use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::{UserAccount, Vault};

/// Неделя 8. «Открыть позицию» пользователя: создаёт его карточку.
/// Адрес карточки = PDA ["user", vault, user], поэтому её всегда можно найти по адресу пользователя.
#[derive(Accounts)]
pub struct OpenUserAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = user,
        space = 8 + UserAccount::INIT_SPACE,
        seeds = [USER_SEED, vault.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<OpenUserAccount>) -> Result<()> {
    let ua = &mut ctx.accounts.user_account;
    ua.owner = ctx.accounts.user.key();
    ua.vault = ctx.accounts.vault.key();
    ua.deposited = 0;
    ua.withdrawn = 0;
    ua.shares_minted = 0;
    ua.shares_burned = 0;
    ua.bump = ctx.bumps.user_account;
    Ok(())
}
