"""Regenerates the synthetic test PDFs in tests/fixtures.

Each file reproduces a real-world PDF trait that broke LuminaPDF 1.x. The outputs are
committed, so this only needs to run when a fixture is added or changed.

Requires: pip install pikepdf reportlab, and pdflatex (TeX Live) for the LaTeX page.
Usage:    python scripts/make-fixtures.py
"""
import pathlib
import shutil
import subprocess
import tempfile

import pikepdf
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures"


def base_a4(path: pathlib.Path) -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    for page in range(3):
        c.setFont("Times-Roman", 11)
        for line in range(50):
            c.drawString(60, 800 - line * 15, f"Page {page + 1}, line {line + 1}: the quick brown fox jumps over the lazy dog.")
        c.showPage()
    c.save()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        base = pathlib.Path(tmp) / "base.pdf"
        base_a4(base)
        shutil.copy(base, OUT / "plain-a4.pdf")

        # Page size inherited from the /Pages node instead of each page.
        with pikepdf.open(base) as pdf:
            pdf.Root.Pages.MediaBox = pdf.pages[0].obj.MediaBox
            for page in pdf.pages:
                del page.obj["/MediaBox"]
            pdf.save(OUT / "inherited-mediabox.pdf")

        # Visible area (CropBox) smaller than the page (MediaBox), as in trimmed books.
        with pikepdf.open(base) as pdf:
            for page in pdf.pages:
                page.obj.CropBox = pikepdf.Array([50, 100, 545, 742])
            pdf.save(OUT / "cropbox.pdf")

        # Owner password only: every reader opens it without asking for a password.
        with pikepdf.open(base) as pdf:
            pdf.save(OUT / "owner-password-rc4.pdf", encryption=pikepdf.Encryption(owner="owner", user="", R=4))
            pdf.save(OUT / "owner-password-aes256.pdf", encryption=pikepdf.Encryption(owner="owner", user="", R=6))

        # Object streams + cross-reference stream (default output of modern exporters).
        with pikepdf.open(base) as pdf:
            pdf.save(OUT / "object-streams.pdf", object_stream_mode=pikepdf.ObjectStreamMode.generate)

        # Wrong startxref offset: Acrobat and pdf.js repair this silently.
        data = base.read_bytes()
        cut = data.rfind(b"startxref")
        (OUT / "broken-xref.pdf").write_bytes(data[:cut] + b"startxref\n999999\n%%EOF\n")

        # Script in an outline (bookmark) title: must be shown as text, never run.
        with pikepdf.open(base) as pdf:
            with pdf.open_outline() as outline:
                outline.root.append(pikepdf.OutlineItem('<img src=x onerror="window.__xss=1">Chapter 1', 0))
            pdf.save(OUT / "html-in-outline.pdf")

        # LaTeX page with Latin Modern fonts, maths, grey and coloured text, and a
        # luminosity soft mask (TikZ fading): dark mode must keep the fade, because the mask's
        # lightness controls transparency and must never be recoloured.
        for name in ("soft-mask", "latex-page"):
            tex = pathlib.Path(__file__).resolve().parent / "fixtures" / f"{name}.tex"
            subprocess.run(["pdflatex", "-interaction=batchmode", "-output-directory", tmp, str(tex)], check=True)
            shutil.copy(pathlib.Path(tmp) / f"{name}.pdf", OUT / f"{name}.pdf")

    print(f"Fixtures written to {OUT}")


if __name__ == "__main__":
    main()
