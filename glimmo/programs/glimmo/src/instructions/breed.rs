use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint as FoodMint, Token, TokenAccount as FoodAccount};
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

use crate::constants::*;
use crate::errors::GlimmoError;
use crate::events::Bred;
use crate::instructions::adopt::init_egg;
use crate::nft::{mint_pet_nft, NftAccounts};
use crate::state::*;

/// Скрещивание. Родитель A принадлежит `owner`, родитель B — `partner`
/// (может быть тот же кошелёк). Оба подписывают транзакцию.
/// Яйцо получает `owner`, он же платит FOOD и ренту.
#[derive(Accounts)]
pub struct Breed<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub partner: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Player::INIT_SPACE,
        seeds = [PLAYER_SEED, owner.key().as_ref()],
        bump
    )]
    pub player: Box<Account<'info, Player>>,

    #[account(mut, seeds = [PET_SEED, parent_a.mint.as_ref()], bump = parent_a.bump)]
    pub parent_a: Box<Account<'info, Pet>>,
    #[account(
        constraint = parent_a_token.mint == parent_a.mint @ GlimmoError::NotOwner,
        constraint = parent_a_token.owner == owner.key() @ GlimmoError::NotOwner,
        constraint = parent_a_token.amount == 1 @ GlimmoError::NotOwner,
    )]
    pub parent_a_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [PET_SEED, parent_b.mint.as_ref()],
        bump = parent_b.bump,
        constraint = parent_b.key() != parent_a.key() @ GlimmoError::SamePet,
    )]
    pub parent_b: Box<Account<'info, Pet>>,
    #[account(
        constraint = parent_b_token.mint == parent_b.mint @ GlimmoError::NotOwner,
        constraint = parent_b_token.owner == partner.key() @ GlimmoError::NotOwner,
        constraint = parent_b_token.amount == 1 @ GlimmoError::NotOwner,
    )]
    pub parent_b_token: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, address = config.food_mint)]
    pub food_mint: Box<Account<'info, FoodMint>>,
    #[account(mut, token::mint = food_mint, token::authority = owner)]
    pub owner_food: Box<Account<'info, FoodAccount>>,

    #[account(
        init,
        payer = owner,
        seeds = [PET_MINT_SEED, &config.total_pets.to_le_bytes()],
        bump,
        mint::decimals = 0,
        mint::authority = config,
        mint::token_program = token_2022_program,
        extensions::metadata_pointer::authority = config,
        extensions::metadata_pointer::metadata_address = child_mint,
    )]
    pub child_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = owner,
        associated_token::mint = child_mint,
        associated_token::authority = owner,
        associated_token::token_program = token_2022_program,
    )]
    pub child_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = owner,
        space = 8 + Pet::INIT_SPACE,
        seeds = [PET_SEED, child_mint.key().as_ref()],
        bump
    )]
    pub child: Box<Account<'info, Pet>>,

    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Пауза после скрещивания: удваивается с каждым ребёнком (до x16).
pub fn breed_cooldown(p: &GameParams, children: u8) -> i64 {
    p.breed_cooldown.saturating_mul(1i64 << children.min(4))
}

/// Цена в FOOD: база × (1 + детей у «более опытного» родителя).
pub fn breed_cost(p: &GameParams, a_children: u8, b_children: u8) -> u64 {
    p.breed_food_cost
        .saturating_mul(1 + a_children.max(b_children) as u64)
}

fn check_parent(pet: &mut Pet, now: i64, p: &GameParams) -> Result<()> {
    pet.apply_decay(now, p);
    require!(pet.stage(p) == Stage::Adult, GlimmoError::NotAdult);
    require!(pet.children < MAX_CHILDREN, GlimmoError::TooManyChildren);
    require!(pet.satiety >= MIN_SATIETY_TO_BREED, GlimmoError::TooHungry);
    require!(pet.mood >= MIN_MOOD_TO_BREED, GlimmoError::TooSad);
    require!(
        pet.last_breed == 0 || now - pet.last_breed >= breed_cooldown(p, pet.children.saturating_sub(1)),
        GlimmoError::BreedCooldown
    );
    Ok(())
}

