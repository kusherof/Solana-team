/// Сиды (seeds) для вычисления адресов PDA.
/// Адрес PDA = hash(seeds, program_id) и не имеет приватного ключа.
pub const VAULT_SEED: &[u8] = b"vault";
pub const AUTHORITY_SEED: &[u8] = b"authority";
pub const SHARE_MINT_SEED: &[u8] = b"share";
pub const VAULT_A_SEED: &[u8] = b"vault_a";
pub const VAULT_B_SEED: &[u8] = b"vault_b";
pub const USER_SEED: &[u8] = b"user";
