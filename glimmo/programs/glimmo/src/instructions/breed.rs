use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_lang::solana_program::sysvar::slot_hashes;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint as FoodMint, Token, TokenAccount as FoodAccount};
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

use crate::constants::*;
use crate::errors::GlimmoError;
use crate::events::Bred;
use crate::genes;
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

    /// CHECK: sysvar SlotHashes, проверяется по адресу
    #[account(address = slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

fn check_parent(pet: &mut Pet, now: i64, p: &GameParams) -> Result<()> {
    pet.apply_decay(now, p);
    require!(pet.stage(p) == Stage::Adult, GlimmoError::NotAdult);
    require!(pet.satiety >= MIN_SATIETY_TO_BREED, GlimmoError::TooHungry);
    require!(
        pet.last_breed == 0 || now - pet.last_breed >= p.breed_cooldown,
        GlimmoError::BreedCooldown
    );
    pet.last_breed = now;
    pet.children += 1;
    Ok(())
}

pub fn breed(ctx: Context<Breed>, name: String) -> Result<()> {
    validate_name(&name)?;
    let now = Clock::get()?.unix_timestamp;
    let params = ctx.accounts.config.params;

    check_parent(&mut ctx.accounts.parent_a, now, &params)?;
    check_parent(&mut ctx.accounts.parent_b, now, &params)?;

    if params.breed_food_cost > 0 {
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.food_mint.to_account_info(),
                    from: ctx.accounts.owner_food.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            params.breed_food_cost,
        )?;
    }

    let id = ctx.accounts.config.total_pets;
    let seed = genes::recent_slot_hash(&ctx.accounts.slot_hashes.to_account_info())?;
    let rnd = hashv(&[
        &seed,
        ctx.accounts.parent_a.key().as_ref(),
        ctx.accounts.parent_b.key().as_ref(),
        &id.to_le_bytes(),
        &now.to_le_bytes(),
    ])
    .to_bytes();
    let (dna, mutations) = genes::mix_dna(&ctx.accounts.parent_a.dna, &ctx.accounts.parent_b.dna, &rnd);
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
        &dna,
    )?;

    let parents = (ctx.accounts.parent_a.key(), ctx.accounts.parent_b.key());
    init_egg(
        &mut ctx.accounts.child,
        ctx.accounts.child_mint.key(),
        id,
        name,
        dna,
        generation,
        parents,
        now,
        &params,
        ctx.bumps.child,
    );

    let player = &mut ctx.accounts.player;
    if player.owner == Pubkey::default() {
        player.owner = ctx.accounts.owner.key();
        player.bump = ctx.bumps.player;
    }
    player.pets_bred += 1;
    player.actions += 1;
    ctx.accounts.config.total_pets += 1;

    emit!(Bred {
        parent_a: parents.0,
        parent_b: parents.1,
        child: ctx.accounts.child.key(),
        child_mint: ctx.accounts.child_mint.key(),
        dna,
        generation,
        mutations,
    });
    Ok(())
}
