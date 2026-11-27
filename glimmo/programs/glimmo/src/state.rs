use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::GlimmoError;

/// Параметры игры, которые задаёт администратор.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug)]
pub struct GameParams {
    /// Цена яйца в лампортах.
    pub egg_price: u64,
    /// Сколько секунд высиживается яйцо.
    pub hatch_seconds: i64,
    /// Раз в сколько секунд сытость и настроение падают на 1.
    pub decay_seconds: i64,
    /// Сколько FOOD выдаёт кормушка за раз.
    pub food_per_claim: u64,
    /// Пауза между походами к кормушке (сек).
    pub food_cooldown: i64,
    /// Пауза между играми (сек).
    pub play_cooldown: i64,
    /// Пауза между скрещиваниями для одного питомца (сек).
    pub breed_cooldown: i64,
    /// Сколько FOOD стоит скрещивание.
    pub breed_food_cost: u64,
    /// Опыт для перехода на следующий уровень = xp_per_level * текущий уровень.
    pub xp_per_level: u32,
    /// Уровень, на котором малыш становится подростком.
    pub teen_level: u8,
    /// Уровень, на котором питомец становится взрослым.
    pub adult_level: u8,
}

impl GameParams {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.hatch_seconds >= 0
                && self.decay_seconds > 0
                && self.food_per_claim > 0
                && self.food_cooldown >= 0
                && self.play_cooldown >= 0
                && self.breed_cooldown >= 0
                && self.xp_per_level > 0
                && self.teen_level >= 2
                && self.adult_level > self.teen_level
                && self.adult_level <= MAX_LEVEL,
            GlimmoError::BadParams
        );
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub food_mint: Pubkey,
    pub total_pets: u64,
    pub params: GameParams,
    pub bump: u8,
    pub treasury_bump: u8,
    pub food_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Player {
    pub owner: Pubkey,
    pub last_food_claim: i64,
    pub eggs_adopted: u32,
    pub pets_bred: u32,
    pub actions: u64,
    pub bump: u8,
}

/// Стадия жизни питомца.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Stage {
    Egg = 0,
    Baby = 1,
    Teen = 2,
    Adult = 3,
}

#[account]
#[derive(InitSpace)]
pub struct Pet {
    /// NFT-mint (Token-2022), владелец которого управляет питомцем.
    pub mint: Pubkey,
    pub id: u64,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    /// 32 байта генов, из них рисуется внешность.
    pub dna: [u8; 32],
    pub generation: u16,
    pub parent_a: Pubkey,
    pub parent_b: Pubkey,
    pub born_at: i64,
    pub hatch_at: i64,
    pub hatched: bool,
    pub level: u8,
    pub xp: u32,
    pub satiety: u8,
    pub mood: u8,
    /// Момент, до которого уже посчитано «проголодание».
    pub last_tick: i64,
    pub last_play: i64,
    pub last_breed: i64,
    pub times_fed: u32,
    pub times_played: u32,
    pub children: u16,
    pub bump: u8,
}

impl Pet {
    pub fn stage(&self, p: &GameParams) -> Stage {
        if !self.hatched {
            Stage::Egg
        } else if self.level >= p.adult_level {
            Stage::Adult
        } else if self.level >= p.teen_level {
            Stage::Teen
        } else {
            Stage::Baby
        }
    }

    /// Применить падение сытости/настроения за прошедшее время.
    /// Голодный питомец грустит вдвое быстрее.
    pub fn apply_decay(&mut self, now: i64, p: &GameParams) {
        if !self.hatched || now <= self.last_tick {
            return;
        }
        let ticks = (now - self.last_tick) / p.decay_seconds;
        if ticks <= 0 {
            return;
        }
        self.last_tick += ticks * p.decay_seconds;
        let t = ticks.min(255) as u8;
        // Сколько тиков питомец был ещё сытым
        let fed_ticks = t.min(self.satiety);
        let hungry_ticks = t - fed_ticks;
        self.satiety -= fed_ticks;
        let mood_loss = (fed_ticks as u16) + (hungry_ticks as u16) * 2;
        self.mood = self.mood.saturating_sub(mood_loss.min(255) as u8);
    }

    /// Добавить опыт; возвращает список новых уровней (для событий).
    pub fn add_xp(&mut self, xp: u32, p: &GameParams) -> Vec<u8> {
        let mut ups = Vec::new();
        self.xp = self.xp.saturating_add(xp);
        while self.level < MAX_LEVEL {
            let need = p.xp_per_level.saturating_mul(self.level as u32);
            if self.xp < need {
                break;
            }
            self.xp -= need;
            self.level += 1;
            ups.push(self.level);
        }
        ups
    }
}

pub fn validate_name(name: &str) -> Result<()> {
    require!(
        !name.is_empty() && name.len() <= MAX_NAME_LEN,
        GlimmoError::BadName
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params() -> GameParams {
        GameParams {
            egg_price: 0,
            hatch_seconds: 0,
            decay_seconds: 10,
            food_per_claim: 5,
            food_cooldown: 0,
            play_cooldown: 0,
            breed_cooldown: 0,
            breed_food_cost: 3,
            xp_per_level: 100,
            teen_level: 3,
            adult_level: 6,
        }
    }

    fn pet() -> Pet {
        Pet {
            mint: Pubkey::default(),
            id: 0,
            name: "a".into(),
            dna: [0; 32],
            generation: 0,
            parent_a: Pubkey::default(),
            parent_b: Pubkey::default(),
            born_at: 0,
            hatch_at: 0,
            hatched: true,
            level: 1,
            xp: 0,
            satiety: 50,
            mood: 50,
            last_tick: 0,
            last_play: 0,
            last_breed: 0,
            times_fed: 0,
            times_played: 0,
            children: 0,
            bump: 0,
        }
    }

    #[test]
    fn decay_keeps_remainder_and_doubles_when_hungry() {
        let p = params();
        let mut x = pet();
        x.satiety = 3;
        x.mood = 50;
        x.apply_decay(55, &p); // 5 тиков, остаток 5 сек
        assert_eq!(x.last_tick, 50);
        assert_eq!(x.satiety, 0);
        // 3 сытых тика по 1 + 2 голодных по 2
        assert_eq!(x.mood, 50 - 3 - 4);
    }

    #[test]
    fn xp_levels_up_several_times() {
        let p = params();
        let mut x = pet();
        // 1->2: 100, 2->3: 200
        let ups = x.add_xp(350, &p);
        assert_eq!(ups, vec![2, 3]);
        assert_eq!(x.level, 3);
        assert_eq!(x.xp, 50);
        assert_eq!(x.stage(&p), Stage::Teen);
    }
}
