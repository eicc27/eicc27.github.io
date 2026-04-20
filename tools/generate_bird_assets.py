from __future__ import annotations

import json
import math
from fractions import Fraction
from pathlib import Path

from PIL import Image, ImageOps
from PIL.ExifTags import IFD


ROOT = Path(__file__).resolve().parents[1]
BIRDS_DIR = ROOT / "birds"
DISPLAY_DIR = BIRDS_DIR / "display"
THUMB_DIR = BIRDS_DIR / "thumbs"
DATA_MODULE = ROOT / "birds-data.js"

DISPLAY_LONG_EDGE = 2200
THUMB_LONG_EDGE = 560

IUCN_STYLES = {
    "LC": {
        "code": "LC",
        "labelZh": "无危",
        "labelEn": "Least Concern",
        "tone": "lc",
        "background": "#e7f4ea",
        "border": "#7db38a",
        "ink": "#165324",
    },
    "NT": {
        "code": "NT",
        "labelZh": "近危",
        "labelEn": "Near Threatened",
        "tone": "nt",
        "background": "#fbf3d3",
        "border": "#d9bc5d",
        "ink": "#6a4e00",
    },
    "EN": {
        "code": "EN",
        "labelZh": "濒危",
        "labelEn": "Endangered",
        "tone": "en",
        "background": "#fde5d7",
        "border": "#df8b62",
        "ink": "#8d2e12",
    },
    "CR": {
        "code": "CR",
        "labelZh": "极危",
        "labelEn": "Critically Endangered",
        "tone": "cr",
        "background": "#f8d7da",
        "border": "#d06a78",
        "ink": "#7d1726",
    },
}

SPECIES_MAP = {
    "七彩文鸟.JPG": {
        "id": "gouldian-finch",
        "title": "七彩文鸟",
        "commonName": "Gouldian finch",
        "scientificName": "Erythrura gouldiae",
        "iucn": "NT",
    },
    "丹顶鹤.jpg": {
        "id": "red-crowned-crane",
        "title": "丹顶鹤",
        "commonName": "Red-crowned crane",
        "scientificName": "Grus japonensis",
        "iucn": "EN",
    },
    "红绿金刚鹦鹉.JPG": {
        "id": "green-winged-macaw",
        "title": "红绿金刚鹦鹉",
        "commonName": "Green-winged macaw",
        "scientificName": "Ara chloropterus",
        "iucn": "LC",
    },
    "红额亚马逊鹦鹉.JPG": {
        "id": "red-lored-amazon",
        "title": "红额亚马逊鹦鹉",
        "commonName": "Red-lored amazon",
        "scientificName": "Amazona autumnalis",
        "iucn": "LC",
    },
    "美洲红鹮.JPG": {
        "id": "scarlet-ibis",
        "title": "美洲红鹮",
        "commonName": "Scarlet ibis",
        "scientificName": "Eudocimus ruber",
        "iucn": "LC",
    },
    "翠丽椋鸟.JPG": {
        "id": "superb-starling",
        "title": "翠丽椋鸟",
        "commonName": "Superb starling",
        "scientificName": "Lamprotornis superbus",
        "iucn": "LC",
    },
    "蓝蕉鹃.JPG": {
        "id": "blue-coua",
        "title": "蓝蕉鹃",
        "commonName": "Blue coua",
        "scientificName": "Coua caerulea",
        "iucn": "LC",
    },
    "蓝黄金刚鹦鹉.JPG": {
        "id": "blue-and-yellow-macaw",
        "title": "蓝黄金刚鹦鹉",
        "commonName": "Blue-and-yellow macaw",
        "scientificName": "Ara ararauna",
        "iucn": "LC",
    },
    "长冠八哥.JPG": {
        "id": "bali-myna",
        "title": "长冠八哥",
        "commonName": "Bali myna",
        "scientificName": "Leucopsar rothschildi",
        "iucn": "CR",
    },
    "隐夜鸫.JPG": {
        "id": "hermit-thrush",
        "title": "隐夜鸫",
        "commonName": "Hermit thrush",
        "scientificName": "Catharus guttatus",
        "iucn": "LC",
    },
}


def encode_url_parts(*parts: str) -> str:
    from urllib.parse import quote

    return "/".join(quote(part) for part in parts)


def trim_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\x00", "").strip()


def format_decimal(value: float) -> str:
    text = f"{value:.1f}"
    if text.endswith(".0"):
        return text[:-2]
    return text


def to_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def format_aperture(value: object) -> str:
    number = to_float(value)
    if number is None:
        return "N/A"
    return f"f/{format_decimal(number)}"


