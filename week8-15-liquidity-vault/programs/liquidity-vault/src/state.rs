use anchor_lang::prelude::*;

/// Настройки vault. PDA: ["vault", mint_a].
#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Администратор: управляет обменами и позициями, но НЕ может забрать токены себе.
    pub admin: Pubkey,
    /// Токен, который принимает vault (токен A).
    pub mint_a: Pubkey,
    /// Share-токен (квитанция о доле). Выпускать может только vault_authority.
    pub share_mint: Pubkey,
    /// Хранилище токена A (token account, владелец — vault_authority).
    pub vault_a: Pubkey,
    /// Второй токен пула (появляется после configure_pool).
    pub mint_b: Pubkey,
    /// Хранилище токена B.
    pub vault_b: Pubkey,
    /// Привязанный CLMM-пул Raydium.
    pub pool_state: Pubkey,
    /// Mint NFT текущей позиции в CLMM (Pubkey::default(), если позиции нет).
    pub position_nft_mint: Pubkey,
    /// Сколько всего токенов A внесено (статистика).
    pub total_deposited: u64,
    /// Сколько всего токенов A выведено (статистика).
    pub total_withdrawn: u64,
    pub bump: u8,
    pub authority_bump: u8,
    pub share_mint_bump: u8,
    pub vault_a_bump: u8,
}

impl Vault {
    pub fn has_pool(&self) -> bool {
        self.pool_state != Pubkey::default()
    }
    pub fn has_position(&self) -> bool {
        self.position_nft_mint != Pubkey::default()
    }
}

/// «Карточка» пользователя. PDA: ["user", vault, owner] —
/// адрес вычисляется из адреса пользователя, поэтому список пользователей хранить не нужно.
#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    pub owner: Pubkey,
    pub vault: Pubkey,
    /// Сколько токенов A пользователь внёс за всё время.
    pub deposited: u64,
    /// Сколько токенов A пользователь вывел за всё время.
    pub withdrawn: u64,
    /// Сколько share-токенов получено за всё время.
    pub shares_minted: u64,
    /// Сколько share-токенов сожжено при выводе.
    pub shares_burned: u64,
    pub bump: u8,
}
