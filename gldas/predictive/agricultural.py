"""Storage indicators for the newest released monthly snapshot."""
from __future__ import annotations

import numpy as np


def moisture_indicators(history):
    """Rows are consecutive recent months, newest first. Stop a dry run at a gap."""
    if not history or history[0][1] is None:
        return {"anomaly_mm": None, "below_normal": None, "consecutive_below_normal_months": None}
    latest = float(history[0][1])
    if not np.isfinite(latest):
        raise ValueError("Anomalies must be finite or null.")
    dry_run = 0
    prior = history[0][0] + 1
    for index, value in history:
        if index != prior - 1 or value is None or not np.isfinite(value) or value >= 0:
            break
        dry_run += 1
        prior = index
    return {"anomaly_mm": latest, "below_normal": latest < 0,
            "consecutive_below_normal_months": dry_run}
