use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use raydium_amm_v3::states::PoolState;

use crate::constants::*;
use crate::errors::VaultError;
use crate::state::Vault;

/// Неделя 12. Привязать CLMM-пул Raydium и создать второе хранилище (для токена B).
#[derive(Accounts)]
pub struct ConfigurePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint_a.as_ref()],
        bump = vault.bump,
        has_one = admin @ VaultError::Unauthorized,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// CHECK: PDA vault, будет владельцем хранилища B
    #[account(seeds = [AUTHORITY_SEED, vault.key().as_ref()], bump = vault.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    /// CLMM-пул Raydium. AccountLoader проверяет, что аккаунт принадлежит программе Raydium CLMM.
    pub pool_state: AccountLoader<'info, PoolState>,

    pub mint_b: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = admin,
        seeds = [VAULT_B_SEED, vault.key().as_ref()],
        bump,
        token::mint = mint_b,
        token::authority = vault_authority,
    )]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<ConfigurePool>) -> Result<()> {
    require!(!ctx.accounts.vault.has_pool(), VaultError::PoolAlreadyConfigured);

    let pool = ctx.accounts.pool_state.load()?;
    let mint_a = ctx.accounts.vault.mint_a;
    let mint_b = ctx.accounts.mint_b.key();
    let pair_ok = (pool.token_mint_0 == mint_a && pool.token_mint_1 == mint_b)
        || (pool.token_mint_0 == mint_b && pool.token_mint_1 == mint_a);
    require!(pair_ok, VaultError::PoolMintMismatch);
    drop(pool);

    let vault = &mut ctx.accounts.vault;
    vault.pool_state = ctx.accounts.pool_state.key();
    vault.mint_b = mint_b;
    vault.vault_b = ctx.accounts.vault_b.key();
    msg!("Пул привязан: {}", vault.pool_state);
    Ok(())
}
