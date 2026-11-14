"""Run the second-phase GLDAS sensitivities from verified local exports."""

import argparse
from importlib.metadata import version
from itertools import combinations
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import netCDF4 as nc
import numpy as np
from scipy import ndimage

from .acquisition import write_json
from .history import OUTPUT
from .trend_report import INDEX, SOURCE, audit_inputs
from .trends import (_benjamini_hochberg, _cell_areas, _linear_hac,
                     analyze_monthly_grids, load_monthly_netcdf)

PERIODS = ((2006, 2025), (2006, 2015), (2016, 2025), (2009, 2023))
HAC_LAGS = (6, 12, 24)
BLOCK = 24
DRAWS = 1999
SEED = 20261114
DRIVERS = ("Rainf_f_tavg", "Evap_tavg", "Tair_f_inst", "Qs_acc", "Qsb_acc")


def aggregate(storage, weights, region, threshold=0.80):
    """Return means and available area fractions using only finite profiles."""
    values = storage[:, region]
    support = weights[region]
    valid = np.isfinite(values)
    area = valid @ support
    coverage = np.minimum(area / support.sum(), 1.0)
    masked_mean = np.full(values.shape[0], np.nan)
    np.divide(np.where(valid, values, 0) @ support, area, out=masked_mean,
              where=(coverage >= threshold) & (area > 0))
    return masked_mean, coverage


def trend(values, lag=12):
    indices = np.flatnonzero(np.isfinite(values))
    row = {"n": len(indices), "lag_months": lag, "slope": None, "ci95": None}
    if len(indices) > 13:
        fit = _linear_hac(list(zip(indices.tolist(), values[indices].tolist())),
                          (indices % 12 + 1).tolist(), max_lag=lag)
        row.update(slope=fit["slope_per_decade"],
                   ci95=[fit["ci_low_per_decade"], fit["ci_high_per_decade"]],
                   p=fit["p_value"])
    return row


def block_indices(n, rng, *, stride=1):
    starts = rng.choice(np.arange(0, n, stride),
                        size=(DRAWS, math.ceil(n / BLOCK), 1))
    return ((starts + np.arange(BLOCK)) % n).reshape(DRAWS, -1)[:, :n]


def ci(values):
    return np.quantile(values, [0.025, 0.975]).tolist()


def detrend(values):
    time = np.arange(len(values))
    design = np.column_stack([time, time[:, None] % 12 == np.arange(12)])
    return values - design @ np.linalg.lstsq(design, values, rcond=None)[0]


def seasonal_sen(values, rng):
    left, right = np.triu_indices(len(values), k=1)
    within_month = (right - left) % 12 == 0
    left, right = left[within_month], right[within_month]
    elapsed = right - left
    slope = np.median((values[right] - values[left]) * 120 / elapsed)
    adjusted = (values - np.arange(len(values)) * slope / 120).reshape(-1, 12)
    residual = (adjusted - adjusted.mean(axis=0)).ravel()
    sampled = residual[block_indices(len(values), rng, stride=12)]
    slopes = slope + np.median((sampled[:, right] - sampled[:, left]) * 120 / elapsed, axis=1)
    return {"n": len(values), "slope": float(slope), "ci95": ci(slopes)}


def correlation(x, y):
    x = x - x.mean(axis=-1, keepdims=True)
    y = y - y.mean(axis=-1, keepdims=True)
    return (x * y).sum(axis=-1) / np.sqrt((x * x).sum(axis=-1) * (y * y).sum(axis=-1))


