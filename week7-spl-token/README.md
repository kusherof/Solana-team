# Неделя 7 — SPL Token + Token Extensions

Силлабус: свой токен — выпуск, transfer, metadata, клиент.

Скрипт `src/main.ts` на Devnet:

1. создаёт mint **Token-2022**
2. пишет **metadata** прямо в mint (Token Extensions)
3. минтит 10 штук себе
4. переводит 3 штуки другому кошельку

Своя Solana Program тут не нужна — используются Token-2022 и Associated Token Account.

## Проверка

Нужны Node.js и кошелёк `~/.config/solana/id.json` с тестовым SOL (`solana airdrop 2`).

```powershell
cd week7-spl-token
npm install
npm start
```

Ожидаешь в консоли: mint address, `metadata name Solana Team Token`, ссылку Explorer. Файл `last-token.json` — для отчёта.

В Explorer (Devnet) открой mint: программа `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, имя/символ STT.

Если airdrop не даёт SOL — подожди и повтори, Devnet часто лимитирует кран.
