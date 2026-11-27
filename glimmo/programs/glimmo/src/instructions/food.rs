use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::constants::*;
use crate::errors::GlimmoError;
use crate::events::FoodClaimed;
use crate::state::*;

#[derive(Accounts)]
pub struct ClaimFood<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PLAYER_SEED, owner.key().as_ref()], bump = player.bump)]
    pub player: Box<Account<'info, Player>>,
    #[account(mut, seeds = [FOOD_MINT_SEED], bump = config.food_bump)]
    pub food_mint: Box<Account<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = food_mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program,
    )]
    pub owner_food: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim_food(ctx: Context<ClaimFood>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let cfg = &ctx.accounts.config;
    let player = &mut ctx.accounts.player;
    // Кормушка только для хозяев питомцев: иначе можно наплодить пустых
    // кошельков и собрать бесконечно еды.
    require!(
        player.owner != Pubkey::default() && (player.eggs_adopted > 0 || player.pets_bred > 0),
        GlimmoError::NeedPet
    );
    require!(
        player.last_food_claim == 0 || now - player.last_food_claim >= cfg.params.food_cooldown,
        GlimmoError::FoodCooldown
    );
    player.last_food_claim = now;
    player.actions = player.actions.saturating_add(1);

    let amount = cfg.params.food_per_claim;
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[cfg.bump]];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.food_mint.to_account_info(),
                to: ctx.accounts.owner_food.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;
    emit!(FoodClaimed {
        player: ctx.accounts.owner.key(),
        amount
    });
    Ok(())
}
