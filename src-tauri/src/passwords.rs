//! Remembered passwords of locked PDFs, kept by the system: Windows Credential Manager or the
//! macOS Keychain. Never written to LumiPDF's own files. Entries are named after a hash of the
//! file's path, so the list of credentials doesn't reveal which files you read.
//!
//! Only the password that *opens* a file is stored; LumiPDF never removes or bypasses a PDF's
//! protections with it.

use sha2::{Digest, Sha256};

use crate::AppError;

#[cfg_attr(not(any(target_os = "windows", target_os = "macos")), allow(dead_code))]
const SERVICE: &str = "LumiPDF";

#[cfg_attr(
    not(any(target_os = "windows", target_os = "macos", test)),
    allow(dead_code)
)]
/// Credential name for a file: "pdf-" and the first 32 hex digits of SHA-256 of its path.
fn account(path: &str) -> String {
    let canonical = std::fs::canonicalize(path)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.to_owned());
    let digest = Sha256::digest(canonical.as_bytes());
    let hex: String = digest.iter().take(16).map(|b| format!("{b:02x}")).collect();
    format!("pdf-{hex}")
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
mod store {
    use super::{account, AppError, SERVICE};

    fn entry(path: &str) -> Result<keyring::Entry, AppError> {
        keyring::Entry::new(SERVICE, &account(path))
            .map_err(|e| AppError::InvalidInput(e.to_string()))
    }

    pub fn get(path: &str) -> Result<Option<String>, AppError> {
        match entry(path)?.get_password() {
            Ok(p) => Ok(Some(p)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::InvalidInput(e.to_string())),
        }
    }

    pub fn set(path: &str, password: &str) -> Result<(), AppError> {
        entry(path)?
            .set_password(password)
            .map_err(|e| AppError::InvalidInput(e.to_string()))
    }

    pub fn forget(path: &str) -> Result<(), AppError> {
        match entry(path)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::InvalidInput(e.to_string())),
        }
    }
}

/// Other systems (development builds): nothing is remembered.
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod store {
    use super::AppError;
    pub fn get(_path: &str) -> Result<Option<String>, AppError> {
        Ok(None)
    }
    pub fn set(_path: &str, _password: &str) -> Result<(), AppError> {
        Ok(())
    }
    pub fn forget(_path: &str) -> Result<(), AppError> {
        Ok(())
    }
}

/// The remembered password for the PDF at `path`, if any.
#[tauri::command]
pub fn pdf_password_get(path: String) -> Result<Option<String>, AppError> {
    store::get(&path)
}

/// Remembers the password that opened the PDF at `path`.
#[tauri::command]
pub fn pdf_password_set(path: String, password: String) -> Result<(), AppError> {
    if password.is_empty() || password.len() > 1024 {
        return Err(AppError::InvalidInput("password".into()));
    }
    store::set(&path, &password)
}

/// Forgets the remembered password of the PDF at `path` (it no longer opens it).
#[tauri::command]
pub fn pdf_password_forget(path: String) -> Result<(), AppError> {
    store::forget(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_is_stable_and_hides_the_path() {
        let a = account("/nonexistent/Secret Contract.pdf");
        assert_eq!(a, account("/nonexistent/Secret Contract.pdf"));
        assert!(a.starts_with("pdf-") && a.len() == 4 + 32);
        assert!(!a.contains("Secret"));
        assert_ne!(a, account("/nonexistent/other.pdf"));
    }
}
