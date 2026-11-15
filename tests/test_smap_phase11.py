from datetime import date
import json

import numpy as np
import pandas as pd
import pytest

from gldas import smap_appeears, smap_benchmark, smap_sites
from gldas.acquisition import AcquisitionError, checksum
from gldas.smap_appeears import signed_download, task
from gldas.smap_benchmark import evaluate_sites, split_masks
from gldas.smap_panel import SLOTS
from gldas.smap_sites import appeears_slots, daily, load_design, verify_overlap


def test_task_fixes_native_variable_and_locations():
    design = load_design()
    assert len(design["sites"]) == 24
    assert {s["region"] for s in design["sites"]} == {"north_east", "north_west", "south_east", "south_west"}
    start = date(2020, 1, 2)
    request = task(design, start, date(2020, 1, 3), pilot=True)
    assert request["params"]["layers"] == [{"product": "SPL4SMGP.008", "layer": "Geophysical_Data_sm_rootzone"}]
    assert len(request["params"]["coordinates"]) == 3
    with pytest.raises(ValueError, match="one year"):
        task(design, start, date(2024, 1, 1))


@pytest.mark.parametrize("destination", [
    "https://s3.us-west-2.amazonaws.com/bucket/file?X-Amz-Signature=fixture",
    "https://bucket.s3.us-west-2.amazonaws.com/file?AWSAccessKeyId=fixture&Signature=fixture&Expires=1",
    "https://cdn.cloudfront.net/file?Signature=fixture&Key-Pair-Id=fixture&Expires=1",
])
def test_signed_appeears_aws_destinations(destination):
    assert signed_download(destination) == destination
    with pytest.raises(AcquisitionError) as error:
        signed_download("https://s3.us-west-2.amazonaws.com.example.com/file?X-Amz-Signature=fixture")
    assert "fixture" not in str(error.value)


def test_yearly_queue_honors_submission_limit_and_resumes(tmp_path, monkeypatch):
    design = load_design()
    state, archive = tmp_path / "state", tmp_path / "archive"
    posted = []

    def pretend_post(session, method, route, headers, **kwargs):
        posted.append(kwargs["json"]["params"]["dates"][0]["startDate"])
        return {"task_id": f"00000000-0000-0000-0000-{len(posted):012}"}

    def pretend_collect(session, headers, task_id, root):
        folder = root / task_id
        folder.mkdir(parents=True)
        (folder / "capture.json").write_text("{}")

    monkeypatch.setattr(smap_appeears, "service_json", pretend_post)
    monkeypatch.setattr(smap_appeears, "collect", pretend_collect)
    monkeypatch.setattr(smap_appeears, "wait_for_task", lambda *args: None)
    monkeypatch.setattr(smap_sites, "appeears_slots", lambda *args, **kwargs: ({}, []))
    monkeypatch.setattr(smap_sites, "harmony_slots", lambda *args: ({}, []))
    monkeypatch.setattr(smap_sites, "verify_overlap", lambda *args: (3, 48))
    monkeypatch.setattr(smap_sites, "daily", lambda *args: ([], np.ones((366, 24))))
    smap_appeears.historical_batches(None, {}, design, state, archive, tmp_path, 1, 1)
    assert posted == ["01-01-2016"]
    smap_appeears.historical_batches(None, {}, design, state, archive, tmp_path, 1, 1)
    assert posted == ["01-01-2016", "01-01-2017"]


def test_missing_slots_or_sites_stay_missing_and_overlap_is_required():
    day = date(2020, 1, 2)
    observations = {(day, slot): np.array([.3, .4, .2]) for slot in SLOTS[1:]}
    dates, values = daily(observations, day, day, 3)
    assert dates == [day] and np.isnan(values).all()
    observations[day, SLOTS[0]] = np.array([.3, np.nan, .2])
    _, values = daily(observations, day, day, 3)
    assert np.isnan(values[0, 1])
    np.testing.assert_allclose(values[0, [0, 2]], [.3, .2])
    with pytest.raises(ValueError, match="two days"):
        verify_overlap(observations, observations, 3)


def test_date_only_appeears_cannot_be_confused_with_three_hourly(tmp_path):
    design = load_design()
    site = design["sites"][0]
    archive = tmp_path / "probe"
    archive.mkdir()
    csv = archive / "sample.csv"
    csv.write_text("ID,Latitude,Longitude,Date,SPL4SMGP_008_Line_Y_9.00805km,"
                   "SPL4SMGP_008_Sample_X_9.00805km,SPL4SMGP_008_Geophysical_Data_sm_rootzone\n"
                   f"{site['id']},{site['latitude']},{site['longitude']},2020-01-02,1227,1279,0.30\n")
    record = {"schema": "smap_appeears_capture_v1", "task_id": "probe",
              "request": {"layers": [{"product": "SPL4SMGP.008", "layer": design["layer"]}]},
              "files": [{"name": csv.name, "bytes": csv.stat().st_size, "sha256": checksum(csv)}]}
    (archive / "capture.json").write_text(json.dumps(record))
    with pytest.raises(ValueError, match="native three-hour"):
        appeears_slots(tmp_path, design, date(2020, 1, 2), date(2020, 1, 2))


def test_fold_purge_and_missing_calibration_withhold_scores():
    design = load_design()
    cut = pd.to_datetime(["2021-01-01", "2022-01-01", "2024-01-01"])
    issues = cut - pd.Timedelta(days=1)
    release = cut + pd.Timedelta(days=1)
    fit, validation, calibration, holdout = split_masks(issues, release, design)
    assert not any(segment.any() for segment in (fit, validation, calibration, holdout))
    days = pd.date_range(design["archive_start"], design["archive_end"])
    rng = np.random.default_rng(1729)
    # This synthetic fixture validates the gates without posing as a NASA result.
    fake = .4 + .03 * np.sin(np.arange(len(days)) / 365 * 2 * np.pi) + rng.normal(0, .015, len(days))
    fake = fake[:, None].repeat(len(design["sites"]), axis=1)
    fake[days >= "2022-01-01"] = np.nan
    result = evaluate_sites(days, fake, design)
    assert all(value["status"] == "insufficient_history" for value in result.values())
    assert all(not value["holdout_models"] for value in result.values())


def test_selected_models_are_independent_of_holdout_values(monkeypatch):
    design = load_design()
    design["sites"] = design["sites"][:1]
    monkeypatch.setattr(smap_benchmark, "MIN_SITES", 1)
    days = pd.date_range(design["archive_start"], design["archive_end"])
    rng = np.random.default_rng(33)
    fake = (.35 + .02 * np.sin(np.arange(len(days)) / 365 * 2 * np.pi) + rng.normal(0, .018, len(days)))[:, None]
    perturbed = fake.copy()
    perturbed[days >= design["holdout_start"]] += .05
    first, second = [evaluate_sites(days, values, design) for values in (fake, perturbed)]
    for h in ("14", "28"):
        assert first[h]["status"] == second[h]["status"] == "scored"
        for name, result in first[h]["targets"].items():
            assert result["selected_on_validation"] == second[h]["targets"][name]["selected_on_validation"]
            assert result["validation_scores"] == second[h]["targets"][name]["validation_scores"]
            assert all(scores["target_observations"] >= 112 for scores in result["holdout_models"].values())
