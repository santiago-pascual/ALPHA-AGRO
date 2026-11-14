from datetime import date
from getpass import GetPassWarning
import json
import sys
import warnings
from urllib.parse import urlsplit

import netCDF4 as nc
import numpy as np
import pytest
import requests

from gldas.acquisition import (
    AcquisitionError, NETCDF4_MAGIC, PRODUCTS, discover, open_granule, preserve, retry, valid_data_url,
)
from gldas.validation import LAYERS, ValidationError, validate_and_subset
from gldas import __main__ as cli

PRODUCT = PRODUCTS["monthly"]
FILE = "GLDAS_NOAH025_M.A202001.021.nc4"
URL = "https://data.gesdisc.earthdata.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/2020/" + FILE
GRANULE = {"filename": FILE, "start": "2020-01-01T00:00:00Z", "url": URL}


def test_prompt_refuses_getpass_echo_fallback(monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["gldas", "--start", "2020-01-01",
                                      "--end", "2020-01-31", "--prompt-token"])
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True)

    def unavailable(prompt):
        warnings.warn("Input may be echoed.", GetPassWarning)
        pytest.fail("The prompt fell back to echoed input.")

    monkeypatch.setattr(cli, "getpass", unavailable)
    with pytest.raises(SystemExit) as result:
        cli.main()
    assert result.value.code == 2
    assert "Cannot hide input" in capsys.readouterr().err


def test_batch_guard():
    with pytest.raises(AcquisitionError, match="240 granules"):
        discover(None, PRODUCT, date(2006, 1, 1), date(2025, 12, 31), 8)


def test_official_url_boundary():
    assert valid_data_url(URL, PRODUCT, FILE)
    assert not valid_data_url(URL.replace(".2.1/", ".2.0/"), PRODUCT, FILE)
    assert not valid_data_url(URL + "?token=placeholder", PRODUCT, FILE)
    assert not valid_data_url(URL.replace("https://", "https://other.example@"), PRODUCT, FILE)


@pytest.mark.parametrize("redirect_host", ["urs.earthdata.nasa.gov", "other.example"])
def test_download_redirect_stays_on_known_nasa_hosts(redirect_host):
    class Session:
        urls = []

        def get(self, url, **kwargs):
            self.urls.append(url)
            assert kwargs["allow_redirects"] is False
            response = requests.Response()
            response._content = b""
            response._content_consumed = True
            response.status_code = 302
            response.headers["Location"] = (
                f"https://{redirect_host}/oauth/authorize" if len(self.urls) == 1 else URL
            )
            if len(self.urls) == 3:
                response.status_code = 200
                response.headers.clear()
            return response

    session = Session()
    if redirect_host == "other.example":
        with pytest.raises(AcquisitionError, match="unsupported destination"):
            open_granule(session, URL, "placeholder")
        assert session.urls == [URL]
    else:
        with open_granule(session, URL, "placeholder") as response:
            assert response.status_code == 200
        assert session.urls == [URL, "https://urs.earthdata.nasa.gov/oauth/authorize", URL]


@pytest.mark.parametrize(("host", "prefix", "query", "accepted"), [
    ("gesdisc-cumulus-prod-protected.s3.us-west-2.amazonaws.com", "",
     "X-Amz-Credential=placeholder&X-Amz-Signature=placeholder", True),
    ("gesdisc-cumulus-prod-protected.s3.us-west-2.amazonaws.com", "/other",
     "X-Amz-Credential=placeholder&X-Amz-Signature=placeholder", False),
    ("d2b3c3wh8s6en5.cloudfront.net", "",
     "Expires=2000000000&Signature=placeholder&Key-Pair-Id=placeholder", True),
    ("d2b3c3wh8s6en5.cloudfront.net", "/gesdisc-cumulus-prod-protected",
     "Policy=placeholder&Signature=placeholder&Key-Pair-Id=placeholder", True),
    ("d2b3c3wh8s6en5.cloudfront.net", "/other",
     "Policy=placeholder&Signature=placeholder&Key-Pair-Id=placeholder", False),
    ("d2b3c3wh8s6en5.cloudfront.net", "", "Expires=2000000000", False),
    ("unrelated.cloudfront.net", "",
     "Policy=placeholder&Signature=placeholder&Key-Pair-Id=placeholder", False),
])
def test_signed_storage_redirect_never_receives_earthdata_token(host, prefix, query, accepted):
    object_path = urlsplit(URL).path.removeprefix("/data")
    signed_url = f"https://{host}{prefix}{object_path}?{query}"

    class Session:
        def get(self, url, *, headers, **kwargs):
            response = requests.Response()
            response._content_consumed = True
            if url == URL:
                assert headers == {"Authorization": "Bearer placeholder"}
                response.status_code = 302
                response.headers["Location"] = signed_url
            else:
                assert url == signed_url and accepted
                assert headers == {}
                response.status_code = 200
            return response

    if not accepted:
        with pytest.raises(AcquisitionError, match="unsupported destination"):
            open_granule(Session(), URL, "placeholder")
    else:
        with open_granule(Session(), URL, "placeholder") as response:
            assert response.status_code == 200


