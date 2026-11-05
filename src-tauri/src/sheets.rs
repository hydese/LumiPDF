//! Formula sheets: pages of snips (formulas, figures) and titles, built while studying.
//!
//! Storage, in the app data folder:
//!   formula-sheets/<id>.json      one sheet (the frontend owns the schema and validates it)
//!   formula-sheets/images/<n>.png the snips, saved on white paper at high resolution
//!
//! Snips live inside LumiPDF's own folder, so a sheet keeps working when the original PDF moves
//! or is deleted. The frontend never names a path: sheets are addressed by id, pictures by the
//! file name this module gave them, and both are checked before they touch the disk.

use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use lopdf::{dictionary, Document, Object, Stream, StringFormat};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, Runtime};

use crate::store::{read_json, write_json};
use crate::AppError;

const MAX_SHEET_BYTES: usize = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 60 * 1024 * 1024;
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
/// Pictures go into the exported PDF at up to this resolution (sharp in print, small files).
const EXPORT_DPI: f32 = 300.0;

/// Sheet ids: lowercase letters, digits and dashes (the frontend makes them).
pub fn valid_id(id: &str) -> bool {
    (1..=40).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Picture names as this module makes them: 32 hex digits + ".png".
pub fn valid_image(name: &str) -> bool {
    name.len() == 36
        && name.ends_with(".png")
        && name[..32]
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AppError> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?
        .join("formula-sheets"))
}

fn sheet_file(root: &Path, id: &str) -> Result<PathBuf, AppError> {
    if !valid_id(id) {
        return Err(AppError::InvalidInput("Invalid sheet id".into()));
    }
    Ok(root.join(format!("{id}.json")))
}

fn image_file(root: &Path, name: &str) -> Result<PathBuf, AppError> {
    if !valid_image(name) {
        return Err(AppError::InvalidInput("Invalid picture name".into()));
    }
    Ok(root.join("images").join(name))
}

fn new_image_name() -> String {
    // 128 random bits from the OS-seeded hasher (no extra dependency needed).
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let mut out = String::with_capacity(36);
    for _ in 0..2 {
        let mut h = RandomState::new().build_hasher();
        h.write_u128(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default(),
        );
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out.push_str(".png");
    out
}

/// Picture names a sheet document refers to (items of type "snip").
fn images_in(sheet: &Value) -> Vec<String> {
    sheet
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("image").and_then(Value::as_str))
        .filter(|name| valid_image(name))
        .map(str::to_owned)
        .collect()
}

// ---------------------------------------------------------------------------------------------
// Commands

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetSummary {
    pub id: String,
    pub title: String,
    pub modified: u64,
    pub items: usize,
}

/// Every sheet, most recently changed first.
#[tauri::command]
pub fn sheets_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<SheetSummary>, AppError> {
    Ok(list(&root(&app)?))
}

fn list(root: &Path) -> Vec<SheetSummary> {
    let mut out: Vec<SheetSummary> = fs::read_dir(root)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let id = path.file_stem()?.to_str()?.to_owned();
            if path.extension()? != "json" || !valid_id(&id) {
                return None;
            }
            let sheet: Value = read_json(&path)?;
            Some(SheetSummary {
                title: sheet
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .chars()
                    .take(120)
                    .collect(),
                modified: sheet.get("modified").and_then(Value::as_u64).unwrap_or(0),
                items: sheet
                    .get("items")
                    .and_then(Value::as_array)
                    .map_or(0, Vec::len),
                id,
            })
        })
        .collect();
    out.sort_by_key(|s| std::cmp::Reverse(s.modified));
    out
}

#[tauri::command]
pub fn sheet_load<R: Runtime>(app: AppHandle<R>, id: String) -> Result<Option<Value>, AppError> {
    Ok(read_json(&sheet_file(&root(&app)?, &id)?))
}

#[tauri::command]
pub fn sheet_save<R: Runtime>(app: AppHandle<R>, id: String, sheet: Value) -> Result<(), AppError> {
    save(&root(&app)?, &id, &sheet)
}

fn save(root: &Path, id: &str, sheet: &Value) -> Result<(), AppError> {
    let path = sheet_file(root, id)?;
    // Pictures dropped from the sheet (deleted snips, undo history aside) are removed with it.
    let before: Vec<String> = read_json::<Value>(&path)
        .map(|v| images_in(&v))
        .unwrap_or_default();
    write_json(&path, sheet, MAX_SHEET_BYTES)?;
    let now = images_in(sheet);
    for name in before.iter().filter(|n| !now.contains(n)) {
        let _ = fs::remove_file(root.join("images").join(name));
    }
    Ok(())
}

