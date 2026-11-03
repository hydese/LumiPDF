# Changelog

All notable changes to LumiPDF are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased] — 2.0.0

LumiPDF 2.0 is a full rewrite of LuminaPDF 1.x under a new name.

### Added
- Dark mode that recolours pages while they are drawn, so text stays as sharp as the original:
  hue is kept, coloured ink is lifted to stay readable, scans and handwritten notes become dark
  paper, photos keep their colours.
- Five reading themes (Lumina Black, OLED Black, Night Paper, Deep Slate, Soft Contrast) with
  text brightness, contrast and text weight adjustments.
- Automatic dark mode: follow Windows, or on a schedule.
- Opens PDFs that 1.x refused (owner-password PDFs, damaged cross-reference tables) and measures
  every page correctly (inherited page sizes, crop boxes).
- Text selection and copy, find, links, high-zoom rendering, password prompt.
- Open with the dialog, drag-and-drop, or "Open with" from Explorer; a portable exe is built too.
- New project structure: Svelte 5 frontend, Tauri 2 backend, pdf.js 6 rendering.
- Rendering test bench that opens every test PDF in a real browser engine.
- Continuous integration on Windows and macOS.

### Fixed
- Faint lines between image strips on slides (rectangular clips are now snapped to pixels).

### Security
- Files can only be read after the user opens them; PDF text is never inserted as HTML; strict
  content security policy.

### Removed
- The LuminaPDF 1.x code base, replaced by the rewrite.
