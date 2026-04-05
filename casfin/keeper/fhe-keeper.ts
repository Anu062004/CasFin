require("dotenv").config();
const { ethers } = require("ethers");
const encryptedCoinFlipAbi = require("../frontend/lib/generated-abis/EncryptedCoinFlip.json");
const encryptedDiceAbi = require("../frontend/lib/generated-abis/EncryptedDiceGame.json");
const encryptedCrashAbi = require("../frontend/lib/generated-abis/EncryptedCrashGame.json");

const ROUTER_ABI = [
  "function getRandomness(uint256 requestId) view returns (uint256 randomWord, bool ready)"
];

const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);

const pollIntervalMs = Number(process.env.KEEPER_POLL_MS || 15000);
const resolutionDelayMs = Number(process.env.KEEPER_RESOLUTION_DELAY_MS || 30000);
const trackedCrashPlayers = (process.env.KEEPER_CRASH_PLAYERS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const resolutionRequestedAt = new Map();

function requiredEnvAny(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error) {
  return error?.shortMessage || error?.reason || error?.info?.error?.message || error?.message || String(error);
}

function getBetState(bet) {
  return {
    player: bet[0],
    requestId: bet[3],
    resolved: bet[4],
    resolutionPending: bet[5],
    won: bet[7] ?? bet[8] ?? false
  };
}

async function buildContracts() {
  const coinFlip = new ethers.Contract(
    requiredEnvAny("ENCRYPTED_COIN_FLIP_ADDRESS", "FHE_COIN_FLIP_ADDRESS"),
    encryptedCoinFlipAbi,
    signer
  );
  const dice = new ethers.Contract(
    requiredEnvAny("ENCRYPTED_DICE_GAME_ADDRESS", "FHE_DICE_ADDRESS"),
    encryptedDiceAbi,
    signer
  );
  const crash = new ethers.Contract(
    requiredEnvAny("ENCRYPTED_CRASH_GAME_ADDRESS", "FHE_CRASH_ADDRESS"),
    encryptedCrashAbi,
    signer
  );
  const routerAddress = process.env.ENCRYPTED_CASINO_RANDOMNESS_ROUTER_ADDRESS
    || process.env.CASINO_RANDOMNESS_ROUTER_ADDRESS
    || await coinFlip.randomnessRouter();
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, signer);

  return { coinFlip, dice, crash, router, routerAddress };
}

async function processEncryptedBets(label, game, router) {
  const nextBetId = await game.nextBetId();

  for (let betId = 0n; betId < nextBetId; betId += 1n) {
    const requestKey = `${label}:${betId.toString()}`;

    try {
      const bet = getBetState(await game.bets(betId));

      if (bet.resolved) {
        resolutionRequestedAt.delete(requestKey);
        continue;
      }

      if (!bet.resolutionPending) {
        const [, ready] = await router.getRandomness(bet.requestId);
        if (!ready) {
          continue;
        }

        const tx = await game.requestResolution(betId);
        console.log(`[${label}] requestResolution(${betId}) -> ${tx.hash}`);
        await tx.wait();
        resolutionRequestedAt.set(requestKey, Date.now());
        continue;
      }

      if (!resolutionRequestedAt.has(requestKey)) {
        resolutionRequestedAt.set(requestKey, Date.now());
        continue;
      }

      if (Date.now() - resolutionRequestedAt.get(requestKey) < resolutionDelayMs) {
        continue;
      }

      try {
        const tx = await game.finalizeResolution(betId);
        console.log(`[${label}] finalizeResolution(${betId}) -> ${tx.hash}`);
        await tx.wait();
        resolutionRequestedAt.delete(requestKey);
      } catch (error) {
        console.log(`[${label}] finalizeResolution(${betId}) pending: ${formatError(error)}`);
      }
    } catch (error) {
      console.error(`[${label}] bet ${betId} failed: ${formatError(error)}`);
    }
  }
}

async function processCrashRounds(contracts) {
  const nextRoundId = await contracts.crash.nextRoundId();

  for (let roundId = 0n; roundId < nextRoundId; roundId += 1n) {
    try {
      const round = await contracts.crash.rounds(roundId);
      const exists = round[0];
      const requestId = round[1];
      const closed = round[3];

      if (!exists) {
        continue;
      }

      if (!closed) {
        const [, ready] = await contracts.router.getRandomness(requestId);
        if (!ready) {
          continue;
        }

        const tx = await contracts.crash.closeRound(roundId);
        console.log(`[Crash] closeRound(${roundId}) -> ${tx.hash}`);
        await tx.wait();
        continue;
      }

      for (const player of trackedCrashPlayers) {
        try {
          const bet = await contracts.crash.playerBets(roundId, player);
          const existsForPlayer = bet[3];
          const settled = bet[4];

          if (!existsForPlayer || settled) {
            continue;
          }

          const tx = await contracts.crash.settleBet(roundId, player);
          console.log(`[Crash] settleBet(${roundId}, ${player}) -> ${tx.hash}`);
          await tx.wait();
        } catch (error) {
          console.error(`[Crash] player ${player} round ${roundId} failed: ${formatError(error)}`);
        }
      }
    } catch (error) {
      console.error(`[Crash] round ${roundId} failed: ${formatError(error)}`);
    }
  }
}

async function tick(contracts) {
  await processEncryptedBets("CoinFlip", contracts.coinFlip, contracts.router);
  await processEncryptedBets("Dice", contracts.dice, contracts.router);
  await processCrashRounds(contracts);
}

async function main() {
  if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === "your_private_key_here") {
    throw new Error("Set PRIVATE_KEY before starting the FHE keeper.");
  }

  const contracts = await buildContracts();

  console.log("CasFin FHE keeper started");
  console.log("Signer:", await signer.getAddress());
  console.log("RPC:", process.env.ARBITRUM_SEPOLIA_RPC_URL);
  console.log("Router:", contracts.routerAddress);
  console.log("CoinFlip:", contracts.coinFlip.target);
  console.log("Dice:", contracts.dice.target);
  console.log("Crash:", contracts.crash.target);
  console.log("Poll interval (ms):", pollIntervalMs);
  console.log("Resolution delay (ms):", resolutionDelayMs);
  console.log("Tracked crash players:", trackedCrashPlayers.length > 0 ? trackedCrashPlayers.join(", ") : "none");

  while (true) {
    try {
      await tick(contracts);
    } catch (error) {
      console.error("[FHE Keeper]", formatError(error));
    }

    await sleep(pollIntervalMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
