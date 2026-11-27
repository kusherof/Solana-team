use anchor_lang::prelude::*;
use anchor_spl::memo::spl_memo;
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount as ITokenAccount};
use raydium_amm_v3::{
    cpi,
    program::AmmV3,
    states::{PersonalPositionState, PoolState},
};

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::{FeesCollectedEvent, LiquidityIncreasedEvent, PositionClosedEvent};
use crate::state::Vault;

/// Неделя 13. Общий набор аккаунтов для «собрать комиссии» и «закрыть позицию».
#[derive(Accounts)]
pub struct ManagePosition<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint_a.as_ref()],
        bump = vault.bump,
        has_one = admin @ VaultError::Unauthorized,
        has_one = pool_state @ VaultError::PoolNotConfigured,
        has_one = vault_a @ VaultError::InvalidVaultAccount,
        has_one = vault_b @ VaultError::InvalidVaultAccount,
        constraint = vault.has_position() @ VaultError::NoOpenPosition,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// CHECK: PDA vault — владелец NFT позиции
    #[account(mut, seeds = [AUTHORITY_SEED, vault.key().as_ref()], bump = vault.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub clmm_program: Program<'info, AmmV3>,

    #[account(mut, address = vault.position_nft_mint @ VaultError::NoOpenPosition)]
    pub position_nft_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = position_nft_mint,
        token::authority = vault_authority,
    )]
    pub position_nft_account: Box<InterfaceAccount<'info, ITokenAccount>>,

    #[account(
        mut,
        constraint = personal_position.nft_mint == vault.position_nft_mint @ VaultError::NoOpenPosition,
    )]
    pub personal_position: Box<Account<'info, PersonalPositionState>>,

    #[account(mut)]
    pub pool_state: AccountLoader<'info, PoolState>,

    /// CHECK: устаревший аккаунт, проверяется Raydium
    pub protocol_position: UncheckedAccount<'info>,

    #[account(mut, address = pool_state.load()?.token_vault_0)]
    pub token_vault_0: Box<InterfaceAccount<'info, ITokenAccount>>,

    #[account(mut, address = pool_state.load()?.token_vault_1)]
    pub token_vault_1: Box<InterfaceAccount<'info, ITokenAccount>>,

    /// CHECK: проверяется Raydium
    #[account(mut)]
    pub tick_array_lower: UncheckedAccount<'info>,

    /// CHECK: проверяется Raydium
    #[account(mut)]
    pub tick_array_upper: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    #[account(address = token_vault_0.mint)]
    pub vault_0_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = token_vault_1.mint)]
    pub vault_1_mint: Box<InterfaceAccount<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub token_program_2022: Program<'info, Token2022>,

    /// CHECK: адрес проверяется
    #[account(address = spl_memo::id())]
    pub memo_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    // remaining_accounts: [tick_array_bitmap_extension?, reward vaults...]
}

/// Вызывает decrease_liquidity_v2 у Raydium. При liquidity = 0 просто забирает накопленные комиссии.
fn decrease<'info>(
    accs: &ManagePosition<'info>,
    remaining: &[AccountInfo<'info>],
    liquidity: u128,
    amount_0_min: u64,
    amount_1_min: u64,
) -> Result<()> {
    let a_is_0 = accs.vault_0_mint.key() == accs.vault.mint_a;
    let (r0, r1) = if a_is_0 {
        (accs.vault_a.to_account_info(), accs.vault_b.to_account_info())
    } else {
        (accs.vault_b.to_account_info(), accs.vault_a.to_account_info())
    };
    let vault_key = accs.vault.key();
    let seeds: &[&[u8]] = &[AUTHORITY_SEED, vault_key.as_ref(), &[accs.vault.authority_bump]];
    let signer = &[seeds];

    let cpi_accounts = cpi::accounts::DecreaseLiquidityV2 {
        nft_owner: accs.vault_authority.to_account_info(),
        nft_account: accs.position_nft_account.to_account_info(),
        personal_position: accs.personal_position.to_account_info(),
        pool_state: accs.pool_state.to_account_info(),
        protocol_position: accs.protocol_position.to_account_info(),
        token_vault_0: accs.token_vault_0.to_account_info(),
        token_vault_1: accs.token_vault_1.to_account_info(),
        tick_array_lower: accs.tick_array_lower.to_account_info(),
        tick_array_upper: accs.tick_array_upper.to_account_info(),
        recipient_token_account_0: r0,
        recipient_token_account_1: r1,
        token_program: accs.token_program.to_account_info(),
        token_program_2022: accs.token_program_2022.to_account_info(),
        memo_program: accs.memo_program.to_account_info(),
        vault_0_mint: accs.vault_0_mint.to_account_info(),
        vault_1_mint: accs.vault_1_mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(accs.clmm_program.to_account_info(), cpi_accounts, signer)
        .with_remaining_accounts(remaining.to_vec());
    cpi::decrease_liquidity_v2(cpi_ctx, liquidity, amount_0_min, amount_1_min)
}

/// «Собрать комиссии»: забрать накопленные комиссии позиции в хранилища vault.
pub fn collect_fees_handler<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ManagePosition<'info>>,
) -> Result<()> {
    let a_before = ctx.accounts.vault_a.amount;
    let b_before = ctx.accounts.vault_b.amount;

    decrease(&ctx.accounts, ctx.remaining_accounts, 0, 0, 0)?;

    ctx.accounts.vault_a.reload()?;
    ctx.accounts.vault_b.reload()?;
    let fees_a = ctx.accounts.vault_a.amount - a_before;
    let fees_b = ctx.accounts.vault_b.amount - b_before;
    emit!(FeesCollectedEvent { vault: ctx.accounts.vault.key(), fees_a, fees_b });
    msg!("Комиссии собраны: A={}, B={}", fees_a, fees_b);
    Ok(())
}

