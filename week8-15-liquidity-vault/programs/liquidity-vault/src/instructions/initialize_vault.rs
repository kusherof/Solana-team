use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::errors::VaultError;
use crate::state::Vault;

/// Неделя 8. «Создать vault»: один раз создаёт настройки, share-токен и хранилище токена A.
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Токен, который vault принимает от пользователей.
    pub mint_a: Account<'info, Mint>,

    /// Настройки vault.
    #[account(
        init,
        payer = admin,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, mint_a.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: PDA без данных — «подпись» vault. Владеет хранилищами, выпускает share-токены,
    /// владеет NFT позиции и платит аренду за аккаунты Raydium. Приватного ключа нет.
    #[account(mut, seeds = [AUTHORITY_SEED, vault.key().as_ref()], bump)]
    pub vault_authority: SystemAccount<'info>,

    /// Share-токен. Mint authority = vault_authority, поэтому выпускать его может только программа.
    #[account(
        init,
        payer = admin,
        seeds = [SHARE_MINT_SEED, vault.key().as_ref()],
        bump,
        mint::decimals = mint_a.decimals,
        mint::authority = vault_authority,
    )]
    pub share_mint: Account<'info, Mint>,

    /// Хранилище токена A.
    #[account(
        init,
        payer = admin,
        seeds = [VAULT_A_SEED, vault.key().as_ref()],
        bump,
        token::mint = mint_a,
        token::authority = vault_authority,
    )]
    pub vault_a: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeVault>, authority_lamports: u64) -> Result<()> {
    // vault_authority будет платить аренду за NFT позиции и аккаунты Raydium,
    // поэтому сразу пополняем его SOL (минимум — rent-exempt для пустого аккаунта).
    let min = Rent::get()?.minimum_balance(0);
    require!(authority_lamports >= min, VaultError::InsufficientAuthorityLamports);
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.admin.to_account_info(),
                to: ctx.accounts.vault_authority.to_account_info(),
            },
        ),
        authority_lamports,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.admin = ctx.accounts.admin.key();
    vault.mint_a = ctx.accounts.mint_a.key();
    vault.share_mint = ctx.accounts.share_mint.key();
    vault.vault_a = ctx.accounts.vault_a.key();
    vault.mint_b = Pubkey::default();
    vault.vault_b = Pubkey::default();
    vault.pool_state = Pubkey::default();
    vault.position_nft_mint = Pubkey::default();
    vault.total_deposited = 0;
    vault.total_withdrawn = 0;
    vault.bump = ctx.bumps.vault;
    vault.authority_bump = ctx.bumps.vault_authority;
    vault.share_mint_bump = ctx.bumps.share_mint;
    vault.vault_a_bump = ctx.bumps.vault_a;

    msg!("Vault создан: {}", vault.key());
    Ok(())
}
