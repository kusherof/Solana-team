use sha2::{Digest, Sha256};

use crate::pubkey::Pubkey;

/// Educational PDA: SHA-256(seeds || program_id || bump), like Solana's idea
/// of a deterministic address from seeds. Not a byte-for-byte Solana PDA.
pub fn find_program_address(seeds: &[&[u8]], program_id: &Pubkey) -> (Pubkey, u8) {
    for bump in (0..=255u8).rev() {
        let candidate = derive(seeds, program_id, bump);
        if is_off_ed25519_curve(&candidate) {
            return (candidate, bump);
        }
    }
    panic!("unable to find a valid PDA bump");
}

pub fn derive(seeds: &[&[u8]], program_id: &Pubkey, bump: u8) -> Pubkey {
    let mut hasher = Sha256::new();
    for seed in seeds {
        hasher.update(seed);
    }
    hasher.update(program_id.as_bytes());
    hasher.update([bump]);
    hasher.update(b"ProgramDerivedAddress");
    let digest = hasher.finalize();
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&digest);
    Pubkey::from_bytes(bytes)
}

/// Simplified off-curve check: last bit of hash is 0. Real Solana uses
/// ed25519 point decompression; here we only practise seed hashing + bump.
fn is_off_ed25519_curve(pk: &Pubkey) -> bool {
    pk.as_bytes()[31] & 1 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pda_is_deterministic() {
        let program = Pubkey::from_bytes([7u8; 32]);
        let seed = b"profile";
        let (a, bump_a) = find_program_address(&[seed], &program);
        let (b, bump_b) = find_program_address(&[seed], &program);
        assert_eq!(a, b);
        assert_eq!(bump_a, bump_b);
        assert_eq!(derive(&[seed], &program, bump_a), a);
    }
}
