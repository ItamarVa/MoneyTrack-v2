"""Generate brand assets from logo-source.jpg.

Produces a tightly cropped emblem with a transparent background plus the app
icons. The wordmark is intentionally not exported as an image: the UI renders
"MoneyTrack" as live text so it stays crisp and follows the colour theme.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "apps" / "web" / "public" / "brand"
SRC = BRAND / "logo-source.jpg"

# Fraction of the source image occupied by the emblem, excluding the wordmark
# and the "32x32" reference swatch in the top-right corner.
EMBLEM_REGION = (0.06, 0.20, 0.36, 0.82)
WHITE_TOLERANCE = 26
CANVAS_PADDING = 0.04

OBSOLETE = ("lockup-light.png", "lockup-light.svg", "mark.svg", "mark-dark.png")


def emblem_region(src: Image.Image) -> Image.Image:
    width, height = src.size
    left, top, right, bottom = EMBLEM_REGION
    return src.crop(
        (int(width * left), int(height * top), int(width * right), int(height * bottom))
    ).convert("RGBA")


def drop_outer_background(im: Image.Image) -> Image.Image:
    """Flood fill the white surround, leaving white details inside the logo."""
    filled = im.copy()
    drawer = ImageDraw.floodfill
    corners = [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]
    for corner in corners:
        drawer(filled, corner, (0, 0, 0, 0), thresh=WHITE_TOLERANCE)
    return filled


def trim(im: Image.Image) -> Image.Image:
    bbox = im.getchannel("A").getbbox()
    return im.crop(bbox) if bbox else im


def square_canvas(im: Image.Image) -> Image.Image:
    side = int(max(im.size) * (1 + CANVAS_PADDING * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    return canvas


def main() -> int:
    if not SRC.exists():
        print(f"ERROR: missing {SRC}")
        return 1

    src = Image.open(SRC).convert("RGBA")
    mark = square_canvas(trim(drop_outer_background(emblem_region(src))))
    mark.save(BRAND / "mark.png", "PNG", optimize=True)

    for size, name in (
        (180, "apple-touch-icon.png"),
        (192, "icon-192.png"),
        (512, "icon-512.png"),
    ):
        mark.resize((size, size), Image.Resampling.LANCZOS).save(
            BRAND / name, "PNG", optimize=True
        )

    favicon = mark.resize((64, 64), Image.Resampling.LANCZOS)
    favicon.save(BRAND / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    (ROOT / "apps" / "web" / "public" / "favicon.ico").write_bytes(
        (BRAND / "favicon.ico").read_bytes()
    )

    for name in OBSOLETE:
        (BRAND / name).unlink(missing_ok=True)

    print(f"Brand assets written to {BRAND} (mark {mark.size[0]}x{mark.size[1]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
