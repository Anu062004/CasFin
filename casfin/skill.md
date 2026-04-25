# CasFin — Complete Project Skill File

> **Purpose of this file:** This document is the single source of truth for any AI assistant, contributor, or auditor who needs to understand the CasFin project end-to-end. It covers goals, architecture, every contract, the frontend, the keeper system, the Fhenix/CoFHE integration, deployment history, the design system, what has been built, what remains, and known gotchas.

---

## Table of Contents

1. [Project Identity](#1-project-identity)
2. [The Problem We Solve](#2-the-problem-we-solve)
3. [Core Goals & Vision](#3-core-goals--vision)
4. [Technology Stack](#4-technology-stack)
5. [Repository Structure](#5-repository-structure)
6. [Architecture Overview](#6-architecture-overview)
7. [Smart Contracts — Deep Dive](#7-smart-contracts--deep-dive)
   - 7.1 [FHE Encrypted Casino Contracts](#71-fhe-encrypted-casino-contracts)
   - 7.2 [Transparent Prediction Market Contracts](#72-transparent-prediction-market-contracts)
   - 7.3 [Encrypted Prediction Market Contracts](#73-encrypted-prediction-market-contracts)
   - 7.4 [Shared Infrastructure Contracts](#74-shared-infrastructure-contracts)
   - 7.5 [Base & Library Contracts](#75-base--library-contracts)
8. [Fhenix & CoFHE Integration](#8-fhenix--cofhe-integration)
9. [Frontend — Deep Dive](#9-frontend--deep-dive)
   - 9.1 [Pages & Routing](#91-pages--routing)
   - 9.2 [Components](#92-components)
   - 9.3 [Client Libraries](#93-client-libraries)
   - 9.4 [The CoFHE React Provider](#94-the-cofhe-react-provider)
   - 9.5 [The WalletProvider Context](#95-the-walletprovider-context)
10. [Keeper Bot Infrastructure](#10-keeper-bot-infrastructure)
11. [Deployment & DevOps](#11-deployment--devops)
12. [Deployed Contract Addresses (Arbitrum Sepolia)](#12-deployed-contract-addresses-arbitrum-sepolia)
13. [The "Midnight Nebula" Design System](#13-the-midnight-nebula-design-system)
14. [Environment Variables Reference](#14-environment-variables-reference)
15. [Development Workflow](#15-development-workflow)
16. [Test Suite](#16-test-suite)
17. [Progress Tracker — What's Built](#17-progress-tracker--whats-built)
18. [Known Issues & Gotchas](#18-known-issues--gotchas)
19. [Future Roadmap](#19-future-roadmap)

---

## 1. Project Identity

| Field | Value |
|---|---|
| **Name** | CasFin |
| **Tagline** | The Next-Generation Encrypted Web3 Casino & Prediction Market |
| **Version** | `0.1.0` (pre-audit prototype) |
| **Primary Network** | Arbitrum Sepolia (Chain ID `421614`) |
| **FHE Network** | Fhenix Helium (Chain ID `8008135`) — contracts deployed to Arbitrum Sepolia using CoFHE cross-chain |
| **License** | MIT |
| **Status** | Advanced prototype / hackathon-ready. Unaudited. |

---

## 2. The Problem We Solve

Traditional Web3 casinos and prediction markets on transparent blockchains (Ethereum, Arbitrum, etc.) have a critical privacy flaw:

- **Public Balances** — Anyone can scan a wallet to see how much liquidity a player has.
- **Public Bets** — The asset wagered, the multiplier, the game state — all visible to MEV bots and analytics trackers.
- **Predatory Tracking** — Trackers copy or social-engineer frequent winners based on on-chain data.
- **Front-running** — MEV bots can extract value by observing pending game transactions in the mempool.

**CasFin solves this** by integrating Fully Homomorphic Encryption (FHE) via the Fhenix protocol. Player deposits, wagers, and game outcomes are encrypted end-to-end on-chain. Smart contracts compute over ciphertext without ever decrypting it. Only the player's local wallet can decrypt their own data.

---

## 3. Core Goals & Vision

1. **Privacy-First Gaming** — All casino bets, balances, and outcomes are encrypted via FHE. No one — not even the contract deployer — can see a player's balance or bet details on-chain.
2. **Unified Encrypted Vault** — Players deposit once into an `EncryptedCasinoVault` and play across all games with a single encrypted balance, eliminating per-game token approvals.
3. **Async 2-TX Resolution** — Because FHE computations are expensive, game outcomes are resolved asynchronously via a Keeper Bot that calls `requestResolution()` then `finalizeResolution()` after the CoFHE decrypt task completes.
4. **Transparent Prediction Markets** — Factory-deployed prediction markets with AMM-based trading, LP pools, dispute registries, and fee distribution — all transparent for market integrity.
5. **Encrypted Prediction Markets** — A parallel set of encrypted prediction market contracts using FHE for private position-taking.
6. **Premium UX** — A "Midnight Nebula" design system with cinematic video backgrounds, glassmorphism, animated Fhenix engine visualizer, and dark-mode-first aesthetics.
7. **Full-Stack Deployability** — One-command deployment of the entire stack (casino + predictions + token + staking) with automated ABI export to the frontend.

---

## 4. Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Smart Contracts** | Solidity `^0.8.24` / `^0.8.25` | Hardhat framework, `viaIR` compiler, optimizer at 200 runs, `cancun` EVM |
| **FHE Engine** | Fhenix Protocol (CoFHE) | `@fhenixprotocol/cofhe-contracts ^0.1.3`, TFHE types (`euint8`, `euint32`, `euint128`, `ebool`), `FHE.sol` library |
| **Frontend Framework** | Next.js 15 (App Router) | React 19, TypeScript, `next dev` on port 3000 |
| **Web3 Libraries** | Ethers v6, Wagmi v3, RainbowKit v2 | Wallet connection, contract interaction, chain switching |
| **FHE Client SDK** | `@cofhe/sdk ^0.4.0` | Client-side encryption/decryption, `Ethers6Adapter`, `arbSepolia` chain config |
| **Auth Provider** | Privy (`@privy-io/react-auth ^3.19.1`) | Social login + embedded wallet support |
| **Database** | Neon Postgres (serverless) | Hosted on Vercel, pooled via pgbouncer, `neondb` database on `us-east-1` |
| **Keeper Bot** | Node.js + `tsx` | Long-running polling process for async FHE resolution |
| **RPC Infrastructure** | Infura (primary), BlockPi, StackUp (fallback) | Load-balanced multi-RPC transport (`loadBalancedTransport.ts`) |
| **ABI Pipeline** | `hardhat-abi-exporter` | Auto-exports ABI JSON to `frontend/lib/generated-abis/` on compile |
| **Deployment Artifacts** | JSON snapshots | Saved to `deployments/<network>/` with full address + tx hash history |
| **Hosting** | Vercel | Frontend deployment with Neon Postgres integration |
| **Testing** | Hardhat test runner, Chai | Tests in `test/` directory |

---

## 5. Repository Structure

```
CasFin/                              ← Git root
├── README.md                        ← Root README (points to casfin/)
├── cofhesdk-upstream/               ← Vendored CoFHE SDK source (reference/docs)
│   └── ARCHITECTURE.md              ← Comprehensive CoFHE SDK architecture docs
└── casfin/                          ← Main application directory
    ├── contracts/                   ← All Solidity contracts
    │   ├── base/                    ← Base contracts (Ownable, Pausable, ReentrancyGuard, Initializable)
    │   ├── interfaces/              ← All interface definitions (11 files)
    │   ├── libraries/               ← Utility libraries (MathLib, PredictionTypes, Clones, VRFV2PlusClientLib)
    │   ├── mocks/                   ← Mock contracts (MockVRFCoordinatorV2Plus)
    │   ├── casino/                  ← Transparent casino infra (CasinoRandomnessRouter, ChainlinkVRFAdapter)
    │   ├── fhenix/                  ← FHE-encrypted contracts (Vault, CoinFlip, Dice, Crash, Randomness, Predictions)
    │   ├── staking/                 ← StakingPool.sol
    │   ├── token/                   ← CasinoToken.sol (ERC20)
    │   ├── PredictionMarket.sol     ← Main transparent prediction market
    │   ├── MarketFactory.sol        ← Factory deployer for prediction markets
    │   ├── MarketAMM.sol            ← Automated market maker for share pricing
    │   ├── MarketResolver.sol       ← Oracle-driven market resolution
    │   ├── LiquidityPool.sol        ← LP token + liquidity management
    │   ├── FeeDistributor.sol       ← Platform/LP/staking fee routing
    │   └── DisputeRegistry.sol      ← Dispute bonding + settlement
    ├── scripts/                     ← Hardhat deployment scripts (9 files)
    ├── keeper/                      ← FHE keeper bot (fhe-keeper.ts)
    ├── test/                        ← Hardhat tests (4 test files)
    ├── deployments/                 ← Deployment artifacts
    │   └── arbitrumSepolia/         ← 3 deployment snapshots (casino, fhe-casino, full-stack)
    ├── frontend/                    ← Next.js 15 application
    │   ├── app/                     ← App Router pages
    │   │   ├── page.tsx             ← Landing page (cinematic intro video flow)
    │   │   ├── layout.tsx           ← Root layout (providers, navbar, video BG)
    │   │   ├── globals.css          ← Master stylesheet (110KB, the entire design system)
    │   │   ├── casino/page.tsx      ← Casino game floor
    │   │   ├── predictions/page.tsx ← Prediction markets dashboard
    │   │   ├── wallet/page.tsx      ← Wallet management page
    │   │   └── debug/page.tsx       ← Debug/diagnostics page
    │   ├── components/              ← React components (21 files + casino/ subdir)
    │   │   ├── casino/              ← Clean game cards (CoinFlip, Dice, Crash, OutcomeCard)
    │   │   ├── Navbar.tsx           ← Main navigation (glassmorphism)
    │   │   ├── NavbarPrivy.tsx      ← Privy-integrated navbar variant
    │   │   ├── WalletProvider.tsx    ← Main wallet context (30KB, massive state machine)
    │   │   ├── WalletProviderPrivy.tsx ← Privy variant of wallet context
    │   │   ├── PrivyAppProvider.tsx  ← Privy config wrapper
    │   │   ├── ProtocolApp.tsx       ← Full protocol dashboard component
    │   │   ├── VaultCard.tsx         ← Deposit/withdraw/bankroll UI
    │   │   ├── MarketCard.tsx        ← Prediction market trading card
    │   │   ├── PredictionFactory.tsx ← Market creation form
    │   │   ├── PredictionRail.tsx    ← Prediction markets sidebar rail
    │   │   ├── CasinoRail.tsx        ← Casino sidebar rail
    │   │   ├── GlassButton.tsx       ← Glassmorphism button primitive
    │   │   ├── GlassCard.tsx         ← Glassmorphism card primitive
    │   │   ├── GlassInput.tsx        ← Glassmorphism input primitive
    │   │   ├── StatCard.tsx          ← Stat display card
    │   │   ├── StatusBar.tsx         ← Global status bar
    │   │   ├── VideoBackground.tsx   ← Looping cinematic BG video
    │   │   └── ProtocolBits.tsx      ← Misc protocol UI bits
    │   ├── lib/                     ← Client-side libraries
    │   │   ├── casfin-config.ts     ← Centralized config (addresses, chain, RPC, defaults)
    │   │   ├── casfin-client.ts     ← Transparent casino/prediction read/write logic (19KB)
    │   │   ├── casfin-types.ts      ← TypeScript type definitions
    │   │   ├── casfin-abis.ts       ← ABI import barrel
    │   │   ├── fhe-client.ts        ← FHE-specific contract interaction layer
    │   │   ├── fhe-prediction-client.ts ← FHE prediction market client
    │   │   ├── cofhe-provider.tsx   ← React context for CoFHE SDK (encrypt/decrypt)
    │   │   ├── cofhe-runtime.ts     ← TFHE WASM runtime initialization
    │   │   ├── cofhe-utils.ts       ← Encrypted input tuple conversion helpers
    │   │   ├── loadBalancedTransport.ts ← Multi-RPC load balancer with retry/failover
    │   │   └── generated-abis/      ← Auto-generated ABI JSON files (from hardhat compile)
    │   ├── public/                  ← Static assets (videos, images)
    │   └── vercel.json              ← Vercel deployment config
    ├── hardhat.config.ts            ← Hardhat config (dual compiler, ABI exporter, network configs)
    ├── package.json                 ← Root package with all npm scripts
    ├── .env                         ← Root env (RPC URLs, private keys, contract addresses)
    ├── .env.example                 ← Template for root env
    └── README.md                    ← Detailed project documentation
```

---

## 6. Architecture Overview

CasFin has a **three-rail architecture**:

### Rail 1: FHE-Encrypted Casino (Primary Focus)
```
[Player Browser]
    │
    ├── CoFHE SDK encrypts inputs (encAmount, encGuess)
    │   └── TFHE WASM → ZK Proof → Verifier Signature → EncryptedInput struct
    │
    ├── Sends encrypted tx to EncryptedCoinFlip / EncryptedDiceGame / EncryptedCrashGame
    │   └── Contract calls vault.reserveFunds(player, encAmount)
    │       └── Vault performs FHE.gte(), FHE.sub(), FHE.add() on encrypted balances
    │
    ├── Game stores encrypted bet state (lockedHandle, encGuess, outcomeHandle)
    │   └── Randomness generated via GameRandomnessLib (FHE.randomEuint8(), etc.)
    │
    └── [Keeper Bot] (async, polling every 15s)
        ├── Step 1: requestResolution(betId) → computes FHE.eq(guess, outcome), creates decrypt task
        ├── Step 2: (wait ~30s for CoFHE decrypt task to complete)
        └── Step 3: finalizeResolution(betId) → reads decrypted bool, settles via vault.settleBet()
```

### Rail 2: Transparent Prediction Markets
```
[Player Browser]
    │
    ├── MarketFactory.createMarket() → clones PredictionMarket, MarketAMM, LiquidityPool, MarketResolver
    │
    ├── PredictionMarket.buyShares(outcomeIndex) → AMM prices shares, fees distributed
    │
    ├── MarketResolver.resolveMarket(winningOutcome) → after resolvesAt timestamp
    │
    └── PredictionMarket.claim() → pro-rata distribution from finalPayoutPool
```

### Rail 3: Encrypted Prediction Markets
```
Same factory pattern as Rail 2, but using FHE-encrypted versions:
  EncryptedMarketFactory → EncryptedPredictionMarket, EncryptedMarketAMM, 
  EncryptedLiquidityPool, EncryptedMarketResolver, EncryptedEscrow
```

### Cross-Cutting: The Vault Pattern
```
┌─────────────────────────────────────────────┐
│           EncryptedCasinoVault              │
│                                             │
│  balances[player]       → euint128          │
│  lockedBalances[player] → euint128          │
│  pendingWithdrawals[player] → euint128      │
│  authorizedGames[game]  → bool              │
│                                             │
│  depositETH()       → encrypts msg.value    │
│  reserveFunds()     → FHE balance check     │
│  settleBet()        → FHE payout credit     │
│  withdrawETH()      → async decrypt + send  │
│  fundHouseBankroll() → operator top-up      │
│  setMaxBet()        → encrypted cap         │
└─────────────────────────────────────────────┘
         ▲           ▲           ▲
         │           │           │
   EncryptedCoinFlip  EncryptedDice  EncryptedCrash
   (authorized game)  (authorized)   (authorized)
```

---

## 7. Smart Contracts — Deep Dive

### 7.1 FHE Encrypted Casino Contracts

All located in `contracts/fhenix/`. Compiled with Solidity `^0.8.25`.

#### `EncryptedCasinoVault.sol` (241 lines)
- **Purpose:** Unified encrypted balance manager for all FHE casino games.
- **Key State:** `balances[address] → euint128`, `lockedBalances[address] → euint128`, `pendingWithdrawals[address] → PendingWithdrawal`, `authorizedGames[address] → bool`.
- **Deposit Flow:** `depositETH()` → converts `msg.value` to `FHE.asEuint128(msg.value)` → `FHE.add(currentBalance, encDeposit)`.
- **Reserve Flow:** `reserveFunds(player, encAmount)` → checks `FHE.gte(balance, amount)` AND `FHE.lte(amount, maxBet)` → `FHE.select(canReserve, amount, ZERO)` → deducts from balance, adds to locked.
- **Settlement Flow:** `settleBet(player, lockedHandle, returnHandle)` → verifies lock validity → `FHE.sub(locked, releasedLock)` → `FHE.add(balance, creditedReturn)`.
- **Withdrawal Flow:** `withdrawETH(InEuint128)` → 2-phase: first call queues encrypted amount + requests CoFHE decrypt task; second call (after decrypt ready) reads plaintext via `FHE.getDecryptResultSafe()` and sends ETH.
- **Access Control:** `onlyGame` modifier — only `authorizedGames[msg.sender]` can call `reserveFunds` and `settleBet`.
- **FHE Constants:** `ENCRYPTED_ZERO`, `ENCRYPTED_MAX_BET` — pre-computed and stored with `FHE.allowThis()`.

#### `EncryptedCoinFlip.sol` (187 lines)
- **Game Logic:** Player submits encrypted bool guess (heads/tails) + encrypted bet amount.
- **Randomness:** `GameRandomnessLib.randomCoinFlip()` → `FHE.randomEuint8()` masked to 1 bit → `FHE.asEbool()`.
- **Payout:** 2× gross before house edge. Applied via `FHE.mul(locked, ENCRYPTED_TWO)` → `_applyHouseEdge()`.
- **Resolution:** 3-step async: `placeBet()` → `requestResolution()` (compares guess vs outcome via `FHE.eq`, requests decrypt) → `finalizeResolution()` (reads decrypted win flag, settles with vault).
- **House Edge:** Configurable BPS (currently 200 = 2%). Applied entirely in FHE domain.

#### `EncryptedDiceGame.sol` (206 lines)
- **Game Logic:** Player submits encrypted uint8 guess (1–6) + encrypted bet amount.
- **Range Validation:** Guess range [1,6] enforced homomorphically via `FHE.gte(guess, 1)` AND `FHE.lte(guess, 6)`, with `FHE.select` auto-correcting invalid to 1.
- **Randomness:** `GameRandomnessLib.randomDiceRoll()` → `FHE.randomEuint8()` mod 6 + 1.
- **Payout:** 6× gross before house edge.
- **Resolution:** Same 3-step pattern as CoinFlip. Also decrypts `rolledHandle` for event logging.

#### `EncryptedCrashGame.sol` (228 lines)
- **Game Logic:** Round-based. Operator starts rounds, players join with encrypted bet + plaintext cash-out multiplier (in BPS, min 1.1×).
- **Crash Multiplier:** `GameRandomnessLib.randomCrashMultiplierBps()` — sophisticated encrypted random: 4% instant crash (1.0×), otherwise random between 1.0× and ~10× in 100bps increments.
- **Resolution:** 4-step: `startRound()` → `placeBet()` → `closeRound()` (generates encrypted crash multiplier, requests decrypt) → `finalizeRound()` (reads decrypted crash point) → `settleBet(roundId, player)` (compares cashOut vs crash, settles with vault).
- **Win Condition:** `bet.cashOutMultiplierBps < round.crashMultiplierBps` — plaintext comparison since crash multiplier is now public after round closes.

#### `GameRandomness.sol` (413 lines)
- **Library (`GameRandomnessLib`):** Pure FHE randomness generators:
  - `randomCoinFlip()` → `ebool` (masked bit from `FHE.randomEuint8()`)
  - `randomDiceRoll()` → `euint8` [1,6]
  - `randomCardIndex()` → `euint8` [0,51]
  - `randomStatRoll()` → `euint8` [1,20] (RPG d20)
  - `randomLootTier()` → `euint8` [0,4] (weighted rarity: 60% common, 25% uncommon, 10% rare, 4% epic, 1% legendary)
  - `randomBoardTile()` → `euint8` [0,3]
  - `randomWinnerIndex(playerCount)` → `euint32`
  - `randomCrashMultiplierBps()` → `euint32` (crash game multiplier with 4% instant crash)
- **Contract (`GameRandomness`):** Stateful wrapper — stores per-player last rolls, card draws, stats, loot, and boards. Provides higher-level functions: `rollDice()`, `flipCoin()`, `drawCard()`, `generateStats()`, `rollLoot()`, `generateBoard(size)`, `pickWinner(players[])` with async reveal flow.

#### `IEncryptedCasinoVault.sol` (interface)
- Exposes `reserveFunds()` and `settleBet()` for game contracts.

### 7.2 Transparent Prediction Market Contracts

Located in `contracts/` root. Compiled with Solidity `^0.8.24`.

#### `MarketFactory.sol` (245 lines)
- **Pattern:** Minimal proxy (EIP-1167 Clones) — deploys cheap copies of implementation contracts.
- **Deployment:** `createMarket(params)` → clones `MarketAMM`, `LiquidityPool`, `PredictionMarket`, `MarketResolver` → initializes each → binds together → seeds initial liquidity.
- **Governance:** `approvedCreators` whitelist, configurable `feeConfig` (platform + LP + resolver fees, max total 10%), `treasury` address, dispute bond settings.
- **Implementations:** 6 immutable implementation addresses set at construction.

#### `PredictionMarket.sol` (267 lines)
- **Lifecycle:** Created (trading open) → Resolved (by resolver after `resolvesAt`) → Finalized (after dispute window) → Claims open.
- **Trading:** `buyShares(outcomeIndex, minSharesOut)` — ETH-collateralized, with platform + LP fee deductions, AMM-priced share minting. `sell(outcomeIndex, sharesIn)` — burns shares, returns ETH minus fees.
- **Resolution:** `resolveMarket(resolvedOutcome)` — only by bound resolver, only after `resolvesAt`.
- **Claims:** `claim()` — pro-rata payout from `finalPayoutPool` based on winning outcome shares.
- **Disputes:** `markDisputed()` / `settleDispute(finalOutcome)` — by dispute registry.

#### `MarketAMM.sol` (~ 3KB)
- CPMM-style AMM for share pricing with configurable spread and virtual liquidity floor.

#### `LiquidityPool.sol` (~ 5.4KB)
- LP token (ERC20-like), `seedLiquidity()`, `accrueTraderFee()`, LP share accounting.

#### `MarketResolver.sol` (~ 3.5KB)
- Supports manual and oracle-driven resolution. Stores `oracleType`, `oracleAddress`, `oracleParams`, `feeRecipient`.

#### `FeeDistributor.sol` (~ 2.7KB)
- Routes platform fees to treasury and optionally to staking pool. Routes resolver fees to resolver's fee recipient.

#### `DisputeRegistry.sol` (~ 2.7KB)
- Dispute bonding mechanism. Challengers can dispute with a bond. Factory owner settles disputes.

### 7.3 Encrypted Prediction Market Contracts

Located in `contracts/fhenix/`. Parallel FHE-encrypted versions:

| Contract | Lines | Purpose |
|---|---|---|
| `EncryptedMarketFactory.sol` | ~245 | Same factory pattern but clones encrypted variants |
| `EncryptedPredictionMarket.sol` | ~340 | Prediction market with encrypted positions + async claim via FHE decrypt |
| `EncryptedMarketAMM.sol` | ~120 | AMM with encrypted share calculations |
| `EncryptedLiquidityPool.sol` | ~100 | LP pool with encrypted accounting |
| `EncryptedMarketResolver.sol` | ~140 | Resolution with encrypted outcome handling |
| `EncryptedEscrow.sol` | ~120 | Encrypted escrow for prediction market collateral |

### 7.4 Shared Infrastructure Contracts

| Contract | Location | Purpose |
|---|---|---|
| `CasinoToken.sol` | `contracts/token/` | ERC20 governance token. Mintable by owner. Initial supply: 10M. |
| `StakingPool.sol` | `contracts/staking/` | Stake CasinoToken, earn share of platform fees. |
| `CasinoRandomnessRouter.sol` | `contracts/casino/` | Routes randomness requests (legacy transparent casino). |
| `ChainlinkVRFAdapter.sol` | `contracts/casino/` | Chainlink VRF v2+ integration for transparent randomness. |

### 7.5 Base & Library Contracts

| Contract | Purpose |
|---|---|
| `base/Ownable.sol` | `_initializeOwner()` + `onlyOwner` modifier |
| `base/Pausable.sol` | `_pause()` / `_unpause()` + `whenNotPaused` |
| `base/ReentrancyGuard.sol` | Standard reentrancy lock |
| `base/Initializable.sol` | `initializer` modifier for cloned contracts |
| `libraries/MathLib.sol` | `mulDiv()`, `BPS_DENOMINATOR` (10000) |
| `libraries/PredictionTypes.sol` | `FeeConfig` struct, `OracleType` enum, `CreateMarketParams` struct |
| `libraries/Clones.sol` | EIP-1167 minimal proxy factory |
| `libraries/VRFV2PlusClientLib.sol` | Chainlink VRF v2+ request encoding |

---

## 8. Fhenix & CoFHE Integration

### What is Fhenix/CoFHE?

Fhenix is a blockchain protocol that brings **Fully Homomorphic Encryption (FHE)** to EVM chains. It allows smart contracts to perform computations over encrypted data without decrypting it. CoFHE is the client-side SDK that handles encryption/decryption.

### Does CoFHE Replace Oracles?

**For casino randomness: YES — no oracle needed.**
Fhenix has native on-chain randomness (`FHE.randomEuint8()`, `FHE.randomEuint32()`, etc.) built into `FHE.sol`. This fully replaces Chainlink VRF for all casino games (CoinFlip, Dice, Crash). The random values are generated inside the FHE runtime and are already encrypted — nobody can observe or front-run them.

**For decryption: NOT an oracle — it's the Threshold Network.**
Decryption in CoFHE is handled by Fhenix's own internal **Threshold Network** (MPC-based, distributed key shares). The flow is:
1. Contract calls `FHE.allowPublic(ctHash)` to authorize public decryption.
2. Client SDK calls `decryptForTx(ctHash).withoutPermit().execute()` off-chain → gets `(plaintextValue, signature)`.
3. Client (or keeper) submits `FHE.publishDecryptResult(ctHash, plaintext, signature)` on-chain.
4. Contract verifies the Threshold Network's ECDSA signature — no trust required.

**For real-world price data (prediction markets): YES — external oracle still needed.**
CoFHE cannot fetch off-chain data. It only computes over on-chain encrypted state. To resolve a bet like "Will ETH exceed $3000?", you need an external price source.

### How CasFin Uses It

#### Encrypted Types Used
- `euint128` — Encrypted 128-bit unsigned integer (balances, bet amounts, payouts)
- `euint32` — Encrypted 32-bit unsigned integer (crash multipliers)
- `euint8` — Encrypted 8-bit unsigned integer (dice rolls, guesses, card indices)
- `ebool` — Encrypted boolean (coin flip outcomes, win flags)

#### FHE Operations Used
| Operation | Purpose |
|---|---|
| `FHE.asEuint128(plaintext)` | Convert plaintext → encrypted |
| `FHE.add(a, b)` | Encrypted addition (deposit, payout) |
| `FHE.sub(a, b)` | Encrypted subtraction (reserve, deduct) |
| `FHE.mul(a, b)` | Encrypted multiplication (payout multiplier) |
| `FHE.div(a, b)` | Encrypted division (house edge BPS) |
| `FHE.rem(a, b)` | Encrypted modulo (randomness bounding) |
| `FHE.eq(a, b)` | Encrypted equality (win check) |
| `FHE.gte(a, b)` | Encrypted ≥ (balance sufficiency) |
| `FHE.lte(a, b)` | Encrypted ≤ (max bet check) |
| `FHE.lt(a, b)` | Encrypted < (loot tier thresholds) |
| `FHE.and(a, b)` | Encrypted AND (multi-condition checks) |
| `FHE.select(cond, a, b)` | Encrypted ternary (branchless payout) |
| `FHE.asEbool(value)` | Convert to encrypted bool |
| `FHE.asEuint8(value)` | Convert to encrypted uint8 |
| `FHE.randomEuint8()` | On-chain encrypted randomness (8-bit) |
| `FHE.randomEuint32()` | On-chain encrypted randomness (32-bit) |
| `FHE.allowThis(handle)` | Grant contract access to handle |
| `FHE.allow(handle, addr)` | Grant address access to handle |
| `FHE.allowSender(handle)` | Grant msg.sender access to handle |
| `FHE.getDecryptResultSafe(handle)` | Read async decryption result |

#### The `FHE.allow()` Pattern (Critical!)
Every encrypted value has an **access control list**. If a contract or address needs to use an encrypted handle later, it MUST call `FHE.allowThis()` (for the contract itself) or `FHE.allow(handle, address)` (for another address). Forgetting this causes silent failures where FHE operations return zero or revert.

#### Async Decryption Flow
1. Contract calls `ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(uint256(handle), address(this))`.
2. The CoFHE Threshold Network processes the decryption off-chain.
3. After ~15-30 seconds, the result is available via `FHE.getDecryptResultSafe(handle)`.
4. Returns `(plaintextValue, bool ready)` — must check `ready == true` or revert.

#### Client-Side CoFHE SDK Integration
```
CofheProvider (React Context)
  ├── createCofheConfig({ supportedChains: [arbSepolia], useWorkers: false })
  ├── createCofheClient(config)
  ├── connect(ethersProvider, ethersSigner) → Ethers6Adapter
  ├── ensureSessionReady() → initializeTfheRuntime() → warmup encrypt
  ├── encryptUint128(value) → Encryptable.uint128(BigInt) → execute()
  ├── encryptUint8(value) → Encryptable.uint8(BigInt) → execute()
  ├── encryptBool(value) → Encryptable.bool(Boolean) → execute()
  └── decryptForView(ctHash, fheType) → getOrCreateSelfPermit() → execute()
```

---

## 9. Frontend — Deep Dive

### 9.1 Pages & Routing

| Route | File | Description |
|---|---|---|
| `/` | `app/page.tsx` | Landing page — cinematic intro video, skip button, then "Enter Casino" / "Predictions" buttons |
| `/casino` | `app/casino/page.tsx` | Casino game floor — tab switcher (Coin Flip / Dice / Crash), vault sidebar, status panel |
| `/predictions` | `app/predictions/page.tsx` | Prediction markets — stats strip, market factory, live market cards |
| `/wallet` | `app/wallet/page.tsx` | Wallet management, token info |
| `/debug` | `app/debug/page.tsx` | Diagnostics & developer tools |

### 9.2 Components

**Core UI Primitives:**
- `GlassButton` — Glassmorphism-styled button with variant support
- `GlassCard` — Semi-transparent card with backdrop blur, eyebrow text, staggered animation
- `GlassInput` — Matching glassmorphism input field
- `StatCard` — Metric display card (label + value)
- `StatusBar` — Global status indicator bar
- `VideoBackground` — Full-viewport looping deep-space video

**Casino Components:**
- `CleanCoinFlipCard` — FHE coin flip interface (encrypt guess, place bet, show result)
- `CleanDiceCard` — FHE dice game interface (encrypted guess 1-6, 6× payout)
- `CleanCrashCard` — FHE crash game interface (round lifecycle, cash-out multiplier)
- `CasinoOutcomeCard` — Game result display card
- `VaultCard` — Deposit/withdraw/bankroll interface for the encrypted vault

**Prediction Components:**
- `PredictionFactory` — Market creation form (question, description, outcomes, resolve date, liquidity)
- `MarketCard` — Full market trading card (buy/sell shares, prices, resolution, claims)

**Provider Components:**
- `WalletProvider` — 30KB context providing: connection state, chain management, protocol state loading, transaction execution, error handling. Merges both transparent and FHE state.
- `WalletProviderPrivy` — Privy-specific variant of wallet provider
- `PrivyAppProvider` — Privy SDK configuration and initialization
- `NavbarPrivy` — Navigation bar with Privy wallet integration
- `CofheProvider` — CoFHE SDK React context (see §8)

### 9.3 Client Libraries

| File | Size | Responsibility |
|---|---|---|
| `casfin-config.ts` | 2.9KB | Centralized config: chain ID, RPC URLs, contract addresses (all from env vars), prediction defaults |
| `casfin-client.ts` | 19KB | All transparent contract read/write functions: `loadCasinoState()`, `loadPredictionState()`, `depositEth()`, `withdrawEth()`, `placeCoinFlipBet()`, `placeDiceBet()`, `buyShares()`, `sell()`, `createMarket()`, etc. |
| `casfin-types.ts` | 7.3KB | Type definitions for casino state, prediction state, market data, fee configs |
| `fhe-client.ts` | 8.2KB | FHE-specific read/write: `loadFheState()`, `placeFheCoinFlipBet()`, `placeFheDiceBet()`, `requestFheResolution()`, `finalizeFheResolution()`, `getFheVaultBalance()` |
| `fhe-prediction-client.ts` | 5.5KB | FHE prediction market: encrypted position taking, claim winnings |
| `cofhe-provider.tsx` | 7KB | React context for CoFHE SDK |
| `cofhe-runtime.ts` | 1.1KB | TFHE WASM initialization helper |
| `cofhe-utils.ts` | 1.7KB | `toEncryptedInputTuple()` / `toEncryptedInputTuples()` — converts SDK output to contract-ready structs |
| `loadBalancedTransport.ts` | 12KB | Multi-RPC provider with round-robin, retry, failover, rate-limit detection |

### 9.4 The CoFHE React Provider

The `CofheProvider` wraps the entire app and manages:
1. **Client lifecycle:** Creates `CofheClient` on mount, initializes TFHE WASM runtime.
2. **Connection:** `connect(ethersProvider, ethersSigner)` — adapts ethers v6 to CoFHE's client format.
3. **Session warmup:** `ensureSessionReady()` — performs a trial encryption to warm the TFHE runtime. Sets `sessionReady = true` when done.
4. **Encryption:** `encryptUint128()`, `encryptUint8()`, `encryptBool()`, `encryptMultiple()` — each calls `ensureSessionReady()` first, then uses `Encryptable.*` + `execute()`.
5. **Decryption:** `decryptForView(ctHash, fheType)` — gets permit, calls SDK decrypt.

**Important:** Workers are disabled (`useWorkers: false`) because the TFHE WASM runtime has compatibility issues with Web Workers in the current CoFHE SDK version.

### 9.5 The WalletProvider Context

The massive `WalletProvider.tsx` (30KB) is the brain of the frontend. It provides:

- **Connection State:** `account`, `isConnected`, `isCorrectChain`, `walletBlocked`
- **Protocol State:** `casinoState` (vault balance, game states, crash rounds), `predictionState` (markets, fees, creator approval)
- **Actions:** `connectWallet()`, `ensureTargetNetwork()`, `loadProtocolState()`, `runTransaction()`
- **FHE Integration:** Merges FHE state from `fhe-client.ts` with transparent state from `casfin-client.ts`. Uses `useCofhe()` internally for encryption.
- **Transaction Pipeline:** `runTransaction(label, fn)` — wraps tx execution with pending state, error handling, auto-refresh.
- **Operator Detection:** `isOperator` — checks if connected wallet matches `CASFIN_CONFIG.operatorAddress`.

---

## 10. Keeper Bot Infrastructure

The keeper has **two implementations**:

### 10.1 Local Keeper — `keeper/index.ts` (866 lines)

A long-running Node.js process. Polls every 5 seconds (`KEEPER_POLL_MS`). Used for local development.

```bash
npx tsx keeper/index.ts    # from casfin/ root
```

**Features:**
- Polls CoinFlip/Dice/Crash/Prediction Markets
- `requestResolution()` → waits for CoFHE decrypt (~15-30s) → `finalizeResolution()`
- Publishes bet resolution events to Redis `casfin:bets` channel (fire-and-forget)
- Redis publisher uses `ioredis` (TCP, persistent connection required for pub/sub)
- Graceful shutdown on SIGINT/SIGTERM — closes Redis publisher

### 10.2 Lambda Keeper — `keeper/lambda/` (deployed on AWS)

AWS Lambda function triggered by EventBridge at `rate(1 minute)`. Serverless, $0 cost.

**Key files:**
- `keeper/lambda/keeper-logic.ts` — core tick logic (no `tx.wait()`, fire-and-forget txs)
- `keeper/lambda/handler.ts` — Lambda entry point
- `keeper/lambda/serverless.yml` — Serverless Framework config
- `keeper/lambda/abis/` — copy of ABI JSON files from `frontend/lib/generated-abis/`

**Lambda configuration:**
- Timeout: 300s, Memory: 512MB
- RPC failover: tries 3 Infura keys in order, picks first that responds
- Hard deadline: 250s — defers remaining bets to next invocation if exceeded
- No `tx.wait()` — submits transactions fire-and-forget, next invocation picks up continuation

**Deploy/manage:**
```bash
cd keeper/lambda
npm install
npx serverless deploy              # deploy/update Lambda
aws logs tail /aws/lambda/casfin-keeper-dev-keeperTick --region us-east-1 --since 10m --format short
```

### 10.3 Redis Pub/Sub Pipeline (Wave 3)

After the keeper resolves a bet, it publishes a real-time event to eliminate the 45s polling latency:

```
Keeper resolves bet
  → redisPublisher.publish("casfin:bets", JSON.stringify({game, betId, player, action:"resolved", timestamp}))
  → SSE endpoint /api/events/bets subscribes to Redis channel
  → Browser EventSource receives event
  → useBetEvents() hook triggers loadProtocolState()
  → UI updates instantly (< 1 second)
```

**Files:**
- `frontend/lib/redis.ts` — Redis client factory (ioredis singleton)
- `frontend/app/api/events/bets/route.ts` — SSE streaming endpoint
- `frontend/lib/useBetEvents.ts` — React hook (auto-reconnect with exponential backoff)
- `frontend/components/WalletProviderPrivy.tsx` — wires `useBetEvents` to `loadProtocolState()`

**Redis instance:** Upstash (free tier), region ap-south-1
- URL format: `rediss://default:TOKEN@known-toucan-94286.upstash.io:6379`
- Env var: `REDIS_URL` in both `casfin/.env` and `frontend/.env.local`

**Important:** The 45-second polling interval is kept as a backup. Redis events are additive — they trigger instant refreshes on top of the existing polling cycle.

### 10.4 Keeper Environment Variables

| Variable | Used By | Purpose |
|---|---|---|
| `KEEPER_POLL_MS` | Local | Polling interval (default: 5000ms) |
| `KEEPER_PREDICTION_POLL_MS` | Local | Prediction polling interval (default: 5000ms) |
| `PRIVATE_KEY` | Local + Lambda | Keeper signer wallet |
| `ARBITRUM_SEPOLIA_RPC_URL` | Local | Primary RPC URL |
| `KEEPER_RPC_URL_1/2/3` | Lambda | Failover RPC pool |
| `ENCRYPTED_COIN_FLIP_ADDRESS` | Lambda | CoinFlip contract (must match frontend!) |
| `ENCRYPTED_DICE_GAME_ADDRESS` | Lambda | Dice contract (must match frontend!) |
| `ENCRYPTED_CRASH_GAME_ADDRESS` | Lambda | Crash contract (must match frontend!) |
| `ENCRYPTED_PREDICTION_FACTORY_ADDRESS` | Lambda | Market factory |
| `REDIS_URL` | Local | Redis pub/sub publisher URL |

**Critical:** Without the keeper running, all FHE bets sit in "pending" indefinitely. The keeper is required for the casino to function.

---

## 11. Deployment & DevOps

### NPM Scripts

| Script | Command | Purpose |
|---|---|---|
| `compile` | `hardhat compile` | Compile contracts + auto-export ABIs to frontend |
| `test` | `hardhat test` | Run Hardhat test suite |
| `deploy:casino` | Deploys transparent casino stage | CasinoRandomnessRouter, VRFAdapter, etc. |
| `deploy:prediction` | Deploys transparent prediction stage | MarketFactory + all implementations |
| `deploy:all` | Deploys both stages | Combined deployment |
| `deploy:full` | `deployFullStack.ts` | **Full encrypted stack:** Vault + 3 FHE games + encrypted predictions + token + staking |
| `redeploy:fhe-games` | `redeployFheGames.ts` | Redeploy only game contracts (reuse existing vault) |
| `authorize:games` | `authorizeGames.ts` | Fix `NOT_AUTHORIZED_GAME` errors by re-authorizing games on vault |
| `keeper:start` | `tsx keeper/fhe-keeper.ts` | Start the FHE keeper bot |
| `frontend:dev` | `next dev` | Start frontend dev server |
| `frontend:build` | `next build` | Production build |

### Deployment Flow (Full Stack)

1. Deploy `EncryptedCasinoVault(deployer)`.
2. Deploy `EncryptedCoinFlip(deployer, vault, 200)` — 2% house edge.
3. Deploy `EncryptedDiceGame(deployer, vault, 200)`.
4. Deploy `EncryptedCrashGame(deployer, vault, 200, 100000)` — 2% edge, max 10× cashout.
5. Authorize all 3 games on vault: `vault.authorizeGame(game, true)`.
6. Set deployer as resolver on all games: `game.setResolver(deployer, true)`.
7. Deploy 6 prediction implementation contracts.
8. Deploy `EncryptedMarketFactory(...)` with all implementations.
9. Deploy `CasinoToken` + `StakingPool`.
10. Verify all on Etherscan.
11. Write deployment JSON to `deployments/<network>/full-stack.json`.

---

## 12. Deployed Contract Addresses (Arbitrum Sepolia)

> ⚠️ **CANONICAL SOURCE:** `frontend/.env.local` — these are the addresses the live frontend uses. The root `casfin/.env` contains DIFFERENT (older) addresses for the same contract names. Always use the frontend addresses when targeting live bets.

| Contract | Address | Source |
|---|---|---|
| **EncryptedCasinoVault** | `0xDe635798122487CF0a61512D2D7229D28436d9f8` | `frontend/.env.local` |
| **EncryptedCoinFlip** | `0x2a43F77A2286ffC3ebfb5D577123CB7cEf8553Af` | `frontend/.env.local` |
| **EncryptedDiceGame** | `0x7D7A8f22727CB618f5C96eCA151C48Bc0aa3D563` | `frontend/.env.local` |
| **EncryptedCrashGame** | `0x6465C2f5F5c9B2F7F05dC6E6D799514D6F1d214D` | `frontend/.env.local` |
| **GameRandomness Router** | `0xA35D1C633D6E4178dD3DCE567ddb76d6C341f111` | `casfin/.env` |
| **EncryptedMarketFactory** | `0xC876De943508B4938d3d8f010cc97dbac7Ab0B43` | `frontend/.env.local` |
| **FeeDistributor** | `0xFDD1E5A48739831DbF655338DE5996D283a79295` | `frontend/.env.local` |
| **DisputeRegistry** | `0x5c15ABfe97bAF24540fbc13d9a9d35d052C655db` | `frontend/.env.local` |
| **CasinoToken** | `0x64982D01A94298FD5b8294A30DAaB6Fdad2d3203` | `frontend/.env.local` |
| **StakingPool** | `0x2E42d445FdA2644cb7Da85572Ce77D03019a4fcB` | `frontend/.env.local` |
| **Operator/Keeper Wallet** | `0x6b3a924379B9408D8110f10F084ca809863B378A` | `casfin/.env DEPLOYER_ADDRESS` |

**Network:** Arbitrum Sepolia (`421614` / `0x66eee`)
**Explorer:** `https://sepolia.arbiscan.io`

> ⚠️ **Address Mismatch Warning:** `casfin/.env` has `ENCRYPTED_COIN_FLIP_ADDRESS=0x9c0F6a4...`, `ENCRYPTED_DICE_GAME_ADDRESS=0xAc90DF4...`, etc. These are DIFFERENT from the frontend addresses. The Lambda keeper uses `serverless.yml` hardcoded defaults which match the FRONTEND addresses. Always verify which address set you are targeting.

---

## 13. The "Midnight Nebula" Design System

The frontend uses a premium dark-mode-first design system called **Midnight Nebula**, defined entirely in `globals.css` (110KB):

### Core Aesthetic
- **Cinematic Video Background:** Full-viewport looping deep-space video (`/videos/casfin-landing-loop.mp4`) plays behind the entire application.
- **Glassmorphism:** All cards, panels, and navigation use `rgba(...)` semi-transparent backgrounds with `backdrop-filter: blur(18px)`, allowing the video to bleed through.
- **Color Palette:** Deep purples (`hsl(265, ...)`) and violets as primary, electric cyan accents, warm gold for highlights.
- **Typography:** Inter (Google Fonts) — clean, modern sans-serif.
- **Animations:** Staggered fade-in/slide-up entrance animations, hover glow effects, pulse rings.

### Key Visual Elements
- **FHE Visualizer:** Animated lock icon with pulsing concentric rings (`fhe-pulse-ring ring-1`, `ring-2`) representing the Fhenix encryption engine.
- **Landing Intro:** Optional intro video (`/videos/casfin-intro.mp4`) with skip button, followed by fade transition to "Enter Casino" / "Predictions" CTAs.
- **Stat Grid:** Horizontal strip of glassmorphism stat cards (TVL, balance, crash ceiling, etc.).
- **Tab Switcher:** Horizontally scrollable game tabs (Coin Flip / Dice / Crash).
- **Glass Primitives:** `GlassButton`, `GlassCard`, `GlassInput` — reusable atomic components.

### CSS Architecture
- No CSS framework (no Tailwind) — all vanilla CSS with CSS custom properties.
- Class-based component styling matching React component names.
- Responsive design with media queries.
- CSS animations for entrance effects, pulses, and transitions.

---

## 14. Environment Variables Reference

### Root `.env` (Hardhat & Keeper)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PRIVATE_KEY` | Yes | — | Deployer/keeper wallet private key |
| `FHENIX_PRIVATE_KEY` | No | Falls back to `PRIVATE_KEY` | Separate key for Fhenix transactions |
| `ARBITRUM_SEPOLIA_RPC_URL` | Yes | Public Arbitrum RPC | Hardhat network RPC |
| `FHENIX_RPC_URL` | No | `https://api.helium.fhenix.zone` | Fhenix Helium RPC |
| `KEEPER_POLL_MS` | No | `15000` | Keeper polling interval |
| `KEEPER_RESOLUTION_DELAY_MS` | No | `30000` | Delay before finalization attempts |
| `KEEPER_CRASH_PLAYERS` | No | `""` | Comma-separated player addresses for auto crash settlement |
| `ENCRYPTED_MARKET_ADDRESSES` | No | `""` | Extra prediction market addresses for keeper |
| `ENCRYPTED_COIN_FLIP_ADDRESS` | No | — | Override for keeper contract binding |
| `ENCRYPTED_DICE_GAME_ADDRESS` | No | — | Override for keeper contract binding |
| `ENCRYPTED_CRASH_GAME_ADDRESS` | No | — | Override for keeper contract binding |
| `ENCRYPTED_PREDICTION_FACTORY_ADDRESS` | No | — | Override for keeper factory binding |
| `DATABASE_URL` | No | — | Neon Postgres pooled connection string (pgbouncer) |
| `DATABASE_URL_UNPOOLED` | No | — | Neon Postgres direct connection (for migrations) |
| `PGHOST` | No | — | Neon Postgres hostname (pooled) |
| `PGUSER` | No | — | Neon Postgres username (`neondb_owner`) |
| `PGDATABASE` | No | — | Neon Postgres database name (`neondb`) |
| `PGPASSWORD` | No | — | Neon Postgres password |

### Vercel-Injected Database Variables

These are auto-injected by Vercel when Neon Postgres is connected to the project:

| Variable | Purpose |
|---|---|
| `POSTGRES_URL` | Pooled connection string (recommended for most uses) |
| `POSTGRES_URL_NON_POOLING` | Direct connection (for schema migrations) |
| `POSTGRES_USER` | Database user (`neondb_owner`) |
| `POSTGRES_HOST` | Pooled hostname |
| `POSTGRES_PASSWORD` | Database password |
| `POSTGRES_DATABASE` | Database name (`neondb`) |
| `POSTGRES_URL_NO_SSL` | Connection string without SSL (local dev only) |
| `POSTGRES_PRISMA_URL` | Connection string optimized for Prisma ORM |

### Frontend `.env.local`

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL_{1-4}` | Yes | Load-balanced Arbitrum Sepolia RPC endpoints |
| `NEXT_PUBLIC_READ_RPC_URL` | Yes | Dedicated read-only RPC |
| `NEXT_PUBLIC_FHE_RPC_URL` | Yes | RPC for FHE contract reads |
| `NEXT_PUBLIC_WALLET_RPC_URL` | Yes | RPC for wallet transactions |
| `NEXT_PUBLIC_POLLING_RPC_URL` | Yes | RPC for state polling |
| `NEXT_PUBLIC_CHAIN_ID` | Yes | Chain ID (`421614`) |
| `NEXT_PUBLIC_OPERATOR_ADDRESS` | Yes | Operator wallet address |
| `NEXT_PUBLIC_FHE_VAULT_ADDRESS` | Yes | Deployed vault address |
| `NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS` | Yes | Deployed CoinFlip address |
| `NEXT_PUBLIC_FHE_DICE_ADDRESS` | Yes | Deployed Dice address |
| `NEXT_PUBLIC_FHE_CRASH_ADDRESS` | Yes | Deployed Crash address |
| `NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS` | Yes | Deployed MarketFactory address |
| `NEXT_PUBLIC_CASINO_TOKEN_ADDRESS` | No | CasinoToken address |
| `NEXT_PUBLIC_STAKING_POOL_ADDRESS` | No | StakingPool address |
| `NEXT_PUBLIC_FEE_DISTRIBUTOR_ADDRESS` | No | FeeDistributor clone address |
| `NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS` | No | DisputeRegistry clone address |

---

## 15. Development Workflow

### First-Time Setup
```bash
cd casfin
npm install                        # Install root dependencies (Hardhat, ethers, etc.)
npm --prefix frontend install      # Install frontend dependencies (Next.js, CoFHE SDK, etc.)
cp .env.example .env               # Create env file, fill in PRIVATE_KEY and RPC URLs
cp frontend/.env.local.example frontend/.env.local  # Create frontend env, fill in addresses
npm run compile                    # Compile contracts → auto-exports ABIs to frontend
```

### Daily Development (2 terminals)
```bash
# Terminal 1: Frontend
npm run frontend:dev               # http://localhost:3000

# Terminal 2: Keeper (required for FHE game resolution!)
npm run keeper:start
```

### Deployment
```bash
# Full stack (vault + games + predictions + token + staking)
npm run deploy:full

# Just casino games
npm run deploy:casino

# Just prediction markets
npm run deploy:prediction

# Fix authorization errors
npm run authorize:games

# Redeploy only FHE game contracts (reuse existing vault)
npm run redeploy:fhe-games
```

### After Redeployment
1. Update contract addresses in `frontend/.env.local`.
2. Update contract addresses in root `.env` (for keeper).
3. Restart both frontend and keeper.
4. If getting `NOT_AUTHORIZED_GAME`, run `npm run authorize:games`.

---

## 16. Test Suite

Located in `test/`. Run with `npm test`.

| Test File | Coverage |
|---|---|
| `CasinoGames.ts` | Transparent casino game logic |
| `PredictionMarket.ts` | Full prediction market lifecycle |
| `TokenAndStaking.ts` | CasinoToken minting, StakingPool staking/unstaking |
| `VRFAdapter.ts` | Chainlink VRF adapter integration |

**Note:** FHE contracts cannot be tested on a standard Hardhat network because they require the Fhenix/CoFHE runtime. They are tested via manual deployment to Arbitrum Sepolia.

---

## 17. Progress Tracker — What's Built

### ✅ Completed

| Feature | Status | Details |
|---|---|---|
| **EncryptedCasinoVault** | ✅ Deployed | Full FHE balance management, deposit/withdraw/reserve/settle |
| **EncryptedCoinFlip** | ✅ Deployed | 2× payout, encrypted guess, async 3-step resolution |
| **EncryptedDiceGame** | ✅ Deployed | 6× payout, encrypted guess 1-6, range validation |
| **EncryptedCrashGame** | ✅ Deployed | Round-based, encrypted crash multiplier, configurable max cashout |
| **GameRandomness Library** | ✅ Deployed | 8 randomness primitives (coin, dice, card, stats, loot, board, winner, crash) |
| **Transparent PredictionMarket** | ✅ Deployed | Full lifecycle: create → trade → resolve → claim |
| **MarketFactory** | ✅ Deployed | Clone-based deployment with fee config and creator whitelist |
| **MarketAMM** | ✅ Deployed | CPMM share pricing with spread and virtual liquidity |
| **LiquidityPool** | ✅ Deployed | LP token, seed liquidity, fee accrual |
| **MarketResolver** | ✅ Deployed | Manual + oracle resolution support |
| **FeeDistributor** | ✅ Deployed | Platform fee → treasury, resolver fee → fee recipient |
| **DisputeRegistry** | ✅ Deployed | Dispute bonding and admin settlement |
| **CasinoToken** | ✅ Deployed | ERC20, 10M initial supply |
| **StakingPool** | ✅ Deployed | Stake CasinoToken, earn fee share |
| **Encrypted Prediction Markets** | ✅ Deployed | Full encrypted prediction suite (Factory, Market, AMM, LP, Resolver, Escrow) |
| **Local FHE Keeper** | ✅ Built | `keeper/index.ts` — polling every 5s, full resolution pipeline |
| **AWS Lambda Keeper** | ✅ Deployed | `keeper/lambda/` on EventBridge rate(1 min), 300s timeout, 3-RPC failover |
| **Redis Pub/Sub Pipeline** | ✅ Built | Keeper → Redis `casfin:bets` → SSE `/api/events/bets` → `useBetEvents` hook → instant UI refresh |
| **Frontend Landing Page** | ✅ Complete | Cinematic intro video → fade → CTA buttons |
| **Frontend Casino Page** | ✅ Complete | Tab-based game selection, vault sidebar, stat strip, Fhenix visualizer |
| **Frontend Predictions Page** | ✅ Complete | Market factory, live market cards, trading interface |
| **CoFHE SDK Integration** | ✅ Complete | React context, encrypt/decrypt, session management |
| **Wallet Integration** | ✅ Complete | RainbowKit + Privy, chain switching, multi-RPC load balancing |
| **Midnight Nebula Design** | ✅ Complete | Glassmorphism, cinematic BG, Fhenix visualizer, responsive layout |
| **ABI Export Pipeline** | ✅ Automated | `hardhat-abi-exporter` → `frontend/lib/generated-abis/` on compile |
| **Deployment Automation** | ✅ Complete | Full stack deploy with verification, authorization, and JSON snapshot |
| **Multi-RPC Load Balancer** | ✅ Complete | Round-robin with retry, failover, rate-limit detection across 4+ RPCs |

### 🔴 Active Bugs (Lambda Keeper — As of April 26, 2026)

| Bug | Location | Status | Details |
|---|---|---|---|
| **Stale ABI files** | `keeper/lambda/abis/` | 🔴 Unfixed | ABIs copied from old version of frontend. `EncryptedPredictionMarket.json` missing `nextPositionId` function → `market.nextPositionId is not a function` runtime error |
| **RPC individual call timeouts** | `keeper/lambda/keeper-logic.ts` | 🔴 Unfixed | Per-call RPC timeouts still occurring on some invocations — individual `game.bets(betId)` calls timeout even after provider init succeeds |
| **Unknown custom error on revert** | `keeper/lambda/keeper-logic.ts` | 🔴 Unfixed | `execution reverted (unknown custom error)` — `formatError()` doesn't extract raw revert data — real reason hidden |

### 🟡 Partially Complete / In Progress

| Feature | Status | Details |
|---|---|---|
| **Lambda Keeper End-to-End** | 🟡 Running but not settling | Lambda starts, reads nextBetId=7, hits per-section timeouts, no tx hashes in logs yet — 3 bugs above blocking |
| **Subgraph Indexing** | 🟡 Directory exists, empty | The Graph integration planned but not implemented |
| **Oracle-Driven Resolution** | 🟡 Strategy decided, not wired | MarketResolver supports `oracleType` + `oracleAddress`. Testnet: CoinGecko via keeper. Mainnet: Chainlink/Pyth — zero contract changes needed |

### ❌ Not Yet Built

| Feature | Notes |
|---|---|
| **Mainnet Deployment** | Currently Arbitrum Sepolia testnet only |
| **Security Audit** | Codebase is unaudited |
| **Subgraph / Event Indexing** | No indexer running, all reads are direct RPC calls |
| **MockPriceFeed Contract** | Needed for testnet simulation — see §20 for design |
| **Keeper Auto-Resolve (Manual Markets)** | CoinGecko API fetch + resolveManual() logic not yet added |
| **Mobile Optimization** | Works on mobile but not specifically optimized |
| **Rate Limiting / Anti-Abuse** | No on-chain or off-chain rate limiting |
| **Governance** | CasinoToken exists but no governance mechanism implemented |

---

## 18. Known Issues & Gotchas

### Smart Contract Issues

1. **`NOT_AUTHORIZED_GAME` Revert** — If games are redeployed but vault authorization wasn't re-run. Fix: `npm run authorize:games`.

2. **FHE.allow() Misses** — Every encrypted handle that will be used later MUST have `FHE.allowThis()` and/or `FHE.allow(handle, consumer)` called. Missing allows cause silent zero-value results.

3. **Async Decrypt Timing** — `FHE.getDecryptResultSafe()` returns `(0, false)` until the CoFHE Threshold Network completes decryption (~15-30 seconds). The keeper must wait before calling `finalizeResolution`.

4. **Zero-Handle Sentinel** — `ebool.wrap(bytes32(0))` is used as a placeholder in bet structs before resolution is requested. Reading it via `FHE.getDecryptResultSafe` would return garbage — guards prevent this.

5. **Withdrawal 2-Phase** — `withdrawETH()` must be called TWICE: first to request, second to finalize after decrypt is ready. Calling once only queues the request.

### Frontend Issues

6. **CoFHE Session Warmup** — The first encryption after page load takes 5-15 seconds because TFHE WASM must initialize. The UI shows "Initializing TFHE" during this period.

7. **Workers Disabled** — `useWorkers: false` in CoFHE config because of WASM compatibility issues. This means encryption runs on the main thread and can cause brief UI freezes.

8. **RPC Rate Limiting** — Using Infura free tier can hit rate limits. The `loadBalancedTransport.ts` mitigates this with 4 endpoints + retry logic, but heavy polling can still exhaust quotas.

9. **`vault.minimumReserveWei()` / `vault.paused()` not on deployed contract** — Frontend `loadCasinoState` calls these functions added for future insolvency protection. The deployed vault doesn't have them yet. Fixed by wrapping in `Promise.allSettled` with `0n`/`false` fallbacks in `frontend/lib/casfin-client.ts`.

### Lambda Keeper Issues (Active)

10. **Stale ABIs in `keeper/lambda/abis/`** — These are NOT auto-synced from `frontend/lib/generated-abis/`. Must be manually copied after any contract recompile. `EncryptedPredictionMarket.json` is currently outdated — missing `nextPositionId` function.

11. **Contract Address Mismatch** — `casfin/.env` has different addresses for CoinFlip/Dice/Crash than `frontend/.env.local`. The Lambda `serverless.yml` defaults use the FRONTEND addresses (correct). The root `.env` addresses are stale. Do NOT use `casfin/.env` game addresses for the keeper.

12. **Individual RPC call timeouts** — Even after provider init succeeds, individual calls like `game.bets(betId)` can timeout on slow testnet. The 30s `RPC_TIMEOUT_MS` per call is set in `FetchRequest`, but testnet can be slower.

13. **`execution reverted (unknown custom error)`** — On-chain custom errors (e.g., `NOT_RESOLVER`, `BET_RESOLVED`) have their 4-byte selectors but ethers.js can't decode them without ABI error definitions. Need to improve `formatError()` to log raw error data.

---

## 19. Future Roadmap

1. **Production Deployment** — Move to Arbitrum mainnet once FHE performance is production-ready.
2. **Subgraph Integration** — Index on-chain events for historical data, leaderboards, analytics.
3. **Oracle Price Feeds (Mainnet)** — Wire Chainlink/Pyth addresses to MarketResolver for automated prediction market resolution on mainnet. Contract already supports it — just swap the `oracleAddress`.
4. **Additional Games** — Leverage the `GameRandomnessLib` library (card draws, RPG stats, loot, boards) for new game types (Blackjack, Roulette, etc.).
5. **Governance** — CasinoToken voting for protocol parameters (fee levels, max bets, game whitelisting).
6. **Multi-Chain** — Deploy to other FHE-compatible chains as the ecosystem expands.
7. **Keeper Hardening** — Production-grade keeper with PM2, alerts, auto-restart, redundancy.
8. **Security Audit** — Full professional audit before mainnet.
9. **Mobile App** — React Native or PWA for mobile-optimized experience.
10. **Social Features** — Leaderboards, tournaments, chat (all privacy-preserving via FHE).

---

## Appendix: Key File Quick-Reference

| Need to... | File(s) |
|---|---|
| Understand the vault logic | `contracts/fhenix/EncryptedCasinoVault.sol` |
| Add a new FHE game | Copy `EncryptedCoinFlip.sol`, modify game logic, add to vault authorization in deploy script |
| Change game house edge | Constructor parameter in deploy script (BPS, e.g., 200 = 2%) |
| Add new FHE randomness | Add function to `GameRandomnessLib` in `GameRandomness.sol` |
| Modify frontend page | `frontend/app/<route>/page.tsx` |
| Change contract addresses | `frontend/.env.local` (frontend) + `.env` (keeper) |
| Debug FHE encryption | Check `CofheProvider` state via `useCofhe()` — `sessionReady`, `connected`, `ready` |
| Change UI styling | `frontend/app/globals.css` (110KB monolith — search by component class name) |
| Add a new component | `frontend/components/` — follow GlassCard pattern |
| Modify contract ABIs | Edit `.sol` → `npm run compile` → ABIs auto-update in `frontend/lib/generated-abis/` |
| Deploy fresh contracts | `npm run deploy:full` from `casfin/` |
| Fix authorization errors | `npm run authorize:games` |
| Start the keeper | `npm run keeper:start` |
| Run tests | `npm test` |

---

## 20. Infrastructure Decisions & Price Feed Strategy

> **Session date:** April 17, 2026

### Storage: Do Not Use S3 for Database

S3 is object storage (files/blobs), not a database. It has no query support, no ACID transactions, no indexes, and high latency per read. CasFin's on-chain state lives in smart contracts and is read via RPC. For any off-chain data needs:
- **User profiles / metadata** → Supabase (hosted Postgres) or Turso (SQLite)
- **Caching / leaderboards** → Upstash Redis
- **Blockchain event indexing** → The Graph (subgraph dir already exists)
- **File storage** (images, avatars) → This IS S3's job (or Cloudflare R2)

### Database: Neon Postgres on Vercel

> **Decision date:** April 19, 2026

CasFin uses **Neon Postgres** (serverless PostgreSQL) hosted via Vercel's Storage integration for any off-chain data needs (leaderboards, user profiles, analytics, cached state).

**Provider:** Neon (serverless Postgres, scales to zero)
**Database:** `neondb` on `us-east-1`
**Connection:** Pooled via pgbouncer (`-pooler` endpoint) for serverless compatibility
**User:** `neondb_owner`

| Connection Type | When to Use | Env Var |
|---|---|---|
| **Pooled** (pgbouncer) | API routes, server components, general queries | `DATABASE_URL` / `POSTGRES_URL` |
| **Direct** (unpooled) | Schema migrations, DDL statements | `DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING` |

**Why Neon over other options:**
- Native Vercel integration (auto-injects env vars)
- Standard Postgres — compatible with `setup-db.sh`, raw SQL, any ORM
- Serverless/scales-to-zero — no cost when idle
- Free tier sufficient for testnet/demo
- Connection pooling built-in (pgbouncer)

**Previous decisions:**
- S3 was considered but rejected — it's object storage, not a database (no queries, no ACID, high latency)
- Supabase was considered as an alternative — Neon was chosen for simpler Vercel integration

### CoFHE Does NOT Need a Traditional Oracle for Casino

Key finding from reading the Fhenix CoFHE docs at `https://cofhe-docs.fhenix.zone/`:

| Need | Oracle Required? | Solution |
|---|---|---|
| Casino randomness (dice, coin flip, crash) | ❌ No | `FHE.randomEuint8/16/32/64()` — built into FHE.sol |
| Decrypting game results | ❌ No | Fhenix Threshold Network + `FHE.publishDecryptResult()` |
| Prediction market price data | ✅ Yes | External price source required |

Chainlink VRF and the `CasinoRandomnessRouter` are **legacy/transparent casino infrastructure** — they are not needed for the FHE casino.

### Prediction Market Price Feed Strategy

The `EncryptedMarketResolver.sol` already supports 3 oracle types (`OracleType.Manual`, `OracleType.Chainlink`, `OracleType.Pyth`). The resolution strategy per environment:

#### Testnet (Arbitrum Sepolia) — Current

**Problem:** Chainlink Arbitrum Sepolia feeds update infrequently (hours apart) and don't fluctuate realistically for testing short-duration bets.

**Solution: `OracleType.Manual` + Keeper + CoinGecko Free API**

```
CoinGecko Free API (real live ETH/BTC prices)
            ↓
    fhe-keeper.ts (polls every 60 seconds)
    - fetches real price for each asset
    - checks markets past resolvesAt
    - determines YES/NO winner
    - calls resolver.resolveManual(outcomeIndex)
            ↓
    Market resolves with real market price ✅
```

This gives realistic price fluctuation on testnet with zero oracle dependency. Users see actual ETH/BTC prices from CoinGecko.

#### Mainnet — Future

Swap `oracleAddress` to real Chainlink/Pyth feed addresses. **Zero contract code changes needed.**

Chainlink feeds on Arbitrum (mainnet, for reference):
- ETH/USD: `0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612`
- BTC/USD: `0x6ce185539ad4fdaecd7fa6b4e22a5ce34cb6ad24`

### MockPriceFeed Contract (for Testnet Simulation)

A `MockPriceFeed` contract that implements `IChainlinkAggregator` can be used as a drop-in replacement for testing with `OracleType.Chainlink`:

```solidity
// Implements IChainlinkAggregator — drop-in for EncryptedMarketResolver
contract MockPriceFeed {
    function latestRoundData() external view returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (roundId, price, block.timestamp, block.timestamp, roundId);
    }
    function setPrice(int256 newPrice) external onlyOwner { ... }
    function simulatePump(int256 by) external onlyOwner { ... }
    function simulateDump(int256 by) external onlyOwner { ... }
}
```

Chainlink uses **8 decimal places**: `$2500.00` → `2500_00000000` (int256).

**Usage:** Deploy with initial price, point market's `oracleAddress` to mock, call `setPrice()` or `simulatePump/Dump()` to move prices and trigger resolution.

### Keeper Price Resolution Logic (To Be Added to fhe-keeper.ts)

```typescript
async function fetchRealPrice(asset: string): Promise<number> {
    const ASSET_IDS = { ETH: "ethereum", BTC: "bitcoin", ARB: "arbitrum" };
    const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ASSET_IDS[asset]}&vs_currencies=usd`
    );
    const data = await res.json();
    return data[ASSET_IDS[asset]].usd;
}

async function autoResolveManualMarkets() {
    const now = Math.floor(Date.now() / 1000);
    for (const market of await getExpiredUnresolvedManualMarkets()) {
        const realPrice = await fetchRealPrice(market.asset);
        const { threshold, resolveAbove } = decodeOracleParams(market.oracleParams);
        const yesWins = resolveAbove ? realPrice >= threshold : realPrice <= threshold;
        await market.resolver.resolveManual(yesWins ? 0 : 1);
    }
}
setInterval(autoResolveManualMarkets, 60_000); // every 60 seconds
```

### Why Not Just Use Testnet Chainlink Feeds?

Chainlink Arbitrum Sepolia feeds exist (e.g., ETH/USD at `0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165`) and return real prices, but they update infrequently (every few hours or when price deviates significantly). This makes them unsuitable for testing short-duration bets on testnet. CoinGecko via the keeper is a much better testnet experience.

---

*Last updated: April 26, 2026. This document should be updated whenever significant architectural changes are made to the CasFin protocol.*

### Change Log
- **April 26, 2026:** Updated contract addresses (frontend addresses are canonical), added Lambda keeper architecture (§10.2), Redis pub/sub pipeline (§10.3), active Lambda bugs in progress tracker (§17), new keeper gotchas (§18 items 9-13).
- **April 17, 2026:** Initial comprehensive documentation.
