"""Audit the historical GLDAS inputs and render the Phase 1 research figures."""

import argparse
from collections import Counter
import csv
from datetime import date
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import netCDF4 as nc
import numpy as np

from .acquisition import PRODUCTS, checksum, valid_data_url, write_json
from .benchmark import LAYERS, QUERY
from .history import OUTPUT, validate
from .trends import analyze_monthly_files

INDEX = Path("docs/GLDAS_MONTHLY_SHA256.csv")
SOURCE = "NASA GES DISC · GLDAS Noah v2.1 monthly · DOI 10.5067/SXAVCZFAQLNO"
PERIOD = "January 2006 to December 2025 · Provisional Pampas box"


def audit_inputs(directory, index):
    product = PRODUCTS["monthly"]
    months = [f"{year}-{month:02d}" for year in range(2006, 2026) for month in range(1, 13)]
    with index.open(newline="", encoding="utf-8") as source:
        entries = list(csv.DictReader(source))
    if [entry["month"] for entry in entries] != months:
        raise ValueError("The checksum index must cover every month from 2006 through 2025.")
    if len({entry["cmr_granule_id"] for entry in entries}) != len(months):
        raise ValueError("The checksum index contains duplicate granule IDs.")
    paths = [directory / f"GLDAS_NOAH025_M.A{month.replace('-', '')}.021.nc4" for month in months]
    if set(directory.glob("*.nc4")) != set(paths):
        raise ValueError("The input directory does not match the expected monthly file set.")
    masks = Counter()
    for entry, path in zip(entries, paths, strict=True):
        record = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        provenance = record["provenance"]
        granule = provenance["source"]
        endpoint = (f"https://opendap.earthdata.nasa.gov/collections/{product.collection}/granules/"
                    f"{product.short_name}.2.1%253A{path.name}.dap.nc4")
        if (granule["filename"] != path.name
                or granule["granule_id"] != entry["cmr_granule_id"]
                or granule["collection_id"] != product.collection
                or granule["version"] != product.version or granule["doi"] != product.doi
                or not valid_data_url(granule["url"], product, path.name)
                or provenance["endpoint"] != endpoint or provenance["constraint"] != QUERY
                or provenance["method"] != "nasa_opendap_dap4"
                or path.stat().st_size != record["bytes"] or record["bytes"] != int(entry["bytes"])
                or checksum(path) != record["sha256"] or record["sha256"] != entry["sha256"]):
            raise ValueError(f"Checksum or provenance mismatch for {path.name}.")
        metadata = validate(path, granule)
        if metadata != record["validation"] or metadata["time"]["timestamp_utc"] != entry["month"] + "-01T00:00:00Z":
            raise ValueError(f"Validation or time metadata mismatch for {path.name}.")
        with nc.Dataset(path) as dataset:
            mask = np.logical_and.reduce([~np.ma.getmaskarray(dataset[name][0]) for name in LAYERS])
            masks[mask.tobytes()] += 1
    if len(masks) != 1:
        raise ValueError("This analysis requires a consistent complete-profile mask.")
    return paths


def regional_diagnostics(result):
    """Cross-check the regional fit with a full design matrix and cell slopes."""
    rows = result["regional_monthly_series"]
    values = np.array([row["soil_water_0_100_mm"] for row in rows])
    time = np.arange(len(rows))
    calendar_month = np.array([date.fromisoformat(row["month"]).month for row in rows])
    design = np.column_stack([time - time.mean(), calendar_month[:, None] == np.arange(1, 13)])
    coefficients = np.linalg.lstsq(design, values, rcond=None)[0]
    fitted = design @ coefficients
    residuals = values - fitted
    bread = np.linalg.inv(design.T @ design)
    scores = design * residuals[:, None]
    lag_intervals = {}
    trend = result["regional_trend"]
    for bandwidth in (6, 12, 24):
        meat = scores.T @ scores
        for lag in range(1, bandwidth + 1):
            cross = scores[lag:].T @ scores[:-lag]
            meat += (1 - lag / (bandwidth + 1)) * (cross + cross.T)
        covariance = bread @ meat @ bread * len(rows) / (len(rows) - design.shape[1])
        slope = float(coefficients[0] * 120)
        margin = float(1.959963984540054 * np.sqrt(covariance[0, 0]) * 120)
        lag_intervals[str(bandwidth)] = [slope - margin, slope + margin]
    np.testing.assert_allclose(slope, trend["linear_hac_slope_per_decade"], atol=1e-9)
    np.testing.assert_allclose(lag_intervals["12"], trend["linear_hac_ci95_per_decade"], atol=1e-7)

    cells = result["spatial_trends_on_cell_seasonal_anomalies"]["cells"]
    cell_slopes = np.array([cell["linear_hac_slope_per_decade"] for cell in cells])
    cell_areas = np.cos(np.deg2rad([cell["latitude"] for cell in cells]))
    weighted_slope = float(np.average(cell_slopes, weights=cell_areas))
    np.testing.assert_allclose(weighted_slope, slope, atol=1e-9)
    diagnostics = {
        "hac_ci95_by_lag_months": lag_intervals,
        "residual_lag1_correlation": float(np.corrcoef(residuals[:-1], residuals[1:])[0, 1]),
        "area_weighted_cell_slope_per_decade": weighted_slope,
        "cell_slope_range_per_decade": [float(cell_slopes.min()), float(cell_slopes.max())],
        "negative_cells": int((cell_slopes < 0).sum()),
        "positive_cells": int((cell_slopes > 0).sum()),
        "fdr_cells": sum(cell["significant_after_bh"] for cell in cells),
    }
    return diagnostics


