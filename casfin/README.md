# CasFin

CasFin is a multi-rail onchain finance project that combines:

- a prediction market protocol with factory-based market deployment, AMM pricing, LP shares, resolver flows, and dispute handling
- a casino protocol with a shared vault, staking, and randomness-driven games such as coin flip, dice, and crash
- an encrypted FHE-oriented casino rail built around Fhenix-compatible contracts and keeper-assisted resolution
- a unified Next.js frontend for wallet connection, live protocol reads, and transaction flows

The project targets Arbitrum Sepolia for the main application flow and includes deployment artifacts for both transparent and encrypted casino rails.

## What The Project Includes

CasFin is not a single contract. It is a full-stack repo with:

- Solidity contracts for markets, casino games, vaults, fees, disputes, staking, and token issuance
- Hardhat deployment and verification scripts
- keeper processes for post-randomness settlement flows
- a frontend application in Next.js
- generated ABI exports consumed directly by the frontend
- checked-in deployment outputs under `deployments/`

## Core Product Rails

### 1. Prediction Markets

The prediction rail supports:

- factory-driven market creation
- outcome-based AMM trading
- LP capital provisioning
- manual or oracle-backed resolution patterns
- dispute registration and settlement
- fee distribution across protocol participants

Main contracts:

- `contracts/MarketFactory.sol`
- `contracts/PredictionMarket.sol`
- `contracts/MarketAMM.sol`
- `contracts/LiquidityPool.sol`
- `contracts/MarketResolver.sol`
- `contracts/FeeDistributor.sol`
- `contracts/DisputeRegistry.sol`

### 2. Transparent Casino

The transparent casino rail supports:

- a shared user vault
- locked-balance accounting per active bet
- coin flip, dice, and crash gameplay
- staking and reward notification hooks
- randomness through a router abstraction

Main contracts:

- `contracts/casino/CasinoVault.sol`
- `contracts/casino/CasinoRandomnessRouter.sol`
- `contracts/casino/ChainlinkVRFAdapter.sol`
- `contracts/games/CoinFlipGame.sol`
- `contracts/games/DiceGame.sol`
- `contracts/games/CrashGame.sol`
- `contracts/token/CasinoToken.sol`
- `contracts/staking/StakingPool.sol`

### 3. Encrypted FHE Casino

The encrypted rail is intended for FHE-compatible flows where user balances and bet inputs can be represented as encrypted handles rather than plain Solidity values.

Main contracts:

- `contracts/fhenix/EncryptedCasinoVault.sol`
- `contracts/fhenix/EncryptedCoinFlip.sol`
- `contracts/fhenix/EncryptedDiceGame.sol`
- `contracts/fhenix/EncryptedCrashGame.sol`

This rail also includes:

- frontend helpers for encrypted-state reads
- a dedicated FHE keeper process for request/finalize resolution handling

## Repository Structure

