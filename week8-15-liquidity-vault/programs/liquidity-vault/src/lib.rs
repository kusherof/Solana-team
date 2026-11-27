//! # Liquidity Vault
//!
//! Учебный DeFi-vault на Solana (курс, недели 8–15):
//! пользователи вносят токен A и получают share-токены (долю в общем «котле»),
//! администратор размещает средства в CLMM-пуле Raydium и собирает комиссии,
//! пользователи сжигают share-токены и забирают свою долю.
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use instructions::*;

declare_id!("96NuHqGCDcUKWXGNuHZeS1wpeMTrpc64Jnh5jVxyLRuU");

#[program]
pub mod liquidity_vault {
    use super::*;

    /// Неделя 8. Создать vault: настройки, share-токен, хранилище токена A.
    /// `authority_lamports` — сколько SOL (в lamports) положить на PDA vault_authority
    /// для оплаты аренды аккаунтов позиции Raydium.
    pub fn initialize_vault(ctx: Context<InitializeVault>, authority_lamports: u64) -> Result<()> {
        instructions::initialize_vault::handler(ctx, authority_lamports)
    }

    /// Неделя 8. Пользователь создаёт свою карточку.
    pub fn open_user_account(ctx: Context<OpenUserAccount>) -> Result<()> {
        instructions::open_user_account::handler(ctx)
    }

    /// Неделя 9. Внести токены A и получить share-токены.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// Неделя 10. Сжечь share-токены и забрать свою долю токенов A.
    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, shares)
    }

    /// Неделя 10 (практика). Вывести всё: сжечь все share-токены пользователя за один вызов.
    pub fn withdraw_all(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::withdraw_all_handler(ctx)
    }

    /// Неделя 10 (практика). Закрыть пустую карточку и вернуть ренту пользователю.
    pub fn close_user_account(ctx: Context<CloseUserAccount>) -> Result<()> {
        instructions::close_user_account::handler(ctx)
    }

    /// Неделя 12. Привязать CLMM-пул Raydium и создать хранилище токена B (только админ).
    pub fn configure_pool(ctx: Context<ConfigurePool>) -> Result<()> {
        instructions::configure_pool::handler(ctx)
    }

    /// Неделя 12. Обмен через Raydium CLMM (только админ).
    pub fn swap<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, VaultSwap<'info>>,
        amount_in: u64,
        minimum_amount_out: u64,
        sqrt_price_limit_x64: u128,
        a_to_b: bool,
    ) -> Result<()> {
        instructions::swap::handler(ctx, amount_in, minimum_amount_out, sqrt_price_limit_x64, a_to_b)
    }

    /// Неделя 13. Открыть позицию в CLMM-пуле (только админ).
    #[allow(clippy::too_many_arguments)]
    pub fn open_position<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, OpenPosition<'info>>,
        tick_lower_index: i32,
        tick_upper_index: i32,
        tick_array_lower_start_index: i32,
        tick_array_upper_start_index: i32,
        liquidity: u128,
        amount_0_max: u64,
        amount_1_max: u64,
    ) -> Result<()> {
        instructions::open_position::handler(
            ctx,
            tick_lower_index,
            tick_upper_index,
            tick_array_lower_start_index,
            tick_array_upper_start_index,
            liquidity,
            amount_0_max,
            amount_1_max,
        )
    }

    /// Неделя 13. Собрать комиссии позиции (только админ).
    pub fn collect_fees<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ManagePosition<'info>>,
    ) -> Result<()> {
        instructions::manage_position::collect_fees_handler(ctx)
    }

    /// Неделя 13. Закрыть позицию: вывести ликвидность и сжечь NFT (только админ).
    pub fn close_position<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ManagePosition<'info>>,
        amount_0_min: u64,
        amount_1_min: u64,
    ) -> Result<()> {
        instructions::manage_position::close_position_handler(ctx, amount_0_min, amount_1_min)
    }

    /// Неделя 13 (практика). Доложить свободные токены vault (например, комиссии) в открытую позицию.
    pub fn increase_liquidity<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, ManagePosition<'info>>,
        liquidity: u128,
        amount_0_max: u64,
        amount_1_max: u64,
    ) -> Result<()> {
        instructions::manage_position::increase_liquidity_handler(ctx, liquidity, amount_0_max, amount_1_max)
    }
}
