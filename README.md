# CasFin

CasFin is a full-stack onchain finance project centered around the application in [`casfin/`](./casfin).

It combines three major product surfaces:

- prediction markets with factory-based deployment, AMM trading, LP shares, resolution flows, and disputes
- a transparent casino rail with a shared vault, staking, and randomness-driven games
- an encrypted FHE-oriented casino rail with dedicated contracts and keeper-assisted resolution

## Repository Layout

```text
/
|- casfin/   Main application, contracts, frontend, scripts, keepers, and tests
`- README.md
```

The actual protocol code, frontend, deployment scripts, and documentation live in [`casfin/`](./casfin).

## What Is Inside `casfin/`

- Solidity contracts for prediction markets, casino games, vaults, fees, disputes, staking, and token issuance
- a Next.js frontend for wallet flows, live reads, and transaction submission
- Hardhat deployment and verification scripts
- keeper processes for transparent and encrypted game resolution
- checked-in deployment artifacts for Arbitrum Sepolia and local development
- TypeScript-based frontend, tooling, scripts, and tests

## Main Docs

For the detailed project documentation, see:

- [`casfin/README.md`](./casfin/README.md)

That README covers:

- architecture
- product rails
- environment variables
- deployment commands
- keeper processes
- frontend setup
- ABI export flow
- security and privacy notes

## Quick Start

```bash
cd casfin
npm install
npm --prefix frontend install
npm run compile
npm test
npm run frontend:dev
```

## Deployment Shortcuts

From inside `casfin/`:

```bash
npm run deploy:casino
npm run deploy:prediction
npm run deploy:all
npm run deploy:fhenix
```

## Status

The repository has been organized so GitHub shows a root README while the main application remains contained in `casfin/`.
