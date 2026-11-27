use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::constants::*;
use crate::errors::VaultError;
use crate::state::{UserAccount, Vault};

/// Закрыть карточку пользователя, когда у него не осталось share-токенов.
/// Аккаунт карточки удаляется, рента (SOL за хранение данных) возвращается пользователю.
#[derive(Accounts)]
pub struct CloseUserAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [VAULT_SEED, vault.mint_a.as_ref()], bump = vault.bump, has_one = share_mint)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        mut,
        close = user,
        seeds = [USER_SEED, vault.key().as_ref(), user.key().as_ref()],
        bump = user_account.bump,
        constraint = user_account.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub user_account: Box<Account<'info, UserAccount>>,

    pub share_mint: Box<Account<'info, Mint>>,

    /// Кошелёк share-токенов пользователя (ATA). Можно не передавать, если пользователь ни разу не вносил.
    #[account(associated_token::mint = share_mint, associated_token::authority = user)]
    pub user_share: Option<Box<Account<'info, TokenAccount>>>,
}

pub fn handler(ctx: Context<CloseUserAccount>) -> Result<()> {
    match &ctx.accounts.user_share {
        Some(share) => require!(share.amount == 0, VaultError::CardNotEmpty),
        None => require!(ctx.accounts.user_account.shares_minted == 0, VaultError::CardNotEmpty),
    }
    msg!("Карточка закрыта, рента возвращена пользователю");
    Ok(())
}
