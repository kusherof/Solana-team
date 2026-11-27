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
    /// Базовая пауза между скрещиваниями (растёт вдвое с каждым ребёнком).
    pub breed_cooldown: i64,
    /// Базовая цена скрещивания в FOOD (растёт с числом детей).
    pub breed_food_cost: u64,
    /// Опыт для перехода на следующий уровень = xp_per_level * текущий уровень.
    pub xp_per_level: u32,
    /// Уровень, на котором малыш становится подростком.
    pub teen_level: u8,
    /// Уровень, на котором питомец становится взрослым.
    pub adult_level: u8,
    /// Длина «дня заботы» для серии (сек). В настоящей игре 86400.
    pub care_period: i64,
}

impl GameParams {
    pub fn validate(&self) -> Result<()> {
        require!(
            (0..=MAX_PARAM_SECONDS).contains(&self.hatch_seconds)
                && (1..=MAX_PARAM_SECONDS).contains(&self.decay_seconds)
                && (0..=MAX_PARAM_SECONDS).contains(&self.food_cooldown)
                && (0..=MAX_PARAM_SECONDS).contains(&self.play_cooldown)
                && (0..=MAX_PARAM_SECONDS).contains(&self.breed_cooldown)
                && (60..=MAX_PARAM_SECONDS).contains(&self.care_period)
                && self.food_per_claim > 0
                && self.food_per_claim <= 1_000
                && self.breed_food_cost <= 1_000
                && self.egg_price <= 100 * 1_000_000_000
                && self.xp_per_level > 0
                && self.xp_per_level <= 1_000_000
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

/// Облик взрослого: зависит от того, как о питомце заботились.
pub const FORM_NONE: u8 = 0;
pub const FORM_RADIANT: u8 = 1; // почти без «ошибок ухода»
pub const FORM_NORMAL: u8 = 2;
pub const FORM_GRUMPY: u8 = 3; // часто голодал

#[account]
#[derive(InitSpace)]
pub struct Pet {
    /// NFT-mint (Token-2022), владелец которого управляет питомцем.
    pub mint: Pubkey,
    pub id: u64,
    #[max_len(MAX_NAME_LEN)]
    pub name: String,
    /// 32 байта генов. Пока питомец в яйце, здесь гены родителя A
    /// (или нули), настоящая ДНК выпадает при вылуплении.
    pub dna: [u8; 32],
    /// Гены родителя B (только для яиц от скрещивания).
    pub dna_b: [u8; 32],
    /// Слот, хеш которого станет «кубиком» для ДНК при вылуплении.
    pub seed_slot: u64,
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
    pub children: u8,
    /// Привязанность: растёт от заботы, падает, если про питомца забыли.
    pub bond: u32,
    /// Серия «дней заботы» подряд.
    pub streak: u16,
    /// Номер последнего «дня заботы».
    pub last_care_period: i64,
    /// Сколько раз питомец доходил до нуля сытости.
    pub care_mistakes: u8,
    /// Облик взрослого (FORM_*), фиксируется при эволюции во взрослого.
    pub form: u8,
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
    /// Голодный питомец грустит вдвое быстрее, а каждое «доголодание до нуля»
    /// записывается как ошибка ухода.
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
        let fed_ticks = t.min(self.satiety);
        let hungry_ticks = t - fed_ticks;
        self.satiety -= fed_ticks;
        let mood_loss = (fed_ticks as u16) + (hungry_ticks as u16) * 2;
        self.mood = self.mood.saturating_sub(mood_loss.min(255) as u8);
        if hungry_ticks > 0 {
            self.care_mistakes = self.care_mistakes.saturating_add(1);
        }
    }

    /// Отметить заботу: серия дней подряд и привязанность.
    pub fn touch_care(&mut self, now: i64, p: &GameParams) {
        let period = now / p.care_period;
        if self.last_care_period == 0 || period > self.last_care_period + 1 {
            // первый раз или пропуск: серия заново, привязанность чуть падает
            if self.last_care_period != 0 {
                let missed = (period - self.last_care_period - 1).min(1_000) as u32;
                self.bond = self.bond.saturating_sub(missed * BOND_DECAY_PER_MISSED);
            }
            self.streak = 1;
            self.bond = self.bond.saturating_add(BOND_PER_NEW_DAY);
        } else if period == self.last_care_period + 1 {
            self.streak = self.streak.saturating_add(1);
            self.bond = self.bond.saturating_add(BOND_PER_NEW_DAY + (self.streak as u32) / 3);
        }
        self.last_care_period = period;
        self.bond = self.bond.saturating_add(1);
    }

    /// Множитель опыта (в процентах): настроение и серия заботы.
    pub fn xp_multiplier(&self) -> u32 {
        let mood = 50 + self.mood as u32; // 50..150
        let streak = 100 + (self.streak.min(10) as u32) * 5; // 100..150
        mood * streak / 150 // 33..150 %
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

    pub fn adult_form(&self) -> u8 {
        match self.care_mistakes {
            0..=1 => FORM_RADIANT,
            2..=4 => FORM_NORMAL,
            _ => FORM_GRUMPY,
        }
    }
}

/// Имя: 1–20 символов, без управляющих, не больше 40 байт (кириллица — 2 байта).
pub fn validate_name(name: &str) -> Result<()> {
    let chars = name.chars().count();
    require!(
        chars >= 1
            && chars <= MAX_NAME_CHARS
            && name.len() <= MAX_NAME_LEN
            && !name.chars().any(|c| c.is_control())
            && name.trim() == name,
        GlimmoError::BadName
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    pub fn params() -> GameParams {
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
            care_period: 100,
        }
    }

    fn pet() -> Pet {
        Pet {
            mint: Pubkey::default(),
            id: 0,
            name: "a".into(),
            dna: [0; 32],
            dna_b: [0; 32],
            seed_slot: 0,
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
            bond: 0,
            streak: 0,
            last_care_period: 0,
            care_mistakes: 0,
            form: 0,
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
        assert_eq!(x.care_mistakes, 1);
    }

    #[test]
    fn decay_caps_long_absence() {
        let p = params();
        let mut x = pet();
        x.apply_decay(10 * 100_000, &p);
        assert_eq!(x.satiety, 0);
        assert_eq!(x.mood, 0);
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

    #[test]
    fn care_streak_grows_and_resets() {
        let p = params();
        let mut x = pet();
        x.touch_care(1_000, &p); // день 10
        assert_eq!(x.streak, 1);
        x.touch_care(1_050, &p); // тот же день
        assert_eq!(x.streak, 1);
        x.touch_care(1_100, &p); // день 11
        x.touch_care(1_200, &p); // день 12
        assert_eq!(x.streak, 3);
        let bond = x.bond;
        x.touch_care(1_600, &p); // пропуск трёх дней
        assert_eq!(x.streak, 1);
        assert!(x.bond < bond + BOND_PER_NEW_DAY + 1);
    }

    #[test]
    fn mood_and_streak_scale_xp() {
        let mut x = pet();
        x.mood = 100;
        x.streak = 10;
        assert_eq!(x.xp_multiplier(), 150);
        x.mood = 0;
        x.streak = 0;
        assert_eq!(x.xp_multiplier(), 33);
    }

    #[test]
    fn names_count_characters_not_bytes() {
        assert!(validate_name("Искорка-Звёздочка").is_ok()); // 17 символов, 33 байта
        assert!(validate_name("").is_err());
        assert!(validate_name(" пробел").is_err());
        assert!(validate_name("a\u{0007}").is_err());
        assert!(validate_name(&"я".repeat(21)).is_err());
    }
}
