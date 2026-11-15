"""Evaluate the checksummed SMAP daily panel with the causal 14/28-day baseline engine."""
import argparse
from datetime import date
import json
from pathlib import Path

import numpy as np

from .acquisition import checksum
from .smap import COLLECTION, DOI
from .water_evaluation import evaluate


def evaluate_panel(panel, lag, reference_start, reference_end, calibration_start, holdout_start):
    record = json.loads(panel.with_suffix(".json").read_text(encoding="utf-8"))
    if (record["schema"] != "smap_daily_panel_v1" or record["collection"] != COLLECTION or record["doi"] != DOI
            or record["version"] != "008" or record["units"] != "m3 m-3"
            or record["panel_sha256"] != checksum(panel)):
        raise ValueError("SMAP panel identity or checksum failed.")
    with np.load(panel, allow_pickle=False) as data:
        values, dates = data["storage"], data["days"]
        latitudes, longitudes = data["latitude"], data["longitude"]
    first, last = map(date.fromisoformat, record["dates"])
    if (values.shape != (len(dates), len(latitudes), len(longitudes)) or len(dates) != (last - first).days + 1
            or not np.array_equal(dates, np.arange(np.datetime64(first), np.datetime64(last) + np.timedelta64(1, "D")).astype(str))
            or np.isinf(values).any() or np.any(values[np.isfinite(values)] < 0)
            or np.any(values[np.isfinite(values)] > .9)):
        raise ValueError("SMAP panel shape, dates, or moisture values failed validation.")
    # Since the native EASE cells are equal area, equal weights are appropriate.
    result = evaluate(values.astype(float), first, lag, reference_start, reference_end, calibration_start, holdout_start,
                      latitudes, units="m3 m-3", equal_area=True)
    result.update({"collection": COLLECTION, "version": "008", "doi": DOI,
                   "panel_sha256": record["panel_sha256"],
                   "complete_days": sum(x["intervals"] == 8 for x in record["coverage"]),
                   "interpretation": "retrospective availability scenario, not a current forecast"})
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--panel", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--retrospective-lag-days", type=int, required=True)
    for field in ("reference-start", "reference-end", "calibration-start", "holdout-start"):
        p.add_argument("--" + field, required=True, type=date.fromisoformat)
    a = p.parse_args()
    results = evaluate_panel(a.panel, a.retrospective_lag_days, a.reference_start, a.reference_end,
                             a.calibration_start, a.holdout_start)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    with a.output.open("x", encoding="utf-8") as f:
        json.dump(results, f, indent=2, allow_nan=False)
    print({horizon: metrics["status"] for horizon, metrics in results["horizons_days"].items()})


if __name__ == "__main__":
    main()
