use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::slot_hashes;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};
use anchor_spl::token_interface::{Token2022, TokenAccount as TokenAccount2022};

use crate::constants::*;
use crate::errors::GlimmoError;
use crate::events::*;
use crate::genes;
use crate::nft::{dna_hex, update_nft_field, MetaField, DNA_PLACEHOLDER};
use crate::state::*;

/// Начислить опыт (с множителем настроения и серии) и выпустить события.
/// При первом достижении взрослой стадии фиксируется облик по качеству ухода.
pub fn grant_xp(pet: &mut Pet, pet_key: Pubkey, base_xp: u32, params: &GameParams) {
    let xp = base_xp.saturating_mul(pet.xp_multiplier()) / 100;
    let before = pet.stage(params);
    for level in pet.add_xp(xp, params) {
        emit!(LevelUp { pet: pet_key, level });
    }
    let after = pet.stage(params);
    if after != before {
        if after == Stage::Adult && pet.form == FORM_NONE {
            pet.form = pet.adult_form();
        }
        emit!(Evolved {
            pet: pet_key,
            stage: after as u8,
            form: pet.form,
        });
    }
}

/// Отметить заботу и сообщить о серии.
fn care(pet: &mut Pet, pet_key: Pubkey, now: i64, params: &GameParams) {
    let before = pet.streak;
    let period = pet.last_care_period;
    pet.touch_care(now, params);
    if pet.last_care_period != period && pet.streak != before {
        emit!(CareStreak {
            pet: pet_key,
            streak: pet.streak,
            bond: pet.bond
        });
    }
}

#[derive(Accounts)]
pub struct PetAction<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PET_SEED, pet.mint.as_ref()], bump = pet.bump)]
    pub pet: Box<Account<'info, Pet>>,
    /// Токен-аккаунт владельца с NFT питомца (проверяем, что NFT у него).
    #[account(
        constraint = pet_token.mint == pet.mint @ GlimmoError::NotOwner,
        constraint = pet_token.owner == owner.key() @ GlimmoError::NotOwner,
        constraint = pet_token.amount == 1 @ GlimmoError::NotOwner,
    )]
    pub pet_token: Box<InterfaceAccount<'info, TokenAccount2022>>,
}

#[derive(Accounts)]
pub struct Hatch<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PET_SEED, pet.mint.as_ref()], bump = pet.bump)]
    pub pet: Box<Account<'info, Pet>>,
    #[account(
        constraint = pet_token.mint == pet.mint @ GlimmoError::NotOwner,
        constraint = pet_token.owner == owner.key() @ GlimmoError::NotOwner,
        constraint = pet_token.amount == 1 @ GlimmoError::NotOwner,
    )]
    pub pet_token: Box<InterfaceAccount<'info, TokenAccount2022>>,
    /// CHECK: mint питомца, проверяется по адресу из Pet
    #[account(mut, address = pet.mint)]
    pub pet_mint: UncheckedAccount<'info>,
    /// CHECK: sysvar SlotHashes, проверяется по адресу
    #[account(address = slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn hatch(ctx: Context<Hatch>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let key = ctx.accounts.pet.key();
    let pet = &mut ctx.accounts.pet;
    require!(!pet.hatched, GlimmoError::AlreadyHatched);
    require!(now >= pet.hatch_at && clock.slot > pet.seed_slot, GlimmoError::EggNotReady);

    let seed = genes::slot_hash_for(&ctx.accounts.slot_hashes.to_account_info(), pet.seed_slot)?;
    let parents = if pet.generation > 0 { Some((&pet.dna, &pet.dna_b)) } else { None };
    let (dna, mutations) = genes::hatch_dna(seed, &pet.mint, parents);
    pet.dna = dna;
    pet.dna_b = [0; 32];
    pet.hatched = true;
    pet.level = 1;
    pet.satiety = HATCH_SATIETY;
    pet.mood = HATCH_MOOD;
    pet.last_tick = now;
    let id = pet.id;

    // Записываем настоящую ДНК в метаданные NFT (та же длина, что у заглушки)
    update_nft_field(
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.pet_mint.to_account_info(),
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.token_2022_program.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        ctx.accounts.config.bump,
        MetaField::Key("dna".to_string()),
        dna_hex(&dna),
        DNA_PLACEHOLDER.len(),
    )?;

    emit!(Hatched {
        pet: key,
        id,
        dna,
        shiny: genes::is_shiny(&dna),
        mutations,
        fresh_seed: seed.is_some(),
    });
    Ok(())
}

