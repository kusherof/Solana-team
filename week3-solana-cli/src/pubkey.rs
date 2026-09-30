use std::fmt;
use std::str::FromStr;

use rand::RngCore;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::error::ProgramError;

/// 32-byte address, same size as Solana `Pubkey`.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct Pubkey(pub [u8; 32]);

impl Pubkey {
    pub const SIZE: usize = 32;

    pub fn new_unique() -> Self {
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        Self(bytes)
    }

    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl fmt::Display for Pubkey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", bs58::encode(self.0).into_string())
    }
}

impl fmt::Debug for Pubkey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Pubkey({})", self)
    }
}

impl FromStr for Pubkey {
    type Err = ProgramError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let bytes = bs58::decode(s)
            .into_vec()
            .map_err(|e| ProgramError::InvalidPubkey(e.to_string()))?;
        let arr: [u8; 32] = bytes
            .try_into()
            .map_err(|_| {
                ProgramError::InvalidPubkey(format!("expected {} bytes", Pubkey::SIZE))
            })?;
        Ok(Self(arr))
    }
}

impl Serialize for Pubkey {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for Pubkey {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Pubkey::from_str(&s).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_base58() {
        let pk = Pubkey::new_unique();
        let parsed = Pubkey::from_str(&pk.to_string()).unwrap();
        assert_eq!(pk, parsed);
    }
}
