pub const CONFIG_SEED: &[u8] = b"config";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const FOOD_MINT_SEED: &[u8] = b"food";
pub const PLAYER_SEED: &[u8] = b"player";
pub const PET_SEED: &[u8] = b"pet";
pub const PET_MINT_SEED: &[u8] = b"pet_mint";

/// Максимум байт в имени (кириллица — 2 байта на букву).
pub const MAX_NAME_LEN: usize = 40;
/// Максимум символов в имени.
pub const MAX_NAME_CHARS: usize = 20;
/// Верхняя граница для любых таймеров в параметрах: 30 дней.
pub const MAX_PARAM_SECONDS: i64 = 30 * 86_400;
pub const MAX_STAT: u8 = 100;
pub const MAX_LEVEL: u8 = 99;

/// Сколько сытости даёт одна единица FOOD.
pub const SATIETY_PER_FOOD: u8 = 15;
/// Сколько настроения даёт одна единица FOOD.
pub const MOOD_PER_FOOD: u8 = 4;
pub const XP_PER_FOOD: u32 = 10;

pub const PLAY_MOOD: u8 = 25;
pub const PLAY_SATIETY_COST: u8 = 8;
pub const PLAY_XP: u32 = 30;
pub const MIN_SATIETY_TO_PLAY: u8 = 10;
pub const MIN_SATIETY_TO_BREED: u8 = 30;
pub const MIN_MOOD_TO_BREED: u8 = 30;
/// Скрещивание утомляет родителей.
pub const BREED_SATIETY_COST: u8 = 20;
pub const BREED_MOOD_COST: u8 = 10;
/// Сколько детей может быть у одного питомца.
pub const MAX_CHILDREN: u8 = 5;

/// Привязанность за новый день заботы и штраф за каждый пропущенный день.
pub const BOND_PER_NEW_DAY: u32 = 5;
pub const BOND_DECAY_PER_MISSED: u32 = 3;

pub const HATCH_SATIETY: u8 = 80;
pub const HATCH_MOOD: u8 = 80;

pub const NFT_SYMBOL: &str = "GLIM";
pub const NFT_URI: &str =
    "https://raw.githubusercontent.com/kusherof/Solana-team/main/glimmo/app/public/nft/glimmo.json";
