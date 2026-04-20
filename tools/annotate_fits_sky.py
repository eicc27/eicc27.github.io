from __future__ import annotations

import argparse
import json
import math
import warnings
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from astropy.io import fits
from astropy.wcs import WCS


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_DIR = ROOT / "stars"
DEFAULT_OUTPUT_DIR = DEFAULT_INPUT_DIR / "annotated"

STAR_ROWS = [
    ("Sirius", "Canis Major", 101.28715533, -16.71611586),
    ("Betelgeuse", "Orion", 88.79293899, 7.40706400),
    ("Rigel", "Orion", 78.63446707, -8.20163836),
    ("Aldebaran", "Taurus", 68.98016279, 16.50930235),
    ("Capella", "Auriga", 79.17232794, 45.99799147),
    ("Procyon", "Canis Minor", 114.82549791, 5.22498756),
    ("Pollux", "Gemini", 116.32895777, 28.02619889),
    ("Castor", "Gemini", 113.64947164, 31.88828222),
    ("Bellatrix", "Orion", 81.28276356, 6.34970326),
    ("Alnilam", "Orion", 84.05338894, -1.20191914),
    ("Alnitak", "Orion", 85.18969443, -1.94257359),
    ("Saiph", "Orion", 86.93912017, -9.66960492),
    ("Mintaka", "Orion", 83.00166706, -0.29909511),
    ("Mirzam", "Canis Major", 95.67493897, -17.95591871),
    ("Wezen", "Canis Major", 107.09785021, -26.39319958),
    ("Adhara", "Canis Major", 104.65645315, -28.97208616),
    ("Alhena", "Gemini", 99.42796043, 16.39928043),
    ("Gomeisa", "Canis Minor", 111.78767391, 8.28931576),
    ("Elnath", "Taurus", 81.57297133, 28.60745172),
    ("Arneb", "Lepus", 83.18256716, -17.82228927),
    ("Nihal", "Lepus", 82.06134537, -20.75944389),
    ("Cursa", "Eridanus", 76.96239535, -5.08649698),
    ("Polaris", "Ursa Minor", 37.95456067, 89.26410897),
    ("Dubhe", "Ursa Major", 165.93196467, 61.75103469),
    ("Merak", "Ursa Major", 165.46033230, 56.38243365),
    ("Phecda", "Ursa Major", 178.45769715, 53.69475973),
    ("Megrez", "Ursa Major", 183.85649936, 57.03261698),
    ("Alioth", "Ursa Major", 193.50728997, 55.95982296),
    ("Mizar", "Ursa Major", 200.98141867, 54.92535197),
    ("Alkaid", "Ursa Major", 206.88515734, 49.31326673),
    ("Kochab", "Ursa Minor", 222.67635750, 74.15550394),
    ("Pherkad", "Ursa Minor", 230.18209805, 71.83402545),
    ("Schedar", "Cassiopeia", 10.12684601, 56.53732922),
    ("Caph", "Cassiopeia", 2.29452158, 59.14978110),
    ("Navi", "Cassiopeia", 14.17708320, 60.71674900),
    ("Ruchbah", "Cassiopeia", 21.45396446, 60.23528403),
    ("Segin", "Cassiopeia", 28.59889203, 63.67010007),
    ("Alderamin", "Cepheus", 319.64488470, 62.58557446),
    ("Alfirk", "Cepheus", 322.16498688, 70.56071519),
    ("Errai", "Cepheus", 354.83712672, 77.63236411),
    ("Menkalinan", "Auriga", 89.88217887, 44.94743257),
    ("Eltanin", "Draco", 269.15154118, 51.48889562),
    ("Rastaban", "Draco", 262.60817373, 52.30138871),
    ("Thuban", "Draco", 211.09732332, 64.37586962),
    ("Grumium", "Draco", 268.38220643, 56.87264193),
    ("Edasich", "Draco", 231.23239085, 58.96606586),
    ("Regulus", "Leo", 152.09296244, 11.96720878),
    ("Algieba", "Leo", 154.99312733, 19.84148522),
    ("Zosma", "Leo", 168.52708927, 20.52371814),
    ("Denebola", "Leo", 177.26490976, 14.57205806),
    ("Cor Caroli", "Canes Venatici", 194.00693995, 38.31837644),
    ("Mirfak", "Perseus", 51.08070872, 49.86117929),
    ("Algol", "Perseus", 47.04221856, 40.95564667),
    ("Vega", "Lyra", 279.23473479, 38.78368896),
    ("Deneb", "Cygnus", 310.35797975, 45.28033881),
    ("Sadr", "Cygnus", 305.55709098, 40.25667916),
    ("Albireo", "Cygnus", 292.68031501, 27.95967363),
    ("Arcturus", "Bootes", 213.91530029, 19.18240916),
    ("Alpheratz", "Andromeda", 2.09691619, 29.09043112),
    ("Mirach", "Andromeda", 17.43301617, 35.62055765),
    ("Almach", "Andromeda", 30.97480121, 42.32972842),
]