pub fn play(ctx: Context<PetAction>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let params = ctx.accounts.config.params;
    let key = ctx.accounts.pet.key();
    let pet = &mut ctx.accounts.pet;
    require!(pet.hatched, GlimmoError::StillEgg);
    pet.apply_decay(now, &params);
    require!(pet.satiety >= MIN_SATIETY_TO_PLAY, GlimmoError::TooHungry);
    require!(
        pet.last_play == 0 || now - pet.last_play >= params.play_cooldown,
        GlimmoError::PlayCooldown
    );
    pet.last_play = now;
    pet.satiety -= PLAY_SATIETY_COST;
    pet.mood = pet.mood.saturating_add(PLAY_MOOD).min(MAX_STAT);
    pet.times_played = pet.times_played.saturating_add(1);
    care(pet, key, now, &params);
    grant_xp(pet, key, PLAY_XP, &params);
    emit!(Played {
        pet: key,
        satiety: pet.satiety,
        mood: pet.mood
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Feed<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PET_SEED, pet.mint.as_ref()], bump = pet.bump)]
    pub pet: Box<Account<'info, Pet>>,
    #[account(
        constraint = pet_token.mint == pet.mint @ GlimmoError::NotOwner,
        constraint = pet_token.owner == owner.key() @ GlimmoError::NotOwner,
        constraint = pet_token.amount == 1 @ GlimmoError::NotOwner,
    )]
    pub pet_token: Box<InterfaceAccount<'info, TokenAccount2022>>,
    #[account(mut, address = config.food_mint)]
    pub food_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = food_mint, token::authority = owner)]
    pub owner_food: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Сколько FOOD питомец реально съест из `amount` (остальное не тратится).
pub fn food_eaten(satiety: u8, amount: u8) -> u8 {
    let room = (MAX_STAT - satiety.min(MAX_STAT)) as u16;
    let need = room.div_ceil(SATIETY_PER_FOOD as u16) as u8;
    amount.min(need)
}

pub fn feed(ctx: Context<Feed>, amount: u8) -> Result<()> {
    require!(amount > 0, GlimmoError::ZeroFood);
    let now = Clock::get()?.unix_timestamp;
    let params = ctx.accounts.config.params;
    let key = ctx.accounts.pet.key();
    let eaten = {
        let pet = &mut ctx.accounts.pet;
        require!(pet.hatched, GlimmoError::StillEgg);
        pet.apply_decay(now, &params);
        require!(pet.satiety < MAX_STAT, GlimmoError::AlreadyFull);
        food_eaten(pet.satiety, amount)
    };

    // Сжигаем только то, что питомец съел: перекормить ради опыта нельзя
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.food_mint.to_account_info(),
                from: ctx.accounts.owner_food.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        eaten as u64,
    )?;

    let pet = &mut ctx.accounts.pet;
    let add_sat = (eaten as u16 * SATIETY_PER_FOOD as u16).min(MAX_STAT as u16) as u8;
    let add_mood = (eaten as u16 * MOOD_PER_FOOD as u16).min(MAX_STAT as u16) as u8;
    pet.satiety = pet.satiety.saturating_add(add_sat).min(MAX_STAT);
    pet.mood = pet.mood.saturating_add(add_mood).min(MAX_STAT);
    pet.times_fed = pet.times_fed.saturating_add(1);
    care(pet, key, now, &params);
    grant_xp(pet, key, XP_PER_FOOD * eaten as u32, &params);
    emit!(Fed {
        pet: key,
        amount: eaten,
        satiety: pet.satiety,
        mood: pet.mood
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Rename<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PET_SEED, pet.mint.as_ref()], bump = pet.bump)]
    pub pet: Box<Account<'info, Pet>>,
    #[account(
        constraint = pet_token.mint == pet.mint @ GlimmoError::NotOwner,
        constraint = pet_token.owner == owner.key() @ GlimmoError::NotOwner,
        constraint = pet_token.amount == 1 @ GlimmoError::NotOwner,
    )]
    pub pet_token: Box<InterfaceAccount<'info, TokenAccount2022>>,
    /// CHECK: mint питомца, проверяется по адресу из Pet
    #[account(mut, address = pet.mint)]
    pub pet_mint: UncheckedAccount<'info>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn rename(ctx: Context<Rename>, name: String) -> Result<()> {
    validate_name(&name)?;
    let old_len = ctx.accounts.pet.name.len();
    update_nft_field(
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.pet_mint.to_account_info(),
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.token_2022_program.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        ctx.accounts.config.bump,
        MetaField::Name,
        name.clone(),
        old_len,
    )?;
    ctx.accounts.pet.name = name.clone();
    emit!(Renamed {
        pet: ctx.accounts.pet.key(),
        name
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overfeeding_is_not_charged() {
        assert_eq!(food_eaten(99, 255), 1);
        assert_eq!(food_eaten(80, 3), 2);
        assert_eq!(food_eaten(0, 3), 3);
        assert_eq!(food_eaten(0, 20), 7);
    }
}
