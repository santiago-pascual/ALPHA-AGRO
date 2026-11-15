"""Export verified historical scores for the predictive research dashboard."""
import argparse
from collections import defaultdict
from itertools import product
import json
from math import sqrt
from pathlib import Path

import pandas as pd

from ..acquisition import checksum
from .contract import read_parquet

SCOPES = ("regional", "spatial")
HORIZONS = (1, 2, 3)
TARGETS = ("storage", "anomaly", "low_moisture")
MODELS = ("seasonal_climatology", "persistence", "autoregressive_ridge", "ridge", "xgboost", "xgboost_hmm")
BASELINES = MODELS[:3]
RULE = "Minimum pooled walk-forward loss across complete windows released by the first holdout issue"


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def period(months):
    return {"start": months[0], "end": months[-1]}


def normalize(rows, target, lag):
    metric = "brier" if target == "low_moisture" else "rmse"
    models = []
    for name in MODELS:
        records = [r for r in rows if r["model"] == name]
        final, = [r for r in records if r["fold"]["is_final_holdout"]]
        prior = sorted((r for r in records if not r["fold"]["is_final_holdout"]),
                       key=lambda r: r["fold"]["test_months"][0])
        cutoff = pd.Timestamp(final["fold"]["label_availability_cutoff"])
        holdout = final["fold"]["test_months"]
        if not prior or any(r["fold"]["test_months"][-1] >= holdout[0] for r in prior):
            raise ValueError("Walk-forward records must precede the holdout.")
        eligible = [r for r in prior if pd.Timestamp(r["fold"]["test_months"][-1], tz="UTC")
                    + pd.DateOffset(months=lag) <= cutoff]
        if not eligible:
            raise ValueError("No fully released pre-holdout selection windows.")
        power = 1 if metric == "brier" else 2
        weighted = sum(r["metrics"][metric] ** power * r["metrics"]["n_rows"] for r in eligible)
        pooled = weighted / sum(r["metrics"]["n_rows"] for r in eligible)

        def fold(row, identifier):
            scores = row["metrics"]
            return {"id": identifier, "period": period(row["fold"]["test_months"]),
                    "training_period": period(row["fold"]["train_months"]),
                    "label_availability_cutoff": row["fold"]["label_availability_cutoff"],
                    "n_rows": scores["n_rows"], "n_months": scores["n_months"],
                    "metrics": {k: v for k, v in scores.items() if not isinstance(v, (dict, list))},
                    "eligible_for_selection": any(row is value for value in eligible)}

        pairs = final["paired_loss_comparisons"]
        scores = final["metrics"]
        baseline = "persistence" if "persistence" in pairs else "seasonal_climatology"
        models.append({"model": name, "role": "baseline" if name in BASELINES else "candidate",
                       "selection_score": pooled if power == 1 else sqrt(pooled),
                       "walk_forward": {"folds": [fold(r, f"wf-{i}") for i, r in enumerate(prior, 1)]},
                       "holdout": fold(final, "final-holdout"),
                       "skill_scores": {k: scores[f"skill_{k}"] for k in ("vs_persistence", "vs_climatology")
                                        if f"skill_{k}" in scores},
                       "paired_comparisons": pairs,
                       "calibration": {k: v for k, v in scores.items() if "calibration" in k},
                       "uncertainty": {"metric_difference_interval_95": pairs[baseline]["interval_95"],
                                       "comparison_baseline": "persistence" if baseline == "persistence" else "climatology",
                                       "method": "Pointwise paired 12-month circular block bootstrap"}})
    signatures = [{(f["period"]["start"], f["period"]["end"], f["n_rows"], f["eligible_for_selection"])
                   for f in m["walk_forward"]["folds"]} for m in models]
    if any(signature != signatures[0] for signature in signatures):
        raise ValueError("Model selection requires identical walk-forward windows.")
    selected = min(models, key=lambda m: m["selection_score"])["model"]
    best = min(models, key=lambda m: m["holdout"]["metrics"][metric])["model"]
    for m in models:
        m["selected_before_holdout"] = m["model"] == selected
    return metric, models, selected, best


