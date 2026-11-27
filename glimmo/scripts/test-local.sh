#!/usr/bin/env bash
# Интеграционные тесты на чистом локальном валидаторе
# (то же, что `anchor test`, но не зависит от порт-чекера anchor).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
anchor keys sync >/dev/null
anchor build
LEDGER="$(mktemp -d)"
solana-test-validator --reset --quiet --ledger "$LEDGER" \
  --upgradeable-program "$(solana-keygen pubkey target/deploy/glimmo-keypair.json)" target/deploy/glimmo.so "$(solana-keygen pubkey ~/.config/solana/id.json)" \
  > "$LEDGER/validator.log" 2>&1 &
VPID=$!
trap 'kill $VPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
  solana -u http://127.0.0.1:8899 cluster-version >/dev/null 2>&1 && break
  sleep 1
done
anchor test --skip-build --skip-local-validator --skip-deploy