CONSTELLATION_LINES = {
    "Orion": [
        ("Betelgeuse", "Bellatrix"),
        ("Betelgeuse", "Saiph"),
        ("Bellatrix", "Rigel"),
        ("Saiph", "Rigel"),
        ("Mintaka", "Alnilam"),
        ("Alnilam", "Alnitak"),
        ("Betelgeuse", "Mintaka"),
        ("Bellatrix", "Mintaka"),
        ("Saiph", "Alnitak"),
        ("Rigel", "Alnitak"),
    ],
    "Canis Major": [
        ("Sirius", "Mirzam"),
        ("Mirzam", "Wezen"),
        ("Wezen", "Adhara"),
        ("Sirius", "Wezen"),
    ],
    "Canis Minor": [
        ("Procyon", "Gomeisa"),
    ],
    "Gemini": [
        ("Castor", "Pollux"),
        ("Castor", "Alhena"),
        ("Pollux", "Alhena"),
    ],
    "Taurus": [
        ("Aldebaran", "Elnath"),
    ],
    "Auriga": [
        ("Capella", "Menkalinan"),
        ("Menkalinan", "Elnath"),
        ("Elnath", "Capella"),
    ],
    "Lepus": [
        ("Arneb", "Nihal"),
    ],
    "Ursa Major": [
        ("Dubhe", "Merak"),
        ("Merak", "Phecda"),
        ("Phecda", "Megrez"),
        ("Megrez", "Alioth"),
        ("Alioth", "Mizar"),
        ("Mizar", "Alkaid"),
        ("Megrez", "Dubhe"),
    ],
    "Ursa Minor": [
        ("Polaris", "Kochab"),
        ("Kochab", "Pherkad"),
        ("Pherkad", "Polaris"),
    ],
    "Cassiopeia": [
        ("Caph", "Schedar"),
        ("Schedar", "Navi"),
        ("Navi", "Ruchbah"),
        ("Ruchbah", "Segin"),
    ],
    "Cepheus": [
        ("Alderamin", "Alfirk"),
        ("Alfirk", "Errai"),
        ("Errai", "Alderamin"),
    ],
    "Draco": [
        ("Thuban", "Edasich"),
        ("Edasich", "Grumium"),
        ("Grumium", "Eltanin"),
        ("Eltanin", "Rastaban"),
    ],
    "Leo": [
        ("Regulus", "Algieba"),
        ("Algieba", "Zosma"),
        ("Zosma", "Denebola"),
    ],
    "Perseus": [
        ("Mirfak", "Algol"),
    ],
    "Andromeda": [
        ("Alpheratz", "Mirach"),
        ("Mirach", "Almach"),
    ],
    "Cygnus": [
        ("Deneb", "Sadr"),
        ("Sadr", "Albireo"),
    ],
}

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
]

