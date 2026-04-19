# TASK: Deploy CasFin Keeper Bot on AWS Lambda + EventBridge

## WHAT TO DO
Package the keeper bot from `keeper/fhe-keeper.ts` into an **AWS Lambda function** triggered every **1 minute** by **EventBridge (CloudWatch Events)**. This replaces the long-running Node.js process with a serverless function that costs $0 under AWS free tier.

---

## PROJECT INFO
- **Project root**: `c:\Users\ankur\OneDrive\Desktop\CasFin\casfin`
- **Existing keeper**: `keeper/fhe-keeper.ts` (standalone infinite-loop script)
- **Chain**: Arbitrum Sepolia (421614)
- **RPC**: `https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f`
- **ABI files**: `frontend/lib/generated-abis/*.json`

---

## FILE STRUCTURE TO CREATE

```
casfin/
  keeper/
    fhe-keeper.ts          # existing (keep as-is for local use)
    lambda/
      handler.ts           # Lambda entry point
      keeper-logic.ts      # Core tick logic (extracted from fhe-keeper.ts)
      package.json         # Lambda dependencies
      tsconfig.json        # TypeScript config
      serverless.yml       # Serverless Framework config
      .env.example         # Required env vars reference
      abis/                # Copy of ABI files
        EncryptedCoinFlip.json
        EncryptedDiceGame.json
        EncryptedCrashGame.json
        EncryptedPredictionMarket.json
        EncryptedMarketFactory.json
        EncryptedMarketResolver.json
```

---

## STEP 1: Create `keeper/lambda/package.json`

```json
{
  "name": "casfin-keeper-lambda",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "deploy": "npx serverless deploy",
    "invoke": "npx serverless invoke -f keeperTick --log",
    "logs": "npx serverless logs -f keeperTick --tail"
  },
  "dependencies": {
    "ethers": "^6.16.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "serverless": "^3.39.0",
    "serverless-plugin-typescript": "^2.1.5",
    "@types/node": "^20.0.0",
    "@types/aws-lambda": "^8.10.0"
  }
}
```

---

## STEP 2: Create `keeper/lambda/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": ".build",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", ".build"]
}
```

---

## STEP 3: Create `keeper/lambda/serverless.yml`

```yaml
service: casfin-keeper

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  timeout: 60
  memorySize: 256
  environment:
    KEEPER_RPC_URL: ${env:KEEPER_RPC_URL, 'https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f'}
    KEEPER_PRIVATE_KEY: ${env:KEEPER_PRIVATE_KEY}
    ENCRYPTED_COIN_FLIP_ADDRESS: ${env:ENCRYPTED_COIN_FLIP_ADDRESS, '0x2a43F77A2286ffC3ebfb5D577123CB7cEf8553Af'}
    ENCRYPTED_DICE_GAME_ADDRESS: ${env:ENCRYPTED_DICE_GAME_ADDRESS, '0x7D7A8f22727CB618f5C96eCA151C48Bc0aa3D563'}
    ENCRYPTED_CRASH_GAME_ADDRESS: ${env:ENCRYPTED_CRASH_GAME_ADDRESS, '0x6465C2f5F5c9B2F7F05dC6E6D799514D6F1d214D'}
    ENCRYPTED_PREDICTION_FACTORY_ADDRESS: ${env:ENCRYPTED_PREDICTION_FACTORY_ADDRESS, '0xC876De943508B4938d3d8f010cc97dbac7Ab0B43'}
    ENCRYPTED_MARKET_ADDRESSES: ${env:ENCRYPTED_MARKET_ADDRESSES, ''}

plugins:
  - serverless-plugin-typescript

functions:
  keeperTick:
    handler: handler.tick
    description: CasFin FHE Keeper - resolves encrypted casino bets
    events:
      - schedule:
          rate: rate(1 minute)
          enabled: true
          input:
            source: "casfin.keeper"
```

---

## STEP 4: Create `keeper/lambda/keeper-logic.ts`

```typescript
import { ethers } from "ethers";
import * as path from "path";

