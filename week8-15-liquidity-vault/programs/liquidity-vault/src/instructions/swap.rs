use anchor_lang::prelude::*;
use anchor_spl::memo::spl_memo;
use anchor_spl::token::{Token, TokenAccount};
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount as ITokenAccount};
use raydium_amm_v3::{
    cpi,
    program::AmmV3,
    states::{AmmConfig, ObservationState, PoolState},
};

use crate::constants::*;
use crate::errors::VaultError;
use crate::events::SwapEvent;
use crate::state::Vault;

/// Неделя 12. Обмен через CLMM-пул Raydium. Vault отдаёт один токен и получает другой.
#[derive(Accounts)]
pub struct VaultSwap<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.mint_a.as_ref()],
        bump = vault.bump,
        has_one = admin @ VaultError::Unauthorized,
        has_one = pool_state @ VaultError::PoolNotConfigured,
        has_one = vault_a @ VaultError::InvalidVaultAccount,
        has_one = vault_b @ VaultError::InvalidVaultAccount,
    )]
    pub vault: Box<Account<'info, Vault>>,

    /// CHECK: PDA vault — именно он «подписывает» обмен через invoke_signed
    #[account(mut, seeds = [AUTHORITY_SEED, vault.key().as_ref()], bump = vault.authority_bump)]
    pub vault_authority: UncheckedAccount<'info>,

    pub clmm_program: Program<'info, AmmV3>,

    #[account(address = pool_state.load()?.amm_config)]
    pub amm_config: Box<Account<'info, AmmConfig>>,

    #[account(mut)]
    pub pool_state: AccountLoader<'info, PoolState>,

    #[account(mut)]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    /// Хранилище пула для входного токена
    #[account(mut)]
    pub input_vault: Box<InterfaceAccount<'info, ITokenAccount>>,

    /// Хранилище пула для выходного токена
    #[account(mut)]
    pub output_vault: Box<InterfaceAccount<'info, ITokenAccount>>,

    #[account(mut, address = pool_state.load()?.observation_key)]
    pub observation_state: AccountLoader<'info, ObservationState>,

    pub token_program: Program<'info, Token>,
    pub token_program_2022: Program<'info, Token2022>,

    /// CHECK: адрес проверяется
    #[account(address = spl_memo::id())]
    pub memo_program: UncheckedAccount<'info>,

    #[account(address = input_vault.mint)]
    pub input_vault_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(address = output_vault.mint)]
    pub output_vault_mint: Box<InterfaceAccount<'info, Mint>>,
    // remaining_accounts: [tick_array_bitmap_extension?, tick_array_0, tick_array_1, ...]
}

/// * `amount_in` — сколько отдаём
/// * `minimum_amount_out` — защита от slippage: если пул отдаст меньше, обмен откатится
/// * `sqrt_price_limit_x64` — предельная цена (0 = без ограничения)
/// * `a_to_b` — направление: true = A → B, false = B → A
pub fn handler<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, VaultSwap<'info>>,
    amount_in: u64,
    minimum_amount_out: u64,
    sqrt_price_limit_x64: u128,
    a_to_b: bool,
) -> Result<()> {
    require!(amount_in > 0, VaultError::ZeroAmount);
    // Ограничение риска: за один обмен A → B — не больше 50% токена A vault.
    if a_to_b {
        let max_in = (ctx.accounts.vault_a.amount as u128 * MAX_SWAP_BPS as u128 / 10_000) as u64;
        require!(amount_in <= max_in, VaultError::SwapTooLarge);
    }

    let (input_ta, output_ta) = if a_to_b {
        (&ctx.accounts.vault_a, &ctx.accounts.vault_b)
    } else {
        (&ctx.accounts.vault_b, &ctx.accounts.vault_a)
    };
    require_keys_eq!(input_ta.mint, ctx.accounts.input_vault_mint.key(), VaultError::PoolMintMismatch);
    require_keys_eq!(output_ta.mint, ctx.accounts.output_vault_mint.key(), VaultError::PoolMintMismatch);

    let out_before = output_ta.amount;
    let input_info = input_ta.to_account_info();
    let output_info = output_ta.to_account_info();

    let vault_key = ctx.accounts.vault.key();
    let seeds: &[&[u8]] = &[AUTHORITY_SEED, vault_key.as_ref(), &[ctx.accounts.vault.authority_bump]];
    let signer = &[seeds];

    let cpi_accounts = cpi::accounts::SwapSingleV2 {
        payer: ctx.accounts.vault_authority.to_account_info(),
        amm_config: ctx.accounts.amm_config.to_account_info(),
        pool_state: ctx.accounts.pool_state.to_account_info(),
        input_token_account: input_info,
        output_token_account: output_info,
        input_vault: ctx.accounts.input_vault.to_account_info(),
        output_vault: ctx.accounts.output_vault.to_account_info(),
        observation_state: ctx.accounts.observation_state.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        token_program_2022: ctx.accounts.token_program_2022.to_account_info(),
        memo_program: ctx.accounts.memo_program.to_account_info(),
        input_vault_mint: ctx.accounts.input_vault_mint.to_account_info(),
        output_vault_mint: ctx.accounts.output_vault_mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.clmm_program.to_account_info(),
        cpi_accounts,
        signer,
    )
    .with_remaining_accounts(ctx.remaining_accounts.to_vec());

    // is_base_input = true: точная сумма на входе, minimum_amount_out — минимум на выходе.
    cpi::swap_v2(cpi_ctx, amount_in, minimum_amount_out, sqrt_price_limit_x64, true)?;

    // Перечитываем баланс, чтобы залогировать фактический результат обмена.
    let out_after = if a_to_b {
        ctx.accounts.vault_b.reload()?;
        ctx.accounts.vault_b.amount
    } else {
        ctx.accounts.vault_a.reload()?;
        ctx.accounts.vault_a.amount
    };
    let amount_out = out_after.saturating_sub(out_before);
    let sqrt_price_after = ctx.accounts.pool_state.load()?.sqrt_price_x64;

    emit!(SwapEvent {
        vault: vault_key,
        a_to_b,
        amount_in,
        amount_out,
        sqrt_price_x64_after: sqrt_price_after,
    });
    msg!("Swap: отдали {}, получили {}", amount_in, amount_out);
    Ok(())
}
