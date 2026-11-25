#!/usr/bin/env bash
# Собирает программу Raydium CLMM из официальных исходников для локальных тестов.
# Зачем: localnet пустой, в нём нет Raydium. Мы собираем ту же версию, что и
# библиотека для CPI (rev d4ec101), и подменяем адрес «админа Raydium» на локальный
# тестовый ключ, чтобы в тесте можно было создать AmmConfig (на devnet он уже есть).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX="$ROOT/tests/fixtures"
REV=d4ec101
WORK="${TMPDIR:-/tmp}/raydium-clmm-$REV"

mkdir -p "$FIX"
if [ ! -f "$FIX/clmm-admin-keypair.json" ]; then
  solana-keygen new --no-bip39-passphrase -s -o "$FIX/clmm-admin-keypair.json" >/dev/null
fi
ADMIN=$(solana-keygen pubkey "$FIX/clmm-admin-keypair.json")

if [ ! -d "$WORK" ]; then
  git clone -q https://github.com/raydium-io/raydium-clmm "$WORK"
fi
cd "$WORK"
git checkout -q -f "$REV"
# Подменяем mainnet-админа на локальный тестовый ключ (только для localnet-сборки!)
sed -i "s/GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ/$ADMIN/" programs/amm/src/lib.rs
# Совместимость зависимостей со старым cargo из platform-tools
cargo update -q -p blake3 --precise 1.8.2 2>/dev/null || true

cargo build-sbf --manifest-path programs/amm/Cargo.toml --sbf-out-dir "$FIX"
cp "$FIX/raydium_amm_v3.so" "$FIX/raydium_clmm.so"
anchor idl build -p raydium-amm-v3 -o "$FIX/raydium_clmm.json" 2>/dev/null || \
  (cd programs/amm && anchor idl build -o "$FIX/raydium_clmm.json")
echo "OK: $FIX/raydium_clmm.so, admin = $ADMIN"
