# Неделя 4 — первая Solana Program

Силлабус: создать программу и задеплоить в **Devnet**.

Программа умеет две инструкции: **initialize** (создаёт аккаунт со счётчиком = 0) и **increment** (+1). Клиент в `client/demo.ts`.

Это уже on-chain, не CLI с недели 3.

## Проверить код локально (без сети)

```powershell
cd week4-first-program
cargo test --features no-entrypoint
```

Должен пройти тест `counter_roundtrip`.

## Поставить Solana CLI (один раз)

См. [установку](https://solana.com/docs/intro/installation). Потом:

```powershell
solana --version
solana config set --url devnet
solana-keygen new
solana airdrop 2
solana balance
```

## Сборка и деплой (это и есть сдача недели 4)

```powershell
cd week4-first-program
cargo build-sbf
solana program deploy target/deploy/week4_first_program.so
```

Скопируй **Program Id**. Открой его в Explorer (Devnet) — программа должна быть видна.

## Клиент (проверка, что программа живая)

```powershell
cd week4-first-program
npm install
$env:PROGRAM_ID="сюда_program_id"
npm run demo
```

В консоли будет `count 1` и ссылка на транзакцию. Если count = 1 — неделя 4 закрыта.
