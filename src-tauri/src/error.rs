use serde::Serialize;

/// Errors returned to the frontend. Serialized as `{ kind, message }` so the UI can show
/// a readable message and react to the kind without parsing strings.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    InvalidInput(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let kind = match self {
            AppError::Io(_) => "io",
            AppError::InvalidInput(_) => "invalid_input",
        };
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", kind)?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_kind_and_message() {
        let err = AppError::InvalidInput("bad page number".into());
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["kind"], "invalid_input");
        assert_eq!(json["message"], "bad page number");
    }
}
