# CasFin: The Next-Generation Encrypted Web3 Casino

CasFin is a cutting-edge, fully on-chain Web3 casino and prediction market platform. Moving beyond traditional "provably fair" platforms, CasFin integrates **Fully Homomorphic Encryption (FHE)** via the Fhenix protocol to ensure that gameplay, player balances, and the resolution of wagers remain entirely private from external observers on the blockchain.

## Why CasFin? The Problem With Web3 Casinos

In traditional Web3 casinos on transparent blockchains (like Ethereum or Arbitrum), everything is public:
- **Public Balances:** Anyone can scan a wallet to see how much liquidity a player has.
- **Public Bets:** The asset wagered, the multiplier targeting, and the specific gamestate of an active bet are visible to MEV bots and analytical tools.
- **Predatory Tracking:** Trackers can copy or socially engineer frequent winners and high-rollers based on on-chain analytics.

**CasFin solves this.** By utilizing Fhenix and the **CoFHE (Client-side FHE)** SDK, player deposits and wagers are submitted entirely as encrypted states (`eUint128`, `eUint32`). Smart contracts perform computations over these encrypted states without decrypting them. Data is only decrypted on the client side via the CoFHE SDK when a user's local wallet authorizes the session.

---

## What We Built: Core Protocol Features

### 1. FHE-Encrypted Casino Games
Powered by Fhenix-compatible contracts, all bets, randomness outcomes, and payouts are calculated confidentially:
- **Dark Coin Flip:** Pick heads or tails via an encrypted `eUint8` wager. 
- **Encrypted Dice:** Choose your payout multiplier and roll under a target without the mempool knowing your strategy.
- **Confidential Crash:** Escalate your multiplier without revealing your cash-out target to anyone.

### 2. The Unified Encrypted Vault
Instead of approving ERC20 or native ETH for every single bet, players deposit into the `EncryptedCasinoVault`. 
- **One Balance:** Deposit once, and use that encrypted aggregate balance across all games.
- **Private Withdrawal:** Withdraw requests are initiated while balances remain encrypted, ensuring no mid-flight frontrunning. 

### 3. Asynchronous Resolution (Keepers)
Since FHE calculations are complex, randomness distribution relies on an async 2-transaction architecture.
- Users submit an encrypted game input.
- A Node.js backend "Keeper Bot" listens to events, checks randomness conditions, and calls the `finalize(encGameId)` function to compute the outcome and payout on-chain.

### 4. Transparent Prediction Markets
CasFin also hosts a factory-deployed prediction market system allowing manual/oracle-driven AMM markets:
- Market Factory for frictionless deployment.
- Automated Market Maker (AMM) logic for LP pools.
- Dispute Registries & Fee Distributors.

---

## The "Midnight Nebula" UX/UI Design System

CasFin isn't just technologically advanced—it features a premium, startup-grade UI. 
- **Global Cinematic Video Background:** A looping, deep-space cinematic background layered underneath the application.
- **Glassmorphism Components:** All cards, game panels, and navigation items are rendered using semi-transparent CSS (`rgba(...)` with `backdrop-filter: blur(18px)`), allowing the video background to dynamically bleed through the layout. 
- **Fhenix Data Visualizer:** Glowing CSS animations provide a visual pulse for the "Fhenix Engine", communicating the complex cryptography happening under the hood to the user gracefully.

---

## Technology Stack

- **Smart Contracts:** Solidity `^0.8.24` (Hardhat framework)
- **Encryption Engine:** Fhenix Protocol, TFHE library, `fhEVM`
- **Frontend App:** Next.js 15 (App Router), React 19, TypeScript
- **Web3 Integrations:** Ethers v6, Wagmi, RainbowKit, CoFHE SDK
- **Backend Keepers:** Node.js, `ts-node` for asynchronous contract interaction
- **Network:** Designed for Arbitrum Sepolia

---

## Repository Structure

```text
casfin/
|- contracts/          Solidity contracts for all protocol rails
|- scripts/            Hardhat deployment scripts
|- keeper/             Runtime Node.js keepers for FHE async settlement
|- test/               Hardhat test suite
|- frontend/           Next.js 15 application + CoFHE React context
|- hardhat.config.ts   Hardhat environment
|- .env.example        Environment requirements
```

---

## Local Development Workflow

### 1. Installation

Install standard repo dependencies and frontend libraries.
```bash
npm install
npm --prefix frontend install
```

### 2. Compiling the Protocol

Compiling the contracts automatically runs ABI extraction scripts sending the necessary types/ABIs directly into the `frontend/lib/generated-abis/` folder so the Next.js app stays perfectly synced with the solidity layout.
```bash
npm run compile
```

### 3. Environment Setup

* **Root Variables (Hardhat & Keepers)**: Create `.env` using `.env.example` as a template. You need an `ARBITRUM_SEPOLIA_RPC_URL` (Infura is recommended for stability) and a `PRIVATE_KEY` for deployment/keeper operations.
* **Frontend Variables**: Create `frontend/.env.local`. Set `NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL` and map the deployed contract addresses (Vault, CoinFlip, Dice, etc.) to the respective environment variables.

### 4. Running the Ecosystem 

You will need two terminal tabs open simultaneously for the casino to function locally:

**Tab 1 - The Web App:**
```bash
npm run frontend:dev
```
Application will boot up at `http://localhost:3000`.

**Tab 2 - The FHE Keeper Bot:**
Without the Keeper, your bets will sit in a "pending" requested state indefinitely. The Keeper distributes randomness and finalizes the encrypted state.
```bash
npm run keeper:start:fhe
```

---

## Deployment Stages

Ensure `PRIVATE_KEY` has enough Arbitrum Sepolia ETH before deploying.

**1. Vanilla / Transparent Stage** (Predictions & Legacy Casino)
```bash
npm run deploy:prediction
npm run deploy:casino
```

**2. Fhenix Encrypted Architecture**
Deploys the `EncryptedCasinoVault` and all encrypted game channels.
```bash
npm run deploy:fhenix
```

If an existing encrypted deployment starts reverting with `NOT_AUTHORIZED_GAME`, re-run the vault authorization step against the saved deployment snapshot:
```bash
npm run authorize:games
```

All successful testnet/mainnet deployments save JSON snapshots inside the `deployments/<network>/` directory so you can trace addresses and logic hashes easily.

---

## Security Scope

* **Transparent Markets:** Predictions and legacy casino systems are explicitly public.
* **Encrypted Casino:** Protects the inputs/balances via Fully Homomorphic Encryption. **Important restriction:** Because CoFHE is actively developing, handling decryption relies on wallet/local security. Ensure proper CORS and domain allowances in production for keychain usage. 
* *Note: This codebase is unaudited and intended as an advanced demonstration of FHE application infrastructure.*
