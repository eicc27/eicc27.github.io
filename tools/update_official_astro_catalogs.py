from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from urllib.request import urlopen

from astropy.coordinates import SkyCoord
from astropy.time import Time
from astropy import units as u


ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = ROOT / "stars" / "catalogs"

IAU_STAR_SOURCE_URL = "https://iauarchive.eso.org/public/themes/naming_stars/"
CDS_BASE_URL = "https://cdsarc.cds.unistra.fr/ftp/cats/VII/118/"
CDS_NGC_URL = CDS_BASE_URL + "ngc2000.dat"
CDS_NAMES_URL = CDS_BASE_URL + "names.dat"
CDS_README_URL = CDS_BASE_URL + "ReadMe"

IAU_OUTPUT_PATH = CATALOG_DIR / "iau_named_stars.json"
DSO_OUTPUT_PATH = CATALOG_DIR / "famous_dso_catalog.json"


def fetch_text(url: str, encoding: str) -> str:
    with urlopen(url, timeout=30) as response:
        return response.read().decode(encoding, "ignore")


def clean_html_cell(value: str) -> str:
    return unescape(re.sub(r"<[^>]+>", "", value)).strip()


def canonical_catalog_name(raw_name: str) -> str:
    text = raw_name.strip()
    if not text:
        return ""
    if text.upper().startswith("I"):
        digits = text[1:].strip()
        return f"IC {digits}"
    return f"NGC {text}"


def parse_float(text: str) -> float | None:
    value = text.strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_iau_named_stars() -> dict[str, object]:
    html = fetch_text(IAU_STAR_SOURCE_URL, "latin1")
    table_start = html.find('<table id="dtHorizontalExample"')
    table_end = html.find("</table>", table_start)
    if table_start < 0 or table_end < 0:
        raise RuntimeError("Unable to locate IAU named-star table in official page")

    fragment = html[table_start:table_end]
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", fragment, re.S | re.I)
    if not rows:
        raise RuntimeError("IAU named-star table contains no rows")

    headers = [clean_html_cell(value) for value in re.findall(r"<th[^>]*>(.*?)</th>", rows[0], re.S | re.I)]
    header_lookup = {name: index for index, name in enumerate(headers)}
    required_headers = ["IAU Name", "Const.", "Vmag", "RA(J2000)", "Dec(J2000)"]
    missing = [name for name in required_headers if name not in header_lookup]
    if missing:
        raise RuntimeError(f"Missing IAU headers: {missing}")

    entries: list[dict[str, object]] = []
    for row in rows[1:]:
        columns = [clean_html_cell(value) for value in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)]
        if len(columns) < len(headers):
            continue

        name = columns[header_lookup["IAU Name"]]
        constellation = columns[header_lookup["Const."]]
        vmag = parse_float(columns[header_lookup["Vmag"]])
        ra_deg = parse_float(columns[header_lookup["RA(J2000)"]])
        dec_deg = parse_float(columns[header_lookup["Dec(J2000)"]])
        if not name or ra_deg is None or dec_deg is None or vmag is None:
            continue

        entries.append(
            {
                "name": name,
                "constellation": constellation,
                "vmag": vmag,
                "raDeg": ra_deg,
                "decDeg": dec_deg,
            }
        )

    entries.sort(key=lambda item: (item["vmag"], item["name"]))
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "name": "IAU Naming Stars page",
            "url": IAU_STAR_SOURCE_URL,
        },
        "entryCount": len(entries),
        "entries": entries,
    }


def parse_names_table() -> tuple[dict[str, dict[str, set[str]]], dict[str, set[str]]]:
    text = fetch_text(CDS_NAMES_URL, "latin1")
    by_catalog_name: dict[str, dict[str, set[str]]] = {}
    common_name_usage: dict[str, set[str]] = defaultdict(set)

    for line in text.splitlines():
        if not line.strip():
            continue
        object_name = line[0:35].strip()
        raw_catalog_name = line[36:41].strip()
        comment = line[42:70].strip()
        catalog_name = canonical_catalog_name(raw_catalog_name)
        if not object_name:
            continue

        if catalog_name:
            entry = by_catalog_name.setdefault(
                catalog_name,
                {
                    "messierNames": set(),
                    "commonNames": set(),
                    "comments": set(),
                },
            )
            if re.fullmatch(r"M\s*\d{1,3}", object_name, re.I):
                entry["messierNames"].add(object_name.replace(" ", "").upper())
            else:
                entry["commonNames"].add(object_name)
                common_name_usage[object_name].add(catalog_name)
            if comment:
                entry["comments"].add(comment)

    return by_catalog_name, common_name_usage


