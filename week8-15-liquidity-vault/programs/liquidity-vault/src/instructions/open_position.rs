use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount as ITokenAccount};
use raydium_amm_v3::{cpi, program::AmmV3, states::PoolState};

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::PositionOpenedEvent;
use crate::state::Vault;

/// Неделя 13. Открыть позицию в CLMM-пуле: vault кладёт оба токена в диапазон [tick_lower, tick_upper]
/// и получает NFT позиции (Token-2022). Владелец NFT — vault_authority (PDA).
#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.mint_a.as_ref()],
        bump = vault.bump,
        has_one = admin @ VaultError::Unauthorized,
        has_one = pool_state @ VaultError::PoolNotConfigured,
        has_one = vault_a @ VaultError::InvalidVaultAccount,
        has_one = vault_b @ VaultError::InvalidVaultAccount,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// CHECK: PDA vault. Платит аренду за аккаунты позиции и отдаёт токены в пул (invoke_signed).
    #[account(mut, seeds = [AUTHORITY_SEED, vault.key().as_ref()], bump = vault.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub clmm_program: Program<'info, AmmV3>,

    /// Новый случайный keypair — mint NFT позиции (подписывает транзакцию).
    #[account(mut)]
    pub position_nft_mint: Signer<'info>,

    /// CHECK: ATA vault_authority для NFT, создаётся Raydium
    #[account(mut)]
    pub position_nft_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub pool_state: AccountLoader<'info, PoolState>,

    /// CHECK: устаревший аккаунт, оставлен для совместимости, проверяется Raydium
    pub protocol_position: UncheckedAccount<'info>,

    /// CHECK: проверяется Raydium (PDA tick array)
    #[account(mut)]
    pub tick_array_lower: UncheckedAccount<'info>,

    /// CHECK: проверяется Raydium (PDA tick array)
    #[account(mut)]
    pub tick_array_upper: UncheckedAccount<'info>,

    /// CHECK: создаётся Raydium (PDA ["position", nft_mint])
    #[account(mut)]
    pub personal_position: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    #[account(mut, address = pool_state.load()?.token_vault_0)]
    pub token_vault_0: Box<InterfaceAccount<'info, ITokenAccount>>,

    #[account(mut, address = pool_state.load()?.token_vault_1)]
    pub token_vault_1: Box<InterfaceAccount<'info, ITokenAccount>>,

    #[account(address = token_vault_0.mint)]
    pub vault_0_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = token_vault_1.mint)]
    pub vault_1_mint: Box<InterfaceAccount<'info, Mint>>,

    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program_2022: Program<'info, Token2022>,
    // remaining_accounts: [tick_array_bitmap_extension] — если тики вне базового диапазона
}

#[allow(clippy::too_many_arguments)]
pub fn handler<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, OpenPosition<'info>>,
    tick_lower_index: i32,
    tick_upper_index: i32,
    tick_array_lower_start_index: i32,
    tick_array_upper_start_index: i32,
    liquidity: u128,
    amount_0_max: u64,
    amount_1_max: u64,
) -> Result<()> {
    require!(!ctx.accounts.vault.has_position(), VaultError::PositionAlreadyOpen);

    // В пуле токены упорядочены (token_0 < token_1). Сопоставляем им наши хранилища.
    let a_is_0 = ctx.accounts.vault_0_mint.key() == ctx.accounts.vault.mint_a;
    let (ta0, ta1) = if a_is_0 {
        (ctx.accounts.vault_a.to_account_info(), ctx.accounts.vault_b.to_account_info())
    } else {
        (ctx.accounts.vault_b.to_account_info(), ctx.accounts.vault_a.to_account_info())
    };

    let a_before = ctx.accounts.vault_a.amount;
    let b_before = ctx.accounts.vault_b.amount;

    let vault_key = ctx.accounts.vault.key();
    let seeds: &[&[u8]] = &[AUTHORITY_SEED, vault_key.as_ref(), &[ctx.accounts.vault.authority_bump]];
    let signer = &[seeds];

    let cpi_accounts = cpi::accounts::OpenPositionWithToken22Nft {
        payer: ctx.accounts.vault_authority.to_account_info(),
        position_nft_owner: ctx.accounts.vault_authority.to_account_info(),
        position_nft_mint: ctx.accounts.position_nft_mint.to_account_info(),
        position_nft_account: ctx.accounts.position_nft_account.to_account_info(),
        pool_state: ctx.accounts.pool_state.to_account_info(),
        protocol_position: ctx.accounts.protocol_position.to_account_info(),
        tick_array_lower: ctx.accounts.tick_array_lower.to_account_info(),
        tick_array_upper: ctx.accounts.tick_array_upper.to_account_info(),
        personal_position: ctx.accounts.personal_position.to_account_info(),
        token_account_0: ta0,
        token_account_1: ta1,
        token_vault_0: ctx.accounts.token_vault_0.to_account_info(),
        token_vault_1: ctx.accounts.token_vault_1.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
        token_program_2022: ctx.accounts.token_program_2022.to_account_info(),
        vault_0_mint: ctx.accounts.vault_0_mint.to_account_info(),
        vault_1_mint: ctx.accounts.vault_1_mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.clmm_program.to_account_info(),
        cpi_accounts,
        signer,
    )
    .with_remaining_accounts(ctx.remaining_accounts.to_vec());

    cpi::open_position_with_token22_nft(
        cpi_ctx,
        tick_lower_index,
        tick_upper_index,
        tick_array_lower_start_index,
        tick_array_upper_start_index,
        liquidity,
        amount_0_max,
        amount_1_max,
        false, // без метаданных Metaplex
        None,
    )?;

    ctx.accounts.vault_a.reload()?;
    ctx.accounts.vault_b.reload()?;
    let used_a = a_before.saturating_sub(ctx.accounts.vault_a.amount);
    let used_b = b_before.saturating_sub(ctx.accounts.vault_b.amount);

    let vault = &mut ctx.accounts.vault;
    vault.position_nft_mint = ctx.accounts.position_nft_mint.key();

    emit!(PositionOpenedEvent {
        vault: vault_key,
        position_nft_mint: vault.position_nft_mint,
        tick_lower_index,
        tick_upper_index,
        liquidity,
        amount_a: used_a,
        amount_b: used_b,
    });
    msg!("Позиция открыта: тики [{}, {}], A={}, B={}", tick_lower_index, tick_upper_index, used_a, used_b);
    Ok(())
}
