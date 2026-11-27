//! Glimmo — светящиеся питомцы на Solana.
//!
//! Каждый питомец — NFT стандарта Token-2022 (метаданные лежат прямо в mint),
//! рядом с которым живёт PDA `Pet` с ДНК и состоянием: сытость, настроение,
//! опыт, уровень. Еда — обычный SPL-токен FOOD, который выпускает PDA программы.
//! Время берётся из sysvar Clock, случайность — из SlotHashes + ключей.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod genes;
pub mod instructions;
pub mod nft;
pub mod state;

use instructions::*;
pub use state::GameParams;

declare_id!("HSKLQX3Q8pwhn8gJfgDvHjVwyBV5DgGqVGCFicUuxdeX");

#[program]
pub mod glimmo {
    use super::*;

    /// Создать игру: конфиг, mint еды FOOD и казну. Может только upgrade authority программы.
    pub fn initialize(ctx: Context<Initialize>, params: GameParams) -> Result<()> {
        instructions::admin::initialize(ctx, params)
    }

    /// Изменить параметры игры (цены, таймеры). Только администратор.
    pub fn update_params(ctx: Context<UpdateParams>, params: GameParams) -> Result<()> {
        instructions::admin::update_params(ctx, params)
    }

    /// Вывести SOL из казны. Только администратор.
    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, lamports: u64) -> Result<()> {
        instructions::admin::withdraw_treasury(ctx, lamports)
    }

    /// Получить порцию еды FOOD из «кормушки» (не чаще, чем раз в food_cooldown).
    pub fn claim_food(ctx: Context<ClaimFood>) -> Result<()> {
        instructions::food::claim_food(ctx)
    }

    /// Купить яйцо: оплата в казну, выпуск NFT (Token-2022) и случайная ДНК.
    pub fn adopt_egg(ctx: Context<AdoptEgg>, name: String) -> Result<()> {
        instructions::adopt::adopt_egg(ctx, name)
    }

    /// Вылупить питомца, когда истёк таймер яйца. Именно здесь выпадает ДНК.
    pub fn hatch(ctx: Context<Hatch>) -> Result<()> {
        instructions::care::hatch(ctx)
    }

    /// Покормить питомца: сжигается `amount` FOOD.
    pub fn feed(ctx: Context<Feed>, amount: u8) -> Result<()> {
        instructions::care::feed(ctx, amount)
    }

    /// Поиграть с питомцем: настроение и опыт растут, сытость немного падает.
    pub fn play(ctx: Context<PetAction>) -> Result<()> {
        instructions::care::play(ctx)
    }

    /// Переименовать питомца (меняется и имя NFT в метаданных Token-2022).
    pub fn rename(ctx: Context<Rename>, name: String) -> Result<()> {
        instructions::care::rename(ctx, name)
    }

    /// Скрестить двух взрослых питомцев (можно двух разных игроков): новое яйцо
    /// с генами от обоих родителей и шансом мутации.
    pub fn breed(ctx: Context<Breed>, name: String) -> Result<()> {
        instructions::breed::breed(ctx, name)
    }
}
