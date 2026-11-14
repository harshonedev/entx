# Deploying ENTX on Coolify

Three Coolify applications, all from this repo and the same `Dockerfile`. They differ only in build args and env.

## 1. DNS

At your registrar for `entx.space`, add A records pointing at the VPS IP:

| Name | Type | Value |
|------|------|-------|
| `@` | A | `<VPS IP>` |
| `demo` | A | `<VPS IP>` |
| `solana` | A | `<VPS IP>` |

(Or one wildcard `*` A record plus `@`.)

## 2. Create the apps

For each row: **New Resource → Public/Private Repository → this repo → Build Pack: Dockerfile**, port `3000`, set the domain (Coolify issues TLS via Let's Encrypt).

| App | Domain | `NEXT_PUBLIC_ENTX_MODE` | `NEXT_PUBLIC_CHAIN` |
|-----|--------|------------------------|---------------------|
| entx-live | `https://entx.space` | `live` | `near` |
| entx-demo | `https://demo.entx.space` | `demo` | `near` |
| entx-solana | `https://solana.entx.space` | `demo` | `solana` |

## 3. Environment variables

`NEXT_PUBLIC_*` values are baked in at build time: in Coolify tick **Build Variable** on each of them, and redeploy after changing one.

All three apps:

```
NEXT_PUBLIC_FLAG_CHAIN_SWITCH=false      # build variable; true after the hackathon (M4)
NEXT_PUBLIC_NEAR_CONTRACT=entx-market-1794654167.testnet   # build variable
TRUST_PROXY=true                         # runtime; Coolify's Traefik sets X-Real-Ip
```

Per app, the mode and chain from the table above (build variables).

Server-only secrets (runtime, **not** build variables):

| Var | entx-live | entx-demo | entx-solana |
|-----|-----------|-----------|-------------|
| `NEAR_ORACLE_ACCOUNT` / `NEAR_ORACLE_PRIVATE_KEY` | set | set | unset |
| `ENTX_PUBLIC_ORACLE` | `false` | `true` | `false` |
| `ORACLE_API_SECRET` | long random value | optional | unset |
| `ONECLICK_JWT` | optional | optional | optional |

Live never lets the in-app buttons publish to the oracle (`ENTX_PUBLIC_ORACLE=false`); only a caller with `ORACLE_API_SECRET` can. The oracle key is a function-call key limited to `report_epi`, so a leak cannot move funds.

## 4. Verify

```bash
for h in entx.space demo.entx.space solana.entx.space; do curl -sI https://$h | head -1; done
```

Then open each host: the badge in the top bar must read **Live** on `entx.space` and **Demo** on the other two, and the Settings menu must not show the chain switch.

## Local image test

```bash
docker build --build-arg NEXT_PUBLIC_ENTX_MODE=live -t entx:live .
docker run --rm -p 3100:3000 entx:live
```