STAR_MARKER_RADIUS = 5


def build_star_catalog() -> list[dict[str, object]]:
    catalog = []
    for priority, row in enumerate(STAR_ROWS):
        name, constellation, ra_deg, dec_deg = row
        catalog.append(
            {
                "name": name,
                "constellation": constellation,
                "ra_deg": float(ra_deg),
                "dec_deg": float(dec_deg),
                "priority": priority,
            }
        )
    return catalog


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Annotate large astrometrically solved FITS files with famous stars "
            "and constellation names. The preview is built from chunked memmap reads."
        )
    )
    parser.add_argument(
        "inputs",
        nargs="*",
        help="FITS files to process. Defaults to stars/*.fits",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directory for annotated previews and JSON summaries. Default: {DEFAULT_OUTPUT_DIR}",
    )
    parser.add_argument(
        "--preview-edge",
        type=int,
        default=2200,
        help="Maximum long edge of the generated preview image.",
    )
    parser.add_argument(
        "--chunk-rows",
        type=int,
        default=256,
        help="Number of downsampled rows to process per memmap chunk.",
    )
    parser.add_argument(
        "--max-stars",
        type=int,
        default=24,
        help="Maximum number of star labels to draw per image.",
    )
    parser.add_argument(
        "--max-constellations",
        type=int,
        default=12,
        help="Maximum number of constellation labels to draw per image.",
    )
    return parser.parse_args()


def resolve_input_files(raw_inputs: list[str]) -> list[Path]:
    if raw_inputs:
        paths = [Path(item).expanduser().resolve() for item in raw_inputs]
    else:
        paths = sorted(DEFAULT_INPUT_DIR.glob("*.fits"))
    return [path for path in paths if path.is_file()]


def load_font(size: int) -> ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def normalize_channels(data: np.ndarray) -> tuple[str, int, int, int]:
    if data.ndim != 3:
        raise ValueError(f"Expected a 3D RGB FITS cube, got shape {data.shape}")
    if data.shape[0] in (3, 4):
        return "channels_first", data.shape[2], data.shape[1], 0
    if data.shape[-1] in (3, 4):
        return "channels_last", data.shape[1], data.shape[0], 2
    raise ValueError(f"Unsupported FITS cube layout: {data.shape}")


def slice_preview_chunk(
    data: np.ndarray,
    layout: str,
    y0: int,
    y1: int,
    step: int,
) -> np.ndarray:
    if layout == "channels_first":
        chunk = data[:3, y0:y1:step, ::step]
        return np.moveaxis(chunk, 0, -1)
    chunk = data[y0:y1:step, ::step, :3]
    return chunk


def downsample_preview(
    data: np.ndarray,
    header: fits.Header,
    max_edge: int,
    chunk_rows: int,
) -> np.ndarray:
    layout, width, height, _ = normalize_channels(data)
    step = max(1, math.ceil(max(width, height) / max_edge))
    preview_width = math.ceil(width / step)
    preview_height = math.ceil(height / step)
    preview = np.zeros((preview_height, preview_width, 3), dtype=np.uint16)

    bzero = float(header.get("BZERO", 0))
    bscale = float(header.get("BSCALE", 1))
    input_row_span = max(1, chunk_rows) * step
    out_y = 0

    for y0 in range(0, height, input_row_span):
        y1 = min(height, y0 + input_row_span)
        chunk = slice_preview_chunk(data, layout, y0, y1, step)
        if chunk.size == 0:
            continue
        scaled = chunk.astype(np.int32)
        if bscale != 1:
            scaled = np.rint(scaled * bscale).astype(np.int32)
        if bzero:
            scaled += int(round(bzero))
        scaled = np.clip(scaled, 0, 65535).astype(np.uint16)
        rows = scaled.shape[0]
        cols = scaled.shape[1]
        preview[out_y : out_y + rows, :cols, :] = scaled
        out_y += rows

    return preview


