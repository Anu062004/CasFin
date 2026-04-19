# TASK: Move Keeper Bot to Vercel Cron Job

## WHAT TO DO
Convert the standalone `keeper/fhe-keeper.ts` long-running process into a **Vercel Cron Job** that runs as a Next.js API route inside the existing frontend app. This way the keeper runs on Vercel's infrastructure — no separate server needed.

---

## PROJECT INFO
- **Project root**: `c:\Users\ankur\OneDrive\Desktop\CasFin\casfin`
- **Frontend root**: `c:\Users\ankur\OneDrive\Desktop\CasFin\casfin\frontend`
- **Existing keeper**: `keeper/fhe-keeper.ts` (standalone Node.js script, runs in infinite loop)
- **Vercel config**: `frontend/vercel.json`
- **Chain**: Arbitrum Sepolia (421614)
- **Deployed on**: Vercel (frontend is already live at casfin-frontend.vercel.app)

---

## HOW VERCEL CRON WORKS
1. You add a `crons` array to `vercel.json`
2. Each cron calls a Next.js API route on a schedule
3. The route must complete within **60 seconds** (Pro) or **10 seconds** (Hobby)
4. Vercel sends `Authorization: Bearer <CRON_SECRET>` header — you must verify it

---

## STEP 1: Create shared keeper logic module

Create **`frontend/lib/keeper-logic.ts`** — extract the core logic from `keeper/fhe-keeper.ts`:

