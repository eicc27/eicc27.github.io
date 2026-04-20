from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_MODULE = ROOT / "photo-data.js"

DISPLAY_LONG_EDGE = 2200
THUMB_LONG_EDGE = 560
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

DECK_SPECS = {
    "portraits": {
        "directory": ROOT / "portraits",
        "display": ROOT / "portraits" / "display",
        "thumbs": ROOT / "portraits" / "thumbs",
        "kicker": "Portraits / people in transit",
        "title": "人物与旅途",
        "alt_prefix": "人像照片",
        "description": "从哈尔滨、纽约到开罗，人像不追求棚拍感，更像旅途中被城市光线留下的现场。",
        "tags": ["night portrait", "campus", "travel notes"],
        "preview_sources": [
            "哈尔滨 铁路桥.jpg",
            "哥大 Butler.JPG",
            "埃及开罗 金字塔.JPG",
            "延吉大学 网红墙.jpg",
        ],
        "hero_position_portrait": "center 24%",
        "hero_position_landscape": "center 32%",
    },
    "scenery": {
        "directory": ROOT / "scenery",
        "display": ROOT / "scenery" / "display",
        "thumbs": ROOT / "scenery" / "thumbs",
        "kicker": "Scenery / trail and city",
        "title": "行旅风景册",
        "alt_prefix": "风景照片",
        "description": "这些风景来自日出、山脊、港湾、城市与动物现场，保留的是在路上的观看方式。",
        "tags": ["sunrise", "trail line", "city light"],
        "preview_sources": [
            "吉林 日出.JPG",
            "香港 维多利亚港.JPG",
            "重庆 单轨列车.JPG",
            "玉龙雪山 日出.JPG",
        ],
        "hero_position_portrait": "center 42%",
        "hero_position_landscape": "center 50%",
    },
}

PHOTO_METADATA = {
    "portraits": {
        "哈尔滨 铁路桥.jpg": {
            "title": "Arc Light",
            "caption": "哈尔滨松花江边的夜色和桥拱灯带一起收进虚化里，这张更像一张城市夜行的开场照。",
        },
        "哈尔滨 铁路桥 背景.jpg": {
            "title": "Shoreline Back",
            "caption": "背对镜头站在江边，把人物放进远处灯光和水面的留白里。",
        },
        "哥大 Butler.JPG": {
            "title": "Butler Quiet",
            "caption": "在 Butler 前留下的一帧更接近读书生活本身，安静但不空。",
        },
        "埃及开罗 金字塔.JPG": {
            "title": "Desert Interval",
            "caption": "人在金字塔前变成尺度参考，旅途的开阔感比摆拍姿态更重要。",
        },
        "延吉大学 网红墙.jpg": {
            "title": "Neon Wall",
            "caption": "夜色和招牌把校园入口变成一整面发光背景，人像落在城市节奏里。",
        },
    },
    "scenery": {
        "兰州 丹霞地貌.JPG": {
            "title": "Red Strata",
            "caption": "层层起伏的丹霞像被时间切开的地表，颜色和纹理本身就是主角。",
        },
        "吉林 日出.JPG": {
            "title": "First Light",
            "caption": "日出刚越过地平线，低角度的金色把清晨压成很薄的一层光。",
        },
        "哈尔滨 中央大街.JPG": {
            "title": "Winter Avenue",
            "caption": "冬天的中央大街把建筑立面、行人和冷空气一起压进长街透视。",
        },
        "哈尔滨 抗洪纪念塔.JPG": {
            "title": "Monument Blue",
            "caption": "纪念塔前的蓝调时刻把城市地标拍得更安静，也更有北方冬夜的空气感。",
        },
        "埃及卢克索 热气球.JPG": {
            "title": "Luxor Lift",
            "caption": "卢克索清晨的热气球慢慢升起，天空和地面的层次在这一刻刚好分开。",
        },
        "巴彦淖尔 阴山山脉.JPG": {
            "title": "Mountain Silence",
            "caption": "阴山山脉的线条非常克制，适合把风和距离都留在画面里。",
        },
        "成都熊猫谷 大熊猫.JPG": {
            "title": "Bamboo Noon",
            "caption": "大熊猫趴在树干间的状态很松弛，画面重点是它和环境之间的呼吸感。",
        },
        "成都熊猫谷 小熊猫.JPG": {
            "title": "Branch Turn",
            "caption": "小熊猫转身的一瞬间更轻，也让枝叶和毛色形成了一次干净的对比。",
        },
        "玉龙雪山 冰川公园.JPG": {
            "title": "Glacier Steps",
            "caption": "人在冰川公园的栈道上前进，雪线和人工路径一起给出尺度。",
        },
        "玉龙雪山 日出.JPG": {
            "title": "Snowline Dawn",
            "caption": "日出把雪山顶部先点亮，冷暖转换比山体本身更抓人。",
        },
        "甘肃省博 铜奔马.JPG": {
            "title": "Bronze Gallop",
            "caption": "展柜里的铜奔马不是纯文物照，更像一次把动势从玻璃后面重新拉出来。",
        },
        "重庆 单轨列车.JPG": {
            "title": "Through the Hill",
            "caption": "重庆单轨从楼宇和坡地之间穿过去，这座城市最有辨识度的节奏就在这一幕里。",
        },
        "香港 龙脊.JPG": {
            "title": "Dragon's Spine",
            "caption": "龙脊步道最迷人的不是终点，而是海风、山脊和弯线一路把人带过去。",
        },
        "香港 维多利亚港.JPG": {
            "title": "Harbor Blue",
            "caption": "维港的天光、水面和楼群被压进同一层蓝色里，画面更像一次长呼吸。",
        },
    },
}

