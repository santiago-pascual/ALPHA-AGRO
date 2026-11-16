#!/usr/bin/env python3
"""Build a small local exploratory context bundle from public NASA and Argentina data.

The output is a regional grid sample and provincial yield context, not field-level
degradation evidence or a validated crop-yield forecast.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://modis.ornl.gov/rst/api/v1"
CATALOG = "https://datos.gob.ar/api/3/action"
CORE_PROVINCES = {"Buenos Aires", "Santa Fe", "Córdoba", "Entre Ríos", "La Pampa"}
CROP_LABELS = {"soja total": "soybean", "maíz": "maize", "trigo total": "wheat"}
CAMPAIGNS = {f"{year}/{year + 1}" for year in range(2019, 2024)}
PRODUCTIVITY_POINTS = 5


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "AlphaAgro/1.0 research demo"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def select_grid_sample(trend: dict) -> list[dict]:
    cells = [cell for cell in trend["spatial_trends_on_cell_seasonal_anomalies"]["cells"] if cell.get("linear_hac_slope_per_decade") is not None]
    if len(cells) < PRODUCTIVITY_POINTS:
        raise ValueError("The validated trend artifact has fewer than five eligible cells for the productivity sample.")
    ordered = sorted(cells, key=lambda cell: (cell["latitude"], cell["longitude"]))
    selected = []
    for index in range(PRODUCTIVITY_POINTS):
        position = round(index * (len(ordered) - 1) / (PRODUCTIVITY_POINTS - 1))
        cell = ordered[position]
        selected.append({"cell_id": f'{cell["latitude"]:.4f},{cell["longitude"]:.4f}', "latitude": cell["latitude"], "longitude": cell["longitude"]})
    return selected


def fetch_npp(point: dict) -> tuple[list[dict], list[bytes]]:
    query = urllib.parse.urlencode({"latitude": point["latitude"], "longitude": point["longitude"]})
    dates_url = f"{API}/MOD17A3HGF/dates?{query}"
    dates_result = get_json(dates_url)
    dates = dates_result.get("dates", [])
    records: list[dict] = []
    payloads: list[bytes] = []
    for offset in range(0, len(dates), 10):
        batch = dates[offset : offset + 10]
        if not batch:
            continue
        params = {
            "latitude": point["latitude"], "longitude": point["longitude"],
            "startDate": batch[0]["modis_date"], "endDate": batch[-1]["modis_date"],
            "kmAboveBelow": 0, "kmLeftRight": 0, "band": "Npp_500m",
        }
        url = f"{API}/MOD17A3HGF/subset?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "AlphaAgro/1.0 research demo"})
        with urllib.request.urlopen(request, timeout=60) as response:
            content = response.read()
        payloads.append(content)
        subset = json.loads(content)
        scale = float(subset["scale"])
        for row in subset.get("subset", []):
            raw = row.get("data", [None])[0]
            value = raw * scale if isinstance(raw, (int, float)) and 0 <= raw <= 32700 else None
            records.append({"year": int(row["calendar_date"][:4]), "value_kg_c_m2": value, "quality_flag": "pixel_QC_not_requested"})
    return records, payloads


def fetch_yield_csv() -> tuple[bytes, str, str]:
    search = get_json(f"{CATALOG}/package_search?q=estimaciones%20agricolas&rows=5")
    package = next((item for item in search["result"]["results"] if item.get("name") == "estimaciones-agricolas"), None)
    if not package:
        raise ValueError("Official Argentina agricultural estimates dataset is not discoverable in the catalog.")
    details = get_json(f'{CATALOG}/package_show?id={urllib.parse.quote(package["id"])}')["result"]
    resource = next((item for item in details["resources"] if item.get("format", "").lower() == "csv" and "estimaciones" in item.get("name", "").lower()), None)
    if not resource:
        raise ValueError("Official agricultural estimates CSV resource is unavailable.")
    request = urllib.request.Request(resource["url"], headers={"User-Agent": "AlphaAgro/1.0 research demo"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read(), resource["url"], resource.get("last_modified", "not provided")


def parse_yield_context(raw_csv: bytes) -> dict:
    rows = csv.DictReader(raw_csv.decode("utf-8-sig").splitlines())
    annual: dict[tuple[str, str], dict[str, float | set]] = {}
    for row in rows:
        crop = CROP_LABELS.get(row.get("cultivo", "").strip().lower())
        campaign = row.get("campania", "").strip()
        province = row.get("provincia", "").strip()
        try:
            harvested = float(row.get("superficie_cosechada_ha", ""))
            production = float(row.get("produccion_tm", ""))
        except (TypeError, ValueError):
            continue
        if crop is None or campaign not in CAMPAIGNS or province not in CORE_PROVINCES or harvested <= 0 or not math.isfinite(production):
            continue
        bucket = annual.setdefault((crop, campaign), {"area": 0.0, "production_t": 0.0, "provinces": set()})
        bucket["area"] += harvested
        bucket["production_t"] += production
        bucket["provinces"].add(province)
    output = {}
    for crop in CROP_LABELS.values():
        series = []
        for campaign in sorted(CAMPAIGNS):
            bucket = annual.get((crop, campaign))
            if not bucket or len(bucket["provinces"]) < len(CORE_PROVINCES) or bucket["area"] <= 0:
                continue
            series.append({"campaign": campaign, "yield_kg_ha": round(bucket["production_t"] * 1000 / bucket["area"], 1), "harvested_area_ha": round(bucket["area"]), "province_count": len(bucket["provinces"])})
        baseline_rows = series[-5:]
        area = sum(item["harvested_area_ha"] for item in baseline_rows)
        production_kg = sum(item["yield_kg_ha"] * item["harvested_area_ha"] for item in baseline_rows)
        output[crop] = {
            "annual": series,
            "exploratory_baseline_kg_ha": round(production_kg / area, 1) if area else None,
            "recent_campaign_range_kg_ha": [min((item["yield_kg_ha"] for item in baseline_rows), default=0), max((item["yield_kg_ha"] for item in baseline_rows), default=0)] if baseline_rows else None,
            "baseline_campaigns": [item["campaign"] for item in baseline_rows],
        }
    return output


def build(input_json: Path, output_json: Path) -> None:
    raw_trend = input_json.read_bytes()
    trend = json.loads(raw_trend)
    sample = select_grid_sample(trend)
    npp_per_point = []
    npp_payloads: list[bytes] = []
    for point in sample:
        values, payloads = fetch_npp(point)
        npp_per_point.append({**point, "observations": values})
        npp_payloads.extend(payloads)
    by_year: dict[int, list[float]] = {}
    for point in npp_per_point:
        for row in point["observations"]:
            if row["value_kg_c_m2"] is not None:
                by_year.setdefault(row["year"], []).append(row["value_kg_c_m2"])
    annual_npp = [{"year": year, "mean_kg_c_m2": round(statistics.mean(values), 5), "n_cells": len(values)} for year, values in sorted(by_year.items())]
    yield_csv, yield_url, _ = fetch_yield_csv()
    output = {
        "schema_version": "alpha_agro_land_context_v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope_note": "Exploratory regional indicators only. Not a land-degradation classification, field measurement, validated probability, or operational crop-yield forecast.",
        "productivity": {
            "product": "MOD17A3HGF.061", "band": "Npp_500m", "units": "kg_C/m^2/year", "scale_factor": 0.0001,
            "years": annual_npp, "sample_cells": sample, "cell_observations": npp_per_point,
            "sample_design": "Five evenly spaced eligible GLDAS trend cells; unweighted point sample, not full Pampas area coverage.",
            "quality_note": "Npp_QC_500m was not requested; no pixel-level quality filtering was applied. Fill and invalid values were excluded.",
            "api_payload_sha256": sha256(b"\n".join(npp_payloads)),
        },
        "yield_context": {
            "dataset": "Argentina agricultural estimates by crop, campaign, province/department",
            "geography": sorted(CORE_PROVINCES), "aggregation": "sum production / sum harvested area; province-level context, not field-level",
            "campaigns": sorted(CAMPAIGNS), "crops": parse_yield_context(yield_csv),
            "csv_sha256": sha256(yield_csv), "csv_url": yield_url,
            "interpretation": "Exploratory trailing five-campaign historical baseline; not a trained or validated yield forecast.",
        },
        "provenance": {"trend_input_sha256": sha256(raw_trend), "npp_api": API, "yield_catalog": CATALOG},
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trend", type=Path, default=Path("public/data/trend_analysis.json"))
    parser.add_argument("--output", type=Path, default=Path("public/data/agricultural_context_v1.json"))
    args = parser.parse_args()
    build(args.trend, args.output)
    print(f"Wrote {args.output}")
