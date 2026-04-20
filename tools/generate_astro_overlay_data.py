from __future__ import annotations

import json
import math
import warnings
from pathlib import Path

import numpy as np
from PIL import Image
from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS

from annotate_fits_sky import ROOT, build_constellation_groups, get_visible_stars


OUTPUT_JSON_PATH = ROOT / "stars" / "astro-annotations.json"
OUTPUT_MODULE_PATH = ROOT / "stars" / "astro-annotations.js"


IMAGE_SPECS = {
    "2026-02-18_20-43-15___60.fits": {
        "imageId": "orion-field",
        "title": "Orion Field",
        "webImage": ROOT / "scenery" / "display" / "r_pp_orion_light_stacked.jpg",
        "starNames": [
            "Rigel",
            "Saiph",
        ],
        "constellations": ["Orion"],
    },
    "DSC02260.fits": {
        "imageId": "night-haze",
        "title": "Night Haze",
        "webImage": ROOT / "scenery" / "display" / "DSC02260.jpg",
        "starNames": [
            "Polaris",
            "Dubhe",
            "Merak",
            "Alioth",
            "Mizar",
            "Alkaid",
            "Pollux",
            "Castor",
            "Regulus",
            "Denebola",
        ],
        "constellations": ["Ursa Major", "Ursa Minor", "Draco", "Leo", "Gemini"],
    },
}


NEBULA_CATALOG = [
    {
        "id": "orion-nebula",
        "name": "Orion Nebula",
        "catalogName": "M42",
        "imageIds": {"orion-field"},
        "raDeg": 83.8201,
        "decDeg": -5.3876,
        "majorArcmin": 85.0,
        "minorArcmin": 60.0,
        "positionAngleDeg": 38.0,
    },
    {
        "id": "running-man-nebula",
        "name": "Running Man Nebula",
        "catalogName": "NGC 1977",
        "imageIds": {"orion-field"},
        "raDeg": 83.82542,
        "decDeg": -4.68472,
        "majorArcmin": 32.0,
        "minorArcmin": 22.0,
        "positionAngleDeg": 26.0,
    },
    {
        "id": "horsehead-nebula",
        "name": "Horsehead Nebula",
        "catalogName": "Barnard 33 / IC 434",
        "imageIds": {"orion-field"},
        "raDeg": 85.24583,
        "decDeg": -2.45833,
        "majorArcmin": 42.0,
        "minorArcmin": 16.0,
        "positionAngleDeg": 2.0,
    },
]


def round_pct(value: float) -> float:
    return round(float(value), 4)


def slugify(value: str) -> str:
    return (
        value.lower()
        .replace("ö", "o")
        .replace(" ", "-")
        .replace("/", "-")
        .replace("'", "")
    )


def to_percent(value: float, span: int) -> float:
    if span <= 1:
        return 0.0
    return round_pct(100.0 * float(value) / float(span - 1))


def world_to_pixel(wcs: WCS, ra_deg: float, dec_deg: float) -> tuple[float, float]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        x, y = wcs.world_to_pixel_values(ra_deg, dec_deg)
    return float(np.asarray(x)), float(np.asarray(y))


def in_bounds(x: float, y: float, width: int, height: int) -> bool:
    return math.isfinite(x) and math.isfinite(y) and 0 <= x < width and 0 <= y < height


def project_nebula(
    wcs: WCS,
    width: int,
    height: int,
    image_id: str,
    row: dict[str, object],
) -> dict[str, object] | None:
    if image_id not in row["imageIds"]:
        return None

    center_x, center_y = world_to_pixel(wcs, float(row["raDeg"]), float(row["decDeg"]))
    if not in_bounds(center_x, center_y, width, height):
        return None

    center = SkyCoord(float(row["raDeg"]) * u.deg, float(row["decDeg"]) * u.deg, frame="icrs")
    major_end = center.directional_offset_by(
        float(row["positionAngleDeg"]) * u.deg,
        float(row["majorArcmin"]) * 0.5 * u.arcmin,
    )
    minor_end = center.directional_offset_by(
        (float(row["positionAngleDeg"]) + 90.0) * u.deg,
        float(row["minorArcmin"]) * 0.5 * u.arcmin,
    )
    major_x, major_y = world_to_pixel(wcs, major_end.ra.deg, major_end.dec.deg)
    minor_x, minor_y = world_to_pixel(wcs, minor_end.ra.deg, minor_end.dec.deg)

    if not (math.isfinite(major_x) and math.isfinite(major_y) and math.isfinite(minor_x) and math.isfinite(minor_y)):
        return None

    radius_x_px = math.hypot(major_x - center_x, major_y - center_y)
    radius_y_px = math.hypot(minor_x - center_x, minor_y - center_y)
    rotation_deg = math.degrees(math.atan2(major_y - center_y, major_x - center_x))

    return {
        "id": str(row["id"]),
        "name": str(row["name"]),
        "catalogName": str(row["catalogName"]),
        "xPct": to_percent(center_x, width),
        "yPct": to_percent(center_y, height),
        "radiusXPct": round_pct(100.0 * radius_x_px / max(width - 1, 1)),
        "radiusYPct": round_pct(100.0 * radius_y_px / max(height - 1, 1)),
        "rotationDeg": round(float(rotation_deg), 3),
    }