// Load ABIs from local copies
const EncryptedCoinFlipAbi = require("./abis/EncryptedCoinFlip.json");
const EncryptedDiceGameAbi = require("./abis/EncryptedDiceGame.json");
const EncryptedCrashGameAbi = require("./abis/EncryptedCrashGame.json");
const EncryptedMarketFactoryAbi = require("./abis/EncryptedMarketFactory.json");
const EncryptedPredictionMarketAbi = require("./abis/EncryptedPredictionMarket.json");
const EncryptedMarketResolverAbi = require("./abis/EncryptedMarketResolver.json");

function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.KEEPER_RPC_URL ||
    "https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f";
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getSigner(): ethers.Wallet {
  const rawKey = process.env.KEEPER_PRIVATE_KEY || "";
  if (!rawKey) throw new Error("KEEPER_PRIVATE_KEY not set");
  const key = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  return new ethers.Wallet(key, getProvider());
}

function optionalContract(address: string | undefined, abi: any, signer: ethers.Wallet) {
  if (!address || !ethers.isAddress(address) || address === ethers.ZeroAddress) return null;
  return new ethers.Contract(address, abi, signer);
}

function formatError(error: any): string {
  return error?.shortMessage || error?.reason || error?.info?.error?.message || error?.message || String(error);
}

function getBetState(bet: any) {
  return { player: bet[0], resolved: bet[4], resolutionPending: bet[5], won: bet[7] ?? bet[8] ?? false };
}

async function processEncryptedBets(label: string, game: ethers.Contract | null, logs: string[]) {
  if (!game) return;
  const nextBetId = await game.nextBetId();

  for (let betId = 0n; betId < nextBetId; betId += 1n) {
    try {
      const bet = getBetState(await game.bets(betId));
      if (bet.resolved) continue;

      if (!bet.resolutionPending) {
        const tx = await game.requestResolution(betId);
        logs.push(`[${label}] requestResolution(${betId}) -> ${tx.hash}`);
        await tx.wait();
        continue;
      }

      try {
        const tx = await game.finalizeResolution(betId);
        logs.push(`[${label}] finalizeResolution(${betId}) -> ${tx.hash}`);
        await tx.wait();
      } catch (err: any) {
        const msg = formatError(err);
        if (msg.includes("WIN_FLAG_PENDING")) {
          // CoFHE decrypt unavailable — try forceResolve if contract supports it
          try {
            const provider = getProvider();
            const block = await provider.getBlock("latest");
            const won = block ? BigInt(block.hash) % 2n === 0n : false;
            const tx = await game.forceResolve(betId, won);
            logs.push(`[${label}] forceResolve(${betId}, ${won}) -> ${tx.hash}`);
            await tx.wait();
          } catch (fe: any) {
            logs.push(`[${label}] bet ${betId} pending (no forceResolve): ${formatError(fe)}`);
          }
        } else {
          logs.push(`[${label}] finalizeResolution(${betId}): ${msg}`);
        }
      }
    } catch (err: any) {
      logs.push(`[${label}] bet ${betId}: ${formatError(err)}`);
    }
  }
}

async function processCrashRounds(crash: ethers.Contract | null, logs: string[]) {
  if (!crash) return;
  const nextRoundId = await crash.nextRoundId();

  for (let roundId = 0n; roundId < nextRoundId; roundId += 1n) {
    try {
      const round = await crash.rounds(roundId);
      if (!round[0]) continue; // not exists

      if (!round[2]) { // not closeRequested
        const tx = await crash.closeRound(roundId);
        logs.push(`[Crash] closeRound(${roundId}) -> ${tx.hash}`);
        await tx.wait();
        continue;
      }

      if (!round[4]) { // not closed
        try {
          const tx = await crash.finalizeRound(roundId);
          logs.push(`[Crash] finalizeRound(${roundId}) -> ${tx.hash}`);
          await tx.wait();
        } catch (err: any) {
          logs.push(`[Crash] finalizeRound(${roundId}): ${formatError(err)}`);
        }
      }
    } catch (err: any) {
      logs.push(`[Crash] round ${roundId}: ${formatError(err)}`);
    }
  }
}

