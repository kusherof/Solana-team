# Неделя 3 — CLI 

Это та утилита, про которую писали: конвертация **SOL → Lamports** и проверка, похож ли текст на **адрес Solana**.

Большой проект `week3-solana-cli` тоже оставляем — там Pubkey, PDA, transfer, как в силлабусе. Для скриншота преподавателю достаточно этой папки.

## Запуск в терминале Cursor

```powershell
cd "c:\Users\Lenovo\Desktop\Solana team\week3-almau-cli"
cargo run
```

Сначала введи число (для нашей tx с недели 1 удобно **0.2**), потом адрес, например:

`2z22P3J5qoaARXeq1XVbioptY1MFYP4PURW4N97KwiMN`

Скриншот этого окна — сдача недели 3 по инструкции Gemini.

Через `rustc` тоже можно, если скопировать `src/main.rs` в текущую папку:

```powershell
rustc src\main.rs -o week3-almau-cli.exe
.\week3-almau-cli.exe
```

## Проверка без ввода с клавиатуры

```powershell
cargo test
```
