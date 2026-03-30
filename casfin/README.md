# CasFin

CasFin is a transparent onchain protocol that combines two product rails on Arbitrum:

- prediction markets with cloned market infrastructure, fee routing, dispute handling, and resolver support
- casino games backed by a shared vault, CHIPS staking, and Chainlink VRF randomness for production deployments

This codebase does not provide privacy. Balances, shares, bets, and market state are standard Solidity values and should be treated as publicly observable onchain data.

## Architecture

- `contracts/MarketFactory.sol` deploys prediction markets by cloning implementation contracts for the AMM, LP, market, and resolver.
- `contracts/casino/CasinoVault.sol` holds user balances and locked bet funds for the casino rail.
- `contracts/games/` contains coin flip, dice, and crash games that reserve funds from the vault and settle transparently.
- `contracts/casino/ChainlinkVRFAdapter.sol` is the production randomness adapter.
- `contracts/token/CasinoToken.sol` and `contracts/staking/StakingPool.sol` provide CHIPS issuance and ETH reward distribution.
- `frontend/` is the Next.js interface for both rails.

## Randomness

Production deployments use Chainlink VRF through `ChainlinkVRFAdapter`.

`CasinoRandomnessRouter` remains in the repo only for local testing. To force that path locally:

```bash
FORCE_MANUAL_ROUTER=true
```

Without that flag, the casino deploy scripts require valid VRF configuration.

## Environment

Use `.env` values compatible with Hardhat:

```bash
ARBITRUM_SEPOLIA_RPC_URL=
PRIVATE_KEY=
ARBISCAN_API_KEY=

VRF_COORDINATOR_ADDRESS=
VRF_KEY_HASH=
VRF_SUBSCRIPTION_ID=
VRF_REQUEST_CONFIRMATIONS=3
VRF_CALLBACK_GAS_LIMIT=250000
VRF_NUM_WORDS=1
VRF_NATIVE_PAYMENT=true

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

## Development

```bash
npm install
npm run compile
npm test
```

ABI files are exported automatically on compile to `frontend/lib/generated-abis/`.

## Deployment

```bash
npm run deploy:casino
npm run deploy:prediction
npm run deploy:all
```

Each deploy script:

- writes a JSON deployment record to `deployments/<network>/`
- attempts Arbiscan verification when `ARBISCAN_API_KEY` is configured
- uses Chainlink VRF by default for casino deployments

## Frontend

The Next.js frontend lives in `frontend/`.

```bash
npm run frontend:dev
npm run frontend:build
```

## Keeper Stub

The keeper entrypoint is:

```bash
npm run keeper:start
```
