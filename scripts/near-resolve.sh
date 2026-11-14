#!/usr/bin/env bash
# Resolve a prediction market on-chain (owner/oracle only).
# Usage: scripts/near-resolve.sh <market_id> <true|false> [contract]
set -euo pipefail
cd "$(dirname "$0")/.."
CONTRACT="${3:-$(grep NEXT_PUBLIC_NEAR_CONTRACT .env.local | cut -d= -f2)}"
near contract call-function as-transaction "$CONTRACT" resolve \
  json-args "{\"market_id\":\"$1\",\"outcome\":$2}" prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' \
  sign-as "$CONTRACT" network-config testnet sign-with-legacy-keychain send