HIGHLIGHT_CHOICES = {
    "portraitPrimary": ("portraits", "哈尔滨 铁路桥.jpg"),
    "portraitSecondary": ("portraits", "哥大 Butler.JPG"),
    "sceneryPrimary": ("scenery", "吉林 日出.JPG"),
    "scenerySecondary": ("scenery", "香港 维多利亚港.JPG"),
    "aboutPortrait": ("portraits", "哈尔滨 铁路桥.jpg"),
}


def encode_url_parts(*parts: str) -> str:
    from urllib.parse import quote

    return "/".join(quote(part) for part in parts)


def fit_long_edge(image: Image.Image, long_edge: int) -> Image.Image:
    width, height = image.size
    current_long_edge = max(width, height)
    if current_long_edge <= long_edge:
        return image.copy()

    scale = long_edge / current_long_edge
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def reset_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def split_title(title: str) -> tuple[str, str]:
    normalized = " ".join(title.replace("_", " ").split())
    if not normalized:
        return "", ""

    parts = normalized.split()
    if len(parts) == 1:
        return parts[0], ""

    return parts[0], " ".join(parts[1:])


def build_caption(location: str, subject: str, title: str) -> str:
    if location and subject:
        return f"{title}，拍摄于{location}，主体是{subject}。"
    if location:
        return f"{title}，拍摄于{location}。"
    return f"{title}。"


def determine_focus_position(deck_id: str, width: int, height: int) -> str:
    spec = DECK_SPECS[deck_id]
    if height > width:
        return spec["hero_position_portrait"]
    return spec["hero_position_landscape"]


def collect_source_images(directory: Path) -> list[Path]:
    return sorted(
        [
            path
            for path in directory.iterdir()
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ],
        key=lambda path: path.stem,
    )


def build_preview_indices(spec: dict, source_index: dict[str, int], image_count: int) -> list[int]:
    preview_indices: list[int] = []
    seen_indices: set[int] = set()

    for source_name in spec.get("preview_sources", []):
        index = source_index.get(source_name)
        if index is None or index in seen_indices:
            continue
        preview_indices.append(index)
        seen_indices.add(index)

    if preview_indices:
        return preview_indices[:4]

    return list(range(min(4, image_count)))


def resolve_photo_metadata(deck_id: str, source_file_name: str) -> dict:
    return PHOTO_METADATA.get(deck_id, {}).get(source_file_name, {})


