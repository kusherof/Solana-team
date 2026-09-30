# Неделя 2. Transaction Detective

Я взял свою транзакцию с первой недели (перевод 0.2 SOL в Devnet) и разобрал её в Explorer.

Ссылка:  
https://explorer.solana.com/tx/4aqu2uoyE8D3cb39E6spfEmRXNozQVt3skC36S9SrWZnyqH9hQf8zgC5Fzye1Cy9WwKJzG4JDNMFUrij56cdketj?cluster=devnet

Signature:  
`4aqu2uoyE8D3cb39E6spfEmRXNozQVt3skC36S9SrWZnyqH9hQf8zgC5Fzye1Cy9WwKJzG4JDNMFUrij56cdketj`

Дата: 30 сентября 2026. Сеть: Devnet. Транзакция прошла нормально, ошибок нет.

---

## Что я сделал

Просто отправил SOL с одного кошелька на другой. Не токен, не свап, обычные деньги сети (SOL).

Отправил: `2z22P3J5qoaARXeq1XVbioptY1MFYP4PURW4N97KwiMN`  
Получил: `5KEKsPQkmb9GY71jkEJe1bKq6gxYx6hAmfpNSgivkd1M`  
Сумма: 0.2 SOL  
Комиссия: примерно 0.00008 SOL

До перевода у меня было 1 SOL (это тестовые, с крана). После перевода осталось около 0.8 SOL, потому что ушло 0.2 + комиссия.

У второго кошелька сначала было 0, потом стало 0.2 SOL.

---

## Accounts (аккаунты)

В транзакции было 4 адреса:

1. Мой кошелёк — я его подписал. С него ушли SOL и комиссия.
2. Второй кошелёк — тот, кому я кинул деньги. Он ничего не подписывал.
3. System Program (`11111111111111111111111111111111`) — обычная программа Соланы, она и делает перевод SOL.
4. Compute Budget Program — кошелёк сам её добавил. Это не про перевод, а про лимиты, сколько «работы» можно сделать в транзакции.

Signer (кто подписал) — только я, первый адрес.  
Writable (у кого меняется баланс) — мой кошелёк и кошелёк получателя. Программы не меняются.

---

## Programs (программы)

Работали только две программы:

- Compute Budget — вызвалась 2 раза
- System Program — вызвалась 1 раз

В логах у обеих написано success. Других программ нет. Никакого Token Program, никакого DeFi.

---

## Instructions (инструкции)

Всего 3 штуки:

1 и 2 — Compute Budget. Кошелёк так делает почти всегда. На сам перевод это не влияет, просто настройки.

3 — вот это главное. System Program, тип **transfer**.  
Откуда: мой адрес. Куда: второй адрес. Сколько: 200000000 lamports (это и есть 0.2 SOL).

---

## Коротко

Это обычный перевод SOL в тестовой сети.  
**Accounts:** я, получатель и две системные программы.  
**Programs:** Compute Budget и System Program.  
**Instructions:** две служебные + один transfer.

Я открыл Explorer, включил Devnet (не Mainnet), нашёл свою signature и посмотрел accounts, instructions и логи.