def export(regional, spatial, panel_dir):
    paths = dict(zip(SCOPES, (Path(regional), Path(spatial)), strict=True))
    panel_dir = Path(panel_dir)
    manifest = load(panel_dir / "MANIFEST.json")
    result_paths = {"regional": "regional_panel.parquet", "spatial": "monthly_panel.parquet"}
    sources = {}
    records = []
    lag = 5
    policy = f"assumed_release_lag_{lag}_calendar_months"
    for scope, path in paths.items():
        run = load(path)
        panel_path = panel_dir / result_paths[scope]
        release = run["input"]
        digest = checksum(panel_path)
        if (run["schema_version"] != "1.0.0" or release["sha256"] != digest
                or manifest["files"][panel_path.name]["sha256"] != digest
                or release["availability_policy"] != policy
                or release["real_time_release_snapshots_available"] is not False):
            raise ValueError(f"{scope} results do not match the verified input or retrospective policy.")
        panel = read_parquet(panel_path)
        if (len(panel) != manifest["files"][panel_path.name]["rows"]
                or panel["month"].nunique() != 240 or not panel["availability_policy"].eq(policy).all()
                or not panel["available_at"].eq(panel["month"] + pd.DateOffset(months=lag)).all()
                or not panel["source_doi"].eq(manifest["source_doi"]).all()
                or not panel["source_version"].eq("2.1").all()):
            raise ValueError("Panel coverage, provenance or timing does not match Phase 5A.")
        sources[scope] = {"panel_sha256": digest, "evaluation_sha256": checksum(path)}
        grouped = defaultdict(list)
        for row in run["results"]:
            grouped[row["horizon_months"], row["target"]].append(row)
        if set(grouped) != set(product(HORIZONS, TARGETS)):
            raise ValueError("A scope lacks one or more prespecified comparisons.")
        for (horizon, target), rows in sorted(grouped.items()):
            ids = [(r["model"], tuple(r["fold"]["test_months"])) for r in rows]
            if len(set(ids)) != len(ids) or set(r["model"] for r in rows) != set(MODELS):
                raise ValueError("Duplicate folds or incomplete model coverage.")
            metric, models, selected, best = normalize(rows, target, lag)
            if any(m["holdout"]["period"] != period(("2024-01", "2025-12"))
                   or m["holdout"]["n_months"] != 24 for m in models):
                raise ValueError("Expected the reserved 2024–2025 holdout.")
            definition = rows[0]["target_definition"]["method"]
            records.append({"scope": scope, "scope_definition": (
                "Area-weighted regional monthly target, common 867-cell support" if scope == "regional"
                else "Area-weighted scores at 867 known valid GLDAS cells"),
                "horizon_months": horizon, "target": target, "primary_metric": metric,
                "target_definition": {"method": definition,
                                      "units": "dimensionless" if metric == "brier" else "mm",
                                      **({"threshold": "Training-only weighted 20th percentile; not agricultural drought"}
                                         if metric == "brier" else {})},
                "models": models, "selected_model": selected, "descriptive_holdout_model": best})
    return {"schema_version": "predictive_evaluation_v1", "status": "retrospective_evaluation",
            "provenance": {"source_product": manifest["source_product"], "source_version": "2.1",
                           "source_doi": "https://doi.org/" + manifest["source_doi"],
                           "source_collection": manifest["source_collection"],
                           "input_panel_sha256": sources["spatial"]["panel_sha256"], "source_runs": sources,
                           "source_manifest_sha256": checksum(panel_dir / "MANIFEST.json"),
                           "source_file_count": 480, "availability_policy": policy, "release_lag_months": lag,
                           "geography": "Provisional Argentine Pampas study box",
                           "bounds_west_south_east_north": manifest["bounds_west_south_east_north"],
                           "grid_resolution_degrees": manifest["grid_degrees"],
                           "eligible_cell_count": manifest["joint_valid_cells_per_month"],
                           "evaluation_period": {"start": manifest["first_month"], "end": manifest["last_month"]}},
            "evaluation": {"method": "Expanding walk-forward plus contiguous reserved holdout",
                           "selection_method": RULE, "issue_time_rule": "Last UTC nanosecond of origin month",
                           "release_rule": "Features available by each issue; training labels available by first test issue",
                           "holdout_period": period(("2024-01", "2025-12")), "holdout_month_count": 24,
                           "spatial_fold_rule": "All cells in a target month share the same fold",
                           "limitations": ["Archived final GLDAS with assumed five calendar months, no observed release vintages",
                                           "Pointwise intervals; no multiplicity adjustment; 24 holdout months",
                                           "Temporal prediction at known spatial cells; no independent observation validation",
                                           "Research only; no operational forecast or crop-damage claims"]},
            "baseline_ids": BASELINES, "results": records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regional", required=True)
    parser.add_argument("--spatial", required=True)
    parser.add_argument("--panel-dir", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    payload = json.dumps(export(args.regional, args.spatial, args.panel_dir), allow_nan=False, separators=(",", ":"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as file:
        file.write(payload + "\n")
    print(f"Validated 18 historical comparisons in {args.output}")


if __name__ == "__main__":
    main()
