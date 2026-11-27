use anchor_lang::prelude::*;

#[error_code]
pub enum GlimmoError {
    #[msg("Имя: от 1 до 20 символов, без пробелов по краям")]
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
    #[msg("Сначала заведите питомца: кормушка только для хозяев")]
    NeedPet,
    #[msg("У питомца уже максимум детей")]
    TooManyChildren,
    #[msg("Нельзя скрещивать родителя с его ребёнком")]
    Related,
    #[msg("Питомцу грустно, сначала поиграйте с ним")]
    TooSad,
    #[msg("Недостаточно средств в казне")]
    TreasuryEmpty,
    #[msg("Арифметическое переполнение")]
    Overflow,
}