/// «Закрыть позицию»: вывести всю ликвидность (с минимумами — защита от slippage),
/// забрать комиссии и сжечь NFT позиции.
pub fn close_position_handler<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ManagePosition<'info>>,
    amount_0_min: u64,
    amount_1_min: u64,
) -> Result<()> {
    let a_before = ctx.accounts.vault_a.amount;
    let b_before = ctx.accounts.vault_b.amount;
    let liquidity = ctx.accounts.personal_position.liquidity;

    // 1. Выводим всю ликвидность + комиссии.
    decrease(&ctx.accounts, ctx.remaining_accounts, liquidity, amount_0_min, amount_1_min)?;

    // 2. Закрываем позицию: Raydium сжигает NFT и возвращает аренду владельцу (vault_authority).
    let vault_key = ctx.accounts.vault.key();
    let seeds: &[&[u8]] = &[AUTHORITY_SEED, vault_key.as_ref(), &[ctx.accounts.vault.authority_bump]];
    let signer = &[seeds];
    let cpi_accounts = cpi::accounts::ClosePosition {
        nft_owner: ctx.accounts.vault_authority.to_account_info(),
        position_nft_mint: ctx.accounts.position_nft_mint.to_account_info(),
        position_nft_account: ctx.accounts.position_nft_account.to_account_info(),
        personal_position: ctx.accounts.personal_position.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        token_program: ctx.accounts.token_program_2022.to_account_info(),
    };
    cpi::close_position(CpiContext::new_with_signer(
        ctx.accounts.clmm_program.to_account_info(),
        cpi_accounts,
        signer,
    ))?;

    ctx.accounts.vault_a.reload()?;
    ctx.accounts.vault_b.reload()?;
    let got_a = ctx.accounts.vault_a.amount - a_before;
    let got_b = ctx.accounts.vault_b.amount - b_before;

    let nft = ctx.accounts.vault.position_nft_mint;
    ctx.accounts.vault.position_nft_mint = Pubkey::default();

    emit!(PositionClosedEvent { vault: vault_key, position_nft_mint: nft, liquidity, amount_a: got_a, amount_b: got_b });
    msg!("Позиция закрыта: вернулось A={}, B={}", got_a, got_b);
    Ok(())
}

/// «Докупить ликвидность»: доложить свободные токены vault (например, собранные комиссии)
/// в уже открытую позицию через increase_liquidity_v2 Raydium.
/// `amount_0_max` / `amount_1_max` — сколько максимум можно списать (защита от slippage).
pub fn increase_liquidity_handler<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, ManagePosition<'info>>,
    liquidity: u128,
    amount_0_max: u64,
    amount_1_max: u64,
) -> Result<()> {
    require!(liquidity > 0, VaultError::ZeroAmount);
    let accs = &ctx.accounts;
    let a_before = accs.vault_a.amount;
    let b_before = accs.vault_b.amount;

    let a_is_0 = accs.vault_0_mint.key() == accs.vault.mint_a;
    let (t0, t1) = if a_is_0 {
        (accs.vault_a.to_account_info(), accs.vault_b.to_account_info())
    } else {
        (accs.vault_b.to_account_info(), accs.vault_a.to_account_info())
    };
    let vault_key = accs.vault.key();
    let seeds: &[&[u8]] = &[AUTHORITY_SEED, vault_key.as_ref(), &[accs.vault.authority_bump]];
    let signer = &[seeds];

    let cpi_accounts = cpi::accounts::IncreaseLiquidityV2 {
        nft_owner: accs.vault_authority.to_account_info(),
        nft_account: accs.position_nft_account.to_account_info(),
        pool_state: accs.pool_state.to_account_info(),
        protocol_position: accs.protocol_position.to_account_info(),
        personal_position: accs.personal_position.to_account_info(),
        tick_array_lower: accs.tick_array_lower.to_account_info(),
        tick_array_upper: accs.tick_array_upper.to_account_info(),
        token_account_0: t0,
        token_account_1: t1,
        token_vault_0: accs.token_vault_0.to_account_info(),
        token_vault_1: accs.token_vault_1.to_account_info(),
        token_program: accs.token_program.to_account_info(),
        token_program_2022: accs.token_program_2022.to_account_info(),
        vault_0_mint: accs.vault_0_mint.to_account_info(),
        vault_1_mint: accs.vault_1_mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(accs.clmm_program.to_account_info(), cpi_accounts, signer)
        .with_remaining_accounts(ctx.remaining_accounts.to_vec());
    cpi::increase_liquidity_v2(cpi_ctx, liquidity, amount_0_max, amount_1_max, None)?;

    ctx.accounts.vault_a.reload()?;
    ctx.accounts.vault_b.reload()?;
    let spent_a = a_before - ctx.accounts.vault_a.amount;
    let spent_b = b_before - ctx.accounts.vault_b.amount;
    emit!(LiquidityIncreasedEvent { vault: vault_key, liquidity, amount_a: spent_a, amount_b: spent_b });
    msg!("Ликвидность увеличена на {}: списано A={}, B={}", liquidity, spent_a, spent_b);
    Ok(())
}
