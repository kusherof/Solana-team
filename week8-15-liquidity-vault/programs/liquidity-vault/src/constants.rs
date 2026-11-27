/// Сиды (seeds) для вычисления адресов PDA.
/// Адрес PDA = hash(seeds, program_id) и не имеет приватного ключа.
pub const VAULT_SEED: &[u8] = b"vault";
pub const AUTHORITY_SEED: &[u8] = b"authority";
pub const SHARE_MINT_SEED: &[u8] = b"share";
pub const VAULT_A_SEED: &[u8] = b"vault_a";
pub const VAULT_B_SEED: &[u8] = b"vault_b";
pub const USER_SEED: &[u8] = b"user";

/// Минимальный депозит в целых токенах A (1 токен = 10^decimals единиц).
pub const MIN_DEPOSIT_TOKENS: u64 = 1;
/// Сколько токена A vault можно отдать за один обмен A → B, в базисных пунктах (5000 = 50%).
pub const MAX_SWAP_BPS: u64 = 5_000;