```text
casfin/
|- contracts/          Solidity contracts for all protocol rails
|- scripts/            Hardhat deployment and orchestration scripts
|- keeper/             Runtime settlement/automation processes
|- test/               Hardhat test suite
|- frontend/           Next.js application
|- deployments/        Checked-in deployment output JSON files
|- subgraph/           Indexing-related workspace
|- hardhat.config.ts   Hardhat configuration
`- package.json        Root scripts for compile, test, deploy, and frontend ops
```

## Frontend

The frontend lives in `frontend/` and is now TypeScript-based.

It includes:

- app-router pages for landing, casino, predictions, and wallet
- typed client helpers for protocol reads
- wallet/provider state management
- generated ABI consumption from `frontend/lib/generated-abis/`
- UI flows for prediction markets, casino vault actions, and encrypted casino status

Primary frontend technologies:

- Next.js 15
- React 19
- TypeScript
- Ethers v6
- Wagmi
- RainbowKit

## Tooling And Language Setup

The repo now uses TypeScript across:

- frontend pages, components, and client helpers
- Hardhat config
- deployment scripts
- keeper scripts
- tests

Root runtime helpers for TypeScript execution:

- `ts-node`
- `tsx`
- `typescript`

Frontend TypeScript config:

- `frontend/tsconfig.json`
- `frontend/next-env.d.ts`
- `frontend/global.d.ts`
- `frontend/lib/casfin-types.ts`

Root TypeScript config:

- `tsconfig.json`

## Local Development

### Install Root Dependencies

```bash
npm install
```

### Install Frontend Dependencies

```bash
npm --prefix frontend install
```

### Compile Contracts

```bash
npm run compile
```

On compile, ABI artifacts are exported automatically into:

```text
frontend/lib/generated-abis/
```

### Run Tests

```bash
npm test
```

### Run Frontend

```bash
npm run frontend:dev
```

### Build Frontend

```bash
npm run frontend:build
```

## Environment Variables

Use `.env` for root Hardhat, keeper, and deployment settings.

Minimum root network values:

```bash
ARBITRUM_SEPOLIA_RPC_URL=
PRIVATE_KEY=
ARBISCAN_API_KEY=
```

### Casino / VRF Deployment Variables

```bash
FORCE_MANUAL_ROUTER=false
VRF_COORDINATOR_ADDRESS=
VRF_KEY_HASH=
VRF_SUBSCRIPTION_ID=
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=250000
VRF_NUM_WORDS=1
VRF_NATIVE_PAYMENT=true
```

### Prediction Deployment Variables

```bash
PREDICTION_OWNER_ADDRESS=
PREDICTION_TREASURY_ADDRESS=
PREDICTION_APPROVED_CREATOR_ADDRESS=
PREDICTION_MIN_DISPUTE_BOND_ETH=0.1
PREDICTION_PLATFORM_FEE_BPS=100
PREDICTION_LP_FEE_BPS=50
PREDICTION_RESOLVER_FEE_BPS=50
PREDICTION_STAKING_POOL_ADDRESS=
PREDICTION_STAKING_SHARE_BPS=0
```

### Transparent Keeper Variables

```bash
CASINO_RANDOMNESS_ROUTER_ADDRESS=
COIN_FLIP_GAME_ADDRESS=
DICE_GAME_ADDRESS=
CRASH_GAME_ADDRESS=
KEEPER_POLL_MS=15000
KEEPER_CRASH_PLAYERS=
```

### Encrypted / FHE Keeper Variables

```bash
ENCRYPTED_COIN_FLIP_ADDRESS=
ENCRYPTED_DICE_GAME_ADDRESS=
ENCRYPTED_CRASH_GAME_ADDRESS=
ENCRYPTED_CASINO_RANDOMNESS_ROUTER_ADDRESS=
FHE_COIN_FLIP_ADDRESS=
FHE_DICE_ADDRESS=
FHE_CRASH_ADDRESS=
KEEPER_POLL_MS=15000
KEEPER_RESOLUTION_DELAY_MS=30000
KEEPER_CRASH_PLAYERS=
```

### Frontend Variables

Frontend runtime values are read from `frontend/.env.local`.

Examples used in the frontend code include:

```bash
NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL=
NEXT_PUBLIC_ARB_SEPOLIA_CHAIN_ID=421614
NEXT_PUBLIC_FHE_VAULT_ADDRESS=
NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS=
NEXT_PUBLIC_FHE_DICE_ADDRESS=
NEXT_PUBLIC_FHE_CRASH_ADDRESS=
```

## Deployment Scripts

### Casino Stage

Deploy the transparent casino rail:

```bash
npm run deploy:casino
```

This deploys:

- `CasinoToken`
- `StakingPool`
- `CasinoVault`
- a randomness router
- `CoinFlipGame`
- `DiceGame`
- `CrashGame`

### Prediction Stage

Deploy the prediction infrastructure:

```bash
npm run deploy:prediction
```

This deploys:

- implementation contracts
- `MarketFactory`
- fee/dispute clone endpoints
- optional creator approval and staking share config

### Full Stack

Deploy both rails together:

```bash
npm run deploy:all
```

### FHE Casino Deployment

Deploy the encrypted casino contracts:

```bash
npm run deploy:fhenix
```

## Keepers

### Transparent Keeper

Runs the transparent casino settlement loop:

```bash
npm run keeper:start
```

Responsibilities:

- polls randomness readiness
- resolves pending coin flip bets
- resolves pending dice bets
- closes crash rounds when randomness is ready
- settles tracked crash player bets

### FHE Keeper

Runs the encrypted resolution loop:

```bash
npm run keeper:start:fhe
```

Responsibilities:

- requests encrypted bet resolution after randomness is available
- waits for the configured resolution delay
- finalizes encrypted resolutions
- closes encrypted crash rounds
- settles tracked encrypted crash player bets

## Deployment Artifacts

Deployment outputs are written to:

```text
deployments/<network>/
```

Current checked-in examples include:

- `deployments/arbitrumSepolia/casino-stage.json`
- `deployments/arbitrumSepolia/full-stack.json`
- `deployments/arbitrumSepolia/fhe-casino.json`
- `deployments/hardhat/full-stack.json`
- `deployments/hardhat/prediction-stage.json`

These files record:

- deployed addresses
- tx hashes
- gas usage
- factory clone addresses
- configuration transactions

## ABI Export Strategy

Contract ABIs are exported via `hardhat-abi-exporter` into:

```text
frontend/lib/generated-abis/
```

This allows the frontend and keeper utilities to stay aligned with the Solidity code in the same repository.

## Security And Privacy Notes

### Transparent Rail

The transparent prediction and casino rails do not provide privacy.

Assume the following are public:

- balances
- bets
- shares
- market state
- resolver actions
- fee flows

### Encrypted Rail

The encrypted FHE rail is intended to reduce plaintext exposure for selected user values, but it still depends on:

- correct FHE-compatible contract usage
- offchain or client-generated encrypted payloads
- keeper/finalization flows
- network and integration maturity

The current frontend includes encrypted-state awareness, but full encrypted input generation is still a separate concern from standard transparent transaction flows.

## Project Status

CasFin currently includes:

- checked-in deployment artifacts
- a TypeScript frontend
- TypeScript deployment, keeper, and test entrypoints
- prediction market infrastructure
- transparent casino infrastructure
- encrypted casino contracts and related operational scripts

## Suggested Workflow For Contributors

1. Install root and frontend dependencies.
2. Configure `.env` and `frontend/.env.local`.
3. Compile contracts to refresh ABIs.
4. Run tests.
5. Launch the frontend.
6. Use deployment scripts only after network credentials and randomness configuration are set correctly.

## License / Usage

No explicit license file is included in this repository snapshot. Treat usage, redistribution, and commercial handling as undefined until a project license is added.
