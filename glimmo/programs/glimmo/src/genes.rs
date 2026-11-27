//! Гены питомца и псевдослучайность.
//!
//! ДНК — 32 байта. Интерфейс рисует питомца из первых байтов:
//!  0 — форма тела, 1 — основной цвет (оттенок), 2 — второй цвет,
//!  3 — узор, 4 — глаза, 5 — рожки/ушки, 6 — редкость (shiny), 7 — хвост,
//!  остальные байты влияют на мелкие детали.
//!
//! Случайность: hash(последний хеш слота из SlotHashes, время, ключи, счётчик).
//! Для учебной игры этого достаточно; для игр с реальными ставками нужен VRF.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::errors::GlimmoError;

pub const GENE_SHINY: usize = 6;
/// Байт 6 < 13 ⇒ «сияющий» питомец (~5%).
pub const SHINY_THRESHOLD: u8 = 13;
/// Шанс мутации каждого видимого гена при скрещивании: 1 из 8.
pub const MUTATION_ONE_IN: u8 = 8;
/// Сколько первых генов «видимые» и могут мутировать.
pub const VISIBLE_GENES: usize = 8;

pub fn is_shiny(dna: &[u8; 32]) -> bool {
    dna[GENE_SHINY] < SHINY_THRESHOLD
}

/// Читает хеш самого свежего слота из sysvar SlotHashes без десериализации
/// всего (большого) аккаунта.
pub fn recent_slot_hash(slot_hashes: &AccountInfo) -> Result<[u8; 32]> {
    let data = slot_hashes.try_borrow_data()?;
    // u64 длина вектора, затем записи (u64 slot, [u8;32] hash)
    require!(data.len() >= 8 + 40, GlimmoError::Overflow);
    let mut out = [0u8; 32];
    out.copy_from_slice(&data[16..48]);
    Ok(out)
}

pub fn random_dna(seed: &[u8; 32], parts: &[&[u8]]) -> [u8; 32] {
    let mut v: Vec<&[u8]> = Vec::with_capacity(parts.len() + 1);
    v.push(seed);
    v.extend_from_slice(parts);
    hashv(&v).to_bytes()
}

/// Смешать гены двух родителей. Каждый байт берётся от случайного родителя,
/// видимые гены с шансом 1/8 мутируют. Возвращает ДНК и число мутаций.
pub fn mix_dna(a: &[u8; 32], b: &[u8; 32], rnd: &[u8; 32]) -> ([u8; 32], u8) {
    let r2 = hashv(&[rnd, b"mutation"]).to_bytes();
    let mut child = [0u8; 32];
    let mut mutations = 0u8;
    for i in 0..32 {
        let from_a = (rnd[i / 8] >> (i % 8)) & 1 == 1;
        child[i] = if from_a { a[i] } else { b[i] };
        if i < VISIBLE_GENES && r2[i] % MUTATION_ONE_IN == 0 {
            child[i] = r2[i + 8];
            mutations += 1;
        }
    }
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
        let foreign = c.iter().filter(|x| **x != 1 && **x != 2).count() as u8;
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
}
