"""Analyze monthly GLDAS relationships and chronological retrospective baselines."""

import argparse
from calendar import monthrange
import csv
from datetime import date
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import netCDF4 as nc
import numpy as np

from .acquisition import checksum, write_json
from .discovery import BLOCK, DRAWS, SEED, aggregate, block_indices, ci, correlation, detrend
from .multivariable import (
    DRIVERS, JANUARY, OUTPUT, REFERENCE_SHA, ROOT, SOIL, STEM, acquire, fields, source_from,
)
from .trend_report import INDEX, SOURCE, audit_inputs
from .trends import _benjamini_hochberg, _cell_areas, load_monthly_netcdf

NAMES = ("rainfall", "evapotranspiration", "air_temperature", "surface_runoff", "subsurface_runoff")
ANALYSIS_UNITS = dict(zip(NAMES, ("mm/month", "mm/month", "degC", "mm/month", "mm/month"), strict=True))
PREDICTOR_LAG = 5


def convert(name, values, month):
    days = monthrange(month.year, month.month)[1]
    if name == "Tair_f_inst":
        return values - 273.15
    if name in ("Rainf_f_tavg", "Evap_tavg"):
        return values * days * 86400
    if name in ("Qs_acc", "Qsb_acc"):
        return values * days * 8
    raise ValueError(f"Unknown field for unit conversion: {name}")


def observations():
    paths = audit_inputs(SOIL, INDEX)
    dates, lat, lon, layers, _ = load_monthly_netcdf(paths)
    expected = {day.strftime("%Y-%m") for day in dates}
    actual = {path.name for path in OUTPUT.iterdir() if path.is_dir() and not path.name.startswith("tmp")}
    verify_months(expected, actual)
    soil = sum(layers.values())
    weights = _cell_areas(lat, lon)
    north = np.broadcast_to(np.asarray(lat)[:, None] >= -34, weights.shape)
    regions = {"full": np.ones_like(north), "north": north, "south": ~north}
    data = {label: [] for label in regions}
    coverage = {label: [] for label in regions}
    manifest = []
    masks = set()
    reference = ROOT / "raw" / f"{STEM}.nc4"
    if checksum(reference) != REFERENCE_SHA:
        raise ValueError("The pilot reference checksum differs.")
    for index, (day, path) in enumerate(zip(dates, paths, strict=True)):
        source = source_from(path)
        local = path.name == JANUARY.name
        comparison = JANUARY if local else reference if path.name == reference.name else None
        record, _ = acquire(None, source, None, comparison, local_only=local)
        manifest.append(record)
        with nc.Dataset(OUTPUT / day.strftime("%Y-%m") / path.name) as dataset:
            raw = fields(dataset)
        storage = np.stack([soil[index], *(convert(name, raw[name].astype(float).filled(np.nan), day)
                                          for name in DRIVERS)])
        mask = np.isfinite(storage).all(axis=0)
        masks.add(mask.tobytes())
        joint = np.where(mask, storage, np.nan)
        for label, region in regions.items():
            means, support = aggregate(joint, weights, region)
            if not np.isfinite(means).all():
                raise ValueError(f"Insufficient joint coverage for {label} in {day:%Y-%m}.")
            data[label].append(means)
            coverage[label].append(float(support[0]))
    return dates, {label: np.array(rows) for label, rows in data.items()}, coverage, manifest, len(masks)


def verify_months(expected, actual):
    missing = expected - actual
    unexpected = actual - expected
    if missing or unexpected:
        raise ValueError(f"Historical driver archive has {len(missing)} missing and {len(unexpected)} unexpected months.")


def lagged_pair(driver, soil, lag):
    return driver[:len(driver) - lag], soil[lag:]


def association(x, y, indices):
    if np.isclose(x.std(), 0) or np.isclose(y.std(), 0):
        raise ValueError("An association requires variability in both series.")
    x_std = (x - x.mean()) / x.std()
    y_std = (y - y.mean()) / y.std()
    r = float(correlation(x, y))
    scores = x_std * (y_std - r * x_std)
    meat = scores @ scores + sum(2 * (1 - k / 13) * (scores[k:] @ scores[:-k])
                                 for k in range(1, 13))
    se = math.sqrt(max(0, meat) / (len(x) * (len(x) - 2)))
    p = math.erfc(abs(r / se) / math.sqrt(2)) if se else float(r == 0)
    draws = correlation(x[indices], y[indices])
    return {"r": r, "n": len(x), "ci95": ci(draws), "p_hac": p}, draws


def relationships(data, rng):
    anomalies = {label: np.column_stack([detrend(values) for values in rows.T])
                 for label, rows in data.items()}
    rows, contrasts = [], []
    for lag in range(7):
        indices = block_indices(len(data["full"]) - lag, rng)
        for column, name in enumerate(NAMES, 1):
            region_results = {}
            draws = {}
            for scope in ("full", "north", "south"):
                values = anomalies[scope]
                x, y = lagged_pair(values[:, column], values[:, 0], lag)
                region_results[scope], draws[scope] = association(x, y, indices)
                rows.append({**region_results[scope], "region": scope, "variable": name, "lag": lag})
            north, south = region_results["north"], region_results["south"]
            contrasts.append({"variable": name, "lag": lag, "n": north["n"],
                              "north_minus_south_r": north["r"] - south["r"],
                              "ci95": ci(draws["north"] - draws["south"])})
    q_values = _benjamini_hochberg([row["p_hac"] for row in rows])
    for row, q in zip(rows, q_values, strict=True):
        row["q_hac"] = q
    return rows, contrasts