def format_exposure(value: object) -> str:
    number = to_float(value)
    if number is None or number <= 0:
        return "N/A"
    if number >= 1:
        return f"{format_decimal(number)} s"

    fraction = Fraction(number).limit_denominator(8000)
    if fraction.numerator == 1:
        return f"1/{fraction.denominator} s"
    return f"{fraction.numerator}/{fraction.denominator} s"


def format_iso(value: object) -> str:
    text = trim_text(value)
    if not text:
        return "N/A"
    return f"ISO {text}"


def format_focal_length(value: object) -> str:
    number = to_float(value)
    if number is None:
        return "N/A"
    return f"{format_decimal(number)} mm"


def format_datetime(value: object) -> str:
    text = trim_text(value)
    if not text:
        return "N/A"
    return text.replace(":", "-", 2)


def make_camera_label(make: str, model: str) -> str:
    if not make:
        return model or "N/A"
    if not model:
        return make
    if model.lower().startswith(make.lower()):
        return model
    return f"{make} {model}"


def fit_long_edge(image: Image.Image, long_edge: int) -> Image.Image:
    width, height = image.size
    current_long_edge = max(width, height)
    if current_long_edge <= long_edge:
        return image.copy()

    scale = long_edge / current_long_edge
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def extract_metadata(path: Path) -> dict:
    species = SPECIES_MAP[path.name]

    with Image.open(path) as source_image:
        image = ImageOps.exif_transpose(source_image).convert("RGB")
        exif = source_image.getexif()
        exif_ifd = exif.get_ifd(IFD.Exif) if hasattr(exif, "get_ifd") else {}

        make = trim_text(exif.get(271))
        model = trim_text(exif.get(272))
        lens = trim_text(exif_ifd.get(42036))
        captured_at = format_datetime(exif_ifd.get(36867) or exif.get(306))
        aperture = format_aperture(exif_ifd.get(33437))
        shutter = format_exposure(exif_ifd.get(33434))
        iso = format_iso(exif_ifd.get(34855) or exif_ifd.get(34867))
        focal_length = format_focal_length(exif_ifd.get(37386))
        focal_length_35 = trim_text(exif_ifd.get(41989))

        display_image = fit_long_edge(image, DISPLAY_LONG_EDGE)
        thumb_image = fit_long_edge(image, THUMB_LONG_EDGE)

        display_path = DISPLAY_DIR / f"{species['id']}.jpg"
        thumb_path = THUMB_DIR / f"{species['id']}.jpg"
        display_image.save(display_path, format="JPEG", quality=88, optimize=True, progressive=True)
        thumb_image.save(thumb_path, format="JPEG", quality=78, optimize=True, progressive=True)

        width, height = image.size
        dimension_text = f"{width} × {height}"

    iucn = IUCN_STYLES[species["iucn"]]
    focal_length_eq = f"{focal_length_35} mm eq." if focal_length_35 else ""

    return {
        "id": species["id"],
        "title": species["title"],
        "commonName": species["commonName"],
        "scientificName": species["scientificName"],
        "fileName": path.name,
        "fullSrc": f"./{encode_url_parts('birds', path.name)}",
        "displaySrc": f"./{encode_url_parts('birds', 'display', display_path.name)}",
        "thumbSrc": f"./{encode_url_parts('birds', 'thumbs', thumb_path.name)}",
        "alt": f"{species['title']} / {species['commonName']}",
        "dimensions": {
            "width": width,
            "height": height,
            "label": dimension_text,
            "aspectRatio": round(width / height, 4),
        },
        "capture": {
            "camera": make_camera_label(make, model),
            "lens": lens or "N/A",
            "capturedAt": captured_at,
            "aperture": aperture,
            "shutter": shutter,
            "iso": iso,
            "focalLength": focal_length,
            "focalLength35": focal_length_eq or "N/A",
        },
        "iucn": iucn,
    }


def write_data_module(catalog: list[dict]) -> None:
    module_source = (
        "export const birdCatalog = "
        + json.dumps(catalog, ensure_ascii=False, indent=2)
        + ";\n"
    )
    DATA_MODULE.write_text(module_source, encoding="utf-8")


def main() -> None:
    DISPLAY_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)

    catalog = []
    for file_name in sorted(SPECIES_MAP.keys()):
        path = BIRDS_DIR / file_name
        if not path.exists():
            raise FileNotFoundError(f"Missing source bird image: {path}")
        catalog.append(extract_metadata(path))

    write_data_module(catalog)
    print(f"Generated {len(catalog)} bird entries.")


if __name__ == "__main__":
    main()
