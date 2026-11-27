use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::slot_hashes;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, Token2022, TokenAccount};

use crate::constants::*;
use crate::events::EggAdopted;
use crate::genes;
use crate::nft::{mint_pet_nft, NftAccounts};
use crate::state::*;

#[derive(Accounts)]
pub struct AdoptEgg<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: SystemAccount<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Player::INIT_SPACE,
        seeds = [PLAYER_SEED, owner.key().as_ref()],
        bump
    )]
    pub player: Box<Account<'info, Player>>,
    /// NFT питомца: Token-2022 mint, метаданные хранятся в нём самом.
    #[account(
        init,
        payer = owner,
        seeds = [PET_MINT_SEED, &config.total_pets.to_le_bytes()],
        bump,
        mint::decimals = 0,
        mint::authority = config,
        mint::token_program = token_2022_program,
        extensions::metadata_pointer::authority = config,
        extensions::metadata_pointer::metadata_address = pet_mint,
    )]
    pub pet_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = owner,
        associated_token::mint = pet_mint,
        associated_token::authority = owner,
        associated_token::token_program = token_2022_program,
    )]
    pub pet_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = owner,
        space = 8 + Pet::INIT_SPACE,
        seeds = [PET_SEED, pet_mint.key().as_ref()],
        bump
    )]
    pub pet: Box<Account<'info, Pet>>,
    /// CHECK: sysvar SlotHashes, проверяется по адресу
    #[account(address = slot_hashes::ID)]
    pub slot_hashes: UncheckedAccount<'info>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Заполнить свежего питомца-яйцо.
#[allow(clippy::too_many_arguments)]
pub fn init_egg(
    pet: &mut Pet,
    mint: Pubkey,
    id: u64,
    name: String,
    dna: [u8; 32],
    generation: u16,
    parents: (Pubkey, Pubkey),
    now: i64,
    params: &GameParams,
    bump: u8,
) {
    pet.mint = mint;
    pet.id = id;
    pet.name = name;
    pet.dna = dna;
    pet.generation = generation;
    pet.parent_a = parents.0;
    pet.parent_b = parents.1;
    pet.born_at = now;
    pet.hatch_at = now + params.hatch_seconds;
    pet.hatched = false;
    pet.level = 0;
    pet.xp = 0;
    pet.satiety = 0;
    pet.mood = 0;
    pet.last_tick = now;
    pet.last_play = 0;
    pet.last_breed = 0;
    pet.times_fed = 0;
    pet.times_played = 0;
    pet.children = 0;
    pet.bump = bump;
}

pub fn adopt_egg(ctx: Context<AdoptEgg>, name: String) -> Result<()> {
    validate_name(&name)?;
    let now = Clock::get()?.unix_timestamp;
    let price = ctx.accounts.config.params.egg_price;

    if price > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            price,
        )?;
    }

    let id = ctx.accounts.config.total_pets;
    let seed = genes::recent_slot_hash(&ctx.accounts.slot_hashes.to_account_info())?;
    let dna = genes::random_dna(
        &seed,
        &[
            ctx.accounts.owner.key().as_ref(),
            &id.to_le_bytes(),
            &now.to_le_bytes(),
        ],
    );

    mint_pet_nft(
        NftAccounts {
            payer: &ctx.accounts.owner.to_account_info(),
            mint: &ctx.accounts.pet_mint.to_account_info(),
            owner_token: &ctx.accounts.pet_token.to_account_info(),
            config: &ctx.accounts.config.to_account_info(),
            token_program: &ctx.accounts.token_2022_program.to_account_info(),
            system_program: &ctx.accounts.system_program.to_account_info(),
        },
        ctx.accounts.config.bump,
        name.clone(),
        0,
        &dna,
    )?;

    let params = ctx.accounts.config.params;
    init_egg(
        &mut ctx.accounts.pet,
        ctx.accounts.pet_mint.key(),
        id,
        name,
        dna,
        0,
        (Pubkey::default(), Pubkey::default()),
        now,
        &params,
        ctx.bumps.pet,
    );

    let player = &mut ctx.accounts.player;
    if player.owner == Pubkey::default() {
        player.owner = ctx.accounts.owner.key();
        player.bump = ctx.bumps.player;
    }
    player.eggs_adopted += 1;
    player.actions += 1;
    ctx.accounts.config.total_pets += 1;

    emit!(EggAdopted {
        owner: ctx.accounts.owner.key(),
        pet: ctx.accounts.pet.key(),
        mint: ctx.accounts.pet_mint.key(),
        id,
        dna,
        hatch_at: ctx.accounts.pet.hatch_at,
    });
    Ok(())
}