def temporal(values, dates, rng):
    monthly = values.reshape(-1, 12)
    climatology = monthly.mean(axis=0)
    anomalies = (monthly - climatology).ravel()
    order = np.argsort(anomalies, kind="stable")
    extremes = [{"month": dates[i].isoformat(), "anomaly_mm": float(anomalies[i])}
                for i in np.r_[order[:3], order[-3:][::-1]]]
    persistence = []
    for lag in (1, 3, 6, 12):
        x, y = anomalies[:-lag], anomalies[lag:]
        indices = block_indices(len(x), rng)
        persistence.append({"lag": lag, "pairs": len(x), "r": float(correlation(x, y)),
                            "ci95": ci(correlation(x[indices], y[indices]))})
    early, late = (detrend(half) for half in np.split(values, 2))
    before, after = (part.std(ddof=1) for part in (early, late))
    early_boot = early[block_indices(len(early), rng, stride=12)].std(axis=1, ddof=1)
    late_boot = late[block_indices(len(late), rng, stride=12)].std(axis=1, ddof=1)
    return {"months": len(values), "climatology_mm": climatology.tolist(),
            "seasonal_climatology_mm": {
                name: float(climatology[indices].mean())
                for name, indices in (("DJF", [11, 0, 1]), ("MAM", [2, 3, 4]),
                                      ("JJA", [5, 6, 7]), ("SON", [8, 9, 10]))
            }, "annual_anomalies_mm": anomalies.reshape(-1, 12).mean(axis=1).tolist(),
            "anomalies_mm": anomalies.tolist(), "extremes": extremes, "persistence": persistence,
            "residual_sd": {"months_per_half": len(early), "early": float(before),
                            "late": float(after), "late_minus_early": float(after - before),
                            "ci95": ci(late_boot - early_boot)}}


def spatial(result, lat, lon):
    slopes = np.full((len(lat), len(lon)), np.nan)
    for cell in result["cells"]:
        row = np.searchsorted(lat, cell["latitude"])
        col = np.searchsorted(lon, cell["longitude"])
        slopes[row, col] = cell["linear_hac_slope_per_decade"]
    values = slopes[np.isfinite(slopes)]
    patches = {}
    for label, mask in (("negative", slopes < 0), ("positive", slopes > 0)):
        components, count = ndimage.label(mask)
        sizes = np.bincount(components.ravel())[1:]
        largest = int(sizes.argmax()) + 1 if count else 0
        rows, cols = np.where(components == largest) if count else ([], [])
        patches[label] = {"cells": int(sizes.max()) if count else 0,
                          "center_bounds": [float(lon[min(cols)]), float(lat[min(rows)]),
                                            float(lon[max(cols)]), float(lat[max(rows)])] if count else None}
    return {"cells": len(values), "sd_mm_per_decade": float(values.std(ddof=1)),
            "p10_median_p90": np.quantile(values, [0.10, 0.50, 0.90]).tolist(),
            "largest_patches": patches,
            "fdr_count": sum(cell["significant_after_bh"] for cell in result["cells"])}, slopes


def local_inventory(directories):
    """Count unique monthly and three-hourly filenames per field and unit."""
    files = {}
    for folder in directories:
        for path in sorted(folder.glob("GLDAS_NOAH025_*.nc4")):
            key = (folder, path.name)
            with nc.Dataset(path) as dataset:
                files[key] = {name: dataset[name].units for name in DRIVERS if name in dataset.variables}
    report = {}
    for name in DRIVERS:
        monthly = {filename for (_, filename), fields in files.items()
                   if "_M." in filename and name in fields}
        three_hourly = {filename for (_, filename), fields in files.items()
                        if "_3H." in filename and name in fields}
        report[name] = {"monthly_files": sorted(monthly), "three_hourly_files": len(three_hourly),
                        "units": sorted({fields[name] for fields in files.values() if name in fields})}
    return report


def lagged_relationships(dates, soil, drivers):
    """Use validated regional series aligned to the same dates and spatial support.

    Positive lags mean that the driver precedes soil moisture. Each series is
    detrended and seasonally adjusted for retrospective analysis.
    """
    expected = [f"{year}-{month:02d}-01" for year in range(2006, 2026) for month in range(1, 13)]
    if [day.isoformat() for day in dates] != expected:
        raise ValueError("Expected consecutive month-start dates from 2006 through 2025.")
    soil = np.asarray(soil, dtype=float)
    if soil.shape != (240,) or not np.isfinite(soil).all():
        raise ValueError("Expected 240 complete soil-water months.")
    response = detrend(soil)
    rows = []
    for name, driver in sorted(drivers.items()):
        driver = np.asarray(driver, dtype=float)
        if driver.shape != soil.shape or not np.isfinite(driver).all():
            raise ValueError(f"Expected 240 complete aligned months for {name}.")
        driver = detrend(driver)
        if np.isclose(driver.std(), 0):
            raise ValueError(f"No residual variability for {name}.")
        for lag in (0, 1, 3):
            x, y = driver[:len(driver) - lag], response[lag:]
            x = x - x.mean()
            total = x @ x
            slope = (x @ y) / total
            scores = x * (y - y.mean() - slope * x)
            meat = scores @ scores + sum(2 * (1 - k / 13) * (scores[k:] @ scores[:-k])
                                         for k in range(1, 13))
            se = math.sqrt(max(0, meat) / total**2 * len(x) / (len(x) - 2))
            p = math.erfc(abs(slope / se) / math.sqrt(2)) if se else float(slope == 0)
            rows.append({"driver": name, "lag": lag, "n": len(x), "slope": float(slope),
                         "ci95": [float(slope - 1.96 * se), float(slope + 1.96 * se)],
                         "r": float(correlation(x, y)), "p": p})
    for row, q in zip(rows, _benjamini_hochberg([row["p"] for row in rows]), strict=True):
        row["q"] = q
    return rows