async function processPredictionMarkets(factory: ethers.Contract | null, signer: ethers.Wallet, logs: string[]) {
  const configured = (process.env.ENCRYPTED_MARKET_ADDRESSES || "").split(",").map(v => v.trim()).filter(Boolean);
  const addresses = new Set(configured);

  if (factory) {
    const total = Number(await factory.totalMarkets());
    for (let i = 0; i < total; i++) addresses.add(await factory.allMarkets(i));
  }

  for (const addr of addresses) {
    if (!ethers.isAddress(addr) || addr === ethers.ZeroAddress) continue;
    const market = new ethers.Contract(addr, EncryptedPredictionMarketAbi, signer);

    try {
      const [resolvesAt, resolved, resolverAddr, nextPosId] = await Promise.all([
        market.resolvesAt(), market.resolved(), market.resolver(), market.nextPositionId()
      ]);

      if (!resolved && Number(resolvesAt) <= Math.floor(Date.now() / 1000)) {
        try {
          const resolver = new ethers.Contract(resolverAddr, EncryptedMarketResolverAbi, signer);
          const tx = await resolver.requestResolution();
          logs.push(`[Market] requestResolution(${addr}) -> ${tx.hash}`);
          await tx.wait();
        } catch (e: any) { logs.push(`[Market] resolve ${addr}: ${formatError(e)}`); }
      }

      for (let posId = 0n; posId < nextPosId; posId += 1n) {
        try {
          const pos = await market.positions(posId);
          if (!pos[0] || pos[0] === ethers.ZeroAddress || pos[5]) continue; // no player or claimed
          if (!pos[4]) continue; // claimRequested=false

          const tx = await market.finalizeClaimWinnings(posId);
          logs.push(`[Market] finalizeClaim(${addr},${posId}) -> ${tx.hash}`);
          await tx.wait();
        } catch (e: any) { logs.push(`[Market] pos ${posId}: ${formatError(e)}`); }
      }
    } catch (e: any) { logs.push(`[Market] ${addr}: ${formatError(e)}`); }
  }
}

export async function runKeeperTick(): Promise<string[]> {
  const logs: string[] = [];
  const signer = getSigner();

  logs.push(`Keeper tick at ${new Date().toISOString()}`);
  logs.push(`Signer: ${await signer.getAddress()}`);

  const coinFlip = optionalContract(process.env.ENCRYPTED_COIN_FLIP_ADDRESS, EncryptedCoinFlipAbi, signer);
  const dice = optionalContract(process.env.ENCRYPTED_DICE_GAME_ADDRESS, EncryptedDiceGameAbi, signer);
  const crash = optionalContract(process.env.ENCRYPTED_CRASH_GAME_ADDRESS, EncryptedCrashGameAbi, signer);
  const factory = optionalContract(process.env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS, EncryptedMarketFactoryAbi, signer);

  logs.push(`CoinFlip: ${coinFlip ? (coinFlip as any).target : "off"}`);
  logs.push(`Dice: ${dice ? (dice as any).target : "off"}`);
  logs.push(`Crash: ${crash ? (crash as any).target : "off"}`);

  await processEncryptedBets("CoinFlip", coinFlip, logs);
  await processEncryptedBets("Dice", dice, logs);
  await processCrashRounds(crash, logs);
  await processPredictionMarkets(factory, signer, logs);

  logs.push(`Done at ${new Date().toISOString()}`);
  return logs;
}
```

---

## STEP 5: Create `keeper/lambda/handler.ts`

```typescript
import { Context, ScheduledEvent } from "aws-lambda";
import { runKeeperTick } from "./keeper-logic";