def build_constellation_payload(
    visible_stars: list[dict[str, object]],
    wanted_names: set[str],
    width: int,
    height: int,
) -> list[dict[str, object]]:
    groups = build_constellation_groups(visible_stars, max_constellations=99)
    payload = []

    for group in groups:
        name = str(group["name"])
        if name not in wanted_names:
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
                    "yPct": to_percent(float(star["pixel_y"]), height),
                }
            )

        lines = []
        for start_star, end_star in group["lines"]:
            start_name = str(start_star["name"])
            end_name = str(end_star["name"])
            if start_name not in point_lookup or end_name not in point_lookup:
                continue
            lines.append(
                {
                    "from": point_lookup[start_name],
                    "to": point_lookup[end_name],
                }
            )

        center_x = sum(point["xPct"] for point in points) / len(points)
        center_y = sum(point["yPct"] for point in points) / len(points)
        payload.append(
            {
                "id": slugify(name),
                "name": name,
                "labelXPct": round_pct(center_x),
                "labelYPct": round_pct(center_y),
                "points": points,
                "lines": lines,
            }
        )

    return payload


def build_star_payload(
    visible_stars: list[dict[str, object]],
    wanted_names: list[str],
    width: int,
    height: int,
) -> list[dict[str, object]]:
    visible_lookup = {str(star["name"]): star for star in visible_stars}
    payload = []

    for name in wanted_names:
        star = visible_lookup.get(name)
        if not star:
            continue
        payload.append(
            {
                "id": slugify(name),
                "name": name,
                "xPct": to_percent(float(star["pixel_x"]), width),
                "yPct": to_percent(float(star["pixel_y"]), height),
                "constellation": str(star["constellation"]),
            }
        )

    return payload


def build_entry(path: Path, spec: dict[str, object]) -> dict[str, object]:
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
        visible_stars = get_visible_stars(wcs, width, height, width, height, max_stars=None)

    stars = build_star_payload(visible_stars, list(spec["starNames"]), width, height)
    constellations = build_constellation_payload(
        visible_stars,
        set(spec["constellations"]),
        width,
        height,
    )
    nebulae = [
        nebula
        for row in NEBULA_CATALOG
        if (nebula := project_nebula(wcs, width, height, str(spec["imageId"]), row)) is not None
    ]

    with Image.open(spec["webImage"]) as image:
        web_width, web_height = image.size

    return {
        "imageId": str(spec["imageId"]),
        "title": str(spec["title"]),
        "fitsFile": path.name,
        "webImage": str(Path(spec["webImage"]).relative_to(ROOT)).replace("\\", "/"),
        "sourceWidth": width,
        "sourceHeight": height,
        "webWidth": web_width,
        "webHeight": web_height,
        "stars": stars,
        "nebulae": nebulae,
        "constellations": constellations,
    }


def build_index() -> dict[str, object]:
    images = {}

    for fit_name, spec in IMAGE_SPECS.items():
        fit_path = ROOT / "stars" / fit_name
        if not fit_path.exists():
            raise FileNotFoundError(f"Missing FITS file: {fit_path}")
        entry = build_entry(fit_path, spec)
        images[entry["imageId"]] = entry

    return {
        "version": 1,
        "images": images,
    }


def write_outputs(payload: dict[str, object]) -> None:
    OUTPUT_JSON_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

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
        print(f"     nebulae: {', '.join(item['name'] for item in entry['nebulae']) or '(none)'}")
        print(f"     constellations: {', '.join(item['name'] for item in entry['constellations']) or '(none)'}")
    print(f"[ok] json: {OUTPUT_JSON_PATH}")
    print(f"[ok] module: {OUTPUT_MODULE_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
