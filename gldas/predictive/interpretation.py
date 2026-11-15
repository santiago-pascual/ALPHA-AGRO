"""Build a transparent historical context and forecast interpretation artifact."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

REFERENCE_START = "2006-01"
REFERENCE_END = "2025-12"
PERCENTILES = (10, 20, 50, 80, 90)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_interpretation(panel: pd.DataFrame, forecasts: dict, panel_hash: str) -> dict:
    required = {"month", "cell_id", "latitude", "longitude", "soil_water_mm", "soil_water_valid"}
    missing = required - set(panel.columns)
    if missing:
        raise ValueError(f"Panel missing required columns: {sorted(missing)}")
    data = panel.copy()
    data["month"] = pd.to_datetime(data["month"], utc=True)
    if data.duplicated(["month", "cell_id"]).any():
        raise ValueError("Panel has duplicate cell/month rows")
    data["calendar_month"] = data["month"].dt.month
    data["year"] = data["month"].dt.year
    data["soil_water_mm"] = pd.to_numeric(data["soil_water_mm"], errors="coerce")
    valid = data["soil_water_valid"].astype(bool) & data["soil_water_mm"].notna() & np.isfinite(data["soil_water_mm"])
    if ((data["soil_water_valid"].astype(bool)) & ~np.isfinite(data["soil_water_mm"])).any():
        raise ValueError("Valid soil-water rows must have finite values")
    ref = data.loc[(data.year.between(2006, 2025)) & valid].copy()
    if ref.empty or ref.year.min() != 2006 or ref.year.max() != 2025:
        raise ValueError("Reference panel must contain supported data spanning 2006–2025")
    cells = (data.sort_values("month").groupby("cell_id", sort=True)
             .agg(latitude=("latitude", "first"), longitude=("longitude", "first")))
    if cells.index.duplicated().any():
        raise ValueError("Cell identifiers are not unique")

    references = []
    grouped = ref.groupby(["cell_id", "calendar_month"], sort=True)["soil_water_mm"]
    for cell in cells.index:
        for month in range(1, 13):
            values = grouped.get_group((cell, month)) if (cell, month) in grouped.groups else pd.Series(dtype=float)
            arr = values.to_numpy(dtype=float)
            row = {"cell_id": str(cell), "calendar_month": month, "n_years": int(len(arr))}
            for name in ("mean_mm", "sd_mm", *(f"p{q}_mm" for q in PERCENTILES)):
                row[name] = None
            if len(arr):
                row["mean_mm"] = float(np.mean(arr))
                row["sd_mm"] = float(np.std(arr, ddof=1)) if len(arr) > 1 else None
                for q in PERCENTILES:
                    row[f"p{q}_mm"] = float(np.quantile(arr, q / 100, method="linear"))
            row["low_moisture_threshold_mm"] = row["p20_mm"]
            row["low_moisture_count"] = int(np.count_nonzero(arr <= row["p20_mm"])) if len(arr) else None
            row["low_moisture_frequency"] = row["low_moisture_count"] / len(arr) if len(arr) else None
            references.append(row)
    ref_by_key = {(x["cell_id"], x["calendar_month"]): x for x in references}
    if len(references) != len(cells) * 12:
        raise ValueError("Reference statistics do not cover every cell and calendar month")

    last_date = data.loc[valid, "month"].max()
    latest_month = data.loc[data.month.eq(last_date) & valid].copy()
    observations = []
    for row in latest_month.itertuples(index=False):
        refrow = ref_by_key.get((str(row.cell_id), int(row.calendar_month)))
        if not refrow or refrow["n_years"] == 0:
            continue
        value = float(row.soil_water_mm)
        percentile = float(np.mean(ref.loc[(ref.cell_id == row.cell_id) & (ref.calendar_month == row.calendar_month), "soil_water_mm"].to_numpy() <= value) * 100)
        category = "below_reference_p20" if value < refrow["p20_mm"] else "above_reference_p80" if value > refrow["p80_mm"] else "within_reference_p20_p80"
        observations.append({"cell_id": str(row.cell_id), "observation_month": row.month.strftime("%Y-%m"),
            "value_mm": value, "reference_calendar_month": int(row.calendar_month),
            "reference_period": [REFERENCE_START, REFERENCE_END], "reference_n_years": refrow["n_years"],
            "reference_mean_mm": refrow["mean_mm"], "anomaly_mm": value - refrow["mean_mm"],
            "empirical_percentile": percentile, "condition_code": category})

    forecast_rows = []
    for horizon in forecasts.get("spatial_forecasts", {}).get("forecasts", []):
        target = horizon["target_month"]
        calmonth = int(target[5:7])
        for cell in horizon["cells"]:
            cell_id = str(cell["cell_id"])
            stats = ref_by_key.get((cell_id, calmonth))
            if not cell.get("valid") or stats is None or stats["n_years"] == 0:
                forecast_rows.append({"cell_id": cell_id, "target_month": target, "status": "unavailable_masked_or_no_reference", "probability_below_p20": None})
                continue
            anomaly = float(cell["value"]) - stats["mean_mm"]
            forecast_rows.append({"cell_id": cell_id, "target_month": target, "horizon_months": int(horizon["horizon_months"]),
                "forecast_mm": float(cell["value"]), "units": "mm", "reference_mean_mm": stats["mean_mm"],
                "reference_p20_mm": stats["p20_mm"], "reference_p50_mm": stats["p50_mm"], "reference_p80_mm": stats["p80_mm"],
                "forecast_central_anomaly_mm": anomaly, "forecast_anomaly_status": "zero_by_seasonal_climatology_construction",
                "probability_below_p20": None, "probability_status": "unavailable_not_defensibly_calibrated",
                "status": "experimental_climatological_outlook"})

    compact_references = [[r["cell_id"], r["calendar_month"], r["n_years"], r["mean_mm"], r["sd_mm"],
        r["p10_mm"], r["p20_mm"], r["p50_mm"], r["p80_mm"], r["p90_mm"],
        r["low_moisture_count"], r["low_moisture_frequency"]] for r in references]
    compact_observations = [[r["cell_id"], r["observation_month"], r["value_mm"], r["reference_calendar_month"],
        r["reference_n_years"], r["reference_mean_mm"], r["anomaly_mm"], r["empirical_percentile"], r["condition_code"]] for r in observations]
    compact_forecasts = [[r.get("cell_id"), r.get("target_month"), r.get("horizon_months"), r["status"],
        r.get("forecast_mm"), r.get("units"), r.get("reference_mean_mm"), r.get("reference_p20_mm"),
        r.get("reference_p50_mm"), r.get("reference_p80_mm"), r.get("forecast_central_anomaly_mm"),
        r.get("forecast_anomaly_status"), r.get("probability_below_p20"), r.get("probability_status")] for r in forecast_rows]
    compact_cells = [[str(k), float(v.latitude), float(v.longitude),
        bool(ref_by_key.get((str(k), 1)) and ref_by_key[(str(k), 1)]["n_years"] > 0)] for k, v in cells.iterrows()]
    return {
        "schema_version": "soil_moisture_interpretation_v1", "status": "historical_context_and_experimental_outlook",
        "provenance": {"product": "GLDAS Noah v2.1 monthly", "doi": "10.5067/SXAVCZFAQLNO", "target": "0–100 cm soil-water storage", "units": "mm", "panel_sha256": panel_hash, "forecast_bundle_sha256": forecasts.get("_sha256"), "mask_policy": "Preserve Phase 5A/Phase 8 cell identifiers and soil_water_valid mask; masked values are unavailable."},
        "reference": {"start": REFERENCE_START, "end": REFERENCE_END, "sample_size": "20 same-calendar-month observations per cell when valid", "quantile_method": "linear empirical quantile (NumPy method=linear)", "low_moisture_definition": "Observed storage <= same-cell, same-calendar-month 20th percentile of 2006–2025 reference; a descriptive relative threshold, not an agronomic drought threshold.", "historical_low_moisture_frequency": "count and frequency are calculated within the 20-year reference sample; threshold and frequency are descriptive and not independent evidence."},
        "cells": {"columns": ["cell_id", "latitude", "longitude", "soil_water_valid"], "rows": compact_cells},
        "monthly_reference_statistics": {"columns": ["cell_id", "calendar_month", "n_years", "mean_mm", "sd_mm", "p10_mm", "p20_mm", "p50_mm", "p80_mm", "p90_mm", "low_moisture_count", "low_moisture_frequency"], "rows": compact_references},
        "latest_observed_context": {"observation_month": last_date.strftime("%Y-%m"), "reference_period": [REFERENCE_START, REFERENCE_END], "anomaly_definition": "observed value minus same-cell, same-calendar-month 2006–2025 mean", "columns": ["cell_id", "observation_month", "value_mm", "reference_calendar_month", "reference_n_years", "reference_mean_mm", "anomaly_mm", "empirical_percentile", "condition_code"], "records": compact_observations},
        "forecast_context": {"source_bundle_status": forecasts.get("status"), "model": forecasts.get("model", {}).get("name"), "columns": ["cell_id", "target_month", "horizon_months", "status", "forecast_mm", "units", "reference_mean_mm", "reference_p20_mm", "reference_p50_mm", "reference_p80_mm", "forecast_central_anomaly_mm", "forecast_anomaly_status", "probability_below_p20", "probability_status"], "records": compact_forecasts},
        "interpretation_glossary": {"en": {"below_reference_p20": "Observed storage is below the cell's historical same-month 20th percentile.", "within_reference_p20_p80": "Observed storage is within the cell's historical same-month 20th–80th percentile range.", "above_reference_p80": "Observed storage is above the cell's historical same-month 80th percentile."}, "es": {"below_reference_p20": "El almacenamiento observado está por debajo del percentil 20 histórico del mismo mes para esta celda.", "within_reference_p20_p80": "El almacenamiento observado está dentro del rango histórico de percentiles 20–80 del mismo mes para esta celda.", "above_reference_p80": "El almacenamiento observado está por encima del percentil 80 histórico del mismo mes para esta celda."}},
        "forecast_interpretation": {"en": "The central outlook equals the historical seasonal normal; this does not establish that future conditions will be normal.", "es": "La perspectiva central coincide con la normal estacional histórica; esto no demuestra que las condiciones futuras serán normales.", "probability_reason": "Retrospective residuals and intervals do not establish calibrated event probabilities at this horizon and cell; no probability is inferred from the 90% interval."},
        "probability_summary": {"status": "unavailable", "reason": "Available evidence does not validate calibrated probabilities of crossing the cell-specific historical p20 event threshold. A 90% prediction interval is not a predictive distribution; converting interval overlap to probability is invalid without validated distributional assumptions and event calibration."},
        "agricultural_interpretation": {"scope": "Hydrological context only; not crop-specific advice.", "en": "Describe observed soil-water storage relative to its local GLDAS seasonal history. Confirm field conditions before decisions.", "es": "Describa el almacenamiento de agua del suelo observado respecto de su historial estacional GLDAS local. Verifique las condiciones del lote antes de decidir.", "prohibited_inferences": ["crop yield", "crop damage", "irrigation volume", "planting suitability", "crop switching", "long-term land degradation"]},
        "methodology": ["Reference statistics use only 2006–2025 observations; later records do not change the reference.", "Observed anomalies compare observations with the corresponding cell and calendar-month reference mean.", "Forecast central anomalies are reported separately and are zero because the selected forecast is seasonal climatology.", "Forecast anomalies are not claims that future anomalies will be zero."],
        "limitations": ["GLDAS is modeled 0.25-degree grid data, not field measurement.", "Historical percentiles describe this reference period and are not validated drought or crop thresholds.", "Historical anomaly is descriptive, not causal.", "Climatology is a baseline outlook, not demonstrated dynamic forecast skill.", "No future low-moisture probability is supplied because event probabilities are not defensibly calibrated."]
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--panel", type=Path, required=True)
    parser.add_argument("--forecast-bundle", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    panel = pd.read_parquet(args.panel)
    forecasts = json.loads(args.forecast_bundle.read_text(encoding="utf-8"))
    forecasts["_sha256"] = sha256(args.forecast_bundle)
    artifact = build_interpretation(panel, forecasts, sha256(args.panel))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        raise FileExistsError(f"Refusing to overwrite {args.output}")
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "bytes": args.output.stat().st_size, "sha256": sha256(args.output), "cells": len(artifact["cells"]["rows"]), "valid_cells": sum(row[3] for row in artifact["cells"]["rows"]), "reference_records": len(artifact["monthly_reference_statistics"]["rows"]), "latest_observed_records": len(artifact["latest_observed_context"]["records"]), "forecast_records": len(artifact["forecast_context"]["records"]), "probability_status": artifact["probability_summary"]["status"]}, indent=2))


if __name__ == "__main__":
    main()
