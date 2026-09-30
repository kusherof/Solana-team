# Неделя 6 — профиль на PDA

Силлабус: децентрализованный on-chain профиль через **PDA**.

Адрес профиля считается так: `seeds = ["profile", pubkey пользователя]`. Его нельзя подобрать ключом — его выводит программа. В аккаунте: username, bio, authority.

## Проверка

```powershell
cd week6-pda-profile
yarn
anchor build
anchor test
anchor deploy
yarn client
```

Клиент печатает PDA и bio. В Explorer аккаунт профиля: owner = твоя программа, не кошелёк.

Если `initialize` второй раз на тот же PDA — ошибка (аккаунт уже есть). Это нормально и как раз показывает, что PDA один на пользователя.
