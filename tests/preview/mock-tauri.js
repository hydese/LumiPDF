/*
 * Fake Tauri backend for previewing the UI in a plain browser (tests/preview/shoot.mjs).
 * Answers the app's commands with sample data; PDFs are served from tests/fixtures.
 * window.__PREVIEW__ (set before this script) picks the scenario.
 */
(() => {
  const scenario = window.__PREVIEW__ || {};
  const D = "C:\\Users\\Studente\\Università\\";
  const files = {
    [`${D}Analisi 2\\Analisi 2 — Trasformate di Laplace.pdf`]: "latex-page.pdf",
    [`${D}Analisi 2\\Esercitazione 7 — Serie di Fourier.pdf`]: "plain-a4.pdf",
    [`${D}Analisi 2\\Formulario integrali.pdf`]: "soft-mask.pdf",
    [`${D}Analisi 2\\Esercitazioni\\Settimana 1.pdf`]: "plain-a4.pdf",
    [`${D}Analisi 2\\Esercitazioni\\Settimana 2.pdf`]: "latex-page.pdf",
    [`${D}Analisi 2\\Esercitazioni\\Soluzioni\\Soluzioni sett. 1.pdf`]: "cropbox.pdf",
    [`${D}Analisi 2\\Esami passati\\Appello giugno 2025.pdf`]: "object-streams.pdf",
    [`${D}Automatica\\Automatica — Lezione 12 Stabilità.pdf`]: "raster-figures.pdf",
    [`${D}Automatica\\Diagrammi di Bode.pdf`]: "cropbox.pdf",
    [`${D}Fisica 1\\Fisica 1 — Dinamica del punto.pdf`]: "object-streams.pdf",
    [`${D}Fisica 1\\Esame 2025-06.pdf`]: "inherited-mediabox.pdf",
    ["C:\\Users\\Studente\\iCloudDrive\\Controlli — Appunti.pdf"]: "latex-links.pdf",
    ["C:\\Users\\Studente\\iCloudDrive\\Tesi bozza.pdf"]: "broken-xref.pdf",
    ["C:\\Users\\Studente\\OneDrive\\GoodNotes\\Lezione 14 — Root locus.pdf"]: "raster-figures.pdf",
    ["C:\\Users\\Studente\\OneDrive\\GoodNotes\\Appunti Fisica.pdf"]: "plain-a4.pdf",
  };
  const base = (p) => p.split("\\").pop();
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const entry = (path, i, root = "") => ({
    path,
    name: base(path),
    size: 200000 + i,
    modified: Date.now() - i * 86400000 * 3,
    cloudOnly: false,
    dir: root ? path.slice(root.length + 1).split("\\").slice(0, -1).join("/") : "",
  });
  const inFolder = (prefix) => Object.keys(files).filter((p) => p.startsWith(prefix + "\\")).map((p, i) => entry(p, i, prefix));
  const docs = [
    [`${D}Analisi 2\\Analisi 2 — Trasformate di Laplace.pdf`, 1, 1, 7380],
    [`${D}Automatica\\Automatica — Lezione 12 Stabilità.pdf`, 1, 1, 2700],
    ["C:\\Users\\Studente\\iCloudDrive\\Controlli — Appunti.pdf", 2, 3, 900],
    [`${D}Fisica 1\\Fisica 1 — Dinamica del punto.pdf`, 0, 0, 0],
  ];

  const empty = scenario.empty === true;
  const library = {
    folders: empty
      ? []
      : [
          { path: `${D}Analisi 2`, name: "Analisi 2", kind: "folder", available: true, files: inFolder(`${D}Analisi 2`), truncated: false },
          { path: `${D}Automatica`, name: "Automatica", kind: "folder", available: true, files: inFolder(`${D}Automatica`), truncated: false },
          { path: `${D}Fisica 1`, name: "Fisica 1", kind: "folder", available: true, files: inFolder(`${D}Fisica 1`), truncated: false },
          { path: "C:\\Users\\Studente\\iCloudDrive", name: "iCloudDrive", kind: scenario.noCloud ? "folder" : "icloud", available: true, files: inFolder("C:\\Users\\Studente\\iCloudDrive"), truncated: false },
          ...(scenario.goodnotes === false
            ? []
            : [{ path: "C:\\Users\\Studente\\OneDrive\\GoodNotes", name: "GoodNotes", kind: "goodnotes", available: true, files: inFolder("C:\\Users\\Studente\\OneDrive\\GoodNotes"), truncated: false }]),
        ],
    documents: empty
      ? []
      : docs.map(([path, page, pages, studySeconds], i) => ({
          path,
          name: base(path),
          lastOpened: Date.now() - i * 3600000,
          page,
          pages,
          bookmarks: i === 0 ? [1] : [],
          studySeconds,
          studyDays: studySeconds ? Object.fromEntries(Array.from({ length: 20 }, (_, k) => [day(k * (i + 1)), Math.round(studySeconds / (k + 2))])) : {},
          file: entry(path, i),
        })),
    studyDays: empty
      ? {}
      : Object.fromEntries(
          [5100, 5400, 3600, 6000, 2400, 4200, 0, 7800, 3000, 2700, 9000, 6600, 1800, 0, 0, 4800, 5100, 3900, 6300, 7200, 2100, 3300, 5400, 0, 3600, 4500, 6000, 2400, 3000, 5700].map((s, i) => [day(i), s]),
        ),
    cloudSuggestions: [
      { kind: "onedrive", path: "C:\\Users\\Studente\\OneDrive" },
      { kind: "gdrive", path: "G:\\Il mio Drive" },
    ],
  };

  const settings = scenario.settings || {};
  const sheetStore = window.__SHEETS__ ?? (window.__SHEETS__ = {});
  const sheetImages = window.__SHEET_IMAGES__ ?? (window.__SHEET_IMAGES__ = {});
  if (scenario.seedSheets && !Object.keys(sheetStore).length) {
    const now = Date.now();
    for (const [id, title, n, ago] of [["s1", "Analisi 2 — esame", 14, 2], ["s2", "Automatica: stabilità", 6, 26], ["s3", "Fisica 1", 3, 300]]) {
      sheetStore[id] = { version: 1, id, title, created: now, modified: now - ago * 3600000, paper: "a4", layout: "flow", columns: 2, pages: 1, items: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, type: "title", text: "x" })) };
    }
  }
  const handlers = {
    load_settings: () => settings,
    save_settings: () => null,
    app_info: () => ({ name: "LumiPDF", version: "2.0.0", os: "windows", arch: "x86_64" }),
    take_pending_documents: () => [],
    library_load: () => library,
    library_open: ({ path }) => ({ path, name: base(path), size: 1000 }),
    library_update: () => null,
    library_add_study_time: () => null,
    library_forget: () => null,
    library_reset_study: () => {
      library.studyDays = {};
      for (const d of library.documents) {
        d.studySeconds = 0;
        d.studyDays = {};
      }
      return null;
    },
    library_add_folder: () => false,
    library_remove_folder: () => null,
    open_pdf_dialog: () => [],
    save_png: (bytes) => {
      window.__SAVED_PNG__ = bytes?.byteLength ?? bytes?.length ?? 0;
      window.__SAVED_PNG_DATA__ = Array.from(bytes ?? []);
      return true;
    },
    export_pdf: ({ request }) => {
      window.__EXPORT_REQUEST__ = request;
      return { path: "C:\\Users\\Studente\\Università\\Analisi 2\\Analisi 2 — Trasformate di Laplace (annotated, compressed).pdf", originalBytes: 2_480_000, exportedBytes: 610_000, imagesRecompressed: 3, document: null };
    },
    pdf_protection: () =>
      window.__PREVIEW__?.protection ?? { protected: false, openPassword: false, restrictions: { print: false, copy: false, edit: false, annotate: false }, removableWithOpenPassword: false },
    update_installable: () => scenario.installed !== false,
    update_check: () => (scenario.update ? { version: "2.0.1", notes: "Fixes" } : null),
    update_download: () => null,
    update_install: () => null,
    sheets_list: () =>
      Object.values(sheetStore)
        .map((s) => ({ id: s.id, title: s.title, modified: s.modified, items: s.items.length }))
        .sort((a, b) => b.modified - a.modified),
    sheet_load: ({ id }) => sheetStore[id] ?? null,
    sheet_save: ({ id, sheet }) => {
      sheetStore[id] = JSON.parse(JSON.stringify(sheet));
      return null;
    },
    sheet_delete: ({ id }) => {
      delete sheetStore[id];
      return null;
    },
    sheet_add_image: (bytes) => {
      const name = Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("") + ".png";
      sheetImages[name] = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      return name;
    },
    sheet_image: ({ name }) => sheetImages[name]?.buffer ?? new ArrayBuffer(0),
    sheet_export_pdf: ({ request }) => {
      window.__SHEET_EXPORT__ = request;
      return { path: "C:\\Users\\Studente\\Documents\\Formulario.pdf", name: "Formulario.pdf", size: 1000 };
    },
    annotations_load: () => window.__SAVED_ANNOTATIONS__ ?? null,
    annotations_save: ({ data }) => {
      window.__SAVED_ANNOTATIONS__ = data;
      return null;
    },
    "plugin:window|is_maximized": () => false,
    "plugin:event|listen": () => 1,
    "plugin:event|unlisten": () => null,
  };

  let nextId = 1;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback: (cb) => {
      const id = nextId++;
      window[`_${id}`] = cb;
      return id;
    },
    unregisterCallback: () => {},
    convertFileSrc: (path) => `/tests/fixtures/${files[path] ?? base(path)}`,
    invoke: async (cmd, args) => {
      const handler = handlers[cmd];
      if (!handler) {
        console.warn("[preview] unhandled command", cmd);
        return null;
      }
      return handler(args || {});
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
})();
