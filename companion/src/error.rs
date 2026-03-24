use std::fmt;

/// Top-level error type for the companion app.
#[derive(Debug)]
pub enum CompanionError {
    /// WebSocket transport error.
    WebSocket(tokio_tungstenite::tungstenite::Error),
    /// JSON serialization / deserialization error.
    Json(serde_json::Error),
    /// I/O error (file system, network bind, etc.).
    Io(std::io::Error),
    /// Plugin-related error with a human-readable message.
    Plugin(String),
    /// A protocol-level error (unknown message type, missing fields, etc.).
    Protocol(String),
}

impl fmt::Display for CompanionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::WebSocket(e) => write!(f, "WebSocket error: {e}"),
            Self::Json(e) => write!(f, "JSON error: {e}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Plugin(msg) => write!(f, "Plugin error: {msg}"),
            Self::Protocol(msg) => write!(f, "Protocol error: {msg}"),
        }
    }
}

impl std::error::Error for CompanionError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::WebSocket(e) => Some(e),
            Self::Json(e) => Some(e),
            Self::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<tokio_tungstenite::tungstenite::Error> for CompanionError {
    fn from(e: tokio_tungstenite::tungstenite::Error) -> Self {
        Self::WebSocket(e)
    }
}

impl From<serde_json::Error> for CompanionError {
    fn from(e: serde_json::Error) -> Self {
        Self::Json(e)
    }
}

impl From<std::io::Error> for CompanionError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

pub type Result<T> = std::result::Result<T, CompanionError>;