def stretch_preview(preview: np.ndarray, header: fits.Header) -> np.ndarray:
    black = header.get("CBLACK")
    white = header.get("CWHITE")
    preview_f = preview.astype(np.float32)

    if black is None or white is None or float(white) <= float(black):
        flat = preview_f.reshape(-1, 3)
        black = float(np.percentile(flat, 2))
        white = float(np.percentile(flat, 99.8))

    scale = max(float(white) - float(black), 1.0)
    stretched = np.clip((preview_f - float(black)) / scale, 0.0, 1.0)
    channel_high = np.percentile(stretched.reshape(-1, 3), 99.7, axis=0)
    channel_high = np.maximum(channel_high, 0.05)
    stretched = np.clip(stretched / channel_high.reshape(1, 1, 3), 0.0, 1.0)
    stretched = np.power(stretched, 0.82)
    return np.rint(stretched * 255.0).astype(np.uint8)


def world_to_preview_xy(x: float, y: float, width: int, height: int, preview_width: int, preview_height: int) -> tuple[float, float]:
    if width <= 1 or height <= 1:
        return float(x), float(y)
    preview_x = x * (preview_width - 1) / (width - 1)
    preview_y = y * (preview_height - 1) / (height - 1)
    return preview_x, preview_y


def get_visible_stars(
    wcs: WCS,
    width: int,
    height: int,
    preview_width: int,
    preview_height: int,
    max_stars: int | None = None,
) -> list[dict[str, object]]:
    visible: list[dict[str, object]] = []

    for star in build_star_catalog():
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            x, y = wcs.world_to_pixel_values(star["ra_deg"], star["dec_deg"])
        if not (math.isfinite(float(x)) and math.isfinite(float(y))):
            continue
        if x < 0 or x >= width or y < 0 or y >= height:
            continue
        preview_x, preview_y = world_to_preview_xy(x, y, width, height, preview_width, preview_height)
        visible.append(
            {
                **star,
                "pixel_x": float(x),
                "pixel_y": float(y),
                "preview_x": float(preview_x),
                "preview_y": float(preview_y),
            }
        )

    visible.sort(key=lambda item: int(item["priority"]))
    if max_stars is None:
        return visible
    return visible[: max(0, max_stars)]


def rects_overlap(a: tuple[int, int, int, int], b: tuple[int, int, int, int], padding: int = 4) -> bool:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    return not (
        ax1 + padding < bx0
        or bx1 + padding < ax0
        or ay1 + padding < by0
        or by1 + padding < ay0
    )


def place_label(
    draw: ImageDraw.ImageDraw,
    image_size: tuple[int, int],
    occupied: list[tuple[int, int, int, int]],
    text: str,
    origin: tuple[float, float],
    font: ImageFont.ImageFont,
    candidates: list[tuple[int, int]],
) -> tuple[int, int]:
    width, height = image_size
    for dx, dy in candidates:
        left = int(round(origin[0] + dx))
        top = int(round(origin[1] + dy))
        bbox = draw.textbbox((left, top), text, font=font, stroke_width=2)
        shift_x = 0
        shift_y = 0
        if bbox[0] < 0:
            shift_x = -bbox[0]
        elif bbox[2] > width:
            shift_x = width - bbox[2]
        if bbox[1] < 0:
            shift_y = -bbox[1]
        elif bbox[3] > height:
            shift_y = height - bbox[3]
        bbox = (bbox[0] + shift_x, bbox[1] + shift_y, bbox[2] + shift_x, bbox[3] + shift_y)
        if any(rects_overlap(bbox, other) for other in occupied):
            continue
        occupied.append(bbox)
        return left + shift_x, top + shift_y

    fallback_left = int(round(origin[0] + 8))
    fallback_top = int(round(origin[1] - 28))
    bbox = draw.textbbox((fallback_left, fallback_top), text, font=font, stroke_width=2)
    occupied.append(bbox)
    return fallback_left, fallback_top


