use thiserror::Error;

#[derive(Error, Debug)]
pub enum OtiumError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Document format error: {0}")]
    Format(String),

    #[error("Unsupported document type: {0}")]
    UnsupportedType(String),

    #[error("Document not found: {0}")]
    NotFound(String),

    #[error("Storage vault error: {0}")]
    Vault(String),

    #[error("Authentication failed: {0}")]
    AuthFailed(String),

    #[error("Image processing error: {0}")]
    ImageProcessing(String),

    #[error("Presentation slide error: {0}")]
    SlideError(String),

    #[error("Network / P2P sync error: {0}")]
    Network(String),

    #[error("Validation failed: {0}")]
    Validation(String),
}

pub type Result<T> = std::result::Result<T, OtiumError>;