def parse_ngc_main_table(
    name_index: dict[str, dict[str, set[str]]],
    common_name_usage: dict[str, set[str]],
) -> dict[str, object]:
    text = fetch_text(CDS_NGC_URL, "latin1")
    entries: list[dict[str, object]] = []

    for line in text.splitlines():
        if len(line) < 45:
            continue

        raw_name = line[0:5]
        catalog_name = canonical_catalog_name(raw_name)
        if not catalog_name:
            continue

        info = name_index.get(
            catalog_name,
            {
                "messierNames": set(),
                "commonNames": set(),
                "comments": set(),
            },
        )
        has_fame_flag = bool(info["messierNames"] or info["commonNames"])
        if not has_fame_flag:
            continue

        ra_h = line[10:12].strip()
        ra_m = line[13:17].strip()
        dec_sign = line[19:20].strip() or "+"
        dec_d = line[20:22].strip()
        dec_m = line[23:25].strip()

        if not (ra_h and ra_m and dec_d and dec_m):
            continue

        ra_hours = int(ra_h) + float(ra_m) / 60.0
        dec_value = int(dec_d) + int(dec_m) / 60.0
        if dec_sign == "-":
            dec_value = -dec_value

        coord_b2000 = SkyCoord(ra=ra_hours * u.hourangle, dec=dec_value * u.deg, frame="fk4", equinox=Time("B2000"))
        coord_j2000 = coord_b2000.transform_to("icrs")

        common_names = sorted(info["commonNames"])
        unique_common_names = sorted(name for name in common_names if len(common_name_usage[name]) == 1)
        messier_names = sorted(info["messierNames"], key=lambda item: int(item[1:]))

        size_arcmin = parse_float(line[33:38])
        mag = parse_float(line[40:44])
        object_type = line[6:9].strip()
        description = line[46:99].strip()
        constellation = line[29:32].strip()

        if not messier_names and unique_common_names:
            passes_visibility_gate = (mag is not None and mag <= 9.0) or (size_arcmin is not None and size_arcmin >= 8.0)
            if not passes_visibility_gate:
                continue

        if messier_names:
            catalog_label = messier_names[0]
        else:
            catalog_label = catalog_name

        if unique_common_names:
            display_name = min(unique_common_names, key=lambda item: (len(item), item))
        elif common_names:
            display_name = min(common_names, key=lambda item: (len(item), item))
        else:
            display_name = catalog_label

        entries.append(
            {
                "catalogName": catalog_name,
                "labelName": catalog_label,
                "displayName": display_name,
                "objectType": object_type,
                "constellation": constellation,
                "raDeg": round(coord_j2000.ra.deg, 6),
                "decDeg": round(coord_j2000.dec.deg, 6),
                "sizeArcmin": size_arcmin,
                "mag": mag,
                "messierNames": messier_names,
                "commonNames": common_names,
                "uniqueCommonNames": unique_common_names,
                "comments": sorted(info["comments"]),
                "description": description,
            }
        )

    entries.sort(
        key=lambda item: (
            0 if item["messierNames"] else 1,
            item["mag"] if item["mag"] is not None else 99.0,
            -(item["sizeArcmin"] or 0.0),
            item["catalogName"],
        )
    )
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "name": "CDS VizieR VII/118 NGC 2000.0",
            "readmeUrl": CDS_README_URL,
            "ngcUrl": CDS_NGC_URL,
            "namesUrl": CDS_NAMES_URL,
        },
        "entryCount": len(entries),
        "entries": entries,
    }


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    CATALOG_DIR.mkdir(parents=True, exist_ok=True)

    stars_payload = parse_iau_named_stars()
    dso_name_index, common_name_usage = parse_names_table()
    dso_payload = parse_ngc_main_table(dso_name_index, common_name_usage)

    write_json(IAU_OUTPUT_PATH, stars_payload)
    write_json(DSO_OUTPUT_PATH, dso_payload)

    print(f"[ok] stars: {IAU_OUTPUT_PATH} ({stars_payload['entryCount']} entries)")
    print(f"[ok] dso:   {DSO_OUTPUT_PATH} ({dso_payload['entryCount']} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
