use anchor_lang::prelude::*;

#[event]
pub struct FoodClaimed {
    pub player: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EggAdopted {
    pub owner: Pubkey,
    pub pet: Pubkey,
    pub mint: Pubkey,
    pub id: u64,
    pub hatch_at: i64,
}

#[event]
pub struct Hatched {
    pub pet: Pubkey,
    pub id: u64,
    pub dna: [u8; 32],
    pub shiny: bool,
    pub mutations: u8,
    /// false — вылупили слишком поздно, ДНК запасная
    pub fresh_seed: bool,
}

#[event]
pub struct Fed {
    pub pet: Pubkey,
    pub amount: u8,
    pub satiety: u8,
    pub mood: u8,
}

#[event]
pub struct Played {
    pub pet: Pubkey,
    pub satiety: u8,
    pub mood: u8,
}

#[event]
pub struct LevelUp {
    pub pet: Pubkey,
    pub level: u8,
}

#[event]
pub struct Evolved {
    pub pet: Pubkey,
    pub stage: u8,
    pub form: u8,
}

#[event]
pub struct Bred {
    pub parent_a: Pubkey,
    pub parent_b: Pubkey,
    pub child: Pubkey,
    pub child_mint: Pubkey,
    pub generation: u16,
    pub food_cost: u64,
}

#[event]
pub struct Renamed {
    pub pet: Pubkey,
    pub name: String,
}

#[event]
pub struct CareStreak {
    pub pet: Pubkey,
    pub streak: u16,
    pub bond: u32,
}
