use thiserror::Error;

use crate::pubkey::Pubkey;

#[derive(Debug, Error)]
pub enum ProgramError {
    #[error("account not found: {0}")]
    AccountNotFound(Pubkey),
    #[error("insufficient funds: have {have}, need {need}")]
    InsufficientFunds { have: u64, need: u64 },
    #[error("invalid pubkey: {0}")]
    InvalidPubkey(String),
    #[error("account already exists: {0}")]
    AccountAlreadyExists(Pubkey),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

pub type ProgramResult<T> = Result<T, ProgramError>;
