# Changelog

All notable changes to LumiPDF are listed here. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased] — 2.0.0

LumiPDF 2.0 is a full rewrite of LuminaPDF 1.x under a new name.

### Fixed (during 2.0 testing)
- The eraser no longer deletes sticky notes.
- Turning study tools off while on the Stats screen or a sheet tab no longer leaves a blank
  window; deleting a sheet from the Library stays in the Library.

### Added
- New interface, light and dark, with a single top bar that is also the window title bar.
- Welcome on first install (language, appearance, reading theme, folders and cloud drives,
  study timer). An update can show chosen welcome steps again via releases.json.
- Library home screen: Continue reading with first-page previews and progress; folders keep
  their structure (browse subfolders, path bar); cloud drives (iCloud Drive, OneDrive, Google
  Drive, Dropbox) found automatically or picked by hand; GoodNotes notebooks card when turned on
  (title, sorting, count, list or previews, hide notebooks); title search that ignores accents
  (Ctrl+K).
- Formula sheets: "Add to sheet" in the snip menu saves the area on white paper (even in dark
  mode) at high resolution, at its printed size. Sheets open as tabs: Auto layout (1–3 columns,
  drag to reorder, resize, titles that never end a column alone) or Free placement (drag
  anywhere, add pages); A4 or Letter; undo/redo; double-click a snip to open its source page.
  Export as a print-ready PDF (pictures at up to 300 dpi) or a page as PNG. Stored in the app's
  own folder, so sheets survive moving or deleting the PDFs.
- Link previews: hovering an internal link (equation, figure, footnote, section) shows the target
  spot cropped to the text column, in the reading theme; click to go there. Off on contents and
  index pages; can be turned off in Settings → Reading.
- Study tools switch: the welcome asks what LumiPDF is for (Studying, the default, or Just
  reading). Just reading hides the timer, study stats (and stops counting study time) and
  formula sheets; Settings → General has the main switch and one per tool, and the Library shows
  a dismissible "Studying? Turn on study tools" line while they're off.
- Any annotation colour: a hex/system colour picker next to the preset colours, with recent
  custom colours. Custom colours are drawn exactly as picked, also on dark pages (preset colours
  still adapt to them).
- Hand tool (G): drag to scroll, no text selection; links and notes still work.
- In-app updates (installed version): signed updates from GitHub releases, installed
  automatically when LumiPDF closes or when you choose (welcome step and Settings → General);
  hidden beta channel. The portable version keeps the download link. The release workflow builds
  the signed installer into a draft release (public releases are installer-only; the portable
  exe is a test build from CI); publishing updates the channels.
- Full screen (F11 or the button in the reader): the top bar hides and returns at the top edge.
- Folder browser sorting: name A–Z, Z–A, or recently opened.
- Beta builds show a BETA badge in the top bar. The beta channel is hidden (testers unlock it in
  Settings → About); leaving it on a beta offers to switch back to the stable version.
- Text clarity (Settings → Reading, off by default): slightly bolder text and lines at least one
  pixel wide, for screens at 100% scaling.
- The eraser end of a stylus erases; an eraser stroke always deletes what it went over, however
  it ends.
- Formula sheets: smart guides in Free layout (snap to page centre, margins and other items;
  hold Alt to place freely); selected-item actions moved to the sheet's top bar.
- Study stats: "Reset study stats" (keeps documents, progress, bookmarks and the goal).
- Study stats: a Today card in the Library (time against the daily goal, streak, the week) and a
  Stats screen with totals, current and best streak, a 7/30-day chart and the most studied
  documents and folders. Study time is now also kept per document per day.
- Tabs in the top bar. Background tabs sleep (PDF closed, place and a snapshot kept) and come
  back instantly on the same spot; Ctrl+Tab, Ctrl+1..9, Ctrl+W, middle-click, drag to reorder;
  optionally reopen last session's tabs.
- Annotations: highlight, underline and strike text (from the tool or a menu over the
  selection), smooth pressure-sensitive pen (preset or exact thickness), freehand highlighter, sticky notes
  you can drag and comments, snip tool (copy an area or save it as a PNG, in the current theme),
  eraser, undo/redo. Listed in the Notes tab; drawn to suit dark pages; stored next to the app
  by the PDF's own ID, so they follow the file and the PDF is never modified.
- Export (Ctrl+E): a new PDF with annotations written in as real, editable PDF annotations
  (with appearance streams, so other readers show them the same), and compression in four
  levels (none, light, recommended, strong) that shrinks oversized or heavy pictures. Always a
  new file; the original is never overwritten.
- Export keeps a protected PDF's passwords and restrictions by default. With the password you
  can remove them from the copy: the open password unlocks a file that only asks for one; lifting
  printing/copying/editing restrictions always needs the owner password.
- Reader with Outline, Bookmarks (Ctrl+D) and Notes tabs, floating page and zoom controls.
  Right-click the moon for reading themes and adjustments.
- Timer with four modes: Timer (set the time in the circle), Pomodoro (focus, breaks, long break
  after N sessions), Alarm and Chrono with laps. A ringing timer or alarm brings LumiPDF to the
  front; closing while one runs offers to keep running minimized.
- Study time: timers count while running; reading alone counts after 10 minutes in a row.
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
