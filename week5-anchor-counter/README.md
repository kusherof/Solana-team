# Неделя 5 — Counter на Anchor

Силлабус: Counter Program + вызов через **client**.

`initialize` → 0, `increment` → +1, `decrement` → −1. Клиент: `client/increment.ts`. Тест: `tests/counter.ts`.

После деплоя замени `declare_id!` и id в `Anchor.toml` на свой Program Id.

## Поставить Anchor

https://www.anchor-lang.com/docs/installation

Нужны ещё Solana CLI (как на неделе 4) и Node.js.

```powershell
solana config set --url devnet
solana airdrop 2
```

## Сборка, тест, деплой, клиент

```powershell
cd week5-anchor-counter
yarn
anchor build
anchor test --skip-local-validator
anchor deploy
yarn client
```

`anchor test` поднимает локальный validator (если не skip). Если тесты зелёные и клиент печатает `count 1` — неделя 5 сдана.

Проверка в Explorer: аккаунт counter, поле count.