def forecast_inputs(data, train_end, lag=PREDICTOR_LAG):
    """Build target-month climatology and exclusively lagged features."""
    normals = data[:train_end].reshape(-1, 12, data.shape[1]).mean(axis=0)
    months = np.arange(lag, len(data))
    target = data[months, 0] - normals[months % 12, 0]
    predictors = data[months - lag] - normals[(months - lag) % 12]
    return months, target, predictors


def baselines(data, rng):
    train_end = 180
    months, target, features = forecast_inputs(data, train_end)
    train = months < train_end
    # At the first test origin, all fitting data must predate the input cutoff.
    test = months >= train_end + PREDICTOR_LAG - 1
    predictions = {"seasonal_climatology": np.zeros(test.sum()), "persistence": features[test, 0]}
    for name, columns in (("autoregression", [0]), ("environmental", [0, 1, 3])):
        design = np.column_stack([np.ones(len(features)), features[:, columns]])
        fit = np.linalg.lstsq(design[train], target[train], rcond=None)[0]
        predictions[name] = design[test] @ fit
    indices = block_indices(int(test.sum()), rng)
    persistence_error = (predictions["persistence"] - target[test]) ** 2
    scores = {}
    for name, predicted in predictions.items():
        error = predicted - target[test]
        square = error**2
        scores[name] = {"rmse_mm": float(np.sqrt(square.mean())), "mae_mm": float(np.abs(error).mean()),
                        "rmse_difference_vs_persistence_ci95": ci(
                            np.sqrt(square[indices].mean(axis=1))
                            - np.sqrt(persistence_error[indices].mean(axis=1)))}
    return {"train_n": int(train.sum()), "test_n": int(test.sum()), "predictor_lag_months": PREDICTOR_LAG,
            "train_end": "2020-12", "test_start": "2021-05", "test_end": "2025-12", "scores": scores}


def figures(rows, contrasts, output):
    fig, (axis, difference) = plt.subplots(1, 2, figsize=(11, 5), layout="constrained")
    for variable in NAMES:
        for ax, series, key in (
                (axis, [row for row in rows if row["region"] == "full"], "r"),
                (difference, contrasts, "north_minus_south_r")):
            selected = [row for row in series if row["variable"] == variable]
            x = [row["lag"] for row in selected]
            ax.plot(x, [row[key] for row in selected], marker="o", ms=2,
                    label=variable.replace("_", " "))
            bounds = np.array([row["ci95"] for row in selected])
            ax.fill_between(x, bounds[:, 0], bounds[:, 1], alpha=0.09)
    for ax in (axis, difference):
        ax.axhline(0, color="0.45", lw=0.8)
        ax.set_xlabel("Months by which driver leads soil-water storage")
    axis.set_ylabel("Regional anomaly correlation (r)")
    difference.set_ylabel("North minus South correlation")
    axis.legend(fontsize=8)
    fig.suptitle("Detrended GLDAS associations · 2006–2025 · pointwise 95% block intervals\n" + SOURCE,
                 fontsize=11)
    fig.savefig(output / "lagged_relationships.png", dpi=145)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 4.5), layout="constrained")
    simultaneous = [row for row in rows if row["region"] == "full" and row["lag"] == 0]
    for index, row in enumerate(simultaneous):
        ax.plot(row["ci95"], [index, index], color="#17636d")
        ax.scatter(row["r"], index, color="#17636d")
    ax.set(yticks=range(len(simultaneous)),
           yticklabels=[row["variable"].replace("_", " ") for row in simultaneous],
           xlabel="Detrended anomaly correlation (r), pointwise 95% block interval")
    ax.invert_yaxis()
    ax.axvline(0, lw=0.8, color="0.4")
    fig.suptitle("Same-month soil-water associations · Provisional Pampas box, 2006–2025\n" + SOURCE,
                 fontsize=11)
    fig.savefig(output / "contemporaneous_correlations.png", dpi=145)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("data/analysis/multivariable"))
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Choose an unused output directory.")
    dates, data, coverage, manifest, mask_count = observations()
    rng = np.random.default_rng(SEED)
    rows, contrasts = relationships(data, rng)
    args.output.mkdir(parents=True)
    write_json(args.output / "results.json", {
        "schema_version": "1.0", "source": SOURCE, "response": "0–100 cm soil water",
        "bootstrap": {"seed": SEED, "block_months": BLOCK, "draws": DRAWS},
        "start": str(dates[0]), "end": str(date(2025, 12, 31)), "months": len(dates),
        "analysis_units": ANALYSIS_UNITS, "associations": rows, "contrasts": contrasts,
        "baselines": baselines(data["full"], rng),
        "driver_storage_bytes": sum(record["bytes"] for record in manifest),
        "driver_transfer_bytes": sum(record["bytes"] for record in manifest
                                     if "endpoint" in record["provenance"]),
        "minimum_joint_coverage": {label: min(rows) for label, rows in coverage.items()},
        "distinct_joint_masks": mask_count,
    })
    write_json(args.output / "monthly_series.json", {
        "columns": ["soil_water_mm", *NAMES], "units": {"soil_water_mm": "mm", **ANALYSIS_UNITS},
        "months": [d.isoformat() for d in dates], "coverage": coverage,
        "data": {label: rows.tolist() for label, rows in data.items()},
    })
    write_json(args.output / "acquisition_manifest.json", manifest)
    with (args.output / "driver_checksums.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(("month", "cmr_granule_id", "method", "bytes", "sha256"))
        for month, record in zip(dates, manifest, strict=True):
            provenance = record["provenance"]
            writer.writerow((month.strftime("%Y-%m"), provenance["source"]["granule_id"],
                             provenance.get("method", "nasa_opendap_dap4"), record["bytes"], record["sha256"]))
    figures(rows, contrasts, args.output)
    print(f"Analyzed {len(dates)} aligned monthly driver exports. Results in {args.output}.")


if __name__ == "__main__":
    main()