def generate_deck(deck_id: str) -> dict:
    spec = DECK_SPECS[deck_id]
    source_images = collect_source_images(spec["directory"])

    reset_output_dir(spec["display"])
    reset_output_dir(spec["thumbs"])

    images = []
    source_index: dict[str, int] = {}

    for index, source_path in enumerate(source_images):
        source_title = source_path.stem.strip()
        location, subject = split_title(source_title)
        metadata = resolve_photo_metadata(deck_id, source_path.name)
        title = metadata.get("title", source_title)
        caption = metadata.get("caption") or build_caption(location, subject, title)

        with Image.open(source_path) as source_image:
            image = ImageOps.exif_transpose(source_image).convert("RGB")
            width, height = image.size

            display_image = fit_long_edge(image, DISPLAY_LONG_EDGE)
            thumb_image = fit_long_edge(image, THUMB_LONG_EDGE)

            output_name = f"{source_title}.jpg"
            display_path = spec["display"] / output_name
            thumb_path = spec["thumbs"] / output_name

            display_image.save(display_path, format="JPEG", quality=88, optimize=True, progressive=True)
            thumb_image.save(thumb_path, format="JPEG", quality=78, optimize=True, progressive=True)

        source_index[source_path.name] = index
        images.append(
            {
                "id": f"{deck_id}-{index + 1:02d}",
                "src": encode_url_parts(deck_id, "display", output_name),
                "thumbSrc": encode_url_parts(deck_id, "thumbs", output_name),
                "title": title,
                "caption": caption,
                "alt": f"{spec['alt_prefix']}：{title}",
                "location": location,
                "subject": subject,
                "sourceTitle": source_title,
                "sourceFile": source_path.name,
                "heroPosition": metadata.get("heroPosition") or determine_focus_position(deck_id, width, height),
                "dimensions": {
                    "width": width,
                    "height": height,
                },
            }
        )

    preview_indices = build_preview_indices(spec, source_index, len(images))

    return {
        "id": deck_id,
        "kicker": spec["kicker"],
        "title": spec["title"],
        "description": spec["description"].format(count=len(images)),
        "tags": spec["tags"],
        "previewIndices": preview_indices,
        "images": images,
    }


def build_highlights(photo_decks: list[dict]) -> dict:
    deck_lookup = {deck["id"]: deck for deck in photo_decks}
    index_lookup = {
        deck["id"]: {image["sourceFile"]: index for index, image in enumerate(deck["images"])}
        for deck in photo_decks
    }

    def pick(deck_id: str, source_file_name: str) -> dict:
        deck = deck_lookup.get(deck_id, {})
        images = deck.get("images", [])
        if not images:
            return {"deckId": deck_id, "index": 0}

        index = index_lookup.get(deck_id, {}).get(source_file_name, 0)
        return {"deckId": deck_id, "index": min(index, len(images) - 1)}

    return {
        key: pick(deck_id, source_file_name)
        for key, (deck_id, source_file_name) in HIGHLIGHT_CHOICES.items()
    }


def build_summary(photo_decks: list[dict]) -> dict:
    deck_counts = {deck["id"]: len(deck["images"]) for deck in photo_decks}
    total_photos = sum(deck_counts.values())

    return {
        "totalPhotos": total_photos,
        "deckCounts": deck_counts,
    }


def write_module(photo_decks: list[dict], photo_highlights: dict, photo_summary: dict) -> None:
    module_text = (
        "// Generated by tools/generate_photo_assets.py. Do not edit by hand.\n\n"
        f"export const photoDecks = {json.dumps(photo_decks, ensure_ascii=False, indent=2)};\n\n"
        f"export const photoHighlights = {json.dumps(photo_highlights, ensure_ascii=False, indent=2)};\n\n"
        f"export const photoSummary = {json.dumps(photo_summary, ensure_ascii=False, indent=2)};\n"
    )
    OUTPUT_MODULE.write_text(module_text, encoding="utf-8")


def main() -> None:
    photo_decks = [generate_deck("portraits"), generate_deck("scenery")]
    photo_highlights = build_highlights(photo_decks)
    photo_summary = build_summary(photo_decks)
    write_module(photo_decks, photo_highlights, photo_summary)

    print(
        "Generated photo assets:",
        ", ".join(f"{deck['id']}={len(deck['images'])}" for deck in photo_decks),
    )


if __name__ == "__main__":
    main()
