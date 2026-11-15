"""Offline NetCDF and HTTP fixtures. No provider timestamp is claimed."""
from datetime import date, datetime, timedelta, timezone

import netCDF4 as nc
import numpy as np
import pytest

from gldas import vintages
from gldas.acquisition import AcquisitionError, PRODUCTS
from gldas.multivariable import UNITS
from gldas.predictive.forecast import instant, issue_month
from gldas.predictive.prospective import features, fingerprint, verify_snapshot
from test_phase7_prospective import fixture


def product_source():
    product = PRODUCTS["monthly"]
    name = "GLDAS_NOAH025_M.A202002.021.nc4"
    return {"filename": name, "start": "2020-02-01T00:00:00Z", "end": "2020-02-29T23:59:59Z",
            "collection_id": product.collection, "version": product.version, "doi": product.doi,
            "granule_id": "G1000000000-GES_DISC",
            "url": "https://data.gesdisc.earthdata.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/2020/" + name}


def make_fixture(path, mask, soil_base):
    with nc.Dataset(path, "w") as f:
        f.title = "GLDAS2.1 fixture only"
        for name, size in (("time", 1), ("lat", 32), ("lon", 28), ("nv", 2)):
            f.createDimension(name, size)
        for name, start, length, units in (("lat", -37.875, 32, "degrees_north"),
                                            ("lon", -63.875, 28, "degrees_east")):
            coordinate = f.createVariable(name, "f4", (name,))
            coordinate.units = units
            coordinate[:] = start + np.arange(length) * 0.25
        times = f.createVariable("time", "f8", ("time",))
        times.units = "days since 2020-02-01"
        times.bounds = "time_bnds"
        times[:] = 0
        f.createVariable("time_bnds", "f8", ("time", "nv"))[:] = [[0, 29]]
        for name, units in ({**dict.fromkeys(vintages.LAYERS, "kg m-2"), **UNITS}).items():
            field = f.createVariable(name, "f4", ("time", "lat", "lon"), fill_value=-9999)
            field.units = units
            field.cell_methods = "time: mean"
            field[0] = np.ma.array(np.full((32, 28), soil_base if name in vintages.LAYERS else 1.), mask=~mask)


class HTTP:
    def __init__(self, body, status=200, truncated=False):
        self.status_code = status
        self.headers = {"Content-Length": str(len(body) + truncated)}
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def iter_content(self, _):
        yield self.body


class Session:
    def __init__(self, response):
        self.response = response

    def get(self, url, **kwargs):
        assert url.startswith("https://opendap.earthdata.nasa.gov/")
        assert kwargs["allow_redirects"] is False
        assert kwargs["headers"] == {"Authorization": "Bearer test-only"}
        return self.response


def test_preserves_first_local_byte_vintage_and_detects_tampering(tmp_path, monkeypatch):
    mask = (np.arange(896) >= 29).reshape(32, 28)
    monkeypatch.setattr(vintages, "EXPECTED_SUPPORT", fingerprint(mask.ravel().tolist()))
    monkeypatch.setattr(vintages, "discover", lambda *_: [product_source()])
    file = tmp_path / "fixture.nc4"
    make_fixture(file, mask, 5)
    body = file.read_bytes()
    root = tmp_path / "archive"
    month = date(2020, 2, 1)
    started = datetime(2026, 11, 15, tzinfo=timezone.utc)
    first = iter([started, started + timedelta(seconds=1)])
    archive = vintages.capture(root, month, Session(HTTP(body)), "test-only", lambda: next(first))
    assert (archive / "export.nc4").read_bytes() == body
    receipt = vintages.audit(archive)
    assert receipt["evidence_status"] == "local_candidate_unwitnessed"
    assert receipt["provider_publication_at"] is None
    assert receipt["soil_sha256"] == receipt["driver_sha256"] == archive.name
    snapshot = vintages.read(archive / "snapshot.json")
    assert receipt["snapshot_sha256"] == fingerprint(snapshot)
    assert snapshot["values"]["soil_water_mm"] == pytest.approx(15)
    assert snapshot["values"]["precipitation_mm_month"] == pytest.approx(29 * 86400)
    assert snapshot["values"]["surface_runoff_mm_month"] == pytest.approx(29 * 8)
    second = iter([started + timedelta(seconds=10), started + timedelta(seconds=11)])
    assert vintages.capture(root, month, Session(HTTP(body)), "test-only", lambda: next(second)) == archive
    assert vintages.audit(archive) == receipt
    revision_file = tmp_path / "revision.nc4"
    make_fixture(revision_file, mask, 6)
    revision = iter([started + timedelta(seconds=20), started + timedelta(seconds=21)])
    newer = vintages.capture(root, month, Session(HTTP(revision_file.read_bytes())), "test-only", lambda: next(revision))
    assert newer != archive
    assert vintages.read(newer / "snapshot.json")["values"]["soil_water_mm"] == pytest.approx(18)
    with (archive / "export.nc4").open("ab") as f:
        f.write(b"changed")
    with pytest.raises(ValueError, match="offline replay"):
        vintages.audit(archive)


@pytest.mark.parametrize("status", [301, 401, 403, 206])
def test_partial_redirect_and_auth_responses_never_publish(tmp_path, status):
    with pytest.raises(AcquisitionError, match=f"HTTP {status}"):
        vintages.transfer(Session(HTTP(b"", status)), product_source(), "test-only",
                          tmp_path / "result", vintages.utc_now)
    assert not (tmp_path / "result").exists()


def test_rejects_short_body(tmp_path):
    with pytest.raises(AcquisitionError, match="truncated"):
        vintages.transfer(Session(HTTP(vintages.NETCDF4_MAGIC, truncated=True)), product_source(), "test-only",
                          tmp_path / "result", vintages.utc_now)


def test_unsigned_candidate_and_post_issue_witness_are_ineligible():
    config, _, inputs, _, receipts = fixture()
    target = instant("2026-01-01T00:00:00Z")
    cutoff = issue_month(target, 1)
    candidate = next(row for row in receipts if row["snapshot_sha256"] == fingerprint(inputs[0]))
    with pytest.raises(ValueError, match="prefix-only"):
        verify_snapshot(inputs[0], [{**candidate, "evidence_status": "local_candidate_unwitnessed"}], cutoff, config)
    candidate["witnessed_at"] = "2026-01-01T00:00:00Z"
    with pytest.raises(ValueError, match="unavailable"):
        features(inputs, target, cutoff, receipts, config)
