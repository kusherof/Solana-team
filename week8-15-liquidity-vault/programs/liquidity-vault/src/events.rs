use anchor_lang::prelude::*;

#[event]
pub struct DepositEvent {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub total_assets_after: u64,
    pub total_shares_after: u64,
}

#[event]
pub struct WithdrawEvent {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub shares: u64,
    pub amount: u64,
    pub total_assets_after: u64,
    pub total_shares_after: u64,
}

#[event]
pub struct SwapEvent {
    pub vault: Pubkey,
    pub a_to_b: bool,
    pub amount_in: u64,
    pub amount_out: u64,
    pub sqrt_price_x64_after: u128,
}

#[event]
pub struct PositionOpenedEvent {
    pub vault: Pubkey,
    pub position_nft_mint: Pubkey,
    pub tick_lower_index: i32,
    pub tick_upper_index: i32,
    pub liquidity: u128,
    pub amount_a: u64,
    pub amount_b: u64,
}

#[event]
pub struct FeesCollectedEvent {
    pub vault: Pubkey,
    pub fees_a: u64,
    pub fees_b: u64,
}

#[event]
pub struct PositionClosedEvent {
    pub vault: Pubkey,
    pub position_nft_mint: Pubkey,
    pub liquidity: u128,
    pub amount_a: u64,
    pub amount_b: u64,
}