export async function tick(event: ScheduledEvent, context: Context) {
  console.log("CasFin Keeper Lambda invoked");

  try {
    const logs = await runKeeperTick();
    logs.forEach(line => console.log(line));

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, logs }),
    };
  } catch (error: any) {
    console.error("Keeper error:", error.message || error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
```

---

## STEP 6: Copy ABI files

```bash
cd c:\Users\ankur\OneDrive\Desktop\CasFin\casfin\keeper\lambda
mkdir abis

copy ..\..\frontend\lib\generated-abis\EncryptedCoinFlip.json abis\
copy ..\..\frontend\lib\generated-abis\EncryptedDiceGame.json abis\
copy ..\..\frontend\lib\generated-abis\EncryptedCrashGame.json abis\
copy ..\..\frontend\lib\generated-abis\EncryptedCrashGame.json abis\
copy ..\..\frontend\lib\generated-abis\EncryptedPredictionMarket.json abis\
copy ..\..\frontend\lib\generated-abis\EncryptedMarketFactory.json abis\
copy ..\..\frontend\lib\generated-abis\EncryptedMarketResolver.json abis\
```

---

## STEP 7: Create `.env.example`

Create `keeper/lambda/.env.example`:
```
KEEPER_PRIVATE_KEY=your_private_key_without_0x_prefix
KEEPER_RPC_URL=https://arbitrum-sepolia.infura.io/v3/your_key
ENCRYPTED_COIN_FLIP_ADDRESS=0x2a43F77A2286ffC3ebfb5D577123CB7cEf8553Af
ENCRYPTED_DICE_GAME_ADDRESS=0x7D7A8f22727CB618f5C96eCA151C48Bc0aa3D563
ENCRYPTED_CRASH_GAME_ADDRESS=0x6465C2f5F5c9B2F7F05dC6E6D799514D6F1d214D
ENCRYPTED_PREDICTION_FACTORY_ADDRESS=0xC876De943508B4938d3d8f010cc97dbac7Ab0B43
ENCRYPTED_MARKET_ADDRESSES=
```

---

## STEP 8: Deploy

### Prerequisites (one-time setup):
```bash
# 1. Install AWS CLI (if not installed)
# Download from: https://aws.amazon.com/cli/
# Then configure:
aws configure
# Enter your AWS Access Key ID, Secret Key, region (us-east-1)

# 2. Install Serverless Framework globally
npm install -g serverless
```

### Deploy the Lambda:
```bash
cd c:\Users\ankur\OneDrive\Desktop\CasFin\casfin\keeper\lambda

# Install dependencies
npm install

# Set environment variables for deployment
set KEEPER_PRIVATE_KEY=efa2f...REDACTED...f66
set KEEPER_RPC_URL=https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f
set ENCRYPTED_COIN_FLIP_ADDRESS=0x2a43F77A2286ffC3ebfb5D577123CB7cEf8553Af
set ENCRYPTED_DICE_GAME_ADDRESS=0x7D7A8f22727CB618f5C96eCA151C48Bc0aa3D563
set ENCRYPTED_CRASH_GAME_ADDRESS=0x6465C2f5F5c9B2F7F05dC6E6D799514D6F1d214D
set ENCRYPTED_PREDICTION_FACTORY_ADDRESS=0xC876De943508B4938d3d8f010cc97dbac7Ab0B43

# Deploy!
npx serverless deploy
```

### Test it manually:
```bash
npx serverless invoke -f keeperTick --log
```

### View live logs:
```bash
npx serverless logs -f keeperTick --tail
```

---

## STEP 9: Verify

After deploying:
1. Go to **AWS Console → Lambda** → you should see `casfin-keeper-dev-keeperTick`
2. Go to **AWS Console → EventBridge → Rules** → you should see a rule triggering every 1 minute
3. Go to **CloudWatch → Log Groups** → `/aws/lambda/casfin-keeper-dev-keeperTick` → check logs
4. Place a bet on the UI → within ~1 minute the Lambda should pick it up and resolve it

---

## COST

Under AWS Free Tier (first 12 months):
- **Lambda**: 1 million free invocations/month. 1/min = ~43,200/month. **$0**
- **EventBridge**: Free for scheduled rules
- **CloudWatch Logs**: 5GB free. **$0**

**Total: $0/month** ✅

---

## IMPORTANT NOTES
1. The `KEEPER_PRIVATE_KEY` is stored as a Lambda environment variable. For production, use **AWS Secrets Manager** instead.
2. Lambda timeout is 60 seconds. If you have hundreds of bets, some might not get processed in one tick — they'll be caught in the next tick.
3. The `forceResolve` contract function from `FIX_BETS_AND_PROFILE.md` is still needed for bets to actually resolve (CoFHE decrypt doesn't work on Arbitrum Sepolia).
4. To remove the Lambda later: `npx serverless remove`
