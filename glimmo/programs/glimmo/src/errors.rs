use anchor_lang::prelude::*;

#[error_code]
pub enum GlimmoError {
    #[msg("Имя должно быть от 1 до 20 байт")]
    BadName,
    #[msg("Неверные параметры игры")]
    BadParams,
    #[msg("Только администратор")]
    NotAdmin,
    #[msg("Вы не владеете этим питомцем")]
    NotOwner,
    #[msg("Кормушка ещё пуста, приходите позже")]
    FoodCooldown,
    #[msg("Яйцо ещё не готово")]
    EggNotReady,
    #[msg("Питомец уже вылупился")]
    AlreadyHatched,
    #[msg("Это ещё яйцо")]
    StillEgg,
    #[msg("Питомец сыт")]
    AlreadyFull,
    #[msg("Нужно хотя бы 1 FOOD")]
    ZeroFood,
    #[msg("Питомец слишком голоден")]
    TooHungry,
    #[msg("Питомец устал, подождите")]
    PlayCooldown,
    #[msg("Для скрещивания нужны два взрослых питомца")]
    NotAdult,
    #[msg("Нельзя скрестить питомца с самим собой")]
    SamePet,
    #[msg("Питомец ещё отдыхает после скрещивания")]
    BreedCooldown,
    #[msg("Недостаточно средств в казне")]
    TreasuryEmpty,
    #[msg("Арифметическое переполнение")]
    Overflow,
}
