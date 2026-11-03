# Changelog

All notable changes to LumiPDF are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased] — 2.0.0

LumiPDF 2.0 is a full rewrite of LuminaPDF 1.x under a new name.

### Added
- New interface, light and dark, with a single top bar that is also the window title bar.
- Library home screen: Continue reading with first-page previews and progress, your folders
  (files stay where they are), iCloud Drive, GoodNotes Auto Backup folders, and title search
  that ignores accents (Ctrl+K).
- Reader with Outline, Bookmarks (Ctrl+D) and Notes tabs, floating page and zoom controls, and
  the page you were on remembered for every document.
- Study timer: focus, short and long break lengths you choose (arrows change by 5 minutes, or
  type any time), study time per document and per day, and a streak.
- Settings page: General (updates), Appearance, Reading, Library and iCloud, Study timer,
  Shortcuts, About.
- Update check against GitHub releases when LumiPDF opens; the Update button appears only when a
  newer version exists.
- "What's new" window on the first launch after an update, from src/lib/whatsnew/releases.json.
- Every visible string is in a locale file, ready for more languages.
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
