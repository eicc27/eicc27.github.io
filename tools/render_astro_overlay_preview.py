from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ANNOTATION_PATH = ROOT / "stars" / "astro-annotations.json"
DEFAULT_OUTPUT_DIR = ROOT / "stars" / "annotated" / "final-overlay"
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
]


def load_font(size: int) -> ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def pct_to_px(value: float, span: int) -> float:
    if span <= 1:
        return 0.0
    return float(value) * float(span - 1) / 100.0


def draw_label(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: float,
    y: float,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int],
    stroke_fill: tuple[int, int, int],
) -> None:
    draw.text(
        (x, y),
        text,
        font=font,
        fill=fill,
        stroke_width=2,
        stroke_fill=stroke_fill,
    )


def render_entry(image_id: str, entry: dict[str, object], output_dir: Path, max_edge: int) -> Path:
    source_path = ROOT / str(entry["sourceImage"])
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{image_id}-overlay.png"

    with Image.open(source_path) as image:
        canvas = image.convert("RGB")
        if max(canvas.size) > max_edge:
            canvas.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)

    width, height = canvas.size
    draw = ImageDraw.Draw(canvas)
    star_font = load_font(max(14, width // 90))
    dso_font = load_font(max(15, width // 80))
    constellation_font = load_font(max(16, width // 70))

    for constellation in entry.get("constellations", []):
        points = constellation.get("points", [])
        for line in constellation.get("lines", []):
            start = points[line["from"]]
            end = points[line["to"]]
            draw.line(
                (
                    pct_to_px(float(start["xPct"]), width),
                    pct_to_px(float(start["yPct"]), height),
                    pct_to_px(float(end["xPct"]), width),
                    pct_to_px(float(end["yPct"]), height),
                ),
                fill=(103, 206, 255),
                width=max(1, width // 900),
            )
        for point in points:
            x = pct_to_px(float(point["xPct"]), width)
            y = pct_to_px(float(point["yPct"]), height)
            radius = max(2, width // 700)
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(255, 221, 87))

        label = str(constellation["name"])
        if constellation.get("partial"):
            label = f"{label} (partial)"
        draw_label(
            draw,
            label,
            pct_to_px(float(constellation["labelXPct"]), width) + 8,
            pct_to_px(float(constellation["labelYPct"]), height) + 8,
            constellation_font,
            fill=(110, 231, 255),
            stroke_fill=(4, 17, 33),
        )

    for dso in entry.get("deepSkyObjects", []):
        cx = pct_to_px(float(dso["xPct"]), width)
        cy = pct_to_px(float(dso["yPct"]), height)
        rx = max(4.0, pct_to_px(float(dso["radiusXPct"]), width))
        ry = max(4.0, pct_to_px(float(dso["radiusYPct"]), height))
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=(255, 129, 129), width=max(1, width // 1000))
        draw_label(
            draw,
            str(dso.get("displayLabel") or dso.get("catalogName") or dso.get("name")),
            cx + 8,
            cy - 22,
            dso_font,
            fill=(255, 191, 191),
            stroke_fill=(33, 5, 5),
        )

    for star in entry.get("stars", []):
        x = pct_to_px(float(star["xPct"]), width)
        y = pct_to_px(float(star["yPct"]), height)
        radius = max(2, width // 800)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(255, 235, 140))
        draw_label(
            draw,
            str(star["name"]),
            x + 8,
            y - 18,
            star_font,
            fill=(255, 242, 179),
            stroke_fill=(24, 18, 3),
        )

    canvas.save(output_path)
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Render final astro overlay annotations back onto the source image.")
    parser.add_argument("--image-id", action="append", help="Optional image id to render. May be repeated.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory for preview PNG files.")
    parser.add_argument("--max-edge", type=int, default=2400, help="Resize source image for preview if needed.")
    args = parser.parse_args()

    payload = json.loads(ANNOTATION_PATH.read_text(encoding="utf-8"))
    images = payload["images"]
    target_ids = args.image_id or sorted(images.keys())
    output_dir = Path(args.output_dir)

    for image_id in target_ids:
        entry = images.get(image_id)
        if not entry:
            raise KeyError(f"Unknown image id: {image_id}")
        output_path = render_entry(image_id, entry, output_dir, max(400, int(args.max_edge)))
        print(f"[ok] {image_id}: {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
