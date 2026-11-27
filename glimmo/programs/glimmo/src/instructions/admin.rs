use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{Mint, Token};

use crate::constants::*;
use crate::errors::GlimmoError;
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// Только тот, кто задеплоил программу (upgrade authority), может создать
    /// игру — иначе первый встречный стал бы админом и забрал казну.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ GlimmoError::NotAdmin)]
    pub program: Program<'info, crate::program::Glimmo>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ GlimmoError::NotAdmin)]
    pub program_data: Account<'info, ProgramData>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Box<Account<'info, Config>>,
    /// Казна: PDA без данных, принадлежит System Program и копит SOL за яйца.
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: SystemAccount<'info>,
    /// Mint еды FOOD (классический SPL Token), права чеканки у PDA config.
    #[account(
        init,
        payer = admin,
        seeds = [FOOD_MINT_SEED],
        bump,
        mint::decimals = 0,
        mint::authority = config,
        mint::token_program = token_program,
    )]
    pub food_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, params: GameParams) -> Result<()> {
    params.validate()?;
    let c = &mut ctx.accounts.config;
    c.admin = ctx.accounts.admin.key();
    c.food_mint = ctx.accounts.food_mint.key();
    c.total_pets = 0;
    c.params = params;
    c.bump = ctx.bumps.config;
    c.treasury_bump = ctx.bumps.treasury;
    c.food_bump = ctx.bumps.food_mint;

    // Делаем казну rent-exempt, чтобы любые платежи за яйца проходили.
    let min = Rent::get()?.minimum_balance(0);
    let have = ctx.accounts.treasury.lamports();
    if have < min {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.admin.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            min - have,
        )?;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateParams<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ GlimmoError::NotAdmin)]
    pub config: Box<Account<'info, Config>>,
}

pub fn update_params(ctx: Context<UpdateParams>, params: GameParams) -> Result<()> {
    params.validate()?;
    ctx.accounts.config.params = params;
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ GlimmoError::NotAdmin)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, lamports: u64) -> Result<()> {
    let min = Rent::get()?.minimum_balance(0);
    let available = ctx.accounts.treasury.lamports().saturating_sub(min);
    require!(lamports > 0 && lamports <= available, GlimmoError::TreasuryEmpty);
    let bump = [ctx.accounts.config.treasury_bump];
    let seeds: &[&[u8]] = &[TREASURY_SEED, &bump];
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.admin.to_account_info(),
            },
            &[seeds],
        ),
        lamports,
    )
}
