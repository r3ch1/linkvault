use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("keyring: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("{0}")]
    Msg(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Msg(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Msg(s.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