#[tauri::command]
pub fn sheet_delete<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), AppError> {
    let root = root(&app)?;
    let path = sheet_file(&root, &id)?;
    if let Some(sheet) = read_json::<Value>(&path) {
        for name in images_in(&sheet) {
            let _ = fs::remove_file(root.join("images").join(name));
        }
    }
    match fs::remove_file(&path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

/// Stores a snip (PNG bytes as the raw request body); returns its picture name.
#[tauri::command]
pub fn sheet_add_image<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<String, AppError> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::InvalidInput("Expected image bytes".into()));
    };
    add_image(&root(&app)?, bytes)
}

fn add_image(root: &Path, bytes: &[u8]) -> Result<String, AppError> {
    if bytes.len() > MAX_IMAGE_BYTES || !bytes.starts_with(PNG_SIGNATURE) {
        return Err(AppError::InvalidInput("Not a PNG image".into()));
    }
    let dir = root.join("images");
    fs::create_dir_all(&dir)?;
    let name = new_image_name();
    let tmp = dir.join(format!("{name}.tmp"));
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, dir.join(&name))?;
    Ok(name)
}

/// The bytes of a stored snip (shown on the sheet as an object URL).
#[tauri::command]
pub fn sheet_image<R: Runtime>(app: AppHandle<R>, name: String) -> Result<Response, AppError> {
    let path = image_file(&root(&app)?, &name)?;
    Ok(Response::new(fs::read(path)?))
}

// ---------------------------------------------------------------------------------------------
// Export to PDF

/// One placed thing on an exported page. Coordinates in points, origin at the page's top left.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Placed {
    Image {
        page: usize,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        image: String,
    },
    Text {
        page: usize,
        x: f32,
        y: f32,
        size: f32,
        text: String,
        /// Titles are bold (the default); text boxes are regular.
        #[serde(default = "bold_default")]
        bold: bool,
    },
}

fn bold_default() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetExport {
    pub title: String,
    /// Page size in points.
    pub width: f32,
    pub height: f32,
    pub pages: usize,
    pub items: Vec<Placed>,
}

/// Saves the sheet as a PDF where the user chooses. Returns the path, or null if cancelled.
#[tauri::command]
pub async fn sheet_export_pdf<R: Runtime>(
    app: AppHandle<R>,
    request: SheetExport,
) -> Result<Option<crate::documents::DocumentRef>, AppError> {
    use tauri_plugin_dialog::DialogExt;
    let root = root(&app)?;
    let name = crate::pdf_export::with_pdf_extension(PathBuf::from(
        crate::export::suggested_png_name(&request.title).trim_end_matches(".png"),
    ));
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(name.to_string_lossy())
        .add_filter("PDF", &["pdf"]);
    if let Ok(docs) = app.path().document_dir() {
        dialog = dialog.set_directory(docs);
    }
    let Some(dest) = dialog.blocking_save_file().and_then(|f| f.into_path().ok()) else {
        return Ok(None);
    };
    let dest = crate::pdf_export::with_pdf_extension(dest);
    let written = dest.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), AppError> {
        let mut doc = build_pdf(&root, &request)?;
        let tmp = dest.with_extension("pdf.lumipdf-tmp");
        {
            let mut file = fs::File::create(&tmp)?;
            doc.save_to(&mut file)
                .map_err(|e| AppError::InvalidInput(format!("Couldn't write the PDF: {e}")))?;
            file.sync_all()?;
        }
        fs::rename(&tmp, &dest).inspect_err(|_| {
            let _ = fs::remove_file(&tmp);
        })?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::InvalidInput(e.to_string()))??;
    Ok(crate::documents::grant(&app, &written).ok())
}

