# FIX: Stuck Bets (WIN_FLAG_PENDING) + Profile "Internal Server Error"

## Context
- **Project root**: `c:\Users\ankur\OneDrive\Desktop\CasFin\casfin`
- **Chain**: Arbitrum Sepolia (chain ID 421614)
- **FHE SDK**: `@fhenixprotocol/cofhe-contracts` and `@cofhe/sdk`
- **Keeper**: `keeper/fhe-keeper.ts`
- **Frontend**: `frontend/` (Next.js)

---

## BUG 1: Bets stuck at "PENDING" forever

### Root Cause
The contracts call `ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(...)` where `TASK_MANAGER_ADDRESS = 0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9`.

This is a **CoFHE precompile** that only works on **Fhenix-native chains** (Helium, Nitrogen). On **Arbitrum Sepolia**, there is no CoFHE coprocessor listening, so `createDecryptTask` succeeds (the precompile contract exists as a deployed mock), but **nobody ever publishes the decrypt result**. This means `FHE.getDecryptResultSafe()` always returns `(false, false)` → the contract reverts with `WIN_FLAG_PENDING` forever.

### The Fix
The keeper bot must **publish the decrypt result itself** using `FHE.publishDecryptResult()` or `ITaskManager.publishDecryptResult()`. On testnet with the mock TaskManager, the keeper can call this directly.

**If the mock TaskManager doesn't allow arbitrary publishing**, then the alternative fix is:

**Option A (Recommended): Add a `forceResolve` function to each game contract** that the owner/resolver can call. This bypasses the async decrypt and uses a plaintext random outcome instead. This is perfectly fine for testnet.

### Files to modify

#### `contracts/fhenix/EncryptedCoinFlip.sol`
Add after `finalizeResolution` (around line 157):

```solidity
/// @notice Owner-only emergency resolve for testnet when CoFHE decrypt is unavailable
function forceResolve(uint256 betId, bool won) external nonReentrant whenNotPaused onlyResolver {
    EncryptedBet storage bet = bets[betId];
    require(bet.player != address(0), "UNKNOWN_BET");
    require(!bet.resolved, "BET_RESOLVED");

    euint128 grossReturn = FHE.mul(bet.lockedHandle, ENCRYPTED_TWO);
    FHE.allowThis(grossReturn);
    euint128 winReturn = _applyHouseEdge(grossReturn);
    euint128 returnHandle = won ? winReturn : ENCRYPTED_ZERO;

    FHE.allow(returnHandle, address(vault));
    vault.settleBet(bet.player, bet.lockedHandle, returnHandle);

    bet.resolved = true;
    bet.resolutionPending = false;
    bet.won = won;

    emit EncryptedBetResolved(betId, bet.player, won);
}
```

Do the same for `EncryptedDiceGame.sol` and `EncryptedCrashGame.sol`.

#### `keeper/fhe-keeper.ts`
Update `processEncryptedBets` to call `forceResolve` when `WIN_FLAG_PENDING` persists too long.

Replace the `finalizeResolution` try-catch block (around line 106-113) with:

```typescript
try {
    const tx = await game.finalizeResolution(betId);
    console.log(`[${label}] finalizeResolution(${betId}) -> ${tx.hash}`);
    await tx.wait();
    resolutionRequestedAt.delete(requestKey);
} catch (error) {
    const errMsg = formatError(error);
    if (errMsg.includes("WIN_FLAG_PENDING")) {
        // CoFHE decrypt not available on this chain — use forceResolve
        const elapsed = Date.now() - (resolutionRequestedAt.get(requestKey) || 0);
        if (elapsed > 60000) { // Wait 60s before force-resolving
            try {
                // Simple coin flip: 50/50 using block hash
                const block = await provider.getBlock("latest");
                const won = block ? BigInt(block.hash) % 2n === 0n : false;
                const tx = await game.forceResolve(betId, won);
                console.log(`[${label}] forceResolve(${betId}, won=${won}) -> ${tx.hash}`);
                await tx.wait();
                resolutionRequestedAt.delete(requestKey);
            } catch (forceErr) {
                console.log(`[${label}] forceResolve(${betId}) failed: ${formatError(forceErr)}`);
            }
        } else {
            console.log(`[${label}] finalizeResolution(${betId}) pending: ${errMsg} (waiting ${Math.round(elapsed/1000)}s)`);
        }
    } else {
        console.log(`[${label}] finalizeResolution(${betId}) error: ${errMsg}`);
    }
}
```

#### Redeploy
After adding `forceResolve` to the contracts:
```bash
cd c:\Users\ankur\OneDrive\Desktop\CasFin\casfin
npx hardhat run scripts/redeployFheGames.ts --network arbitrumSepolia
```

Then update the contract addresses in `frontend/.env.local` and restart the keeper.

---

## BUG 2: Profile edit shows "Internal server error"

### Root Cause
The file `frontend/.env.local` does NOT contain `DATABASE_URL`. The Prisma client in `frontend/lib/db.ts` tries to connect to the database when the `/api/user/profile` PUT endpoint runs, but without a `DATABASE_URL`, Prisma throws a connection error.

The `DATABASE_URL` exists in the root `.env` file but the Next.js app only reads from `frontend/.env.local`.

### The Fix

#### `frontend/.env.local` — add these lines at the end:
```
# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@ep-YOUR-ENDPOINT-pooler.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require
```

Then also make sure Prisma has generated its client for the frontend:
```bash
cd c:\Users\ankur\OneDrive\Desktop\CasFin\casfin\frontend
npx prisma generate
npx prisma db push
```

#### For Vercel deployment
Add `DATABASE_URL` as an environment variable in the Vercel project settings dashboard.

---

## VERIFICATION

### Bug 1 (Bets):
1. Redeploy contracts with `forceResolve` added
2. Run keeper: `cd keeper && npx tsx fhe-keeper.ts`
3. Place a coin flip bet on the UI
4. Keeper should detect PENDING, wait 60s, then call `forceResolve`
5. Bet should show WIN or LOSE in the UI

### Bug 2 (Profile):
1. Add `DATABASE_URL` to `frontend/.env.local`
2. Run `npx prisma generate` in the frontend directory
3. Click the profile name, type a new name, click Save
4. Should save without "Internal server error"
