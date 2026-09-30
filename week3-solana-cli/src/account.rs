use serde::{Deserialize, Serialize};

use crate::pubkey::Pubkey;

/// Local model of a Solana account: lamports, owner, data buffer.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Account {
    pub lamports: u64,
    pub owner: Pubkey,
    pub data: Vec<u8>,
    pub executable: bool,
}

impl Account {
    pub fn new(lamports: u64, owner: Pubkey) -> Self {
        Self {
            lamports,
            owner,
            data: Vec::new(),
            executable: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub owner: Pubkey,
    pub username: String,
}

impl Profile {
    pub fn pack(&self) -> Vec<u8> {
        serde_json::to_vec(self).expect("profile json")
    }

    pub fn unpack(data: &[u8]) -> Option<Self> {
        serde_json::from_slice(data).ok()
    }
}
