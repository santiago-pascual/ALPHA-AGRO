"""Capture a bounded NSIDC SMAP L4 V008 sample with verifiable local provenance."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, urlsplit

import requests

from gldas.acquisition import AcquisitionError, CMR, NETCDF4_MAGIC, checksum, retry, write_json
from gldas.auth import earthdata_token

COLLECTION = "C3480440870-NSIDC_CPRD"
DOI = "10.5067/T5RUATAQREF8"
HOST = "data.nsidc.earthdatacloud.nasa.gov"
CDN = "d3h5e2j7riftk6.cloudfront.net"
BUDGET = 160_000_000
NAME = r"SMAP_L4_SM_gph_\d{8}T\d{6}_Vv8\d+_\d{3}\.h5"


def utc(value):
    moment = datetime.fromisoformat(value)
    if moment.utcoffset() is None:
        raise ValueError("Use UTC timestamps with an explicit offset.")
    return moment.astimezone(timezone.utc)


def official_asset(url):
    parsed = urlsplit(url)
    return (parsed.scheme == "https" and parsed.netloc == HOST and not parsed.query and not parsed.fragment
            and re.fullmatch(rf"/nsidc-cumulus-prod-protected/SMAP/SPL4SMGP/008/\d{{4}}/\d{{2}}/\d{{2}}/{NAME}",
                             parsed.path))


def discover(session, granule):
    with session.get(CMR, params={"collection_concept_id": COLLECTION, "concept_id": granule, "page_size": 1},
                     timeout=(8, 20)) as response:
        response.raise_for_status()
        item, = response.json()["items"]
    if item["meta"]["concept-id"] != granule:
        raise AcquisitionError("CMR returned a different granule.")
    metadata = item["umm"]
    asset, = {item["URL"] for item in metadata["RelatedUrls"] if item["Type"] == "GET DATA"
              and official_asset(item["URL"])}
    interval = metadata["TemporalExtent"]["RangeDateTime"]
    return {"collection": COLLECTION, "doi": DOI, "version": "008", "id": granule, "url": asset,
            "observed_start": utc(interval["BeginningDateTime"]).isoformat(),
            "observed_end": utc(interval["EndingDateTime"]).isoformat(),
            "catalog_provider_dates": metadata.get("ProviderDates", [])}


def signed_redirect(location, filename):
    parsed = urlsplit(location)
    query = parse_qs(parsed.query)
    if (parsed.scheme != "https" or parsed.netloc != CDN or parsed.fragment
            or not parsed.path.endswith("/" + filename)
            or not {"Signature", "Key-Pair-Id"} <= query.keys()
            or not ({"Policy", "Expires"} & query.keys())):
        raise AcquisitionError("NSIDC redirected outside the approved signed asset destination.")
    return location


def receive(response, path):
    length = response.headers.get("Content-Length")
    if response.status_code != 200 or response.headers.get("Content-Range"):
        raise AcquisitionError(f"NSIDC asset HTTP {response.status_code}; expected the complete HDF5.")
    if length is not None and not 8 <= int(length) <= BUDGET:
        raise AcquisitionError("NSIDC asset exceeded the single-file byte limit.")
    size = 0
    with path.open("wb") as file:
        for block in response.iter_content(1024 * 1024):
            size += len(block)
            if size > BUDGET:
                raise AcquisitionError("NSIDC asset exceeded the single-file byte limit.")
            file.write(block)
    if length is not None and size != int(length):
        raise requests.exceptions.ChunkedEncodingError("Incomplete NSIDC HDF5.")
    with path.open("rb") as file:
        if file.read(8) != NETCDF4_MAGIC:
            raise AcquisitionError("NSIDC asset did not contain HDF5.")


def capture(session, source, token, root):
    if not official_asset(source["url"]) or source["collection"] != COLLECTION:
        raise AcquisitionError("Unexpected NSIDC asset source.")
    name = urlsplit(source["url"]).path.rsplit("/", 1)[-1]
    directory = root / source["id"]
    if directory.exists():
        record = json.loads((directory / "capture.json").read_text(encoding="utf-8"))
        if record["source"] != source or record["sha256"] != checksum(directory / name):
            raise AcquisitionError("Saved NSIDC bundle failed its source or checksum audit.")
        return directory
    root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=root) as stage:
        bundle = Path(stage) / "bundle"
        bundle.mkdir()
        temporary = bundle / name

        def fetch():
            with session.get(source["url"], headers={"Authorization": f"Bearer {token}"},
                             stream=True, allow_redirects=False, timeout=(8, 25)) as response:
                if response.status_code == 200:
                    receive(response, temporary)
                    return
                if response.status_code in {401, 403}:
                    raise AcquisitionError(f"NSIDC denied Earthdata access (HTTP {response.status_code}).")
                if response.status_code != 303:
                    response.raise_for_status()
                    raise AcquisitionError(f"Unexpected NSIDC HTTP {response.status_code}.")
                destination = signed_redirect(response.headers.get("Location", ""), name)
            # The provider's expiring signed redirect authorizes this transfer. The Earthdata bearer
            # stays at NSIDC and the signed URL stays in memory.
            with session.get(destination, stream=True, allow_redirects=False, timeout=(8, 25)) as response:
                receive(response, temporary)

        retry(fetch)
        record = {"schema": "smap_l4_native_capture_v1", "source": source, "filename": name,
                  "locally_accessed_at": datetime.now(timezone.utc).isoformat(), "bytes": temporary.stat().st_size,
                  "sha256": checksum(temporary)}
        write_json(bundle / "capture.json", record)
        bundle.rename(directory)
    return directory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--granule", required=True)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--prompt-token", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"G\d+-NSIDC_CPRD", args.granule):
        parser.error("Use one NSIDC granule concept ID.")
    try:
        token = earthdata_token(prompt=args.prompt_token)
        if not token:
            raise AcquisitionError("Configure NASA Earthdata authentication before capture.")
        with requests.Session() as session:
            session.trust_env = False
            print(capture(session, discover(session, args.granule), token, args.archive))
    except requests.RequestException:
        parser.exit(2, "NASA request failed before a complete verified transfer.\n")
    except (ValueError, OSError, KeyError, AcquisitionError) as error:
        parser.exit(2, f"SMAP capture withheld: {error}\n")


if __name__ == "__main__":
    main()