@pytest.mark.parametrize(("status", "attempts"), [(503, 3), (401, 1)])
def test_retry_classification(monkeypatch, status, attempts):
    monkeypatch.setattr("gldas.acquisition.sleep", lambda _: None)
    calls = []

    def request():
        calls.append(True)
        response = requests.Response()
        response.status_code = status
        response.raise_for_status()

    with pytest.raises(AcquisitionError, match=f"HTTP {status}"):
        retry(request)
    assert len(calls) == attempts


def test_preservation_and_checksum(tmp_path):
    source = tmp_path / FILE
    source.write_bytes(NETCDF4_MAGIC + b"test")
    raw, record = preserve(None, GRANULE, tmp_path / "raw", local=source)
    assert raw.read_bytes() == source.read_bytes()
    manifest = json.loads(raw.with_name(raw.name + ".json").read_text())
    assert manifest == record
    assert preserve(None, GRANULE, raw.parent)[1] == record
    raw.write_bytes(NETCDF4_MAGIC + b"changed")
    with pytest.raises(AcquisitionError, match="checksum mismatch"):
        preserve(None, GRANULE, raw.parent)


def test_validation_masks_fill_and_rejects_wrong_units(tmp_path):
    source = tmp_path / FILE
    subset = tmp_path / "subset.nc4"
    bounds = (-64, -38, -63.5, -37.5)
    with nc.Dataset(source, "w") as dataset:
        dataset.title = "GLDAS2.1 test monthly mean"
        for name, length in {"time": 1, "bnds": 2, "lat": 600, "lon": 1440}.items():
            dataset.createDimension(name, length)
        for name, start, length, units in (
            ("lat", -59.875, 600, "degrees_north"), ("lon", -179.875, 1440, "degrees_east"),
        ):
            variable = dataset.createVariable(name, "f4", (name,))
            variable.units = units
            variable[:] = start + np.arange(length) * 0.25
        time = dataset.createVariable("time", "f8", ("time",))
        time.units = "days since 2020-01-01 00:00:00"
        time.bounds = "time_bnds"
        time[:] = [0]
        dataset.createVariable("time_bnds", "f8", ("time", "bnds"))[:] = [[0, 31]]
        for name, units in {**dict.fromkeys(LAYERS, "kg m-2"), "RootMoist_inst": "kg m-2",
                            "Rainf_f_tavg": "kg m-2 s-1", "Tair_f_inst": "K"}.items():
            variable = dataset.createVariable(name, "f4", ("time", "lat", "lon"), fill_value=-9999)
            variable.units = units
            variable.cell_methods = "time: mean"
            variable[0, 88:90, 464:466] = [[12, -9999], [16, 18]]
    report = validate_and_subset(source, subset, GRANULE, "monthly", bounds)
    assert report["subset_cells"] == 4
    assert report["fields_checked"]["SoilMoi0_10cm_inst"]["masked_cells"] == 1
    with nc.Dataset(subset) as dataset:
        assert dataset["SoilMoi0_10cm_inst"][:].count() == 3
    with nc.Dataset(source, "a") as dataset:
        dataset["SoilMoi0_10cm_inst"].units = "K"
    with pytest.raises(ValidationError, match="units"):
        validate_and_subset(source, subset, GRANULE, "monthly", bounds)
