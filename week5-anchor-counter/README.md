# Неделя 5 — Counter на Anchor

Счётчик: `initialize` ставит 0, `increment` делает +1. Клиент в `client/increment.ts` вызывает программу и печатает `count`.

После `anchor deploy` подставь настоящий Program Id в `programs/counter/src/lib.rs` (`declare_id!`) и в `Anchor.toml`.

## Что нужно

- Solana CLI (Devnet)
- [Anchor](https://www.anchor-lang.com/docs/installation)
- Node.js + yarn или npm

```bash
solana config set --url devnet
solana airdrop 2
```

## Сборка, деплой, клиент

```bash
cd week5-anchor-counter
yarn
anchor build
anchor deploy
yarn client
```

Если `count` в консоли вырос — задание недели 5 закрыто: программа + клиент.