def evaluate(dates, lat, lon, storage, engine):
    rng = np.random.default_rng(SEED)
    weights = _cell_areas(lat, lon)
    full = np.ones_like(weights, dtype=bool)
    north = np.broadcast_to(np.asarray(lat)[:, None] >= -34, full.shape)
    east = np.broadcast_to(np.asarray(lon)[None, :] >= -60.5, full.shape)
    subareas = {"NW": north & ~east, "NE": north & east,
                "SW": ~north & ~east, "SE": ~north & east}
    regional, coverage = aggregate(storage, weights, full)
    np.testing.assert_allclose(regional, [row["soil_water_0_100_mm"]
                                          for row in engine["regional_monthly_series"]], atol=1e-9)
    baseline = trend(regional)
    np.testing.assert_allclose(baseline["slope"], engine["regional_trend"]["linear_hac_slope_per_decade"])
    np.testing.assert_allclose(baseline["ci95"], engine["regional_trend"]["linear_hac_ci95_per_decade"])

    years = np.array([day.year for day in dates])
    robustness = {f"{first}–{last}": trend(regional[(years >= first) & (years <= last)])
                  for first, last in PERIODS}
    robustness.update({f"HAC {lag}": trend(regional, lag) for lag in HAC_LAGS if lag != 12})
    interior = np.zeros_like(full)
    interior[4:-4, 4:-4] = True
    alternatives = (("Equal cells", np.ones_like(weights), full, 0.80),
                    ("Interior", weights, interior, 0.80),
                    ("95% coverage", weights, full, 0.95),
                    ("98% coverage", weights, full, 0.98))
    for label, area, mask, threshold in alternatives:
        values, support = aggregate(storage, area, mask, threshold)
        robustness[label] = {**trend(values), "minimum_area_fraction": float(support.min()),
                             "grid_cells": int(mask.sum())}
    timeline = temporal(regional, dates, rng)
    trimmed = regional.copy()
    dropped = np.argsort(np.abs(timeline["anomalies_mm"]), kind="stable")[-12:]
    trimmed[dropped] = np.nan
    robustness["Without 12 extreme months"] = {
        **trend(trimmed), "removed": sorted(dates[i].isoformat() for i in dropped)
    }
    robustness["Seasonal Sen"] = seasonal_sen(regional, rng)
    quadrants = {}
    adjusted = {}
    for label, mask in subareas.items():
        values, support = aggregate(storage, weights, mask)
        quadrants[label] = {**trend(values), "grid_cells": int(mask.sum()),
                           "valid_cells": int(np.isfinite(storage[0, mask]).sum()),
                           "area_fraction": float(support.min()),
                           "mean_mm": float(values.mean())}
        matrix = values.reshape(-1, 12)
        adjusted[label] = (matrix - matrix.mean(axis=0)).ravel()
    for label, region in (("North minus South", north), ("West minus East", ~east)):
        quadrants[label] = trend(aggregate(storage, weights, region)[0]
                                 - aggregate(storage, weights, ~region)[0])
    indices = block_indices(len(dates), rng, stride=12)
    correlations = {}
    for a, b in combinations(subareas, 2):
        x, y = adjusted[a], adjusted[b]
        correlations[f"{a} / {b}"] = {"r": float(correlation(x, y)), "pairs": len(dates),
                                       "ci95": ci(correlation(x[indices], y[indices]))}
    geography, slopes = spatial(engine["spatial_trends_on_cell_seasonal_anomalies"], lat, lon)
    return {"robustness": robustness, "temporal": timeline, "subareas": quadrants,
            "quadrant_anomaly_correlations": correlations, "spatial": geography,
            "minimum_area_fraction": float(coverage.min())}, slopes


