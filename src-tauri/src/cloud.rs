//! Finding the folders that cloud drive apps sync to.
//!
//! LumiPDF doesn't log in to cloud services: iCloud, OneDrive, Google Drive and Dropbox each have
//! a desktop app that keeps files in a normal folder, and the library reads that folder. This
//! module only guesses where it is; the user can always pick it by hand.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CloudKind {
    Icloud,
    Onedrive,
    Gdrive,
    Dropbox,
}

pub const ALL: [CloudKind; 4] = [
    CloudKind::Icloud,
    CloudKind::Onedrive,
    CloudKind::Gdrive,
    CloudKind::Dropbox,
];

/// Google Drive names "My Drive" in the user's language.
const MY_DRIVE: [&str; 8] = [
    "My Drive",
    "Il mio Drive",
    "Mi unidad",
    "Meine Ablage",
    "Mon Drive",
    "Meu Drive",
    "Mijn Drive",
    "Moja przestrzeń",
];

/// Where `kind` syncs on this computer, if it can be found. `env` reads environment variables.
pub fn detect(
    kind: CloudKind,
    home: &Path,
    env: &dyn Fn(&str) -> Option<String>,
) -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = match kind {
        CloudKind::Icloud => vec![
            home.join("Library/Mobile Documents/com~apple~CloudDocs"),
            home.join("iCloudDrive"),
            home.join("iCloud Drive"),
        ],
        CloudKind::Onedrive => {
            let mut v: Vec<PathBuf> = ["OneDriveConsumer", "OneDrive", "OneDriveCommercial"]
                .iter()
                .filter_map(|k| env(k))
                .map(PathBuf::from)
                .collect();
            v.push(home.join("OneDrive"));
            v.extend(cloud_storage(home, "OneDrive"));
            v
        }
        CloudKind::Dropbox => {
            let mut v: Vec<PathBuf> = ["APPDATA", "LOCALAPPDATA"]
                .iter()
                .filter_map(|k| env(k))
                .filter_map(|dir| dropbox_info(&Path::new(&dir).join("Dropbox/info.json")))
                .collect();
            v.extend(dropbox_info(&home.join(".dropbox/info.json")));
            v.extend(cloud_storage(home, "Dropbox"));
            v.push(home.join("Dropbox"));
            v
        }
        CloudKind::Gdrive => {
            let mut roots: Vec<PathBuf> = cloud_storage(home, "GoogleDrive");
            roots.push(home.join("Google Drive"));
            if cfg!(windows) {
                roots.extend(('D'..='Z').map(|letter| PathBuf::from(format!("{letter}:\\"))));
            }
            let mut v = Vec::new();
            for root in roots {
                v.extend(MY_DRIVE.iter().map(|name| root.join(name)));
            }
            v.push(home.join("Google Drive")); // older "Backup and Sync" layout
            v
        }
    };
    candidates.into_iter().find(|p| p.is_dir())
}

/// macOS File Provider folders: ~/Library/CloudStorage/<Prefix>-account.
fn cloud_storage(home: &Path, prefix: &str) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(home.join("Library/CloudStorage")) else {
        return Vec::new();
    };
    let mut found: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with(prefix))
        .map(|e| e.path())
        .collect();
    found.sort();
    found
}

/// The real name behind a macOS 13 iCloud placeholder: ".Lesson 1.pdf.icloud" → "Lesson 1.pdf".
pub fn icloud_placeholder_name(file_name: &str) -> Option<&str> {
    let real = file_name.strip_prefix('.')?.strip_suffix(".icloud")?;
    (!real.is_empty() && !real.starts_with('.')).then_some(real)
}

/// macOS 13: if `path` is only an iCloud placeholder, asks iCloud to download it and waits (up
/// to a minute) for the real file. Does nothing when the file is already there, and elsewhere.
pub fn download_icloud_placeholder(path: &Path) {
    #[cfg(target_os = "macos")]
    {
        let (Some(dir), Some(name)) = (path.parent(), path.file_name()) else {
            return;
        };
        let placeholder = dir.join(format!(".{}.icloud", name.to_string_lossy()));
        if path.exists() || !placeholder.exists() {
            return;
        }
        let _ = std::process::Command::new("/usr/bin/brctl")
            .arg("download")
            .arg(path)
            .status();
        for _ in 0..120 {
            if path.exists() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = path;
}

/// Dropbox writes its folder location to info.json: {"personal": {"path": "..."}}.
fn dropbox_info(path: &Path) -> Option<PathBuf> {
    let json: serde_json::Value = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    ["personal", "business"]
        .iter()
        .find_map(|k| json.get(k)?.get("path")?.as_str().map(PathBuf::from))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_env(_: &str) -> Option<String> {
        None
    }

    #[test]
    fn reads_icloud_placeholder_names() {
        assert_eq!(
            icloud_placeholder_name(".Lezione 1.pdf.icloud"),
            Some("Lezione 1.pdf")
        );
        assert_eq!(icloud_placeholder_name(".DS_Store"), None);
        assert_eq!(icloud_placeholder_name("a.pdf.icloud"), None);
        assert_eq!(icloud_placeholder_name("..icloud"), None);
    }

    #[test]
    fn finds_folders_in_the_usual_places() {
        let home = tempfile::tempdir().unwrap();
        let h = home.path();
        assert_eq!(detect(CloudKind::Icloud, h, &no_env), None);
        fs::create_dir_all(h.join("iCloudDrive")).unwrap();
        fs::create_dir_all(h.join("Library/CloudStorage/GoogleDrive-me@x.com/Il mio Drive"))
            .unwrap();
        fs::create_dir_all(h.join("OneDrive")).unwrap();
        assert_eq!(
            detect(CloudKind::Icloud, h, &no_env),
            Some(h.join("iCloudDrive"))
        );
        assert_eq!(
            detect(CloudKind::Gdrive, h, &no_env),
            Some(h.join("Library/CloudStorage/GoogleDrive-me@x.com/Il mio Drive"))
        );
        assert_eq!(
            detect(CloudKind::Onedrive, h, &no_env),
            Some(h.join("OneDrive"))
        );
    }

    #[test]
    fn reads_onedrive_env_and_dropbox_info() {
        let home = tempfile::tempdir().unwrap();
        let h = home.path().to_path_buf();
        let one = h.join("OneDrive - Università");
        let dbx = h.join("Work/Dropbox");
        fs::create_dir_all(&one).unwrap();
        fs::create_dir_all(&dbx).unwrap();
        fs::create_dir_all(h.join("appdata/Dropbox")).unwrap();
        let info = serde_json::json!({ "personal": { "path": dbx } });
        fs::write(h.join("appdata/Dropbox/info.json"), info.to_string()).unwrap();
        let env = |k: &str| match k {
            "OneDriveCommercial" => Some(one.to_string_lossy().into_owned()),
            "APPDATA" => Some(h.join("appdata").to_string_lossy().into_owned()),
            _ => None,
        };
        assert_eq!(detect(CloudKind::Onedrive, &h, &env), Some(one.clone()));
        assert_eq!(detect(CloudKind::Dropbox, &h, &env), Some(dbx.clone()));
    }
}
