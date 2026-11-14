#!/usr/bin/env bash
# Registers every catalogue market (assets + predictions) on the deployed contract. Idempotent:
# already-registered ids are skipped by the contract. Run after `bun run seed:tmdb`.
set -euo pipefail
cd "$(dirname "$0")/.."
CONTRACT="${1:-$(grep NEXT_PUBLIC_NEAR_CONTRACT .env.local | cut -d= -f2)}"
TMP="$(mktemp)"
node scripts/markets-json.ts > "$TMP"
near contract call-function as-transaction "$CONTRACT" register_markets file-args "$TMP" \
  prepaid-gas '300.0 Tgas' attached-deposit '0 NEAR' sign-as "$CONTRACT" \
  network-config testnet sign-with-legacy-keychain send
rm -f "$TMP"
