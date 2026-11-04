//! Export: a new PDF with the user's annotations written in, optionally compressed.
//!
//! The original file is never modified: the result is written to a temporary file next to the
//! destination the user picked and renamed into place, and picking the source itself is refused.
//!
//! Annotations become real PDF annotations (Highlight, Underline, StrikeOut, Ink, Text) with
//! appearance streams, so every reader shows them the way LumiPDF does and they stay editable.
//!
//! Compression works like the usual online tools: pictures larger than the target resolution
//! are scaled down and re-encoded (JPEG for photos, lossless for flat graphics), streams are
//! deflated, unused objects dropped and small objects packed into object streams.

use std::collections::BTreeMap;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream, StringFormat};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use crate::AppError;

// ---------------------------------------------------------------------------------------------
// Request / result

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Compression {
    /// Keep pictures as they are (still repacks the file).
    None,
    /// Barely visible: pictures above ~220 dpi.
    Light,
    /// Good for reading and printing: ~150 dpi.
    Recommended,
    /// Smallest file, for screens: ~96 dpi.
    Strong,
}

impl Compression {
    /// How pictures are treated, or None to leave them alone.
    fn image_target(self) -> Option<ImageTarget> {
        let t = |dpi, max_px, quality, heavy_jpeg| {
            Some(ImageTarget {
                dpi,
                max_px,
                quality,
                heavy_jpeg,
            })
        };
        match self {
            Compression::None => None,
            Compression::Light => t(220.0, 6000, 85, 0.25),
            Compression::Recommended => t(150.0, 2600, 75, 0.15),
            Compression::Strong => t(96.0, 1600, 58, 0.08),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ImageTarget {
    /// Pictures aren't kept above this resolution at the largest page size…
    pub dpi: f32,
    /// …nor above this many pixels on their longest side (photos of notes often sit on huge
    /// "pages", where dpi alone would allow anything).
    pub max_px: u32,
    pub quality: u8,
    /// JPEGs using more than this many bytes per sample are re-encoded even at the same size.
    pub heavy_jpeg: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MarkKind {
    Highlight,
    Underline,
    Strike,
}

/// Annotations as the frontend sends them, already in PDF user space.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ExportAnnotation {
    #[serde(rename_all = "camelCase")]
    Mark {
        page: u32,
        kind: MarkKind,
        color: String,
        /// [x1, y1, x2, y2] per line.
        rects: Vec<[f32; 4]>,
        #[serde(default)]
        comment: String,
    },
    /// Pen or highlighter: the outline polygon to fill (what's drawn) and the centre line.
    #[serde(rename_all = "camelCase")]
    Ink {
        page: u32,
        color: String,
        width: f32,
        /// Highlighter strokes blend like a marker (multiply).
        marker: bool,
        /// Centre line: x, y pairs.
        line: Vec<f32>,
        /// Filled outline: x, y pairs.
        outline: Vec<f32>,
    },
    #[serde(rename_all = "camelCase")]
    Note {
        page: u32,
        color: String,
        x: f32,
        y: f32,
        text: String,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub original_bytes: u64,
    pub exported_bytes: u64,
    pub images_recompressed: usize,
}

// ---------------------------------------------------------------------------------------------
// Export

/// Loads `source`, applies annotations and compression, and writes `dest` atomically.
pub fn export(
    source: &Path,
    dest: &Path,
    annotations: &[ExportAnnotation],
    compression: Compression,
    protection: &ProtectionRequest,
) -> Result<ExportResult, AppError> {
    if same_file(source, dest) {
        return Err(AppError::InvalidInput(
            "Choose a different name: LumiPDF never overwrites the original PDF".into(),
        ));
    }
    let original_bytes = fs::metadata(source)?.len();
    let (mut doc, keep) = prepare(source, protection, !annotations.is_empty())?;

    add_annotations(&mut doc, annotations)?;
    let images_recompressed = match compression.image_target() {
        Some(target) => compress_images(&mut doc, target),
        None => 0,
    };
    if compression != Compression::None {
        remove_thumbnails(&mut doc);
    }
    doc.prune_objects();
    doc.delete_zero_length_streams();
    doc.compress();

    let tmp = dest.with_extension("pdf.lumipdf-tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        let failed = |e: &dyn std::fmt::Display| {
            AppError::InvalidInput(format!("Couldn't write the PDF: {e}"))
        };
        match &keep {
            // Same keys, passwords and permissions as the original. Object streams are left
            // out: their contents must not be encrypted twice.
            Some(state) => {
                doc.encrypt(state).map_err(|e| failed(&e))?;
                doc.save_to(&mut file).map_err(|e| failed(&e))?;
            }
            None => doc.save_modern(&mut file).map_err(|e| failed(&e))?,
        }
        file.sync_all()?;
    }
    fs::rename(&tmp, dest).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })?;
    Ok(ExportResult {
        path: dest.to_string_lossy().into_owned(),
        original_bytes,
        exported_bytes: fs::metadata(dest)?.len(),
        images_recompressed,
    })
}

// ---------------------------------------------------------------------------------------------
// Protection
//
// LumiPDF only unlocks a copy with the password: the one you typed to open the file, or the
// owner password for printing/copying/editing restrictions. Without it, the copy keeps exactly
// the original protection (same passwords, same restrictions).

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ProtectionRequest {
    /// The password typed to open the document (kept in memory by the app while it's open).
    pub open_password: Option<String>,
    /// Remove the protection from the copy.
    pub remove: bool,
    /// The owner password, needed to lift printing/copying/editing restrictions.
    pub owner_password: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Restrictions {
    pub print: bool,
    pub copy: bool,
    pub edit: bool,
    pub annotate: bool,
}

impl Restrictions {
    fn any(&self) -> bool {
        self.print || self.copy || self.edit || self.annotate
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectionInfo {
    pub protected: bool,
    /// The file asks for a password to open.
    pub open_password: bool,
    /// What the file blocks (true = blocked).
    pub restrictions: Restrictions,
    /// The open password alone is enough to unlock the copy (nothing else is blocked).
    pub removable_with_open_password: bool,
}

/// Opens the source and settles its protection: returns the document and the protection the
/// copy keeps (None = unprotected copy). Fails if a password is missing or wrong, or if the
/// protection forbids what's asked. Runs before the save dialog too, so mistakes show early.
pub fn prepare(
    source: &Path,
    protection: &ProtectionRequest,
    has_annotations: bool,
) -> Result<(Document, Option<lopdf::encryption::EncryptionState>), AppError> {
    let (mut doc, used_open_password) = load(source, protection.open_password.as_deref())?;
    let info = protection_of(&doc, used_open_password);
    let keep = match doc.encryption_state.take() {
        Some(state) if protection.remove => {
            let owner_ok = protection
                .owner_password
                .as_deref()
                .is_some_and(|pw| owner_password_matches(&doc, &state, pw));
            if !(owner_ok || info.removable_with_open_password) {
                return Err(AppError::InvalidInput(
                    "The owner password is not correct, so the copy can't be unlocked".into(),
                ));
            }
            None
        }
        state => state,
    };
    if keep.is_some() && has_annotations && info.restrictions.annotate {
        return Err(AppError::InvalidInput(
            "This PDF doesn't allow adding annotations. Export it without them, or remove the protection with the owner password".into(),
        ));
    }
    Ok((doc, keep))
}

/// Loads a document, using `open_password` if it asks for one. Returns whether it did.
fn load(source: &Path, open_password: Option<&str>) -> Result<(Document, bool), AppError> {
    let doc = Document::load(source)
        .map_err(|e| AppError::InvalidInput(format!("This PDF can't be exported: {e}")))?;
    if !doc.is_encrypted() {
        return Ok((doc, false)); // not protected, or protected without an open password
    }
    let password = open_password.filter(|p| !p.is_empty()).ok_or_else(|| {
        AppError::InvalidInput("This PDF needs its password to be exported".into())
    })?;
    let doc = Document::load_with_password(source, password)
        .map_err(|_| AppError::InvalidInput("The password for this PDF is not correct".into()))?;
    Ok((doc, true))
}

fn protection_of(doc: &Document, used_open_password: bool) -> ProtectionInfo {
    use lopdf::encryption::Permissions as P;
    let Some(state) = doc.encryption_state.as_ref() else {
        return ProtectionInfo::default();
    };
    let p = state.permissions();
    let restrictions = Restrictions {
        print: !p.contains(P::PRINTABLE),
        copy: !p.contains(P::COPYABLE),
        edit: !p.contains(P::MODIFIABLE) || !p.contains(P::ASSEMBLABLE),
        annotate: !p.contains(P::ANNOTABLE),
    };
    ProtectionInfo {
        protected: true,
        open_password: used_open_password,
        removable_with_open_password: used_open_password && !restrictions.any(),
        restrictions,
    }
}

/// Checks an owner password against the document's original protection.
fn owner_password_matches(
    doc: &Document,
    state: &lopdf::encryption::EncryptionState,
    password: &str,
) -> bool {
    // The loaded document no longer carries its /Encrypt dictionary; rebuild just enough of one
    // (the dictionary and the file ID) to run the standard password check.
    let Ok(encrypt) = state.encode() else {
        return false;
    };
    let mut probe = Document::with_version("1.7");
    let id = probe.add_object(Object::Dictionary(encrypt));
    probe.trailer.set("Encrypt", Object::Reference(id));
    if let Ok(file_id) = doc.trailer.get(b"ID") {
        probe.trailer.set("ID", file_id.clone());
    }
    probe.authenticate_owner_password(password).is_ok()
}

/// What protects `source` (for the Export window). `open_password` is the one the app used.
pub fn protection(source: &Path, open_password: Option<&str>) -> Result<ProtectionInfo, AppError> {
    let (doc, used) = load(source, open_password)?;
    Ok(protection_of(&doc, used))
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => a == b,
    }
}

// ---------------------------------------------------------------------------------------------
// Annotations

fn parse_color(hex: &str) -> [f32; 3] {
    let n = u32::from_str_radix(hex.trim_start_matches('#'), 16).unwrap_or(0);
    [
        ((n >> 16) & 255) as f32 / 255.0,
        ((n >> 8) & 255) as f32 / 255.0,
        (n & 255) as f32 / 255.0,
    ]
}

/// The same "deeper shade" the reader uses for underline and strike lines.
fn deepen([r, g, b]: [f32; 3]) -> [f32; 3] {
    [r * 0.55, g * 0.55, b * 0.55]
}

fn color_array(c: [f32; 3]) -> Object {
    Object::Array(c.iter().map(|v| Object::Real(*v)).collect())
}

fn text(s: &str) -> Object {
    // UTF-16BE with BOM: PDF text strings that can hold any language.
    let mut bytes = vec![0xFE, 0xFF];
    for unit in s.encode_utf16() {
        bytes.extend_from_slice(&unit.to_be_bytes());
    }
    Object::String(bytes, StringFormat::Hexadecimal)
}

fn num(v: f32) -> String {
    let s = format!("{v:.3}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s == "-0" {
        "0".into()
    } else {
        s.to_string()
    }
}

struct Bounds {
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
}

impl Bounds {
    fn of(points: impl IntoIterator<Item = (f32, f32)>) -> Option<Self> {
        let mut b: Option<Bounds> = None;
        for (x, y) in points {
            if !x.is_finite() || !y.is_finite() {
                continue;
            }
            b = Some(match b {
                None => Bounds {
                    x1: x,
                    y1: y,
                    x2: x,
                    y2: y,
                },
                Some(b) => Bounds {
                    x1: b.x1.min(x),
                    y1: b.y1.min(y),
                    x2: b.x2.max(x),
                    y2: b.y2.max(y),
                },
            });
        }
        b
    }
    fn padded(self, p: f32) -> Self {
        Bounds {
            x1: self.x1 - p,
            y1: self.y1 - p,
            x2: self.x2 + p,
            y2: self.y2 + p,
        }
    }
    fn array(&self) -> Object {
        Object::Array(vec![
            Object::Real(self.x1),
            Object::Real(self.y1),
            Object::Real(self.x2),
            Object::Real(self.y2),
        ])
    }
}

/// An appearance stream (form XObject) in page space, optionally blended as multiply.
fn appearance(doc: &mut Document, bounds: &Bounds, ops: String, multiply: bool) -> ObjectId {
    let mut resources = Dictionary::new();
    if multiply {
        resources.set(
            "ExtGState",
            dictionary! { "GS0" => dictionary! { "Type" => "ExtGState", "BM" => "Multiply" } },
        );
    }
    let content = if multiply {
        format!("/GS0 gs\n{ops}")
    } else {
        ops
    };
    let dict = dictionary! {
        "Type" => "XObject",
        "Subtype" => "Form",
        "BBox" => bounds.array(),
        "Resources" => resources,
    };
    doc.add_object(Stream::new(dict, content.into_bytes()))
}

fn base_annotation(subtype: &str, rect: &Bounds, color: [f32; 3], contents: &str) -> Dictionary {
    let mut d = dictionary! {
        "Type" => "Annot",
        "Subtype" => subtype,
        "Rect" => rect.array(),
        "C" => color_array(color),
        "F" => 4, // print
        "T" => text("LumiPDF"),
    };
    if !contents.is_empty() {
        d.set("Contents", text(contents));
    }
    d
}

fn fill_path(points: &[f32]) -> String {
    let mut ops = String::new();
    for (i, pair) in points.chunks_exact(2).enumerate() {
        ops.push_str(&format!(
            "{} {} {}\n",
            num(pair[0]),
            num(pair[1]),
            if i == 0 { "m" } else { "l" }
        ));
    }
    ops.push_str("h f\n");
    ops
}

/// Builds the annotation dictionaries and appends them to their pages' /Annots.
pub fn add_annotations(
    doc: &mut Document,
    annotations: &[ExportAnnotation],
) -> Result<(), AppError> {
    let pages = doc.get_pages();
    let mut by_page: BTreeMap<ObjectId, Vec<Object>> = BTreeMap::new();
    for a in annotations {
        let page = match a {
            ExportAnnotation::Mark { page, .. }
            | ExportAnnotation::Ink { page, .. }
            | ExportAnnotation::Note { page, .. } => *page,
        };
        let Some(&page_id) = pages.get(&page) else {
            continue;
        };
        let Some(dict) = build_annotation(doc, a) else {
            continue;
        };
        let id = doc.add_object(dict);
        by_page
            .entry(page_id)
            .or_default()
            .push(Object::Reference(id));
    }
    for (page_id, refs) in by_page {
        // /Annots may be missing, an inline array, or a reference to an array.
        let existing = doc
            .get_dictionary(page_id)
            .ok()
            .and_then(|p| p.get(b"Annots").ok().cloned());
        let mut list = match existing {
            Some(Object::Array(a)) => a,
            Some(Object::Reference(r)) => doc
                .get_object(r)
                .ok()
                .and_then(|o| o.as_array().ok().cloned())
                .unwrap_or_default(),
            _ => Vec::new(),
        };
        list.extend(refs);
        doc.get_dictionary_mut(page_id)
            .map_err(|e| AppError::InvalidInput(e.to_string()))?
            .set("Annots", Object::Array(list));
    }
    Ok(())
}

fn build_annotation(doc: &mut Document, a: &ExportAnnotation) -> Option<Dictionary> {
    match a {
        ExportAnnotation::Mark {
            kind,
            color,
            rects,
            comment,
            ..
        } => {
            let rects: Vec<[f32; 4]> = rects
                .iter()
                .copied()
                .filter(|r| r.iter().all(|v| v.is_finite()))
                .collect();
            let bounds =
                Bounds::of(rects.iter().flat_map(|r| [(r[0], r[1]), (r[2], r[3])]))?.padded(1.0);
            let c = parse_color(color);
            let (subtype, ops, multiply) = match kind {
                MarkKind::Highlight => {
                    let mut ops = format!("{} {} {} rg\n", num(c[0]), num(c[1]), num(c[2]));
                    for r in &rects {
                        ops.push_str(&format!(
                            "{} {} {} {} re f\n",
                            num(r[0]),
                            num(r[1]),
                            num(r[2] - r[0]),
                            num(r[3] - r[1])
                        ));
                    }
                    ("Highlight", ops, true)
                }
                MarkKind::Underline | MarkKind::Strike => {
                    let d = deepen(c);
                    let mut ops = format!("{} {} {} rg\n", num(d[0]), num(d[1]), num(d[2]));
                    for r in &rects {
                        let h = r[3] - r[1];
                        let t = (h * 0.08).max(0.5);
                        let y = if *kind == MarkKind::Underline {
                            r[1] + h * 0.06
                        } else {
                            r[1] + h * 0.45
                        };
                        ops.push_str(&format!(
                            "{} {} {} {} re f\n",
                            num(r[0]),
                            num(y - t / 2.0),
                            num(r[2] - r[0]),
                            num(t)
                        ));
                    }
                    (
                        if *kind == MarkKind::Underline {
                            "Underline"
                        } else {
                            "StrikeOut"
                        },
                        ops,
                        false,
                    )
                }
            };
            let ap = appearance(doc, &bounds, ops, multiply);
            let mut d = base_annotation(subtype, &bounds, c, comment);
            // Quad points per line: upper-left, upper-right, lower-left, lower-right.
            let quads = rects
                .iter()
                .flat_map(|r| [r[0], r[3], r[2], r[3], r[0], r[1], r[2], r[1]])
                .map(Object::Real)
                .collect();
            d.set("QuadPoints", Object::Array(quads));
            d.set("AP", dictionary! { "N" => Object::Reference(ap) });
            Some(d)
        }
        ExportAnnotation::Ink {
            color,
            width,
            marker,
            line,
            outline,
            ..
        } => {
            if outline.len() < 6 || line.len() < 2 {
                return None;
            }
            let bounds = Bounds::of(outline.chunks_exact(2).map(|p| (p[0], p[1])))?.padded(1.0);
            let c = parse_color(color);
            let ops = format!(
                "{} {} {} rg\n{}",
                num(c[0]),
                num(c[1]),
                num(c[2]),
                fill_path(outline)
            );
            let ap = appearance(doc, &bounds, ops, *marker);
            let mut d = base_annotation("Ink", &bounds, c, "");
            d.set(
                "InkList",
                Object::Array(vec![Object::Array(
                    line.iter().map(|v| Object::Real(*v)).collect(),
                )]),
            );
            d.set("BS", dictionary! { "W" => Object::Real(*width) });
            d.set("AP", dictionary! { "N" => Object::Reference(ap) });
            Some(d)
        }
        ExportAnnotation::Note {
            color,
            x,
            y,
            text: body,
            ..
        } => {
            if !x.is_finite() || !y.is_finite() {
                return None;
            }
            let rect = Bounds {
                x1: *x,
                y1: *y - 20.0,
                x2: *x + 20.0,
                y2: *y,
            };
            let mut d = base_annotation("Text", &rect, parse_color(color), body);
            d.set("Name", "Comment");
            d.set("Open", false);
            Some(d)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Compression

fn remove_thumbnails(doc: &mut Document) {
    for page_id in doc.get_pages().into_values() {
        if let Ok(page) = doc.get_dictionary_mut(page_id) {
            page.remove(b"Thumb");
        }
    }
}

/// The largest page side in points (pictures are never needed bigger than that at the target dpi).
fn largest_page_side(doc: &Document) -> f32 {
    let mut side: f32 = 842.0;
    for page_id in doc.get_pages().into_values() {
        let mut current = Some(page_id);
        // MediaBox may be inherited from a parent Pages node.
        while let Some(id) = current {
            let Ok(dict) = doc.get_dictionary(id) else {
                break;
            };
            if let Ok(Object::Array(b)) = dict
                .get(b"MediaBox")
                .and_then(|o| doc.dereference(o).map(|(_, o)| o))
            {
                let v: Vec<f32> = b.iter().filter_map(|o| o.as_float().ok()).collect();
                if v.len() == 4 {
                    side = side.max((v[2] - v[0]).abs()).max((v[3] - v[1]).abs());
                }
                break;
            }
            current = dict.get(b"Parent").and_then(Object::as_reference).ok();
        }
    }
    side
}

/// A picture the compressor can work with.
struct ImageJob {
    id: ObjectId,
    width: u32,
    height: u32,
    channels: u8,
    /// Already JPEG (decode with the JPEG decoder) or raw samples.
    jpeg: bool,
    data: Vec<u8>,
    original_len: usize,
}

fn name<'a>(dict: &'a Dictionary, key: &[u8]) -> Option<&'a [u8]> {
    dict.get(key).ok().and_then(|o| o.as_name().ok())
}

fn channels(doc: &Document, dict: &Dictionary) -> Option<u8> {
    let cs = dict.get(b"ColorSpace").ok()?;
    let cs = doc.dereference(cs).ok()?.1;
    match cs {
        Object::Name(n) if n == b"DeviceRGB" => Some(3),
        Object::Name(n) if n == b"DeviceGray" => Some(1),
        Object::Array(a) if a.first().and_then(|o| o.as_name().ok()) == Some(b"ICCBased") => {
            let stream = doc.dereference(a.get(1)?).ok()?.1.as_stream().ok()?;
            match stream.dict.get(b"N").ok()?.as_i64().ok()? {
                1 => Some(1),
                3 => Some(3),
                _ => None,
            }
        }
        _ => None,
    }
}

/// No /Decode, or the identity one ([0 1 0 1 …]) some writers add anyway.
fn default_decode(d: &Dictionary) -> bool {
    match d.get(b"Decode") {
        Err(_) => true,
        Ok(Object::Array(a)) => a.chunks(2).all(|p| {
            p.len() == 2 && p[0].as_float().ok() == Some(0.0) && p[1].as_float().ok() == Some(1.0)
        }),
        Ok(_) => false,
    }
}

fn image_job(doc: &Document, id: ObjectId, stream: &Stream) -> Option<ImageJob> {
    let d = &stream.dict;
    if name(d, b"Subtype") != Some(b"Image") {
        return None;
    }
    if d.get(b"ImageMask")
        .and_then(Object::as_bool)
        .unwrap_or(false)
        || d.has(b"Mask")
        || !default_decode(d)
    {
        return None;
    }
    if d.get(b"BitsPerComponent").and_then(Object::as_i64).ok()? != 8 {
        return None;
    }
    let width = u32::try_from(d.get(b"Width").ok()?.as_i64().ok()?).ok()?;
    let height = u32::try_from(d.get(b"Height").ok()?.as_i64().ok()?).ok()?;
    if width < 16 || height < 16 || u64::from(width) * u64::from(height) > 120_000_000 {
        return None;
    }
    let channels = channels(doc, d)?;
    let filters: Vec<&[u8]> = match d.get(b"Filter").ok()? {
        Object::Name(n) => vec![n.as_slice()],
        Object::Array(a) => a.iter().filter_map(|o| o.as_name().ok()).collect(),
        _ => return None,
    };
    let (jpeg, data) = match filters.as_slice() {
        [b"DCTDecode"] => (true, stream.content.clone()),
        [b"FlateDecode"] => {
            let raw = stream.decompressed_content().ok()?;
            if raw.len() != (width as usize) * (height as usize) * channels as usize {
                return None;
            }
            (false, raw)
        }
        _ => return None,
    };
    Some(ImageJob {
        id,
        width,
        height,
        channels,
        jpeg,
        data,
        original_len: stream.content.len(),
    })
}

/// The new stream for a picture, or None if it wouldn't get meaningfully smaller.
fn recompress(
    job: &ImageJob,
    max_side: u32,
    quality: u8,
    heavy_jpeg: f32,
) -> Option<(Vec<u8>, u32, u32, bool)> {
    use image::{imageops::FilterType, DynamicImage, GrayImage, RgbImage};
    let img: DynamicImage = if job.jpeg {
        let decoded =
            image::load_from_memory_with_format(&job.data, image::ImageFormat::Jpeg).ok()?;
        // CMYK and other unusual JPEGs are left alone.
        match decoded.color().channel_count() {
            1 if job.channels == 1 => DynamicImage::ImageLuma8(decoded.to_luma8()),
            3 if job.channels == 3 => DynamicImage::ImageRgb8(decoded.to_rgb8()),
            _ => return None,
        }
    } else if job.channels == 3 {
        DynamicImage::ImageRgb8(RgbImage::from_raw(job.width, job.height, job.data.clone())?)
    } else {
        DynamicImage::ImageLuma8(GrayImage::from_raw(
            job.width,
            job.height,
            job.data.clone(),
        )?)
    };
    let longest = job.width.max(job.height);
    let img = if longest > max_side {
        let scale = max_side as f32 / longest as f32;
        let w = ((job.width as f32 * scale).round() as u32).max(1);
        let h = ((job.height as f32 * scale).round() as u32).max(1);
        img.resize_exact(w, h, FilterType::Triangle)
    } else if job.jpeg
        && (job.original_len as f32)
            < heavy_jpeg * job.width as f32 * job.height as f32 * f32::from(job.channels)
    {
        return None; // a lean JPEG at a fine size: re-encoding would only lose quality
    } else {
        img
    };
    let (w, h) = (img.width(), img.height());
    // Flat graphics (diagrams, screenshots) stay lossless; photos become JPEG.
    let (bytes, as_jpeg) = if few_colors(&img) {
        let raw = img.as_bytes().to_vec();
        (deflate(&raw)?, false)
    } else {
        let mut out = Cursor::new(Vec::new());
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality);
        img.write_with_encoder(encoder).ok()?;
        (out.into_inner(), true)
    };
    (bytes.len() < job.original_len * 95 / 100).then_some((bytes, w, h, as_jpeg))
}

/// True for pictures with only a handful of colours (line art, diagrams).
fn few_colors(img: &image::DynamicImage) -> bool {
    let bytes = img.as_bytes();
    let step = img.color().channel_count() as usize;
    let mut seen = std::collections::HashSet::new();
    let stride = (bytes.len() / step / 4000).max(1) * step;
    for px in bytes.chunks_exact(step).step_by(stride / step) {
        seen.insert(px.to_vec());
        if seen.len() > 64 {
            return false;
        }
    }
    true
}

fn deflate(data: &[u8]) -> Option<Vec<u8>> {
    use std::io::Write;
    let mut e = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::best());
    e.write_all(data).ok()?;
    e.finish().ok()
}

/// Recompresses pictures larger than the target, or stored as needlessly heavy JPEGs. Returns
/// how many pictures were replaced.
pub fn compress_images(doc: &mut Document, target: ImageTarget) -> usize {
    let by_dpi = ((largest_page_side(doc) / 72.0) * target.dpi)
        .round()
        .max(64.0) as u32;
    let max_side = by_dpi.min(target.max_px);
    let jobs: Vec<ImageJob> = doc
        .objects
        .iter()
        .filter_map(|(id, obj)| obj.as_stream().ok().and_then(|s| image_job(doc, *id, s)))
        .collect();
    let results: Vec<(ObjectId, Vec<u8>, u32, u32, bool)> = jobs
        .par_iter()
        .filter_map(|job| {
            recompress(job, max_side, target.quality, target.heavy_jpeg)
                .map(|(b, w, h, jpeg)| (job.id, b, w, h, jpeg))
        })
        .collect();
    let count = results.len();
    for (id, bytes, w, h, jpeg) in results {
        if let Ok(Object::Stream(stream)) = doc.get_object_mut(id) {
            stream.dict.set("Width", i64::from(w));
            stream.dict.set("Height", i64::from(h));
            stream
                .dict
                .set("Filter", if jpeg { "DCTDecode" } else { "FlateDecode" });
            stream.dict.remove(b"DecodeParms");
            stream.dict.remove(b"Decode");
            stream.dict.set("Length", bytes.len() as i64);
            stream.set_content(bytes);
            // Already compressed: lopdf must not deflate it again.
            stream.allows_compression = false;
        }
    }
    count
}

// ---------------------------------------------------------------------------------------------
// File names

/// A safe default name for the exported copy: "<title> (annotated, compressed).pdf".
pub fn suggested_pdf_name(title: &str, annotated: bool, compressed: bool) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| {
            if "\\/:*?\"<>|".contains(c) || c.is_control() {
                '-'
            } else {
                c
            }
        })
        .collect();
    let base = cleaned.trim().trim_matches('.');
    let base: String = if base.is_empty() {
        "LumiPDF export".into()
    } else {
        base.chars().take(120).collect()
    };
    let tags: Vec<&str> = [(annotated, "annotated"), (compressed, "compressed")]
        .iter()
        .filter(|(on, _)| *on)
        .map(|(_, t)| *t)
        .collect();
    if tags.is_empty() {
        format!("{base} (copy).pdf")
    } else {
        format!("{base} ({}).pdf", tags.join(", "))
    }
}