fn after_breed(pet: &mut Pet, now: i64) {
    pet.last_breed = now;
    pet.children = pet.children.saturating_add(1);
    pet.satiety = pet.satiety.saturating_sub(BREED_SATIETY_COST);
    pet.mood = pet.mood.saturating_sub(BREED_MOOD_COST);
}

pub fn breed(ctx: Context<Breed>, name: String) -> Result<()> {
    validate_name(&name)?;
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let params = ctx.accounts.config.params;
    let a_key = ctx.accounts.parent_a.key();
    let b_key = ctx.accounts.parent_b.key();

    // Родителя нельзя скрестить с его ребёнком
    {
        let a = &ctx.accounts.parent_a;
        let b = &ctx.accounts.parent_b;
        require!(
            a.parent_a != b_key && a.parent_b != b_key && b.parent_a != a_key && b.parent_b != a_key,
            GlimmoError::Related
        );
    }
    check_parent(&mut ctx.accounts.parent_a, now, &params)?;
    check_parent(&mut ctx.accounts.parent_b, now, &params)?;

    let cost = breed_cost(&params, ctx.accounts.parent_a.children, ctx.accounts.parent_b.children);
    if cost > 0 {
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.food_mint.to_account_info(),
                    from: ctx.accounts.owner_food.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            cost,
        )?;
    }
    after_breed(&mut ctx.accounts.parent_a, now);
    after_breed(&mut ctx.accounts.parent_b, now);

    let id = ctx.accounts.config.total_pets;
    let generation = ctx
        .accounts
        .parent_a
        .generation
        .max(ctx.accounts.parent_b.generation)
        .checked_add(1)
        .ok_or(GlimmoError::Overflow)?;

    mint_pet_nft(
        NftAccounts {
            payer: &ctx.accounts.owner.to_account_info(),
            mint: &ctx.accounts.child_mint.to_account_info(),
            owner_token: &ctx.accounts.child_token.to_account_info(),
            config: &ctx.accounts.config.to_account_info(),
            token_program: &ctx.accounts.token_2022_program.to_account_info(),
            system_program: &ctx.accounts.system_program.to_account_info(),
        },
        ctx.accounts.config.bump,
        name.clone(),
        generation,
    )?;

    // Гены родителей сохраняются в яйце, смешаются при вылуплении
    let dnas = (ctx.accounts.parent_a.dna, ctx.accounts.parent_b.dna);
    init_egg(
        &mut ctx.accounts.child,
        ctx.accounts.child_mint.key(),
        id,
        name,
        dnas,
        generation,
        (a_key, b_key),
        &clock,
        &params,
        ctx.bumps.child,
    );

    let player = &mut ctx.accounts.player;
    if player.owner == Pubkey::default() {
        player.owner = ctx.accounts.owner.key();
        player.bump = ctx.bumps.player;
    }
    player.pets_bred = player.pets_bred.saturating_add(1);
    player.actions = player.actions.saturating_add(1);
    ctx.accounts.config.total_pets += 1;

    emit!(Bred {
        parent_a: a_key,
        parent_b: b_key,
        child: ctx.accounts.child.key(),
        child_mint: ctx.accounts.child_mint.key(),
        generation,
        food_cost: cost,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn breeding_gets_slower_and_pricier() {
        let p = GameParams {
            egg_price: 0,
            hatch_seconds: 0,
            decay_seconds: 10,
            food_per_claim: 5,
            food_cooldown: 0,
            play_cooldown: 0,
            breed_cooldown: 100,
            breed_food_cost: 3,
            xp_per_level: 100,
            teen_level: 3,
            adult_level: 6,
            care_period: 100,
        };
        assert_eq!(breed_cooldown(&p, 0), 100);
        assert_eq!(breed_cooldown(&p, 2), 400);
        assert_eq!(breed_cooldown(&p, 9), 1600);
        assert_eq!(breed_cost(&p, 0, 0), 3);
        assert_eq!(breed_cost(&p, 1, 3), 12);
    }
}
