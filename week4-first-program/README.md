# Неделя 4 — первая Solana Program

Простая on-chain программа: в аккаунте лежит число, каждый вызов делает +1.

Это уже не CLI с недели 3. Тут код живёт в Devnet.

## Что нужно поставить

- [Rust](https://rustup.rs)
- [Solana CLI](https://solana.com/docs/intro/installation)

```bash
solana config set --url devnet
solana-keygen new
solana airdrop 2
```

## Сборка и деплой

```bash
cd week4-first-program
cargo build-sbf
solana program deploy target/deploy/week4_first_program.so
```

После деплоя сохрани Program Id — его надо показать на защите (Explorer, cluster Devnet).

## Как дёргать программу

1. Создай аккаунт на 8 байт, owner = твоя программа.
2. Отправь транзакцию с инструкцией на этот аккаунт.
3. В логах будет `count = ...`.

Пока программу не задеплоишь, в Explorer её не будет — это нормально, деплой делается у себя с кошелька.
