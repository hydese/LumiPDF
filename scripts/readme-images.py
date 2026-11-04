"""Builds the pictures in docs/images/ used by README.md.

Shoots the app with the mocked backend (tests/preview/shoot.mjs) as a release version, so there's
no BETA badge, then frames each shot (rounded corners and a soft shadow) and saves it as WebP.

Usage: python3 scripts/readme-images.py   (needs Node, the npm packages and Pillow)
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "images"
VERSION = "2.0.0"
WIDTH = 1600  # displayed at ~880 px on GitHub, so this stays sharp on high-DPI screens

# picture name -> screenshot file (the shot's name, or a step of it: "export" saves "export-dialog")
PICTURES = {
    "library-light": "readme-library-light",
    "library-dark": "readme-library-dark",
    "annotations": "annotate-dark",
    "link-preview": "link-preview",
    "snip": "snip-menu",
    "stats": "stats-light",
    "timer": "timer-pomodoro",
    "export": "export-dialog",
    "welcome": "welcome-usage",
}
SPLIT = ("readme-page-light", "readme-page-dark")
# Pictures cropped to the interesting part (left, top, right, bottom in 1280×800 window pixels).
CROPS = {"welcome": (240, 150, 1040, 700)}


def frame(img: Image.Image) -> Image.Image:
    """Rounded window with a soft shadow on a transparent background."""
    img = img.convert("RGB").resize((WIDTH, round(img.height * WIDTH / img.width)), Image.LANCZOS)
    w, h = img.size
    radius, pad = 18, 36
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=255)
    # A hairline border so light windows don't melt into a white page.
    border = Image.new("L", (w, h), 0)
    ImageDraw.Draw(border).rounded_rectangle((0, 0, w - 1, h - 1), radius, outline=255, width=1)
    img = Image.composite(Image.new("RGB", (w, h), (200, 202, 208)), img, border)

    canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    shadow = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(shadow).rounded_rectangle((pad, pad + 10, pad + w, pad + h + 6), radius, fill=70)
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    canvas.putalpha(shadow)
    canvas.paste(img, (pad, pad), mask)
    return canvas


def split(light: Image.Image, dark: Image.Image) -> Image.Image:
    """The same page in light and dark, divided by a slanted line."""
    w, h = light.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon([(w * 0.58, 0), (w, 0), (w, h), (w * 0.42, h)], fill=255)
    mixed = Image.composite(dark.convert("RGB"), light.convert("RGB"), mask)
    line = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(5)), mask)
    return Image.composite(Image.new("RGB", (w, h), (61, 107, 240)), mixed, line)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        shots = sorted({f.removesuffix("-dialog") for f in PICTURES.values()} | set(SPLIT))
        subprocess.run(
            ["node", "tests/preview/shoot.mjs", "--scale", "2", "--version", VERSION, "--out", tmp, "--only", ",".join(shots)],
            cwd=ROOT,
            check=True,
        )
        OUT.mkdir(parents=True, exist_ok=True)
        for name, shot in PICTURES.items():
            img = Image.open(Path(tmp) / f"{shot}.png")
            if name in CROPS:
                k = img.width / 1280
                img = img.crop(tuple(round(v * k) for v in CROPS[name]))
            frame(img).save(OUT / f"{name}.webp", quality=88, method=6)
        light, dark = (Image.open(Path(tmp) / f"{s}.png") for s in SPLIT)
        frame(split(light, dark)).save(OUT / "dark-mode.webp", quality=88, method=6)
    for f in sorted(OUT.glob("*.webp")):
        print(f"{f.relative_to(ROOT)}  {f.stat().st_size // 1024} KB")


if __name__ == "__main__":
    sys.exit(main())
