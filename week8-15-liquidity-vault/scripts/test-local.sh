#!/usr/bin/env bash
# Запуск интеграционных тестов на чистом локальном валидаторе с Raydium CLMM.
# (то же, что `anchor test`, но удобно, если порт-чекер anchor капризничает)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f tests/fixtures/raydium_clmm.so ] || ./scripts/build-raydium-clmm-local.sh
anchor keys sync >/dev/null
anchor build
LEDGER="$(mktemp -d)"
solana-test-validator --reset --quiet --ledger "$LEDGER" \
  --bpf-program CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK tests/fixtures/raydium_clmm.so \
  --bpf-program "$(solana-keygen pubkey target/deploy/liquidity_vault-keypair.json)" target/deploy/liquidity_vault.so \
  > "$LEDGER/validator.log" 2>&1 &
VPID=$!
trap 'kill $VPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
  solana -u http://127.0.0.1:8899 cluster-version >/dev/null 2>&1 && break
  sleep 1
done
anchor test --skip-build --skip-local-validator --skip-deploy
