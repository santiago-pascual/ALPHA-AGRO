"""Create schema-validated, dated historical monthly forecast demonstrations."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import jsonschema
import pandas as pd

from ..acquisition import checksum
from .contract import read_parquet
from .forecast import REGISTRY, instant, issue_month, retrospective


def selected_regional_storage_models(evaluation: dict, panel_path: Path, manifest_path: Path) -> dict[int, str]:
    """Read, verify and return each horizon's pre-holdout regional storage selection."""
    if evaluation.get("schema_version") != "predictive_evaluation_v1" or evaluation.get("status") != "retrospective_evaluation":
        raise ValueError("Expected a retrospective predictive_evaluation_v1 artifact.")
    provenance = evaluation.get("provenance", {})
    runs = provenance.get("source_runs", {})
    regional_run = runs.get("regional", {})
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_files = manifest.get("files", {})
    panel_digest = checksum(panel_path)
    manifest_digest = checksum(manifest_path)
    if (regional_run.get("panel_sha256") != panel_digest
            or provenance.get("source_manifest_sha256") != manifest_digest
            or manifest_files.get(panel_path.name, {}).get("sha256") != panel_digest):
        raise ValueError("Evaluation, regional panel, and Phase 5A manifest checksums do not agree.")
    if (provenance.get("availability_policy") != "assumed_release_lag_5_calendar_months"
            or provenance.get("release_lag_months") != 5
            or manifest.get("availability_policy") != provenance.get("availability_policy")):
        raise ValueError("The evaluation does not use the verified five-month retrospective availability policy.")
    if evaluation.get("evaluation", {}).get("holdout_period") != {"start": "2024-01", "end": "2025-12"}:
        raise ValueError("Expected the reserved January 2024–December 2025 holdout.")

    selected: dict[int, str] = {}
    for horizon in (1, 2, 3):
        matches = [row for row in evaluation.get("results", [])
                   if row.get("scope") == "regional" and row.get("horizon_months") == horizon
                   and row.get("target") == "storage"]
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one regional storage comparison for horizon {horizon}.")
        row = matches[0]
        winners = [model for model in row.get("models", []) if model.get("selected_before_holdout") is True]
        if len(winners) != 1 or winners[0].get("model") != row.get("selected_model"):
            raise ValueError(f"Invalid pre-holdout selection for regional storage horizon {horizon}.")
        model_name = winners[0]["model"]
        if model_name not in REGISTRY:
            raise ValueError(f"Selected model {model_name!r} is not supported by the forecast runner.")
        selected[horizon] = model_name
    return selected


def build_historical_set(panel_path: Path, evaluation_path: Path, manifest_path: Path,
                         schema_path: Path, issue_text: str) -> list[dict]:
    issue = instant(issue_text)
    panel = read_parquet(panel_path)
    evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
    selected = selected_regional_storage_models(evaluation, panel_path, manifest_path)
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    eval_digest = checksum(evaluation_path)
    manifest_digest = checksum(manifest_path)
    panel_digest = checksum(panel_path)
    artifacts = []
    for horizon in (1, 2, 3):
        target_month = issue.normalize().replace(day=1) + pd.DateOffset(months=horizon)
        expected_issue = issue_month(target_month, horizon)
        if issue != expected_issue:
            raise ValueError("Use an explicit last-nanosecond-of-month UTC issue timestamp for the shared issue date.")
        artifact = retrospective(panel, issue, horizon=horizon, target="storage",
                                 model_name=selected[horizon],
                                 release_lag=evaluation["provenance"]["release_lag_months"])
        latest_input = artifact["availability"]["input_months"][-1]
        artifact["scope"]["support"] = "Regional area-weighted Pampas study series; not a field or grid-cell forecast."
        artifact["latest_available_observation_month"] = latest_input["month"]
        artifact["target_period"] = {
            "start": f"{artifact['target_month']}-01",
            "end_exclusive": (target_month + pd.offsets.MonthBegin(1)).strftime("%Y-%m-%d"),
        }
        artifact["model"]["selected_before_holdout"] = True
        artifact["model"]["selection_method"] = evaluation["evaluation"]["selection_method"]
        artifact["model"]["selection_source_sha256"] = eval_digest
        artifact["historical_demonstration"] = {
            "is_current_prediction": False,
            "holdout_period": evaluation["evaluation"]["holdout_period"],
            "interpretation": "Retrospective out-of-sample hindcast issued at the recorded historical issue time.",
        }
        artifact["source"] = {
            "collection": "C1342986036-GES_DISC",
            "doi": "10.5067/SXAVCZFAQLNO",
            "input_panel_sha256": panel_digest,
            "evaluation_sha256": eval_digest,
            "manifest_sha256": manifest_digest,
        }
        jsonschema.validate(artifact, schema, format_checker=jsonschema.FormatChecker())
        artifacts.append(artifact)
    return artifacts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Validated Phase 5A regional_panel.parquet")
    parser.add_argument("--evaluation", type=Path, required=True,
                        help="Verified predictive_evaluation_v1.json with both-scope Phase 5B results")
    parser.add_argument("--manifest", type=Path, required=True, help="Phase 5A MANIFEST.json")
    parser.add_argument("--schema", type=Path, default=Path("config/forecast_v1.schema.json"))
    parser.add_argument("--issue-time", required=True,
                        help="Historical UTC month-end issue (for example 2025-09-30T23:59:59.999999999Z)")
    parser.add_argument("--output-dir", type=Path, required=True,
                        help="New ignored research output directory; existing files are preserved")
    args = parser.parse_args(argv)
    try:
        artifacts = build_historical_set(args.input, args.evaluation, args.manifest, args.schema, args.issue_time)
        names = {1: "forecast_v1_h1.json", 2: "forecast_v1_h2.json", 3: "forecast_v1.json"}
        destinations = [args.output_dir / names[item["horizon_months"]] for item in artifacts]
        conflicts = [path for path in destinations if path.exists()]
        if conflicts:
            parser.error("Refusing to overwrite existing forecast artifact(s): " + ", ".join(map(str, conflicts)))
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for path, artifact in zip(destinations, artifacts, strict=True):
            with path.open("x", encoding="utf-8") as stream:
                json.dump(artifact, stream, indent=2, allow_nan=False)
                stream.write("\n")
            metrics = artifact["out_of_sample"]["metrics"]
            print(f"{path}: horizon={artifact['horizon_months']} target={artifact['target_month']} "
                  f"model={artifact['model']['name']} value={artifact['value']:.4f} mm "
                  f"holdout_n={metrics['n_months']} rmse={metrics['rmse']:.4f} mm")
        print("All records are retrospective_simulation; none is an operational forecast.")
        return 0
    except (OSError, ValueError, KeyError, jsonschema.ValidationError) as error:
        parser.exit(2, f"Monthly MVP withheld: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
