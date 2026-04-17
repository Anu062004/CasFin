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
| **Keeper Bot** | Node.js + `tsx` | Long-running polling process for async FHE resolution |
| **RPC Infrastructure** | Infura (primary), BlockPi, StackUp (fallback) | Load-balanced multi-RPC transport (`loadBalancedTransport.ts`) |
| **ABI Pipeline** | `hardhat-abi-exporter` | Auto-exports ABI JSON to `frontend/lib/generated-abis/` on compile |
| **Deployment Artifacts** | JSON snapshots | Saved to `deployments/<network>/` with full address + tx hash history |
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

**File:** `keeper/fhe-keeper.ts` (326 lines)

The keeper is a long-running Node.js process that polls FHE contracts and performs async resolution.

### What It Does

1. **CoinFlip & Dice Bets:**
   - Iterates all bet IDs from 0 to `nextBetId`.
   - If `!resolved && !resolutionPending` → calls `requestResolution(betId)`.
   - If `resolutionPending` and delay elapsed → calls `finalizeResolution(betId)`.

2. **Crash Rounds:**
   - Iterates all round IDs from 0 to `nextRoundId`.
   - If round exists but not closed and no close requested → calls `closeRound(roundId)`.
   - If close requested but not closed and delay elapsed → calls `finalizeRound(roundId)`.
   - After round closes → iterates `trackedCrashPlayers` and calls `settleBet(roundId, player)` for unsettled bets.

3. **Prediction Markets:**
   - Gets market addresses from factory + `ENCRYPTED_MARKET_ADDRESSES` env var.
   - For each market: checks if past `resolvesAt` and unresolved → calls resolver's `requestResolution()`.
   - Iterates positions → if `claimRequested && !claimed` and delay elapsed → calls `finalizeClaimWinnings(positionId)`.

### Configuration

| Env Variable | Default | Purpose |
|---|---|---|
| `KEEPER_POLL_MS` | `15000` | Polling interval between ticks |
| `KEEPER_RESOLUTION_DELAY_MS` | `30000` | Wait time after requesting resolution before attempting finalization |
| `KEEPER_CRASH_PLAYERS` | `""` | Comma-separated player addresses to auto-settle crash bets for |
| `ENCRYPTED_MARKET_ADDRESSES` | `""` | Additional prediction market addresses to process |
| `FHENIX_RPC_URL` | `https://api.helium.fhenix.zone` | RPC endpoint |
| `FHENIX_PRIVATE_KEY` / `PRIVATE_KEY` | required | Signer key for keeper transactions |

### Running the Keeper
```bash
npm run keeper:start    # from casfin/ root
# or
npx tsx keeper/fhe-keeper.ts
```

**Important:** Without the keeper running, all FHE bets will sit in "pending" state indefinitely. The keeper is essential for the casino to function.

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

These are the **currently live** addresses from `frontend/.env.local`:

| Contract | Address |
|---|---|
| **EncryptedCasinoVault** | `0xDe635798122487CF0a61512D2D7229D28436d9f8` |
| **EncryptedCoinFlip** | `0x6dd64A41E8c2AC90eaC95b0a194c8943D40Fe945` |
| **EncryptedDiceGame** | `0x62dA6E0a33e0E1B67240348e768dD3Aed9feFDAB` |
| **EncryptedCrashGame** | `0xA204279bBb036e31Fc9cbFC7d6660c29E18D6F45` |
| **GameRandomness Router** | `0xA35D1C633D6E4178dD3DCE567ddb76d6C341f111` |
| **EncryptedMarketFactory** | `0xC876De943508B4938d3d8f010cc97dbac7Ab0B43` |
| **FeeDistributor** | `0xFDD1E5A48739831DbF655338DE5996D283a79295` |
| **DisputeRegistry** | `0x5c15ABfe97bAF24540fbc13d9a9d35d052C655db` |
| **CasinoToken** | `0x64982D01A94298FD5b8294A30DAaB6Fdad2d3203` |
| **StakingPool** | `0x2E42d445FdA2644cb7Da85572Ce77D03019a4fcB` |
| **Operator Address** | `0x6b3a924379B9408D8110f10F084ca809863B378A` |

**Network:** Arbitrum Sepolia (`421614` / `0x66eee`)
**Explorer:** `https://sepolia.arbiscan.io`

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
| **FHE Keeper Bot** | ✅ Running | Polling-based async resolution for all FHE games + predictions |
| **Frontend Landing Page** | ✅ Complete | Cinematic intro video → fade → CTA buttons |
| **Frontend Casino Page** | ✅ Complete | Tab-based game selection, vault sidebar, stat strip, Fhenix visualizer |
| **Frontend Predictions Page** | ✅ Complete | Market factory, live market cards, trading interface |
| **CoFHE SDK Integration** | ✅ Complete | React context, encrypt/decrypt, session management |
| **Wallet Integration** | ✅ Complete | RainbowKit + Privy, chain switching, multi-RPC load balancing |
| **Midnight Nebula Design** | ✅ Complete | Glassmorphism, cinematic BG, Fhenix visualizer, responsive layout |
| **ABI Export Pipeline** | ✅ Automated | `hardhat-abi-exporter` → `frontend/lib/generated-abis/` on compile |
| **Deployment Automation** | ✅ Complete | Full stack deploy with verification, authorization, and JSON snapshot |
| **Multi-RPC Load Balancer** | ✅ Complete | Round-robin with retry, failover, rate-limit detection across 4+ RPCs |

### 🟡 Partially Complete / In Progress

| Feature | Status | Details |
|---|---|---|
| **Subgraph Indexing** | 🟡 Directory exists, empty | The Graph integration planned but not implemented |
| **Oracle-Driven Resolution** | 🟡 Contract support exists | MarketResolver supports `oracleType` + `oracleAddress` but no Chainlink/Pyth integration wired |
| **Borrowing/Lending** | 🟡 Discussed in conversations | Architecture explored but not implemented |
| **x402 Payment Integration** | 🟡 Investigated | x402 micropayments explored in prior conversations |

### ❌ Not Yet Built

| Feature | Notes |
|---|---|
| **Mainnet Deployment** | Currently Arbitrum Sepolia testnet only |
| **Security Audit** | Codebase is unaudited |
| **Subgraph / Event Indexing** | No indexer running, all reads are direct RPC calls |
| **Oracle Feeds** | Pyth/Chainlink price feed integration for prediction markets |
| **Mobile Optimization** | Works on mobile but not specifically optimized |
| **Rate Limiting / Anti-Abuse** | No on-chain or off-chain rate limiting |
| **Production Keeper Infrastructure** | Currently single-process Node.js, needs hardening (PM2, alerts, etc.) |
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

9. **Vault Mode Detection** — The frontend auto-detects whether the vault is FHE-encrypted or transparent based on the deployed address. If the vault address changes, `casfin-config.ts` must be updated.

### Deployment Issues

10. **Hardhat ABI Exporter** — ABIs export on compile, but if a contract name changes, old ABI files persist in `generated-abis/`. May need manual cleanup.

11. **Gas Estimation** — FHE transactions have unpredictable gas costs. Some transactions may fail with out-of-gas on Arbitrum Sepolia if the CoFHE precompiles have issues.

---

## 19. Future Roadmap

1. **Production Deployment** — Move to Arbitrum mainnet once FHE performance is production-ready.
2. **Subgraph Integration** — Index on-chain events for historical data, leaderboards, analytics.
3. **Oracle Price Feeds** — Wire Chainlink/Pyth to MarketResolver for automated prediction market resolution.
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

*Last updated: April 2026. This document should be updated whenever significant architectural changes are made to the CasFin protocol.*