```typescript
import { ethers } from "ethers";

// Import ABIs
import EncryptedCoinFlipAbi from "@/lib/generated-abis/EncryptedCoinFlip.json";
import EncryptedDiceGameAbi from "@/lib/generated-abis/EncryptedDiceGame.json";
import EncryptedCrashGameAbi from "@/lib/generated-abis/EncryptedCrashGame.json";
import EncryptedMarketFactoryAbi from "@/lib/generated-abis/EncryptedMarketFactory.json";
import EncryptedPredictionMarketAbi from "@/lib/generated-abis/EncryptedPredictionMarket.json";
import EncryptedMarketResolverAbi from "@/lib/generated-abis/EncryptedMarketResolver.json";

function getProvider() {
  const rpcUrl =
    process.env.KEEPER_RPC_URL ||
    process.env.ARBITRUM_SEPOLIA_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL_1 ||
    "https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f";
  return new ethers.JsonRpcProvider(rpcUrl);
}

function getSigner() {
  const rawKey = process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY || "";
  if (!rawKey || rawKey === "your_private_key_here") {
    throw new Error("KEEPER_PRIVATE_KEY not configured");
  }
  const key = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  return new ethers.Wallet(key, getProvider());
}

function optionalContract(
  address: string | undefined,
  abi: any,
  signer: ethers.Wallet
) {
  if (!address || !ethers.isAddress(address) || address === ethers.ZeroAddress) {
    return null;
  }
  return new ethers.Contract(address, abi, signer);
}

function formatError(error: any): string {
  return (
    error?.shortMessage ||
    error?.reason ||
    error?.info?.error?.message ||
    error?.message ||
    String(error)
  );
}

function getBetState(bet: any) {
  return {
    player: bet[0],
    resolved: bet[4],
    resolutionPending: bet[5],
    won: bet[7] ?? bet[8] ?? false,
  };
}

// Process CoinFlip and Dice bets (same pattern)
async function processEncryptedBets(
  label: string,
  game: ethers.Contract | null,
  logs: string[]
) {
  if (!game) return;

  const nextBetId = await game.nextBetId();
  const resolutionDelayMs = 30000;

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

      // Already pending — try to finalize
      try {
        const tx = await game.finalizeResolution(betId);
        logs.push(`[${label}] finalizeResolution(${betId}) -> ${tx.hash}`);
        await tx.wait();
      } catch (error: any) {
        const errMsg = formatError(error);
        logs.push(`[${label}] finalizeResolution(${betId}) pending: ${errMsg}`);

        // If WIN_FLAG_PENDING persists, try forceResolve if available
        if (errMsg.includes("WIN_FLAG_PENDING")) {
          try {
            const provider = getProvider();
            const block = await provider.getBlock("latest");
            const won = block ? BigInt(block.hash) % 2n === 0n : false;
            const tx = await game.forceResolve(betId, won);
            logs.push(`[${label}] forceResolve(${betId}, won=${won}) -> ${tx.hash}`);
            await tx.wait();
          } catch (forceErr: any) {
            logs.push(`[${label}] forceResolve(${betId}) failed: ${formatError(forceErr)}`);
          }
        }
      }
    } catch (error: any) {
      logs.push(`[${label}] bet ${betId}: ${formatError(error)}`);
    }
  }
}

// Process Crash rounds
async function processCrashRounds(
  crash: ethers.Contract | null,
  logs: string[]
) {
  if (!crash) return;

  const nextRoundId = await crash.nextRoundId();

  for (let roundId = 0n; roundId < nextRoundId; roundId += 1n) {
    try {
      const round = await crash.rounds(roundId);
      const exists = round[0];
      const closeRequested = round[2];
      const closed = round[4];

      if (!exists) continue;

      if (!closeRequested) {
        const tx = await crash.closeRound(roundId);
        logs.push(`[Crash] closeRound(${roundId}) -> ${tx.hash}`);
        await tx.wait();
        continue;
      }

      if (!closed) {
        try {
          const tx = await crash.finalizeRound(roundId);
          logs.push(`[Crash] finalizeRound(${roundId}) -> ${tx.hash}`);
          await tx.wait();
        } catch (error: any) {
          logs.push(`[Crash] finalizeRound(${roundId}) pending: ${formatError(error)}`);
        }
      }
    } catch (error: any) {
      logs.push(`[Crash] round ${roundId}: ${formatError(error)}`);
    }
  }
}

// Process Prediction Markets
async function processPredictionMarkets(
  predictionFactory: ethers.Contract | null,
  signer: ethers.Wallet,
  logs: string[]
) {
  const configuredMarkets = (process.env.ENCRYPTED_MARKET_ADDRESSES || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const addresses = new Set(configuredMarkets);

  if (predictionFactory) {
    const totalMarkets = Number(await predictionFactory.totalMarkets());
    for (let i = 0; i < totalMarkets; i++) {
      addresses.add(await predictionFactory.allMarkets(i));
    }
  }

  const validAddresses = [...addresses].filter(
    (addr) => ethers.isAddress(addr) && addr !== ethers.ZeroAddress
  );

  for (const marketAddress of validAddresses) {
    const market = new ethers.Contract(
      marketAddress,
      EncryptedPredictionMarketAbi,
      signer
    );

    try {
      const [resolvesAt, resolved, resolverAddress, nextPositionId] =
        await Promise.all([
          market.resolvesAt(),
          market.resolved(),
          market.resolver(),
          market.nextPositionId(),
        ]);

      if (
        !resolved &&
        Number(resolvesAt) <= Math.floor(Date.now() / 1000)
      ) {
        try {
          const resolver = new ethers.Contract(
            resolverAddress,
            EncryptedMarketResolverAbi,
            signer
          );
          const tx = await resolver.requestResolution();
          logs.push(`[Prediction] requestResolution(${marketAddress}) -> ${tx.hash}`);
          await tx.wait();
        } catch (error: any) {
          logs.push(`[Prediction] requestResolution(${marketAddress}) skipped: ${formatError(error)}`);
        }
      }

      for (let positionId = 0n; positionId < nextPositionId; positionId += 1n) {
        try {
          const position = await market.positions(positionId);
          const player = position[0];
          const claimRequested = position[4];
          const claimed = position[5];

          if (!player || player === ethers.ZeroAddress || claimed) continue;
          if (!claimRequested) continue;

          try {
            const tx = await market.finalizeClaimWinnings(positionId);
            logs.push(`[Prediction] finalizeClaimWinnings(${marketAddress}, ${positionId}) -> ${tx.hash}`);
            await tx.wait();
          } catch (error: any) {
            logs.push(`[Prediction] finalizeClaimWinnings(${marketAddress}, ${positionId}) pending: ${formatError(error)}`);
          }
        } catch (error: any) {
          logs.push(`[Prediction] position ${positionId}: ${formatError(error)}`);
        }
      }
    } catch (error: any) {
      logs.push(`[Prediction] market ${marketAddress}: ${formatError(error)}`);
    }
  }
}

/**
 * Run one complete keeper tick. Returns logs array.
 */
export async function runKeeperTick(): Promise<string[]> {
  const logs: string[] = [];
  const signer = getSigner();

  logs.push(`Keeper tick at ${new Date().toISOString()}`);
  logs.push(`Signer: ${await signer.getAddress()}`);

  const coinFlip = optionalContract(
    process.env.ENCRYPTED_COIN_FLIP_ADDRESS || process.env.NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS,
    EncryptedCoinFlipAbi,
    signer
  );
  const dice = optionalContract(
    process.env.ENCRYPTED_DICE_GAME_ADDRESS || process.env.NEXT_PUBLIC_FHE_DICE_ADDRESS,
    EncryptedDiceGameAbi,
    signer
  );
  const crash = optionalContract(
    process.env.ENCRYPTED_CRASH_GAME_ADDRESS || process.env.NEXT_PUBLIC_FHE_CRASH_ADDRESS,
    EncryptedCrashGameAbi,
    signer
  );
  const predictionFactory = optionalContract(
    process.env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS || process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS,
    EncryptedMarketFactoryAbi,
    signer
  );

  logs.push(`CoinFlip: ${coinFlip ? (coinFlip as any).target : "not configured"}`);
  logs.push(`Dice: ${dice ? (dice as any).target : "not configured"}`);
  logs.push(`Crash: ${crash ? (crash as any).target : "not configured"}`);

  await processEncryptedBets("CoinFlip", coinFlip, logs);
  await processEncryptedBets("Dice", dice, logs);
  await processCrashRounds(crash, logs);
  await processPredictionMarkets(predictionFactory, signer, logs);

  logs.push(`Tick complete at ${new Date().toISOString()}`);
  return logs;
}
```

