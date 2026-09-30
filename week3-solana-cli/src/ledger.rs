use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::account::{Account, Profile};
use crate::error::ProgramResult;
use crate::pubkey::Pubkey;

const SYSTEM_PROGRAM: [u8; 32] = [0u8; 32];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Ledger {
    pub program_id: Pubkey,
    pub accounts: HashMap<Pubkey, Account>,
}

impl Default for Ledger {
    fn default() -> Self {
        Self {
            program_id: Pubkey::from_bytes([1u8; 32]),
            accounts: HashMap::new(),
        }
    }
}

impl Ledger {
    pub fn path() -> PathBuf {
        PathBuf::from("ledger.json")
    }

    pub fn load(path: &Path) -> ProgramResult<Self> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let raw = fs::read_to_string(path)?;
        Ok(serde_json::from_str(&raw)?)
    }

    pub fn save(&self, path: &Path) -> ProgramResult<()> {
        let json = serde_json::to_string_pretty(self)?;
        fs::write(path, json)?;
        Ok(())
    }

    pub fn get(&self, key: &Pubkey) -> Option<&Account> {
        self.accounts.get(key)
    }

    pub fn get_mut(&mut self, key: &Pubkey) -> Option<&mut Account> {
        self.accounts.get_mut(key)
    }

    pub fn insert(&mut self, key: Pubkey, account: Account) {
        self.accounts.insert(key, account);
    }

    pub fn airdrop(&mut self, pubkey: Pubkey, lamports: u64) {
        match self.accounts.get_mut(&pubkey) {
            Some(account) => account.lamports += lamports,
            None => {
                self.accounts.insert(
                    pubkey,
                    Account::new(lamports, Pubkey::from_bytes(SYSTEM_PROGRAM)),
                );
            }
        }
    }

    pub fn profile_at(&self, pda: &Pubkey) -> Option<Profile> {
        self.get(pda).and_then(|a| Profile::unpack(&a.data))
    }
}
