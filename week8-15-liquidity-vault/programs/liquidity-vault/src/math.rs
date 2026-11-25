//! Учёт долей. Вынесен в отдельные чистые функции, чтобы их было легко тестировать.
use crate::errors::VaultError;
use anchor_lang::prelude::*;

/// Сколько share-токенов выдать за депозит `amount`.
///
/// * первый вкладчик (share-токенов ещё нет): shares = amount
/// * дальше: shares = amount × total_shares ÷ total_assets (округление вниз — в пользу vault)
pub fn shares_for_deposit(amount: u64, total_assets: u64, total_shares: u64) -> Result<u64> {
    require!(amount > 0, VaultError::ZeroAmount);
    if total_shares == 0 || total_assets == 0 {
        return Ok(amount);
    }
    let shares = (amount as u128)
        .checked_mul(total_shares as u128)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(total_assets as u128)
        .ok_or(VaultError::MathOverflow)?;
    let shares = u64::try_from(shares).map_err(|_| VaultError::MathOverflow)?;
    require!(shares > 0, VaultError::AmountTooSmall);
    Ok(shares)
}

/// Сколько токенов вернуть за сжигание `shares`.
///
/// amount = shares × total_assets ÷ total_shares (округление вниз — в пользу vault)
pub fn assets_for_withdraw(shares: u64, total_assets: u64, total_shares: u64) -> Result<u64> {
    require!(shares > 0, VaultError::ZeroAmount);
    require!(total_shares > 0 && shares <= total_shares, VaultError::AmountTooSmall);
    let amount = (shares as u128)
        .checked_mul(total_assets as u128)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(total_shares as u128)
        .ok_or(VaultError::MathOverflow)?;
    let amount = u64::try_from(amount).map_err(|_| VaultError::MathOverflow)?;
    require!(amount > 0, VaultError::AmountTooSmall);
    Ok(amount)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_depositor_gets_1_to_1() {
        assert_eq!(shares_for_deposit(1_000, 0, 0).unwrap(), 1_000);
    }

    #[test]
    fn example_from_methodology() {
        // В vault 1 100 токенов, выпущено 1 000 share. Вносим 110 → получаем 100 share.
        assert_eq!(shares_for_deposit(110, 1_100, 1_000).unwrap(), 100);
    }

    #[test]
    fn withdraw_is_proportional() {
        // 100 share из 1 100 при 1 210 токенах → 110 токенов
        assert_eq!(assets_for_withdraw(100, 1_210, 1_100).unwrap(), 110);
        // Вывод всех share возвращает все токены
        assert_eq!(assets_for_withdraw(1_000, 1_234, 1_000).unwrap(), 1_234);
    }

    #[test]
    fn zero_is_rejected() {
        assert!(shares_for_deposit(0, 10, 10).is_err());
        assert!(assets_for_withdraw(0, 10, 10).is_err());
    }

    #[test]
    fn dust_deposit_is_rejected() {
        // 1 токен при цене share = 2 токена → 0 share → ошибка
        assert!(shares_for_deposit(1, 2_000, 1_000).is_err());
    }

    #[test]
    fn rounding_favors_vault() {
        // deposit → withdraw не должен давать больше, чем внесено
        let total_assets = 1_003u64;
        let total_shares = 1_000u64;
        let s = shares_for_deposit(7, total_assets, total_shares).unwrap();
        let back = assets_for_withdraw(s, total_assets + 7, total_shares + s).unwrap();
        assert!(back <= 7);
    }

    #[test]
    fn large_numbers_do_not_overflow() {
        let s = shares_for_deposit(u64::MAX / 2, u64::MAX / 2, u64::MAX / 2).unwrap();
        assert_eq!(s, u64::MAX / 2);
    }
}
