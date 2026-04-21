from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "_site"
MAX_SITE_FILE_BYTES = 25 * 1024 * 1024

ROOT_FILE_PATTERNS = ("*.html", "*.css", "*.js")
OPTIONAL_ROOT_FILES = ("CNAME", "robots.txt", "sitemap.xml")
DIRECTORIES_TO_COPY = (
    "assets",
    "birds/display",
    "birds/thumbs",
    "portraits/display",
    "portraits/thumbs",
    "scenery/display",
    "scenery/thumbs",
)
FILES_TO_COPY = (
    "stars/astro-annotations.js",
    "stars/astro-annotations.json",
    "videos/web/chongqing-sunset-1080p.jpg",
    "videos/web/chongqing-sunset-1080p.mp4",
    "videos/web/chongqing-sunset-15s-play.mp4",
    "videos/web/chongqing-sunset-15s-rewind.mp4",
)


def reset_output_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def copy_tree(relative_path: str) -> None:
    source = ROOT / relative_path
    if not source.exists():
        return

    destination = OUTPUT_DIR / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination, dirs_exist_ok=True)


def copy_root_files() -> None:
    copied: set[Path] = set()

    for pattern in ROOT_FILE_PATTERNS:
        for source in ROOT.glob(pattern):
            if not source.is_file():
                continue
            destination = OUTPUT_DIR / source.name
            copy_file(source, destination)
            copied.add(destination)

    for name in OPTIONAL_ROOT_FILES:
        source = ROOT / name
        if not source.is_file():
            continue
        destination = OUTPUT_DIR / source.name
        if destination in copied:
            continue
        copy_file(source, destination)


def assert_size_budget() -> None:
    oversized_files: list[tuple[Path, int]] = []
    total_bytes = 0
    file_count = 0

    for path in OUTPUT_DIR.rglob("*"):
        if not path.is_file():
            continue
        size = path.stat().st_size
        total_bytes += size
        file_count += 1
        if size > MAX_SITE_FILE_BYTES:
            oversized_files.append((path.relative_to(OUTPUT_DIR), size))

    if oversized_files:
        details = ", ".join(f"{path}={size}B" for path, size in oversized_files)
        raise SystemExit(f"Site artifact contains oversized files: {details}")

    print(
        f"Prepared Pages artifact at {OUTPUT_DIR} "
        f"with {file_count} files, total {(total_bytes / (1024 * 1024)):.2f} MiB.",
    )


def main() -> None:
    reset_output_dir(OUTPUT_DIR)
    copy_root_files()

    for relative_path in DIRECTORIES_TO_COPY:
        copy_tree(relative_path)

    for relative_path in FILES_TO_COPY:
        source = ROOT / relative_path
        if source.is_file():
            copy_file(source, OUTPUT_DIR / relative_path)

    (OUTPUT_DIR / ".nojekyll").write_text("", encoding="utf-8")
    assert_size_budget()


if __name__ == "__main__":
    main()