pub fn with_pdf_extension(path: PathBuf) -> PathBuf {
    if path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
    {
        path
    } else {
        path.with_extension("pdf")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tests/fixtures")
            .join(name)
    }

    #[test]
    fn writes_annotations_that_read_back() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("out.pdf");
        let annotations = vec![
            ExportAnnotation::Mark {
                page: 1,
                kind: MarkKind::Highlight,
                color: "#ffe14d".into(),
                rects: vec![[72.0, 700.0, 300.0, 712.0]],
                comment: "Important".into(),
            },
            ExportAnnotation::Mark {
                page: 1,
                kind: MarkKind::Strike,
                color: "#d93a2b".into(),
                rects: vec![[72.0, 680.0, 200.0, 692.0]],
                comment: String::new(),
            },
            ExportAnnotation::Ink {
                page: 2,
                color: "#2f5bd8".into(),
                width: 1.8,
                marker: false,
                line: vec![100.0, 100.0, 200.0, 150.0],
                outline: vec![100.0, 99.0, 200.0, 149.0, 200.0, 151.0, 100.0, 101.0],
            },
            ExportAnnotation::Note {
                page: 3,
                color: "#ffd84d".into(),
                x: 300.0,
                y: 400.0,
                text: "Ricorda: è all'esame".into(),
            },
            ExportAnnotation::Note {
                page: 99,
                color: "#ffd84d".into(),
                x: 1.0,
                y: 1.0,
                text: "no such page".into(),
            },
        ];
        let result = export(
            &fixture("plain-a4.pdf"),
            &out,
            &annotations,
            Compression::None,
            &ProtectionRequest::default(),
        )
        .unwrap();
        assert!(result.exported_bytes > 0);

        let doc = Document::load(&out).unwrap();
        let mut subtypes = Vec::new();
        for page_id in doc.get_pages().into_values() {
            for annot in doc.get_page_annotations(page_id).unwrap() {
                subtypes.push(
                    String::from_utf8_lossy(annot.get(b"Subtype").unwrap().as_name().unwrap())
                        .into_owned(),
                );
                if annot.get(b"Subtype").unwrap().as_name().unwrap() != b"Text" {
                    assert!(annot.has(b"AP"), "appearance stream missing");
                }
            }
        }
        subtypes.sort();
        assert_eq!(subtypes, ["Highlight", "Ink", "StrikeOut", "Text"]);
    }

    #[test]
    fn compresses_large_pictures_and_never_overwrites_the_source() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("raster.pdf");
        fs::copy(fixture("raster-figures.pdf"), &src).unwrap();
        let err = export(
            &src,
            &src,
            &[],
            Compression::Strong,
            &ProtectionRequest::default(),
        )
        .unwrap_err();
        assert!(err.to_string().contains("never overwrites"));

        let out = dir.path().join("small.pdf");
        let result = export(
            &src,
            &out,
            &[],
            Compression::Strong,
            &ProtectionRequest::default(),
        )
        .unwrap();
        assert!(result.exported_bytes < result.original_bytes, "{result:?}");
        assert!(Document::load(&out).unwrap().get_pages().len() == 1);
    }

    #[test]
    fn opens_every_fixture() {
        let dir = tempfile::tempdir().unwrap();
        for entry in fs::read_dir(fixture("")).unwrap().flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "pdf") {
                let out = dir.path().join("o.pdf");
                let protection = ProtectionRequest {
                    open_password: Some("study".into()),
                    ..Default::default()
                };
                export(&path, &out, &[], Compression::Recommended, &protection)
                    .unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            }
        }
    }

    fn protected_export(
        name: &str,
        request: ProtectionRequest,
        annotate: bool,
    ) -> Result<PathBuf, AppError> {
        let dir = tempfile::tempdir().unwrap().keep();
        let out = dir.join("out.pdf");
        let annotations = if annotate {
            vec![ExportAnnotation::Note {
                page: 1,
                x: 72.0,
                y: 72.0,
                text: "hi".into(),
                color: "#ffd84d".into(),
            }]
        } else {
            vec![]
        };
        export(
            &fixture(name),
            &out,
            &annotations,
            Compression::None,
            &request,
        )
        .map(|_| out)
    }

    fn req(open: Option<&str>, remove: bool, owner: Option<&str>) -> ProtectionRequest {
        ProtectionRequest {
            open_password: open.map(Into::into),
            remove,
            owner_password: owner.map(Into::into),
        }
    }

    #[test]
    fn keeps_protection_by_default() {
        let out = protected_export("restricted-aes256.pdf", req(None, false, None), false).unwrap();
        let info = protection(&out, None).unwrap();
        assert!(info.protected && !info.open_password);
        assert!(info.restrictions.print && info.restrictions.copy);
        // the original owner password still works on the copy
        let doc = Document::load(&out).unwrap();
        let state = doc.encryption_state.clone().unwrap();
        assert!(owner_password_matches(&doc, &state, "admin"));

        let out = protected_export(
            "user-password-aes256.pdf",
            req(Some("study"), false, None),
            false,
        )
        .unwrap();
        assert!(
            Document::load(&out).unwrap().is_encrypted(),
            "still asks for its password"
        );
        assert!(Document::load_with_password(&out, "study").is_ok());
    }

    #[test]
    fn needs_the_open_password() {
        let err = |r| {
            protected_export("user-password-aes256.pdf", r, false)
                .unwrap_err()
                .to_string()
        };
        assert!(err(req(None, false, None)).contains("needs its password"));
        assert!(err(req(Some("wrong"), false, None)).contains("not correct"));
    }

    #[test]
    fn restrictions_need_the_owner_password() {
        for owner in [None, Some("wrong"), Some("")] {
            assert!(
                protected_export("restricted-aes256.pdf", req(None, true, owner), false).is_err()
            );
        }
        // the open password alone never lifts restrictions
        assert!(protected_export(
            "user-password-aes256.pdf",
            req(Some("study"), true, None),
            false
        )
        .is_err());
        let out = protected_export(
            "restricted-aes256.pdf",
            req(None, true, Some("admin")),
            true,
        )
        .unwrap();
        assert_eq!(protection(&out, None).unwrap(), ProtectionInfo::default());
        let out = protected_export(
            "user-password-aes256.pdf",
            req(Some("study"), true, Some("admin")),
            false,
        )
        .unwrap();
        assert!(!Document::load(&out).unwrap().is_encrypted());
    }

    #[test]
    fn respects_no_annotations() {
        let info = protection(&fixture("restricted-aes256.pdf"), None).unwrap();
        if info.restrictions.annotate {
            assert!(
                protected_export("restricted-aes256.pdf", req(None, false, None), true).is_err()
            );
        }
    }

    #[test]
    fn names_the_copy() {
        assert_eq!(
            suggested_pdf_name("Analisi 2", true, false),
            "Analisi 2 (annotated).pdf"
        );
        assert_eq!(
            suggested_pdf_name("a/b", true, true),
            "a-b (annotated, compressed).pdf"
        );
        assert_eq!(
            suggested_pdf_name("", false, false),
            "LumiPDF export (copy).pdf"
        );
    }
}