def constellation_candidates(constellation: str) -> list[tuple[str, str]]:
    return CONSTELLATION_LINES.get(constellation, [])


def build_constellation_groups(visible_stars: list[dict[str, object]], max_constellations: int) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for star in visible_stars:
        grouped[str(star["constellation"])].append(star)

    groups = []
    for constellation, stars in grouped.items():
        star_map = {str(star["name"]): star for star in stars}
        visible_lines = []
        for start_name, end_name in constellation_candidates(constellation):
            if start_name in star_map and end_name in star_map:
                visible_lines.append((star_map[start_name], star_map[end_name]))
        if len(stars) < 2 and not visible_lines:
            continue
        centroid_x = sum(float(star["preview_x"]) for star in stars) / len(stars)
        centroid_y = sum(float(star["preview_y"]) for star in stars) / len(stars)
        groups.append(
            {
                "name": constellation,
                "stars": stars,
                "lines": visible_lines,
                "preview_x": centroid_x,
                "preview_y": centroid_y,
            }
        )

    groups.sort(key=lambda item: (-len(item["stars"]), item["name"]))
    return groups[: max(0, max_constellations)]


def draw_annotations(
    base_image: Image.Image,
    visible_stars: list[dict[str, object]],
    constellations: list[dict[str, object]],
) -> Image.Image:
    image = base_image.copy()
    draw = ImageDraw.Draw(image)
    occupied: list[tuple[int, int, int, int]] = []

    star_font = load_font(20)
    constellation_font = load_font(28)

    for constellation in constellations:
        for start_star, end_star in constellation["lines"]:
            draw.line(
                (
                    float(start_star["preview_x"]),
                    float(start_star["preview_y"]),
                    float(end_star["preview_x"]),
                    float(end_star["preview_y"]),
                ),
                fill=(96, 206, 255),
                width=2,
            )

    for constellation in constellations:
        origin = (float(constellation["preview_x"]), float(constellation["preview_y"]))
        label_x, label_y = place_label(
            draw,
            image.size,
            occupied,
            str(constellation["name"]),
            origin,
            constellation_font,
            [(-60, -42), (20, -42), (-60, 18), (20, 18), (-90, -8), (36, -8)],
        )
        draw.text(
            (label_x, label_y),
            str(constellation["name"]),
            font=constellation_font,
            fill=(146, 231, 255),
            stroke_width=2,
            stroke_fill=(0, 0, 0),
        )

    for star in visible_stars:
        x = float(star["preview_x"])
        y = float(star["preview_y"])
        draw.ellipse(
            (x - STAR_MARKER_RADIUS, y - STAR_MARKER_RADIUS, x + STAR_MARKER_RADIUS, y + STAR_MARKER_RADIUS),
            outline=(255, 214, 102),
            width=2,
        )
        draw.ellipse(
            (x - 2, y - 2, x + 2, y + 2),
            fill=(255, 214, 102),
        )
        label_x, label_y = place_label(
            draw,
            image.size,
            occupied,
            str(star["name"]),
            (x, y),
            star_font,
            [(12, -30), (12, 10), (-90, -30), (-90, 10), (18, -50), (-90, -50)],
        )
        draw.text(
            (label_x, label_y),
            str(star["name"]),
            font=star_font,
            fill=(255, 245, 189),
            stroke_width=2,
            stroke_fill=(0, 0, 0),
        )

    return image


def compute_basic_summary(path: Path, header: fits.Header, wcs: WCS, width: int, height: int) -> dict[str, object]:
    center_x = (width - 1) / 2
    center_y = (height - 1) / 2
    center_world = wcs.pixel_to_world(center_x, center_y)
    corners = wcs.pixel_to_world(
        np.array([0, width - 1, 0, width - 1], dtype=float),
        np.array([0, 0, height - 1, height - 1], dtype=float),
    )
    horizontal_fov = corners[0].separation(corners[1]).deg
    vertical_fov = corners[0].separation(corners[2]).deg
    diagonal_fov = corners[0].separation(corners[3]).deg

    return {
        "file": str(path),
        "date_obs": header.get("DATE-OBS"),
        "width": int(width),
        "height": int(height),
        "center_ra_deg": round(float(center_world.ra.deg), 6),
        "center_dec_deg": round(float(center_world.dec.deg), 6),
        "horizontal_fov_deg": round(float(horizontal_fov), 3),
        "vertical_fov_deg": round(float(vertical_fov), 3),
        "diagonal_fov_deg": round(float(diagonal_fov), 3),
    }