def figures(result, output):
    rows = result["regional_monthly_series"]
    dates = [date.fromisoformat(row["month"]) for row in rows]
    storage = np.array([row["soil_water_0_100_mm"] for row in rows])
    anomalies = np.array([row["anomaly_mm"] for row in result["regional_monthly_anomalies"]])
    trend = result["regional_trend"]
    slope = trend["linear_hac_slope_per_decade"]
    low, high = trend["linear_hac_ci95_per_decade"]
    slope_label = f"Seasonal OLS {slope:+.2f} mm/decade · HAC 95% CI [{low:+.2f}, {high:+.2f}]"

    for filename, title, values, ylabel in (
            ("regional_trend.png", "Regional soil-water storage", storage, "0–100 cm storage (mm)"),
            ("monthly_anomalies.png", "Monthly soil-water anomalies", anomalies, "0–100 cm anomaly (mm)")):
        fig, ax = plt.subplots(figsize=(9, 4.4), layout="constrained")
        ax.plot(dates, values, color="#155e63", lw=1.2, label="Monthly area-weighted mean" if values is storage else "Monthly anomaly")
        if values is storage:
            time_decades = (np.arange(len(rows)) - (len(rows) - 1) / 2) / 120
            centre = storage.mean()
            ax.plot(dates, centre + slope * time_decades, color="#b24926", lw=2, label="Season-adjusted linear trend")
        else:
            ax.axhline(0, color="#687573", lw=0.9)
        subtitle = slope_label if values is storage else "Relative to the 2006–2025 mean for each calendar month"
        ax.set_title(f"{PERIOD}\n{subtitle}", loc="left", fontsize=10)
        ax.set_ylabel(ylabel)
        ax.set_xlabel(f"Year\n{SOURCE}", fontsize=9)
        ax.xaxis.set_major_locator(mdates.YearLocator(4))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
        ax.grid(axis="y", alpha=0.24)
        ax.legend(loc="lower left", fontsize=8, framealpha=0.9)
        fig.suptitle(title, fontsize=17, fontweight="bold")
        fig.savefig(output / filename, dpi=155)
        plt.close(fig)

    cells = result["spatial_trends_on_cell_seasonal_anomalies"]["cells"]
    west, south, east, north = -64, -38, -57, -30
    grid = np.full((32, 28), np.nan)
    for cell in cells:
        row = round((cell["latitude"] - south - 0.125) / 0.25)
        col = round((cell["longitude"] - west - 0.125) / 0.25)
        grid[row, col] = cell["linear_hac_slope_per_decade"]
    extent = float(np.nanmax(np.abs(grid)))
    fig, ax = plt.subplots(figsize=(7, 6.5), layout="constrained")
    ax.set_facecolor("#e3e7e6")
    mesh = ax.imshow(grid, extent=(west, east, south, north), origin="lower", cmap="RdBu",
                     vmin=-extent, vmax=extent, interpolation="nearest",
                     aspect=1 / np.cos(np.deg2rad((south + north) / 2)))
    significant = [cell for cell in cells if cell["significant_after_bh"]]
    ax.scatter([cell["longitude"] for cell in significant], [cell["latitude"] for cell in significant],
               s=7, color="#172627")
    fig.colorbar(mesh, ax=ax, label="Seasonal OLS slope (mm/decade)", shrink=0.83)
    ax.set_title(f"{PERIOD}\nDots: HAC p-values passing BH at q < 0.05 ({len(significant)} cells)\nGray: masked cells",
                 fontsize=10)
    ax.set_xlabel(f"Longitude (°E)\n{SOURCE}", fontsize=9)
    ax.set_ylabel("Latitude (°N)")
    fig.suptitle("0–100 cm soil-water trends by grid cell", fontsize=16, fontweight="bold")
    fig.savefig(output / "spatial_trend.png", dpi=155)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=OUTPUT)
    parser.add_argument("--output", type=Path, default=Path("data/analysis/2006-2025"))
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Choose a new output directory to preserve the previous analysis.")
    paths = audit_inputs(args.input, INDEX)
    result = analyze_monthly_files(paths)
    result["diagnostics"] = regional_diagnostics(result)
    args.output.mkdir(parents=True)
    figures(result, args.output)
    write_json(args.output / "trend_analysis.json", result)
    print(f"Audited and analyzed {len(paths)} months. Results in {args.output}.")


if __name__ == "__main__":
    main()
