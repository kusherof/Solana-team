use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Сумма должна быть больше нуля")]
    ZeroAmount,
    #[msg("Сумма слишком мала: получится 0 share-токенов или 0 токенов")]
    AmountTooSmall,
    #[msg("Арифметическое переполнение")]
    MathOverflow,
    #[msg("Только администратор может выполнить это действие")]
    Unauthorized,
    #[msg("Пул Raydium уже привязан к vault")]
    PoolAlreadyConfigured,
    #[msg("Пул Raydium ещё не привязан к vault")]
    PoolNotConfigured,
    #[msg("Пул не содержит токены vault")]
    PoolMintMismatch,
    #[msg("Неверный аккаунт хранилища")]
    InvalidVaultAccount,
    #[msg("У vault уже есть открытая позиция")]
    PositionAlreadyOpen,
    #[msg("У vault нет открытой позиции")]
    NoOpenPosition,
    #[msg("Средства vault сейчас в работе: закройте позицию и обменяйте токен B обратно в A")]
    VaultNotIdle,
    #[msg("Недостаточно SOL для оплаты аренды аккаунтов Raydium")]
    InsufficientAuthorityLamports,
}