def figures(dates, report, slopes, output):
    fig, (monthly, annual) = plt.subplots(2, 1, figsize=(10, 6), layout="constrained")
    temporal = report["temporal"]
    monthly.plot(dates, temporal["anomalies_mm"], color="#17636d", lw=1)
    monthly.set_ylabel("Monthly anomaly (mm)")
    annual.bar(range(2006, 2026), temporal["annual_anomalies_mm"], color="#17636d")
    annual.set_xticks(range(2006, 2026, 2))
    annual.set_ylabel("Annual mean anomaly (mm)")
    annual.set_xlabel(SOURCE, fontsize=9)
    for ax in (monthly, annual):
        ax.axhline(0, color="#434a50", lw=0.8)
    fig.suptitle("Soil-water departures from monthly normals · Provisional Pampas box, 2006–2025")
    fig.savefig(output / "temporal_variability.png", dpi=145)
    plt.close(fig)

    fig, (map_ax, effect) = plt.subplots(1, 2, figsize=(10, 4.6), layout="constrained")
    limit = np.nanmax(np.abs(slopes))
    mesh = map_ax.imshow(slopes, extent=(-64, -57, -38, -30), origin="lower",
                         cmap="RdBu", vmin=-limit, vmax=limit, interpolation="nearest")
    map_ax.set_facecolor("#d7dddc")
    map_ax.axhline(-34, color="#434a50", lw=0.7)
    map_ax.axvline(-60.5, color="#434a50", lw=0.7)
    map_ax.set(xlabel="Longitude (°E) · gray cells are masked", ylabel="Latitude (°N)")
    fig.colorbar(mesh, ax=map_ax, shrink=0.8, label="Grid cell slope (mm/decade)")
    groups = report["subareas"]
    for row, (name, values) in enumerate(groups.items()):
        lo, hi = values["ci95"]
        effect.plot([lo, hi], [row, row], color="#17636d", lw=1.4)
        effect.scatter(values["slope"], row, color="#17636d", s=19)
    effect.axvline(0, color="#434a50", lw=0.8, ls="--")
    effect.set(yticks=range(len(groups)), yticklabels=list(groups),
               xlabel="Slope (mm/decade) and 95% HAC interval")
    effect.invert_yaxis()
    fig.suptitle("Spatial differences in soil-water trends · 2006–2025\n" + SOURCE, fontsize=12)
    fig.savefig(output / "spatial_heterogeneity.png", dpi=145)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=OUTPUT)
    parser.add_argument("--output", type=Path, default=Path("data/analysis/scientific-discovery"))
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Choose a new output directory to preserve previous results.")
    paths = audit_inputs(args.input, INDEX)
    dates, lat, lon, layers, units = load_monthly_netcdf(paths)
    engine = analyze_monthly_grids(dates, lat, lon, layers, units=units)
    report, slopes = evaluate(dates, lat, lon, sum(layers.values()), engine)
    report["schema_version"] = "1.0"
    report["units"] = {"trend_slopes": "mm/decade", "storage": "mm water equivalent",
                       "area_fraction": "unitless"}
    report["provenance"] = {"product": SOURCE, "checksum_index": INDEX.as_posix(),
                            "months": len(dates), "box": [-64, -38, -57, -30],
                            "start": dates[0].isoformat(), "end_inclusive": "2025-12-31",
                            "cell_width_degrees": 0.25, "bootstrap": {
                                "seed": SEED, "block_months": BLOCK, "draws": DRAWS},
                            "dependencies": {name: version(name) for name in
                                             ("numpy", "netCDF4", "scipy", "matplotlib")}}
    report["driver_inventory"] = local_inventory([args.input, Path("data/phase1/raw")])
    report["relationships"] = {"status": "No validated 240-month driver series supplied", "estimates": []}
    args.output.mkdir(parents=True)
    write_json(args.output / "discovery.json", report)
    figures(dates, report, slopes, args.output)
    print(f"Analyzed {len(dates)} audited monthly exports. Results in {args.output}.")


if __name__ == "__main__":
    main()
