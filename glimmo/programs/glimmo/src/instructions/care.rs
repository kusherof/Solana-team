use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};
use anchor_spl::token_interface::{Token2022, TokenAccount as TokenAccount2022};

use crate::constants::*;
use crate::errors::GlimmoError;
use crate::events::*;
use crate::genes;
use crate::nft::rename_nft;
use crate::state::*;

/// Начислить опыт и выпустить события LevelUp / Evolved.
pub fn grant_xp(pet: &mut Pet, pet_key: Pubkey, xp: u32, params: &GameParams) {
    let before = pet.stage(params);
    for level in pet.add_xp(xp, params) {
        emit!(LevelUp { pet: pet_key, level });
    }
    let after = pet.stage(params);
    if after != before {
        emit!(Evolved {
            pet: pet_key,
            stage: after as u8
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

pub fn hatch(ctx: Context<PetAction>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let pet = &mut ctx.accounts.pet;
    require!(!pet.hatched, GlimmoError::AlreadyHatched);
    require!(now >= pet.hatch_at, GlimmoError::EggNotReady);
    pet.hatched = true;
    pet.level = 1;
    pet.satiety = HATCH_SATIETY;
    pet.mood = HATCH_MOOD;
    pet.last_tick = now;
    emit!(Hatched {
        pet: pet.key(),
        id: pet.id,
        shiny: genes::is_shiny(&pet.dna)
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
    pet.times_played += 1;
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

pub fn feed(ctx: Context<Feed>, amount: u8) -> Result<()> {
    require!(amount > 0, GlimmoError::ZeroFood);
    let now = Clock::get()?.unix_timestamp;
    let params = ctx.accounts.config.params;
    let key = ctx.accounts.pet.key();
    {
        let pet = &mut ctx.accounts.pet;
        require!(pet.hatched, GlimmoError::StillEgg);
        pet.apply_decay(now, &params);
        require!(pet.satiety < MAX_STAT, GlimmoError::AlreadyFull);
    }

    // Еда реально исчезает: сжигаем FOOD
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.food_mint.to_account_info(),
                from: ctx.accounts.owner_food.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount as u64,
    )?;

    let pet = &mut ctx.accounts.pet;
    let add_sat = (amount as u16 * SATIETY_PER_FOOD as u16).min(MAX_STAT as u16) as u8;
    let add_mood = (amount as u16 * MOOD_PER_FOOD as u16).min(MAX_STAT as u16) as u8;
    pet.satiety = pet.satiety.saturating_add(add_sat).min(MAX_STAT);
    pet.mood = pet.mood.saturating_add(add_mood).min(MAX_STAT);
    pet.times_fed += 1;
    grant_xp(pet, key, XP_PER_FOOD * amount as u32, &params);
    emit!(Fed {
        pet: key,
        amount,
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
    rename_nft(
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.pet_mint.to_account_info(),
        &ctx.accounts.config.to_account_info(),
        &ctx.accounts.token_2022_program.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        ctx.accounts.config.bump,
        name.clone(),
    )?;
    ctx.accounts.pet.name = name.clone();
    emit!(Renamed {
        pet: ctx.accounts.pet.key(),
        name
    });
    Ok(())
}
