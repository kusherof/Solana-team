use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub const USERNAME_MAX: usize = 32;
pub const BIO_MAX: usize = 64;

#[program]
pub mod profile {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, username: String, bio: String) -> Result<()> {
        require!(username.len() <= USERNAME_MAX, ProfileError::TooLong);
        require!(bio.len() <= BIO_MAX, ProfileError::TooLong);

        let profile = &mut ctx.accounts.profile;
        profile.authority = ctx.accounts.user.key();
        profile.username = username;
        profile.bio = bio;
        profile.bump = ctx.bumps.profile;
        Ok(())
    }

    pub fn update_bio(ctx: Context<UpdateBio>, bio: String) -> Result<()> {
        require!(bio.len() <= BIO_MAX, ProfileError::TooLong);
        ctx.accounts.profile.bio = bio;
        Ok(())
    }
}

#[account]
pub struct Profile {
    pub authority: Pubkey,
    pub username: String,
    pub bio: String,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 4 + USERNAME_MAX + 4 + BIO_MAX + 1,
        seeds = [b"profile", user.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateBio<'info> {
    #[account(
        mut,
        seeds = [b"profile", authority.key().as_ref()],
        bump = profile.bump,
        has_one = authority
    )]
    pub profile: Account<'info, Profile>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum ProfileError {
    #[msg("username or bio is too long")]
    TooLong,
}
