from __future__ import annotations

import json
import math
import urllib.parse
import warnings
from pathlib import Path

import numpy as np
from PIL import Image
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales

from annotate_fits_sky import ROOT, build_constellation_groups, get_visible_stars


OUTPUT_JSON_PATH = ROOT / "stars" / "astro-annotations.json"
OUTPUT_MODULE_PATH = ROOT / "stars" / "astro-annotations.js"
WEB_OUTPUT_DIR = ROOT / "stars" / "web"
WEB_MAX_EDGE = 2400
CATALOG_DIR = ROOT / "stars" / "catalogs"
IAU_CATALOG_PATH = CATALOG_DIR / "iau_named_stars.json"
DSO_CATALOG_PATH = CATALOG_DIR / "famous_dso_catalog.json"


IMAGE_SPECS = {
    "2026-02-18_20-43-15___60.fits": {
        "imageId": "orion-field",
        "title": "Orion Field",
        "sourceImage": ROOT / "stars" / "2026-02-18_20-43-15___60.00s_0009.png",
        "webImage": WEB_OUTPUT_DIR / "orion-field.jpg",
        "displayFlipVertical": True,
        "displayMode": "deep-sky",
        "constellations": ["Orion"],
        "starMagnitudeLimit": 2.5,
        "maxStarLabels": 4,
        "maxDsoLabels": 8,
    },
    "DSC02260.fits": {
        "imageId": "night-haze",
        "title": "Night Haze",
        "sourceImage": ROOT / "stars" / "DSC02260.TIF",
        "webImage": WEB_OUTPUT_DIR / "night-haze.jpg",
        "displayFlipVertical": True,
        "displayMode": "wide-field",
        "constellations": ["Ursa Major", "Ursa Minor", "Draco"],
        "starMagnitudeLimit": 3.6,
        "maxStarLabels": 8,
        "maxDsoLabels": 10,
    },
}


TYPE_NAMES = {
    "Gx": "galaxy",
    "OC": "open-cluster",
    "Gb": "globular-cluster",
    "Nb": "nebula",
    "Pl": "planetary-nebula",
    "C+N": "cluster-nebula",
    "Ast": "asterism",
    "Kt": "knot",
    "***": "triple-star",
    "D*": "double-star",
    "*": "star",
    "?": "uncertain",
    "-": "nonexistent",
    "PD": "plate-defect",
    "": "unknown",
}

CONSTELLATION_ABBREVIATIONS = {
    "Andromeda": "And",
    "Auriga": "Aur",
    "Bootes": "Boo",
    "Cancer": "Cnc",
    "Canes Venatici": "CVn",
    "Canis Major": "CMa",
    "Canis Minor": "CMi",
    "Cassiopeia": "Cas",
    "Cepheus": "Cep",
    "Cygnus": "Cyg",
    "Draco": "Dra",
    "Eridanus": "Eri",
    "Gemini": "Gem",
    "Leo": "Leo",
    "Lepus": "Lep",
    "Lyra": "Lyr",
    "Orion": "Ori",
    "Perseus": "Per",
    "Taurus": "Tau",
    "Ursa Major": "UMa",
    "Ursa Minor": "UMi",
}


def round_pct(value: float) -> float:
    return round(float(value), 4)


def slugify(value: str) -> str:
    return (
        value.lower()
        .replace("ö", "o")
        .replace(" ", "-")
        .replace("/", "-")
        .replace("'", "")
        .replace(".", "")
    )


def preferred_constellation_codes(names: set[str]) -> set[str]:
    codes = set(names)
    for name in names:
        code = CONSTELLATION_ABBREVIATIONS.get(name)
        if code:
            codes.add(code)
    return codes


def normalize_common_name(name: str, category: str) -> str:
    normalized = " ".join(name.strip().split())
    lower = normalized.lower()
    if lower == "great nebula in orion":
        return "Orion Nebula"
    if lower.endswith(" nebulae") and category == "galaxy":
        return f"{normalized[:-8].strip()} Galaxy"
    if lower.endswith(" nebula") and category == "galaxy":
        return f"{normalized[:-7].strip()} Galaxy"
    return normalized.title()