/// Owner's real PDFs (tests/private, never committed): `cargo test --release private -- --ignored --nocapture`.
#[cfg(test)]
mod private_tests {
    use super::*;

    #[test]
    #[ignore]
    fn private_pdfs_compress() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/private");
        let out_dir = PathBuf::from(
            std::env::var("LUMIPDF_EXPORT_OUT")
                .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned()),
        );
        for name in ["automatica.pdf", "fis1.pdf"] {
            let src = dir.join(name);
            if !src.exists() {
                continue;
            }
            for level in [
                Compression::None,
                Compression::Light,
                Compression::Recommended,
                Compression::Strong,
            ] {
                let out = out_dir.join(format!("{name}-{level:?}.pdf"));
                let t = std::time::Instant::now();
                let r = export(&src, &out, &[], level, &ProtectionRequest::default()).unwrap();
                println!(
                    "{name} {level:?}: {:.1} MB -> {:.1} MB ({:+.0}%), {} pictures, {:?}",
                    r.original_bytes as f64 / 1e6,
                    r.exported_bytes as f64 / 1e6,
                    (r.exported_bytes as f64 / r.original_bytes as f64 - 1.0) * 100.0,
                    r.images_recompressed,
                    t.elapsed()
                );
            }
        }
    }
}

/// Feeds a request captured from the app (tests/preview) into the exporter:
/// `LUMIPDF_EXPORT_REQUEST=req.json LUMIPDF_EXPORT_OUT=out.pdf cargo test replay -- --ignored`.
#[cfg(test)]
mod replay_tests {
    use super::*;

    #[test]
    #[ignore]
    fn replay_captured_request() {
        let Ok(req) = std::env::var("LUMIPDF_EXPORT_REQUEST") else {
            return;
        };
        let json: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(req).unwrap()).unwrap();
        let annotations: Vec<ExportAnnotation> =
            serde_json::from_value(json["annotations"].clone()).unwrap();
        let source =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/latex-page.pdf");
        let out = PathBuf::from(std::env::var("LUMIPDF_EXPORT_OUT").unwrap());
        let compression: Compression = serde_json::from_value(json["compression"].clone()).unwrap();
        let r = export(
            &source,
            &out,
            &annotations,
            compression,
            &ProtectionRequest::default(),
        )
        .unwrap();
        println!("{r:?}");
    }
}
