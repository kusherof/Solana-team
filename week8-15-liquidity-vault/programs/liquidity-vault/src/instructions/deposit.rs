use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{mint_to, transfer_checked, Mint, MintTo, Token, TokenAccount, TransferChecked};

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::DepositEvent;
use crate::math::shares_for_deposit;
use crate::state::{UserAccount, Vault};

/// Неделя 9. «Внести токены» → получить share-токены.
#[derive(Accounts)]
pub struct Deposit<'info> {
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

    /// CHECK: PDA vault, подписывает выпуск share-токенов
    #[account(seeds = [AUTHORITY_SEED, vault.key().as_ref()], bump = vault.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub mint_a: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub share_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    /// Хранилище токена B — нужно, только если пул уже привязан (проверяем, что оно пустое).
    pub vault_b: Option<Box<Account<'info, TokenAccount>>>,

    /// Токен-аккаунт пользователя, откуда списываются токены A.
    #[account(mut, token::mint = mint_a, token::authority = user)]
    pub user_token_a: Box<Account<'info, TokenAccount>>,

    /// Кошелёк share-токенов пользователя (ATA), создаётся при первом депозите.
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = share_mint,
        associated_token::authority = user,
    )]
    pub user_share: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Депозит и вывод разрешены, только когда все средства vault лежат в токене A:
/// нет открытой позиции и хранилище B пустое (упрощение учебной версии).
pub fn assert_idle(vault: &Vault, vault_b: &Option<Box<Account<TokenAccount>>>) -> Result<()> {
    require!(!vault.has_position(), VaultError::VaultNotIdle);
    if vault.has_pool() {
        let vb = vault_b.as_ref().ok_or(VaultError::InvalidVaultAccount)?;
        require_keys_eq!(vb.key(), vault.vault_b, VaultError::InvalidVaultAccount);
        require!(vb.amount == 0, VaultError::VaultNotIdle);
    }
    Ok(())
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);
    assert_idle(&ctx.accounts.vault, &ctx.accounts.vault_b)?;

    // 1. Считаем, сколько share-токенов положено.
    let total_assets = ctx.accounts.vault_a.amount;
    let total_shares = ctx.accounts.share_mint.supply;
    let shares = shares_for_deposit(amount, total_assets, total_shares)?;

    // 2. Перевод токенов пользователя в хранилище. Подписывает ПОЛЬЗОВАТЕЛЬ
    //    (его подпись «передаётся» дальше в Token Program).
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_token_a.to_account_info(),
                mint: ctx.accounts.mint_a.to_account_info(),
                to: ctx.accounts.vault_a.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint_a.decimals,
    )?;

    // 3. Выпуск share-токенов. Подписывает ПРОГРАММА от имени PDA vault_authority.
    let vault_key = ctx.accounts.vault.key();
    let seeds: &[&[u8]] = &[AUTHORITY_SEED, vault_key.as_ref(), &[ctx.accounts.vault.authority_bump]];
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.user_share.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[seeds],
        ),
        shares,
    )?;

    // 4. Обновляем учёт.
    let vault = &mut ctx.accounts.vault;
    vault.total_deposited = vault.total_deposited.checked_add(amount).ok_or(VaultError::MathOverflow)?;
    let ua = &mut ctx.accounts.user_account;
    ua.deposited = ua.deposited.checked_add(amount).ok_or(VaultError::MathOverflow)?;
    ua.shares_minted = ua.shares_minted.checked_add(shares).ok_or(VaultError::MathOverflow)?;

    emit!(DepositEvent {
        vault: vault_key,
        user: ctx.accounts.user.key(),
        amount,
        shares,
        total_assets_after: total_assets + amount,
        total_shares_after: total_shares + shares,
    });
    msg!("Депозит {} → {} share", amount, shares);
    Ok(())
}
