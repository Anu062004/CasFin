# CasFin Application (`casfin/`)

This directory contains the full CasFin protocol: contracts, frontend, keepers, tests, and deployment tooling.

**For judges and first-time contributors, start with the repository root README:**  
[../README.md](../README.md) — overview, architecture, live demo, and testnet addresses.

---

## Quick commands

```bash
npm install
npm --prefix frontend install
npm run compile          # exports ABIs → frontend/lib/generated-abis/
npm test                 # Hardhat + FHE mock tests
npm run frontend:dev     # Next.js on :3000
npm run keeper:start     # encrypted game + prediction keepers
```

---

## Environment

| File | Purpose |
| ---- | ------- |
| `.env` | Hardhat deployer, keeper `PRIVATE_KEY`, RPC, contract addresses |
| `frontend/.env.local` | `NEXT_PUBLIC_*` RPC and deployed addresses |

Use `.env.example` and `frontend/.env.example` as templates.

---

## Deploy scripts

```bash
npm run deploy:prediction
npm run deploy:casino
npm run deploy:full
npm run authorize:games
```

Artifacts: `deployments/<network>/`.

---

## FHE reference

CoFHE integration checklist, ACL rules, and keeper debugging:  
[`FHENIX_COFHE_REFERENCE.md`](./FHENIX_COFHE_REFERENCE.md)

---

## Frontend

- **Stack:** Next.js 15, React 19, `@cofhe/sdk`, Ethers 6  
- **CoFHE:** `frontend/lib/cofhe-provider.tsx`, `frontend/lib/cofhe-runtime.ts`  
- **Config:** `frontend/lib/casfin-config.ts`  

```bash
npm --prefix frontend run dev
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

---

## Keeper

```bash
npm run keeper:start
```

Required env: `ARBITRUM_SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `ENCRYPTED_COIN_FLIP_ADDRESS`, `ENCRYPTED_DICE_GAME_ADDRESS`, `ENCRYPTED_CRASH_GAME_ADDRESS`, `MARKET_FACTORY_ADDRESS`.

Optional: `KEEPER_POLL_MS`, `KEEPER_EVENT_BATCH_BLOCKS`, `REDIS_URL` (SSE only).

Lambda packaging: `keeper/lambda/`.

---

## Tests

```bash
npm run test:unit
npm run test:keeper
npm run test:all
```

---

## Security

Unaudited demonstration software. See root README **Security & scope** section.
