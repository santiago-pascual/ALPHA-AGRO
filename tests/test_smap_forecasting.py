from datetime import date
import numpy as np
import pandas as pd
import pytest

from gldas.acquisition import AcquisitionError
from gldas.smap import official_asset, signed_redirect
from gldas.smap_harmony import output_name
from gldas.water_evaluation import aligned, evaluate


def test_pinned_download_and_harmony_paths():
    filename = "SMAP_L4_SM_gph_20261111T223000_Vv8013_001.h5"
    prefix = "https://data.nsidc.earthdatacloud.nasa.gov/nsidc-cumulus-prod-protected/SMAP/SPL4SMGP/008/2026/11/11/"
    assert official_asset(prefix + filename)
    assert not official_asset(prefix + filename + "?secret=fixture")
    url = f"https://d3h5e2j7riftk6.cloudfront.net/{filename}?Signature=fixture&Key-Pair-Id=fixture&Expires=1"
    assert signed_redirect(url, filename) == url
    with pytest.raises(AcquisitionError, match="approved signed"):
        signed_redirect(url.replace("d3h5e2j7riftk6", "elsewhere"), filename)
    basename = filename.removesuffix(".h5") + "_Geophysical_Data_sm_rootzone_subsetted.nc4"
    assert output_name("https://harmony.earthdata.nasa.gov/output/" + basename) == basename


@pytest.mark.parametrize("horizon", [14, 28])
def test_feature_and_label_gate(horizon):
    days = pd.date_range("2020-01-01", periods=200)
    values = np.arange(len(days), dtype=float)
    lag = 7
    x, change, _, _, _, _, issues, labels, level, _, _, _, _ = aligned(
        days, values, np.zeros(12), np.full(12, 50), np.full(12, .2), horizon, lag)
    assert x[0, 0] == 28 and x[0, 1] == 3
    assert issues[0] == days[36] and labels[0] - issues[0] == pd.Timedelta(days=horizon + lag)
    assert change[0] == horizon and level[0] == 35 + horizon


def test_short_sample_withholds_real_scores_and_long_synthetic_fixture_runs():
    dates = pd.date_range("2016-01-01", "2025-12-31")
    start = date(2016, 1, 1)
    options = (7, start, date(2018, 12, 31), date(2023, 1, 1), date(2025, 1, 1), [-34])
    series = .35 + .05 * np.sin(np.arange(len(dates)) * 2*np.pi/365.25) + np.random.default_rng(7).normal(0, .02, len(dates))
    fixture = series[:, None, None]
    sparse = evaluate(fixture[:1], start, *options, units="m3 m-3", equal_area=True)
    scored = evaluate(fixture, start, *options, units="m3 m-3", equal_area=True)
    for horizon in ("14", "28"):
        assert sparse["horizons_days"][horizon]["status"] == "insufficient_history"
        models = scored["horizons_days"][horizon]
        assert models["status"] == "scored"
        assert models["change_and_below_normal"]["units"] == "m3 m-3"
        assert models["level_and_dry_onset"]["models"]["ridge"]["brier"] <= 1
