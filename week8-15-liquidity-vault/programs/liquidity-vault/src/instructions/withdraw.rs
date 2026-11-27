use anchor_lang::prelude::*;
use anchor_spl::token::{burn, transfer_checked, Burn, Mint, Token, TokenAccount, TransferChecked};

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::WithdrawEvent;
use crate::instructions::deposit::assert_idle;
use crate::math::assets_for_withdraw;
use crate::state::{UserAccount, Vault};

/// Неделя 10. «Вывести»: сжечь share-токены и получить свою долю токенов A.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint_a.as_ref()],
        bump = vault.bump,
        has_one = mint_a,
        has_one = share_mint,
        has_one = vault_a,
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        mut,
        seeds = [USER_SEED, vault.key().as_ref(), user.key().as_ref()],
        bump = user_account.bump,
        constraint = user_account.owner == user.key() @ VaultError::Unauthorized,
    )]
    pub user_account: Box<Account<'info, UserAccount>>,

    /// CHECK: PDA vault, подписывает перевод из хранилища
    #[account(seeds = [AUTHORITY_SEED, vault.key().as_ref()], bump = vault.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub mint_a: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    pub vault_b: Option<Box<Account<'info, TokenAccount>>>,

    #[account(mut, token::mint = mint_a, token::authority = user)]
    pub user_token_a: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = share_mint, token::authority = user)]
    pub user_share: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

/// «Вывести всё»: сжечь все share-токены пользователя за один вызов.
pub fn withdraw_all_handler(ctx: Context<Withdraw>) -> Result<()> {
    let shares = ctx.accounts.user_share.amount;
    handler(ctx, shares)
}

pub fn handler(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
    require!(shares > 0, VaultError::ZeroAmount);
    assert_idle(&ctx.accounts.vault, &ctx.accounts.vault_b)?;

    // 1. Сколько токенов положено: shares ÷ все share × всё, что лежит в vault.
    let total_assets = ctx.accounts.vault_a.amount;
    let total_shares = ctx.accounts.share_mint.supply;
    let amount = assets_for_withdraw(shares, total_assets, total_shares)?;

    // 2. Сжигаем share-токены пользователя. Подписывает ПОЛЬЗОВАТЕЛЬ.
    burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.user_share.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        shares,
    )?;

    // 3. Переводим токены из хранилища. Подписывает ПРОГРАММА от имени PDA (invoke_signed).
    let vault_key = ctx.accounts.vault.key();
    let seeds: &[&[u8]] = &[AUTHORITY_SEED, vault_key.as_ref(), &[ctx.accounts.vault.authority_bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_a.to_account_info(),
                mint: ctx.accounts.mint_a.to_account_info(),
                to: ctx.accounts.user_token_a.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint_a.decimals,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.total_withdrawn = vault.total_withdrawn.checked_add(amount).ok_or(VaultError::MathOverflow)?;
    let ua = &mut ctx.accounts.user_account;
    ua.withdrawn = ua.withdrawn.checked_add(amount).ok_or(VaultError::MathOverflow)?;
    ua.shares_burned = ua.shares_burned.checked_add(shares).ok_or(VaultError::MathOverflow)?;

    emit!(WithdrawEvent {
        vault: vault_key,
        user: ctx.accounts.user.key(),
        shares,
        amount,
        total_assets_after: total_assets - amount,
        total_shares_after: total_shares - shares,
    });
    msg!("Вывод {} share → {} токенов", shares, amount);
    Ok(())
}