---

## STEP 2: Create the Cron API Route

Create **`frontend/app/api/keeper/tick/route.ts`**:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { runKeeperTick } from "@/lib/keeper-logic";

// Vercel Cron requires this to be a GET endpoint
export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const logs = await runKeeperTick();
    console.log("[Keeper Cron]", logs.join("\n"));
    return NextResponse.json({ ok: true, logs });
  } catch (error: any) {
    console.error("[Keeper Cron] Error:", error);
    return NextResponse.json(
      { error: error.message || "Keeper tick failed" },
      { status: 500 }
    );
  }
}

// Vercel Cron config — allow up to 60 seconds for Pro plan
export const maxDuration = 60;
export const dynamic = "force-dynamic";
```

---

## STEP 3: Update vercel.json

Replace the contents of **`frontend/vercel.json`** with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm install --legacy-peer-deps",
  "buildCommand": "npm run build",
  "crons": [
    {
      "path": "/api/keeper/tick",
      "schedule": "* * * * *"
    }
  ]
}
```

The schedule `* * * * *` = **every 1 minute**.

---

## STEP 4: Add Environment Variables to Vercel

These env vars must be set in the **Vercel dashboard** (Settings → Environment Variables) OR via Vercel CLI:

```bash
cd c:\Users\ankur\OneDrive\Desktop\CasFin\casfin\frontend

# The keeper's private key (IMPORTANT: server-only, NO NEXT_PUBLIC_ prefix)
npx vercel env add KEEPER_PRIVATE_KEY
# Paste: efa2f...REDACTED...f66

# RPC URL for the keeper
npx vercel env add KEEPER_RPC_URL
# Paste: https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f

# Contract addresses (use same values as NEXT_PUBLIC_ versions)
npx vercel env add ENCRYPTED_COIN_FLIP_ADDRESS
# Paste: 0x2a43F77A2286ffC3ebfb5D577123CB7cEf8553Af

npx vercel env add ENCRYPTED_DICE_GAME_ADDRESS
# Paste: 0x7D7A8f22727CB618f5C96eCA151C48Bc0aa3D563

npx vercel env add ENCRYPTED_CRASH_GAME_ADDRESS
# Paste: 0x6465C2f5F5c9B2F7F05dC6E6D799514D6F1d214D

npx vercel env add ENCRYPTED_PREDICTION_FACTORY_ADDRESS
# Paste: 0xC876De943508B4938d3d8f010cc97dbac7Ab0B43

# Cron secret to protect the endpoint
npx vercel env add CRON_SECRET
# Paste any random string, e.g.: casfin-keeper-secret-2026
```

**CRITICAL**: `KEEPER_PRIVATE_KEY` must NOT have the `NEXT_PUBLIC_` prefix — it would leak the private key to the browser!

---

## STEP 5: Add to frontend/.env.local for local testing

Add these to **`frontend/.env.local`** so you can test locally:

```
# Keeper (server-only)
KEEPER_PRIVATE_KEY=efa2f...REDACTED...f66
KEEPER_RPC_URL=https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f
ENCRYPTED_COIN_FLIP_ADDRESS=0x2a43F77A2286ffC3ebfb5D577123CB7cEf8553Af
ENCRYPTED_DICE_GAME_ADDRESS=0x7D7A8f22727CB618f5C96eCA151C48Bc0aa3D563
ENCRYPTED_CRASH_GAME_ADDRESS=0x6465C2f5F5c9B2F7F05dC6E6D799514D6F1d214D
ENCRYPTED_PREDICTION_FACTORY_ADDRESS=0xC876De943508B4938d3d8f010cc97dbac7Ab0B43
CRON_SECRET=local-dev-secret
```

---

## STEP 6: Deploy

```bash
cd c:\Users\ankur\OneDrive\Desktop\CasFin\casfin\frontend
npx vercel --prod
```

Or just push to GitHub if auto-deploy is set up.

---

## STEP 7: Verify

### Local test:
```bash
curl http://localhost:3000/api/keeper/tick
```

### On Vercel:
1. Go to **Vercel Dashboard → Project → Cron Jobs** tab
2. You should see `/api/keeper/tick` scheduled every minute
3. Click "Run now" to test
4. Check logs in Vercel → Deployments → Functions → `/api/keeper/tick`

---

## IMPORTANT NOTES
1. **Vercel Hobby plan**: Cron runs minimum every 1 hour (NOT every minute). **You need Vercel Pro ($20/mo) for 1-minute cron.** On Hobby, set schedule to `0 * * * *` (hourly).
2. **Max duration**: Hobby = 10s, Pro = 60s. If you have many bets to process, some may time out.
3. The `KEEPER_PRIVATE_KEY` env var must NEVER start with `NEXT_PUBLIC_` — that would expose it to the client.
4. The `forceResolve` contract fix from `FIX_BETS_AND_PROFILE.md` is still needed for the bets to actually resolve. The cron just automates calling the keeper.