/// Builds the PDF: white pages, pictures as images, titles in Helvetica Bold.
pub fn build_pdf(root: &Path, request: &SheetExport) -> Result<Document, AppError> {
    let (w, h) = (request.width, request.height);
    if !(100.0..=2000.0).contains(&w) || !(100.0..=2000.0).contains(&h) {
        return Err(AppError::InvalidInput("Invalid page size".into()));
    }
    let pages = request.pages.clamp(1, 200);
    let mut doc = Document::with_version("1.7");
    let pages_id = doc.new_object_id();
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica-Bold",
        "Encoding" => "WinAnsiEncoding",
    });
    let regular_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
        "Encoding" => "WinAnsiEncoding",
    });

    let mut contents: Vec<Vec<u8>> = vec![Vec::new(); pages];
    let mut xobjects: Vec<lopdf::Dictionary> = vec![lopdf::Dictionary::new(); pages];
    for (n, item) in request.items.iter().enumerate() {
        match item {
            Placed::Image {
                page,
                x,
                y,
                w: iw,
                h: ih,
                image,
            } => {
                let Some(ops) = contents.get_mut(*page) else {
                    continue;
                };
                let png = fs::read(image_file(root, image)?)?;
                let stream = image_stream(&png, *iw, *ih)?;
                let id = doc.add_object(stream);
                let name = format!("Im{n}");
                xobjects[*page].set(name.as_bytes().to_vec(), Object::Reference(id));
                ops.extend(
                    format!(
                        "q {iw:.3} 0 0 {ih:.3} {x:.3} {:.3} cm /{name} Do Q\n",
                        h - y - ih
                    )
                    .bytes(),
                );
            }
            Placed::Text {
                page,
                x,
                y,
                size,
                text,
                bold,
            } => {
                let Some(ops) = contents.get_mut(*page) else {
                    continue;
                };
                let size = size.clamp(4.0, 72.0);
                let baseline = h - y - size * 0.95;
                let font = if *bold { "F1" } else { "F2" };
                ops.extend(
                    format!("BT /{font} {size:.2} Tf 0.11 0.11 0.12 rg {x:.3} {baseline:.3} Td ")
                        .bytes(),
                );
                ops.extend(pdf_literal(&win_ansi(text)));
                ops.extend(b" Tj ET\n");
            }
        }
    }

    let mut kids = Vec::with_capacity(pages);
    for (ops, xobjects) in contents.into_iter().zip(xobjects) {
        let content_id = doc.add_object(Stream::new(lopdf::Dictionary::new(), ops));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), Object::Real(w), Object::Real(h)],
            "Contents" => content_id,
            "Resources" => dictionary! {
                "Font" => dictionary! { "F1" => font_id, "F2" => regular_id },
                "XObject" => xobjects,
            },
        });
        kids.push(Object::Reference(page_id));
    }
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => kids,
            "Count" => pages as i64,
        }),
    );
    let info = doc.add_object(dictionary! {
        "Title" => Object::String(win_ansi(&request.title), StringFormat::Literal),
        "Producer" => Object::string_literal("LumiPDF"),
    });
    let catalog = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog);
    doc.trailer.set("Info", info);
    doc.compress();
    Ok(doc)
}

/// A PNG as a PDF image: composited on white, scaled down to EXPORT_DPI at its printed size.
fn image_stream(png: &[u8], w_pt: f32, h_pt: f32) -> Result<Stream, AppError> {
    use image::imageops::FilterType;
    let img = image::load(Cursor::new(png), image::ImageFormat::Png)
        .map_err(|e| AppError::InvalidInput(format!("A picture can't be read: {e}")))?
        .to_rgba8();
    let max_w = ((w_pt / 72.0) * EXPORT_DPI).ceil().max(1.0) as u32;
    let max_h = ((h_pt / 72.0) * EXPORT_DPI).ceil().max(1.0) as u32;
    let img = if img.width() > max_w || img.height() > max_h {
        image::imageops::resize(
            &img,
            max_w.min(img.width()),
            max_h.min(img.height()),
            FilterType::Lanczos3,
        )
    } else {
        img
    };
    let (iw, ih) = img.dimensions();
    let mut rgb = Vec::with_capacity((iw * ih * 3) as usize);
    for px in img.pixels() {
        let [r, g, b, a] = px.0;
        let a = u16::from(a);
        for c in [r, g, b] {
            rgb.push(((u16::from(c) * a + 255 * (255 - a)) / 255) as u8);
        }
    }
    let mut stream = Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => iw as i64,
            "Height" => ih as i64,
            "ColorSpace" => "DeviceRGB",
            "BitsPerComponent" => 8,
        },
        rgb,
    );
    stream
        .compress()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    Ok(stream)
}

/// A PDF literal string: "(...)" with brackets, backslashes and non-printing bytes escaped.
fn pdf_literal(bytes: &[u8]) -> Vec<u8> {
    let mut out = vec![b'('];
    for &b in bytes {
        match b {
            b'(' | b')' | b'\\' => out.extend([b'\\', b]),
            0x20..=0x7E => out.push(b),
            _ => out.extend(format!("\\{b:03o}").bytes()),
        }
    }
    out.push(b')');
    out
}