def build_constellation_star_prominence(
    visible_stars: list[dict[str, object]],
    wanted_names: set[str],
) -> dict[str, float]:
    prominence: dict[str, float] = {}
    groups = build_constellation_groups(visible_stars, max_constellations=99)
    for group in groups:
        if str(group["name"]) not in wanted_names:
            continue
        for star in group["stars"]:
            name = str(star["name"])
            prominence.setdefault(name, 1.0)
        for start_star, end_star in group["lines"]:
            prominence[str(start_star["name"])] = prominence.get(str(start_star["name"]), 1.0) + 2.0
            prominence[str(end_star["name"])] = prominence.get(str(end_star["name"]), 1.0) + 2.0
    return prominence


def load_json(path: Path) -> dict[str, object]:
    if not path.exists():
        raise FileNotFoundError(
            f"Missing official catalog cache: {path}. "
            "Run tools/update_official_astro_catalogs.py first."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_orientation_deg(wcs: WCS, width: int, height: int, flip_vertical: bool) -> float | None:
    center_x = (width - 1) / 2
    center_y = (height - 1) / 2
    center_world = wcs.pixel_to_world(center_x, center_y)
    north_world = SkyCoord(center_world.ra, center_world.dec + 0.25 * u.deg, frame="icrs")
    east_world = SkyCoord(center_world.ra + 0.25 * u.deg, center_world.dec, frame="icrs")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        north_x, north_y = wcs.world_to_pixel(north_world)
        east_x, east_y = wcs.world_to_pixel(east_world)

    if not all(math.isfinite(float(value)) for value in (north_x, north_y, east_x, east_y)):
        return None

    center_display_y = display_y(center_y, height, flip_vertical)
    north_display_y = display_y(float(north_y), height, flip_vertical)
    east_display_y = display_y(float(east_y), height, flip_vertical)

    north_angle = math.degrees(math.atan2(north_display_y - center_display_y, float(north_x) - center_x))
    east_angle = math.degrees(math.atan2(east_display_y - center_display_y, float(east_x) - center_x))
    orientation = (east_angle - north_angle) % 360.0
    return round(orientation, 3)


def display_y(y: float, height: int, flip_vertical: bool) -> float:
    if not flip_vertical:
        return float(y)
    return float(height - 1) - float(y)


def to_percent(value: float, span: int) -> float:
    if span <= 1:
        return 0.0
    return round_pct(100.0 * float(value) / float(span - 1))


def image_relative_path(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def compress_channel_histogram(values: list[int], bins: int = 64) -> list[int]:
    if not values:
        return [0] * bins
    step = max(1, len(values) // bins)
    compressed = []
    for index in range(0, len(values), step):
        compressed.append(int(sum(values[index : index + step])))
        if len(compressed) >= bins:
            break
    if len(compressed) < bins:
        compressed.extend([0] * (bins - len(compressed)))
    return compressed[:bins]


def build_histogram_payload(image: Image.Image) -> dict[str, object]:
    sample = image.copy()
    if max(sample.size) > 1024:
        sample.thumbnail((1024, 1024), Image.Resampling.BILINEAR)
    raw = sample.histogram()
    red = compress_channel_histogram(raw[0:256])
    green = compress_channel_histogram(raw[256:512])
    blue = compress_channel_histogram(raw[512:768])
    return {
        "bins": len(red),
        "red": red,
        "green": green,
        "blue": blue,
        "maxCount": max(max(red), max(green), max(blue), 1),
    }


def world_to_pixel(wcs: WCS, ra_deg: float, dec_deg: float) -> tuple[float, float]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        x, y = wcs.world_to_pixel_values(ra_deg, dec_deg)
    return float(np.asarray(x)), float(np.asarray(y))


def in_bounds(x: float, y: float, width: int, height: int) -> bool:
    return math.isfinite(x) and math.isfinite(y) and 0 <= x < width and 0 <= y < height


def ensure_web_image(source_image: Path, web_image: Path) -> tuple[int, int, dict[str, object]]:
    WEB_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with Image.open(source_image) as image:
        rgb = image.convert("RGB")
        histogram = build_histogram_payload(rgb)
        if max(rgb.size) > WEB_MAX_EDGE:
            rgb.thumbnail((WEB_MAX_EDGE, WEB_MAX_EDGE), Image.Resampling.LANCZOS)
        rgb.save(web_image, quality=92, optimize=True)
        return rgb.size[0], rgb.size[1], histogram


def simbad_identifier_url(identifier: str) -> str:
    return f"https://simbad.cds.unistra.fr/simbad/sim-id?Ident={urllib.parse.quote(identifier)}"


def iau_constellation_url(name: str) -> str:
    return f"https://www.iau.org/public/themes/constellations/#{urllib.parse.quote(name.lower().replace(' ', '-'))}"


def project_named_star(
    wcs: WCS,
    width: int,
    height: int,
    flip_vertical: bool,
    row: dict[str, object],
) -> dict[str, object] | None:
    x, y = world_to_pixel(wcs, float(row["raDeg"]), float(row["decDeg"]))
    if not in_bounds(x, y, width, height):
        return None

    return {
        "id": slugify(str(row["name"])),
        "name": str(row["name"]),
        "kind": "star",
        "category": "star",
        "constellation": str(row["constellation"]),
        "vmag": float(row["vmag"]),
        "raDeg": round(float(row["raDeg"]), 6),
        "decDeg": round(float(row["decDeg"]), 6),
        "docUrl": simbad_identifier_url(str(row["name"])),
        "docSource": "CDS SIMBAD",
        "xPct": to_percent(x, width),
        "yPct": to_percent(display_y(y, height, flip_vertical), height),
    }


def center_distance_pct(x_pct: float, y_pct: float) -> float:
    return math.hypot(float(x_pct) - 50.0, float(y_pct) - 50.0)


def score_named_star(
    star: dict[str, object],
    preferred_constellations: set[str],
    star_prominence: dict[str, float],
) -> float:
    score = max(0.0, 7.0 - float(star["vmag"])) * 100.0
    if str(star["constellation"]) in preferred_constellations:
        score += 180.0
    score += star_prominence.get(str(star["name"]), 0.0) * 45.0
    score -= center_distance_pct(float(star["xPct"]), float(star["yPct"])) * 3.0
    return score


def select_named_stars(
    wcs: WCS,
    width: int,
    height: int,
    flip_vertical: bool,
    named_star_catalog: list[dict[str, object]],
    preferred_constellations: set[str],
    star_prominence: dict[str, float],
    magnitude_limit: float,
    max_labels: int,
) -> list[dict[str, object]]:
    visible = []
    for row in named_star_catalog:
        if float(row["vmag"]) > magnitude_limit:
            continue
        projected = project_named_star(wcs, width, height, flip_vertical, row)
        if projected is None:
            continue
        projected["score"] = score_named_star(projected, preferred_constellations, star_prominence)
        visible.append(projected)

    preferred = [item for item in visible if str(item["constellation"]) in preferred_constellations]
    fallback = [item for item in visible if str(item["constellation"]) not in preferred_constellations and float(item["vmag"]) <= 1.5]
    pool = preferred if preferred else visible
    if preferred:
        pool.extend(fallback)

    pool.sort(key=lambda item: (-float(item["score"]), float(item["vmag"]), str(item["name"])))
    selected: list[dict[str, object]] = []
    min_distance_pct = 8.0 if max_labels <= 4 else 5.0

    for item in pool:
        if any(
            math.hypot(float(item["xPct"]) - float(other["xPct"]), float(item["yPct"]) - float(other["yPct"])) < min_distance_pct
            for other in selected
        ):
            continue
        selected.append({key: value for key, value in item.items() if key != "score"})
        if len(selected) >= max_labels:
            break

    return selected


def classify_kind(code: str) -> str:
    return TYPE_NAMES.get(code.strip(), "unknown")


def classify_category(kind: str) -> str:
    if "galaxy" in kind:
        return "galaxy"
    if "nebula" in kind or kind in {"knot"}:
        return "nebula"
    if "cluster" in kind:
        return "cluster"
    return "other"


def project_dso(
    wcs: WCS,
    width: int,
    height: int,
    flip_vertical: bool,
    row: dict[str, object],
) -> dict[str, object] | None:
    center_x, center_y = world_to_pixel(wcs, float(row["raDeg"]), float(row["decDeg"]))
    if not in_bounds(center_x, center_y, width, height):
        return None

    center_display_y = display_y(center_y, height, flip_vertical)
    size_arcmin = float(row["sizeArcmin"] or 0.0)
    if size_arcmin > 0:
        pixel_scale_deg = float(np.mean(proj_plane_pixel_scales(wcs)))  # degrees / pixel
        radius_px = (size_arcmin / 60.0) * 0.5 / max(pixel_scale_deg, 1e-9)
    else:
        radius_px = 0.0

    label_name = str(row["labelName"])
    display_name = str(row["displayName"])
    messier_names = [str(value) for value in row.get("messierNames", [])]
    unique_common_names = [str(value) for value in row.get("uniqueCommonNames", [])]
    common_names = [str(value) for value in row.get("commonNames", [])]
    mag = row.get("mag")
    mag_value = float(mag) if mag is not None else None
    kind = classify_kind(str(row["objectType"]))
    category = classify_category(kind)
    preferred_label = messier_names[0] if messier_names else label_name
    display_common_name = ""
    if unique_common_names:
        display_common_name = normalize_common_name(unique_common_names[0], category)
    elif common_names:
        display_common_name = normalize_common_name(common_names[0], category)

    return {
        "id": slugify(label_name),
        "name": display_name,
        "catalogName": preferred_label,
        "displayLabel": preferred_label if not display_common_name else f"{preferred_label} · {display_common_name}",
        "kind": kind,
        "category": category,
        "catalogRef": str(row["catalogName"]),
        "constellation": str(row["constellation"]),
        "messierNames": messier_names,
        "commonNames": common_names,
        "displayCommonName": display_common_name,
        "raDeg": round(float(row["raDeg"]), 6),
        "decDeg": round(float(row["decDeg"]), 6),
        "docUrl": simbad_identifier_url(preferred_label if messier_names else str(row["catalogName"])),
        "docSource": "CDS SIMBAD",
        "xPct": to_percent(center_x, width),
        "yPct": to_percent(center_display_y, height),
        "radiusXPct": round_pct(100.0 * radius_px / max(width - 1, 1)),
        "radiusYPct": round_pct(100.0 * radius_px / max(height - 1, 1)),
        "rotationDeg": 0.0,
        "sizeArcmin": size_arcmin,
        "mag": mag_value,
        "scoreMessier": bool(messier_names),
        "scoreUniqueCommonName": bool(unique_common_names),
    }


def score_dso(dso: dict[str, object], preferred_constellations: set[str]) -> float:
    score = 0.0
    if dso["scoreMessier"]:
        score += 1000.0
    if dso["scoreUniqueCommonName"]:
        score += 250.0
    if str(dso["constellation"]) in preferred_constellations:
        score += 150.0
    score += min(120.0, float(dso["sizeArcmin"]))
    if dso["mag"] is not None:
        score += max(0.0, 12.0 - float(dso["mag"])) * 8.0
    score -= center_distance_pct(float(dso["xPct"]), float(dso["yPct"])) * 4.0
    return score


def select_deep_sky_objects(
    wcs: WCS,
    width: int,
    height: int,
    flip_vertical: bool,
    dso_catalog: list[dict[str, object]],
    preferred_constellations: set[str],
    max_labels: int,
) -> list[dict[str, object]]:
    visible = []
    for row in dso_catalog:
        projected = project_dso(wcs, width, height, flip_vertical, row)
        if projected is None:
            continue
        projected["score"] = score_dso(projected, preferred_constellations)
        visible.append(projected)

    visible.sort(
        key=lambda item: (
            -float(item["score"]),
            float(item["mag"]) if item["mag"] is not None else 99.0,
            str(item["catalogName"]),
        )
    )

    preferred = [item for item in visible if str(item["constellation"]) in preferred_constellations]
    fallback = [
        item
        for item in visible
        if str(item["constellation"]) not in preferred_constellations
        and item["scoreMessier"]
        and center_distance_pct(float(item["xPct"]), float(item["yPct"])) <= 28.0
    ]
    pool = preferred if preferred else visible
    if preferred:
        pool.extend(fallback)

    selected: list[dict[str, object]] = []
    min_distance_pct = 4.0
    for item in pool:
        blocked = False
        for other in selected:
            distance = math.hypot(float(item["xPct"]) - float(other["xPct"]), float(item["yPct"]) - float(other["yPct"]))
            threshold = 1.0 if item["scoreMessier"] and other["catalogName"].startswith("M") else min_distance_pct
            if distance < threshold:
                blocked = True
                break
        if blocked:
            continue
        selected.append(
            {
                key: value
                for key, value in item.items()
                if key not in {"score", "scoreMessier", "scoreUniqueCommonName"}
            }
        )
        if len(selected) >= max_labels:
            break

    return selected


def build_constellation_payload(
    visible_stars: list[dict[str, object]],
    wanted_names: set[str],
    width: int,
    height: int,
    flip_vertical: bool,
    image_mode: str,
) -> list[dict[str, object]]:
    groups = build_constellation_groups(visible_stars, max_constellations=99)
    payload = []

    for group in groups:
        name = str(group["name"])
        if name not in wanted_names:
            continue
        is_full = len(group["stars"]) >= 3 and len(group["lines"]) >= 2
        is_partial = image_mode == "deep-sky" and len(group["stars"]) >= 2 and len(group["lines"]) >= 1
        if not is_full and not is_partial:
            continue

        points = []
        point_lookup: dict[str, int] = {}
        for star in group["stars"]:
            star_name = str(star["name"])
            point_lookup[star_name] = len(points)
            points.append(
                {
                    "id": slugify(star_name),
                    "name": star_name,
                    "xPct": to_percent(float(star["pixel_x"]), width),
                    "yPct": to_percent(display_y(float(star["pixel_y"]), height, flip_vertical), height),
                }
            )

        lines = []
        for start_star, end_star in group["lines"]:
            start_name = str(start_star["name"])
            end_name = str(end_star["name"])
            if start_name not in point_lookup or end_name not in point_lookup:
                continue
            lines.append({"from": point_lookup[start_name], "to": point_lookup[end_name]})

        if is_full and len(lines) < 2:
            continue
        if not is_full and len(lines) < 1:
            continue

        center_x = sum(point["xPct"] for point in points) / len(points)
        center_y = sum(point["yPct"] for point in points) / len(points)
        payload.append(
            {
                "id": slugify(name),
                "name": name,
                "kind": "constellation",
                "category": "constellation",
                "partial": not is_full,
                "docUrl": iau_constellation_url(name),
                "docSource": "IAU Constellations",
                "labelXPct": round_pct(center_x),
                "labelYPct": round_pct(center_y),
                "points": points,
                "lines": lines,
            }
        )

    return payload


def drawable_constellation_names(
    visible_stars: list[dict[str, object]],
    wanted_names: set[str],
    image_mode: str,
) -> set[str]:
    groups = build_constellation_groups(visible_stars, max_constellations=99)
    names: set[str] = set()
    for group in groups:
        name = str(group["name"])
        if name not in wanted_names:
            continue
        is_full = len(group["stars"]) >= 3 and len(group["lines"]) >= 2
        is_partial = image_mode == "deep-sky" and len(group["stars"]) >= 2 and len(group["lines"]) >= 1
        if is_full or is_partial:
            names.add(name)
    return names


def build_entry(
    path: Path,
    spec: dict[str, object],
    named_star_catalog: list[dict[str, object]],
    dso_catalog: list[dict[str, object]],
) -> dict[str, object]:
    source_image = Path(spec["sourceImage"])
    web_image = Path(spec["webImage"])
    flip_vertical = bool(spec.get("displayFlipVertical", False))
    requested_constellations = set(str(value) for value in spec["constellations"])

    web_width, web_height, histogram = ensure_web_image(source_image, web_image)

    with fits.open(path, memmap=True, do_not_scale_image_data=True) as hdul:
        header = hdul[0].header
        data = hdul[0].data
        if data is None:
            raise ValueError(f"No FITS image data in {path}")
        if data.ndim != 3:
            raise ValueError(f"Expected 3D FITS cube, got {data.shape} for {path}")

        if data.shape[0] in (3, 4):
            width = int(data.shape[2])
            height = int(data.shape[1])
        else:
            width = int(data.shape[1])
            height = int(data.shape[0])

        wcs = WCS(header, naxis=2)
        visible_constellation_stars = get_visible_stars(wcs, width, height, width, height, max_stars=None)
    drawable_constellations = drawable_constellation_names(
        visible_constellation_stars,
        requested_constellations,
        str(spec["displayMode"]),
    )
    star_preferred_constellation_set = preferred_constellation_codes(drawable_constellations or requested_constellations)
    dso_preferred_constellation_set = preferred_constellation_codes(requested_constellations)
    star_prominence = build_constellation_star_prominence(
        visible_constellation_stars,
        drawable_constellations or requested_constellations,
    )

    constellations = build_constellation_payload(
        visible_constellation_stars,
        requested_constellations,
        width,
        height,
        flip_vertical,
        str(spec["displayMode"]),
    )

    stars = select_named_stars(
        wcs,
        width,
        height,
        flip_vertical,
        named_star_catalog,
        star_preferred_constellation_set,
        star_prominence,
        float(spec["starMagnitudeLimit"]),
        int(spec["maxStarLabels"]),
    )
    deep_sky_objects = select_deep_sky_objects(
        wcs,
        width,
        height,
        flip_vertical,
        dso_catalog,
        dso_preferred_constellation_set,
        int(spec["maxDsoLabels"]),
    )

    return {
        "imageId": str(spec["imageId"]),
        "title": str(spec["title"]),
        "fitsFile": path.name,
        "sourceImage": image_relative_path(source_image),
        "webImage": image_relative_path(web_image),
        "sourceWidth": width,
        "sourceHeight": height,
        "webWidth": web_width,
        "webHeight": web_height,
        "display": {
            "flipVertical": flip_vertical,
            "displayMode": str(spec["displayMode"]),
        },
        "metadata": {
            "capturedAt": header.get("DATE-OBS"),
            "centerRaDeg": round(float(header["CRVAL1"]), 6),
            "centerDecDeg": round(float(header["CRVAL2"]), 6),
            "orientationDeg": resolve_orientation_deg(wcs, width, height, flip_vertical),
            "orientationReference": "display image, E of N",
            "deepSkyCounts": {
                "galaxy": sum(1 for item in deep_sky_objects if item["category"] == "galaxy"),
                "nebula": sum(1 for item in deep_sky_objects if item["category"] == "nebula"),
                "cluster": sum(1 for item in deep_sky_objects if item["category"] == "cluster"),
                "other": sum(1 for item in deep_sky_objects if item["category"] == "other"),
            },
            "histogram": histogram,
        },
        "stars": stars,
        "deepSkyObjects": deep_sky_objects,
        "constellations": constellations,
    }


def build_index() -> dict[str, object]:
    named_star_catalog = load_json(IAU_CATALOG_PATH)["entries"]
    dso_catalog = load_json(DSO_CATALOG_PATH)["entries"]
    images = {}

    for fit_name, spec in IMAGE_SPECS.items():
        fit_path = ROOT / "stars" / fit_name
        if not fit_path.exists():
            raise FileNotFoundError(f"Missing FITS file: {fit_path}")
        entry = build_entry(fit_path, spec, named_star_catalog, dso_catalog)
        images[entry["imageId"]] = entry

    return {
        "version": 3,
        "images": images,
    }


def write_outputs(payload: dict[str, object]) -> None:
    OUTPUT_JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    module_text = (
        "// Generated by tools/generate_astro_overlay_data.py\n"
        f"export const astroAnnotationData = {json.dumps(payload, ensure_ascii=False, indent=2)};\n\n"
        "export function getAstroAnnotation(imageId) {\n"
        "  return astroAnnotationData.images[imageId] || null;\n"
        "}\n"
    )
    OUTPUT_MODULE_PATH.write_text(module_text, encoding="utf-8")


def main() -> int:
    payload = build_index()
    write_outputs(payload)

    for image_id, entry in payload["images"].items():
        print(f"[ok] {image_id}")
        print(f"     stars: {', '.join(item['name'] for item in entry['stars']) or '(none)'}")
        print(f"     dso: {', '.join(item['catalogName'] for item in entry['deepSkyObjects']) or '(none)'}")
        print(f"     constellations: {', '.join(item['name'] for item in entry['constellations']) or '(none)'}")
    print(f"[ok] json: {OUTPUT_JSON_PATH}")
    print(f"[ok] module: {OUTPUT_MODULE_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