def process_file(
    path: Path,
    output_dir: Path,
    preview_edge: int,
    chunk_rows: int,
    max_stars: int,
    max_constellations: int,
) -> dict[str, object]:
    with fits.open(path, memmap=True, do_not_scale_image_data=True) as hdul:
        header = hdul[0].header.copy()
        data = hdul[0].data
        if data is None:
            raise ValueError(f"No image data found in {path}")

        layout, width, height, _ = normalize_channels(data)
        _ = layout
        wcs = WCS(header, naxis=2)
        preview_linear = downsample_preview(data, header, preview_edge, chunk_rows)
        preview_rgb = stretch_preview(preview_linear, header)
        preview_image = Image.fromarray(preview_rgb, mode="RGB")
        all_visible_stars = get_visible_stars(
            wcs,
            width,
            height,
            preview_image.width,
            preview_image.height,
            max_stars=None,
        )
        labeled_stars = all_visible_stars[: max(0, max_stars)]
        constellations = build_constellation_groups(all_visible_stars, max_constellations=max_constellations)
        annotated_image = draw_annotations(preview_image, labeled_stars, constellations)

    output_dir.mkdir(parents=True, exist_ok=True)
    annotated_path = output_dir / f"{path.stem}-annotated.png"
    summary_path = output_dir / f"{path.stem}-summary.json"
    annotated_image.save(annotated_path)

    summary = compute_basic_summary(path, header, wcs, width, height)
    summary["annotated_preview"] = str(annotated_path)
    summary["visible_star_count"] = len(all_visible_stars)
    summary["labeled_star_count"] = len(labeled_stars)
    summary["visible_stars"] = [
        {
            "name": str(star["name"]),
            "constellation": str(star["constellation"]),
            "ra_deg": round(float(star["ra_deg"]), 6),
            "dec_deg": round(float(star["dec_deg"]), 6),
            "pixel_x": round(float(star["pixel_x"]), 2),
            "pixel_y": round(float(star["pixel_y"]), 2),
        }
        for star in all_visible_stars
    ]
    summary["visible_constellations"] = [
        {
            "name": str(constellation["name"]),
            "stars": [str(star["name"]) for star in constellation["stars"]],
            "line_count": len(constellation["lines"]),
        }
        for constellation in constellations
    ]
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    return summary


def main() -> int:
    args = parse_args()
    files = resolve_input_files(args.inputs)
    if not files:
        raise SystemExit("No FITS files found to process.")

    output_dir = args.output_dir.expanduser().resolve()
    summaries = []
    for path in files:
        summary = process_file(
            path=path,
            output_dir=output_dir,
            preview_edge=max(512, int(args.preview_edge)),
            chunk_rows=max(32, int(args.chunk_rows)),
            max_stars=max(1, int(args.max_stars)),
            max_constellations=max(1, int(args.max_constellations)),
        )
        summaries.append(summary)
        star_names = ", ".join(item["name"] for item in summary["visible_stars"][:8])
        print(f"[ok] {path.name}")
        print(f"     preview: {summary['annotated_preview']}")
        print(f"     constellations: {', '.join(item['name'] for item in summary['visible_constellations'])}")
        print(f"     stars: {star_names}")

    index_path = output_dir / "summary-index.json"
    index_path.write_text(json.dumps(summaries, indent=2), encoding="utf-8")
    print(f"[ok] index: {index_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