/// Text for the standard fonts (WinAnsi / cp1252); characters it lacks become "?".
pub fn win_ansi(text: &str) -> Vec<u8> {
    text.chars()
        .filter(|c| !c.is_control())
        .map(|c| match c {
            '€' => 0x80,
            '‚' => 0x82,
            '„' => 0x84,
            '…' => 0x85,
            '‘' => 0x91,
            '’' => 0x92,
            '“' => 0x93,
            '”' => 0x94,
            '•' => 0x95,
            '–' => 0x96,
            '—' => 0x97,
            '™' => 0x99,
            c if (c as u32) < 0x80 || (0xA0..=0xFF).contains(&(c as u32)) => c as u32 as u8,
            _ => b'?',
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(w: u32, h: u32) -> Vec<u8> {
        let img = image::RgbaImage::from_fn(w, h, |x, _| {
            image::Rgba([0, 0, 0, if x % 2 == 0 { 255 } else { 0 }])
        });
        let mut out = Vec::new();
        img.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn escapes_text() {
        assert_eq!(pdf_literal(b"a(b)\\\xE0"), b"(a\\(b\\)\\\\\\340)".to_vec());
    }

    #[test]
    fn checks_names() {
        assert!(valid_id("sheet-1a2b"));
        assert!(!valid_id("../x") && !valid_id("") && !valid_id("A"));
        let name = new_image_name();
        assert!(valid_image(&name), "{name}");
        assert!(!valid_image("../../etc/passwd.png") && !valid_image(&name.to_uppercase()));
    }

    #[test]
    fn stores_lists_and_cleans_up() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(add_image(root, b"not a png").is_err());
        let a = add_image(root, &png(4, 4)).unwrap();
        let b = add_image(root, &png(4, 4)).unwrap();
        let sheet = serde_json::json!({ "title": "Analisi", "modified": 5, "items": [{ "image": a }, { "image": b }, { "type": "title" }] });
        save(root, "s1", &sheet).unwrap();
        save(
            root,
            "s2",
            &serde_json::json!({ "title": "Fisica", "modified": 9, "items": [] }),
        )
        .unwrap();
        let listed = list(root);
        assert_eq!(
            listed.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["s2", "s1"]
        );
        assert_eq!(listed[1].items, 3);
        // Dropping a snip removes its picture.
        save(
            root,
            "s1",
            &serde_json::json!({ "title": "Analisi", "modified": 6, "items": [{ "image": a }] }),
        )
        .unwrap();
        assert!(root.join("images").join(&a).exists());
        assert!(!root.join("images").join(&b).exists());
        assert!(save(root, "../evil", &sheet).is_err());
    }

    #[test]
    fn exports_a_pdf_that_reads_back() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let img = add_image(root, &png(1200, 300)).unwrap();
        let request = SheetExport {
            title: "Analisi 2 — formule".into(),
            width: 595.28,
            height: 841.89,
            pages: 2,
            items: vec![
                Placed::Text {
                    page: 0,
                    x: 40.0,
                    y: 40.0,
                    size: 14.0,
                    text: "Trasformate – Laplace".into(),
                    bold: true,
                },
                Placed::Image {
                    page: 0,
                    x: 40.0,
                    y: 70.0,
                    w: 200.0,
                    h: 50.0,
                    image: img.clone(),
                },
                Placed::Image {
                    page: 1,
                    x: 40.0,
                    y: 40.0,
                    w: 100.0,
                    h: 25.0,
                    image: img,
                },
            ],
        };
        let mut doc = build_pdf(root, &request).unwrap();
        let mut bytes = Vec::new();
        doc.save_to(&mut bytes).unwrap();
        let back = Document::load_mem(&bytes).unwrap();
        assert_eq!(back.get_pages().len(), 2);
        // 200 pt at 300 dpi = 834 px: the 1200 px snip was scaled down.
        let widths: Vec<i64> = back
            .objects
            .values()
            .filter_map(|o| o.as_stream().ok())
            .filter(|s| s.dict.get(b"Subtype").and_then(Object::as_name).ok() == Some(b"Image"))
            .filter_map(|s| s.dict.get(b"Width").and_then(Object::as_i64).ok())
            .collect();
        assert!(widths.contains(&834), "{widths:?}");
        assert_eq!(
            win_ansi("àè – €✓"),
            vec![0xE0, 0xE8, b' ', 0x96, b' ', 0x80, b'?']
        );
        let out = std::env::var("LUMIPDF_SHEET_OUT").ok();
        if let Some(out) = out {
            fs::write(out, &bytes).unwrap();
        }
    }
}
