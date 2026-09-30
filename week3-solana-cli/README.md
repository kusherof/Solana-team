# Неделя 3 — Rust CLI для Solana-разработки

Не открывай `target/debug/week3-solana-cli.exe` в редакторе — это уже собранная программа (куча красных кракозябр, так и должно быть). Смотри код в `src/`, запускай из терминала: `cargo run -- keygen`.

Задание силлабуса: небольшая CLI-программа на Rust с конструкциями, которые нужны в Solana (Pubkey 32 байта, `enum` инструкций + `match`, `Result`/`Option`, PDA из seeds, аккаунт с `lamports` и `data`).

Это **локальный симулятор**, не сеть Solana. Неделя 4 — уже реальный deploy в Devnet.

## Что потренировать

| Конструкция | Где в коде | Зачем в Solana |
|---|---|---|
| `[u8; 32]` + Base58 | `src/pubkey.rs` | адрес аккаунта / программы |
| `enum` + `match` | `src/instruction.rs` | диспетчер инструкций программы |
| `Result` / свои ошибки | `src/error.rs` | `ProgramResult` в on-chain коде |
| `HashMap`, ownership | `src/ledger.rs` | состояние аккаунтов |
| SHA-256 + bump | `src/pda.rs` | Program Derived Address |
| `Vec<u8>` в аккаунте | `src/account.rs` | сериализация состояния |

## Сборка

Нужны [Rust](https://rustup.rs) и Cargo.

```bash
cd week3-solana-cli
cargo build
cargo test
```

## Демонстрация (для защиты)

В каталоге проекта:

```bash
cargo run -- keygen
```

Скопируйте адрес, затем (подставьте свои pubkey):

```bash
cargo run -- airdrop <PUBKEY_A> 1000
cargo run -- keygen
cargo run -- transfer <PUBKEY_A> <PUBKEY_B> 250
cargo run -- balance <PUBKEY_A>
cargo run -- accounts
cargo run -- pda --seeds profile alice
cargo run -- profile init <PUBKEY_A> alice
cargo run -- profile show <PUBKEY_A>
```

Состояние пишется в `ledger.json` рядом с командой.

## Команды

- `keygen` — новый адрес
- `airdrop <pubkey> <lamports>` — тестовые средства
- `create-account <payer> <new_account> <lamports>` — создать аккаунт за счёт payer
- `transfer <from> <to> <lamports>` — перевод
- `balance <pubkey>`
- `accounts`
- `pda --seeds <s1> [s2...] [--program <pk>]`
- `profile init <owner> <username>` — PDA `["profile", owner]`
- `profile show <owner>`
