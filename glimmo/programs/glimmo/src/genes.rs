//! Гены питомца и случайность.
//!
//! ДНК — 32 байта. Интерфейс рисует питомца из первых байтов:
//!  0 — форма тела, 1 — основной цвет (оттенок), 2 — второй цвет,
//!  3 — узор, 4 — глаза, 5 — рожки/ушки, 6 — редкость (shiny), 7 — хвост,
//!  остальные байты влияют на мелкие детали.
//!
//! Защита от «перебора»: гены выпадают не при покупке яйца, а при вылуплении,
//! из хеша слота, выбранного заранее (см. `hatch_dna`). Для игр с реальными
//! деньгами всё равно нужен VRF (Switchboard, ORAO).

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::errors::GlimmoError;

pub const GENE_SHINY: usize = 6;
/// Байт 6 < 13 ⇒ «сияющий» питомец (~5%).
pub const SHINY_THRESHOLD: u8 = 13;
/// Если оба родителя сияющие, шанс сияния у ребёнка ~25% (64/256).
pub const SHINY_BOTH_PARENTS: u8 = 64;
/// Шанс мутации каждого видимого гена при скрещивании: 1 из 8.
pub const MUTATION_ONE_IN: u8 = 8;
/// Сколько первых генов «видимые» и могут мутировать.
pub const VISIBLE_GENES: usize = 8;

pub fn is_shiny(dna: &[u8; 32]) -> bool {
    dna[GENE_SHINY] < SHINY_THRESHOLD
}

/// Ищет в sysvar SlotHashes хеш конкретного слота. Sysvar хранит последние
/// 512 слотов (~3,5 минуты); читаем байты напрямую, без десериализации всего.
pub fn slot_hash_for(slot_hashes: &AccountInfo, slot: u64) -> Result<Option<[u8; 32]>> {
    let data = slot_hashes.try_borrow_data()?;
    require!(data.len() >= 8, GlimmoError::Overflow);
    let n = u64::from_le_bytes(data[0..8].try_into().unwrap()) as usize;
    for i in 0..n {
        let off = 8 + i * 40;
        if off + 40 > data.len() {
            break;
        }
        let s = u64::from_le_bytes(data[off..off + 8].try_into().unwrap());
        if s == slot {
            let mut h = [0u8; 32];
            h.copy_from_slice(&data[off + 8..off + 40]);
            return Ok(Some(h));
        }
        if s < slot {
            break; // записи идут от новых к старым
        }
    }
    Ok(None)
}

/// ДНК при вылуплении.
///
/// Если бы гены выпадали в транзакции покупки, игрок мог бы добавить после неё
/// свою инструкцию «упасть, если питомец не сияющий» и перебирать бесплатно.
/// Поэтому при покупке запоминается БУДУЩИЙ слот, а гены считаются из его хеша
/// при вылуплении: любая повторная попытка даёт тот же результат.
///
/// Если вылупили слишком поздно и слота уже нет в SlotHashes, берётся запасная
/// детерминированная ДНК без сияния, так что ждать нарочно нет смысла.
pub fn hatch_dna(
    seed: Option<[u8; 32]>,
    mint: &Pubkey,
    parents: Option<(&[u8; 32], &[u8; 32])>,
) -> ([u8; 32], u8) {
    let late = seed.is_none();
    let base = seed.unwrap_or_else(|| hashv(&[b"late", mint.as_ref()]).to_bytes());
    let rnd = hashv(&[&base, mint.as_ref()]).to_bytes();
    let (mut dna, mutations) = match parents {
        Some((a, b)) => mix_dna(a, b, &rnd),
        None => (rnd, 0),
    };
    if late && is_shiny(&dna) {
        dna[GENE_SHINY] += SHINY_THRESHOLD;
    }
    (dna, mutations)
}

/// Смешать гены двух родителей. Каждый байт берётся от случайного родителя,
/// видимые гены с шансом 1/8 мутируют. Сияние не копируется, а бросается
/// заново: ~5%, или ~25%, если сияют оба родителя. Возвращает ДНК и число мутаций.
pub fn mix_dna(a: &[u8; 32], b: &[u8; 32], rnd: &[u8; 32]) -> ([u8; 32], u8) {
    let r2 = hashv(&[rnd, b"mutation"]).to_bytes();
    let mut child = [0u8; 32];
    let mut mutations = 0u8;
    for i in 0..32 {
        let from_a = (rnd[i / 8] >> (i % 8)) & 1 == 1;
        child[i] = if from_a { a[i] } else { b[i] };
        if i < VISIBLE_GENES && i != GENE_SHINY && r2[i] % MUTATION_ONE_IN == 0 {
            child[i] = r2[i + 8];
            mutations += 1;
        }
    }
    let chance = if is_shiny(a) && is_shiny(b) { SHINY_BOTH_PARENTS } else { SHINY_THRESHOLD };
    let roll = r2[31];
    child[GENE_SHINY] = if roll < chance {
        roll % SHINY_THRESHOLD
    } else {
        SHINY_THRESHOLD + roll % (255 - SHINY_THRESHOLD)
    };
    (child, mutations)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn child_genes_come_from_parents_except_mutations() {
        let a = [1u8; 32];
        let b = [2u8; 32];
        let rnd = hashv(&[b"seed"]).to_bytes();
        let (c, m) = mix_dna(&a, &b, &rnd);
        let foreign = c
            .iter()
            .enumerate()
            .filter(|(i, x)| *i != GENE_SHINY && **x != 1 && **x != 2)
            .count() as u8;
        assert!(foreign <= m);
        // невидимые гены не мутируют
        assert!(c[VISIBLE_GENES..].iter().all(|x| *x == 1 || *x == 2));
    }

    #[test]
    fn mixing_is_deterministic() {
        let a = [7u8; 32];
        let b = [9u8; 32];
        let rnd = [42u8; 32];
        assert_eq!(mix_dna(&a, &b, &rnd), mix_dna(&a, &b, &rnd));
    }

    #[test]
    fn shiny_is_rare_even_from_shiny_parents() {
        let a = [0u8; 32]; // оба сияющие
        let mut shiny = 0;
        for i in 0..1000u32 {
            let rnd = hashv(&[&i.to_le_bytes()]).to_bytes();
            if is_shiny(&mix_dna(&a, &a, &rnd).0) {
                shiny += 1;
            }
        }
        assert!(shiny > 150 && shiny < 350, "{shiny}");
    }

    #[test]
    fn late_hatch_is_never_shiny() {
        for i in 0..200u8 {
            let mint = Pubkey::new_from_array([i; 32]);
            let (d, _) = hatch_dna(None, &mint, None);
            assert!(!is_shiny(&d));
        }
    }

    #[test]
    fn hatch_is_deterministic_for_same_slot() {
        let mint = Pubkey::new_unique();
        let seed = Some([5u8; 32]);
        assert_eq!(hatch_dna(seed, &mint, None), hatch_dna(seed, &mint, None));
    }
}
