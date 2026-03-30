require("dotenv").config();
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY || "", provider);

const ROUTER_ABI = [
  "function getRandomness(uint256 requestId) view returns (uint256 randomWord, bool ready)"
];

const COIN_FLIP_ABI = [
  "function nextBetId() view returns (uint256)",
  "function bets(uint256 betId) view returns (address player, uint128 lockedAmount, bool guessHeads, uint256 requestId, bool resolved, bool won)",
  "function resolveBet(uint256 betId)"
];

const DICE_ABI = [
  "function nextBetId() view returns (uint256)",
  "function bets(uint256 betId) view returns (address player, uint128 lockedAmount, uint8 guess, uint256 requestId, bool resolved, uint8 rolled, bool won)",
  "function resolveBet(uint256 betId)"
];

const CRASH_ABI = [
  "function nextRoundId() view returns (uint256)",
  "function rounds(uint256 roundId) view returns (bool exists, uint256 requestId, uint32 crashMultiplierBps, bool closed)",
  "function playerBets(uint256 roundId, address player) view returns (uint128 lockedAmount, uint32 cashOutMultiplierBps, bool exists, bool settled, bool won)",
  "function closeRound(uint256 roundId)",
  "function settleBet(uint256 roundId, address player)"
];

const pollIntervalMs = Number(process.env.KEEPER_POLL_MS || 15000);
const trackedCrashPlayers = (process.env.KEEPER_CRASH_PLAYERS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getContracts() {
  const router = new ethers.Contract(requiredEnv("CASINO_RANDOMNESS_ROUTER_ADDRESS"), ROUTER_ABI, signer);
  const coinFlip = new ethers.Contract(requiredEnv("COIN_FLIP_GAME_ADDRESS"), COIN_FLIP_ABI, signer);
  const dice = new ethers.Contract(requiredEnv("DICE_GAME_ADDRESS"), DICE_ABI, signer);
  const crash = new ethers.Contract(requiredEnv("CRASH_GAME_ADDRESS"), CRASH_ABI, signer);
  return { router, coinFlip, dice, crash };
}

async function resolveCasinoBets(label, game) {
  const nextBetId = await game.nextBetId();

  for (let betId = 0n; betId < nextBetId; betId += 1n) {
    const bet = await game.bets(betId);
    if (bet.resolved) {
      continue;
    }

    const [, ready] = await contracts.router.getRandomness(bet.requestId);
    if (!ready) {
      continue;
    }

    const tx = await game.resolveBet(betId);
    console.log(`[${label}] resolveBet(${betId}) -> ${tx.hash}`);
    await tx.wait();
  }
}

async function processCrashRounds() {
  const nextRoundId = await contracts.crash.nextRoundId();

  for (let roundId = 0n; roundId < nextRoundId; roundId += 1n) {
    const round = await contracts.crash.rounds(roundId);
    if (!round.exists) {
      continue;
    }

    if (!round.closed) {
      const [, ready] = await contracts.router.getRandomness(round.requestId);
      if (ready) {
        const tx = await contracts.crash.closeRound(roundId);
        console.log(`[Crash] closeRound(${roundId}) -> ${tx.hash}`);
        await tx.wait();
      }
      continue;
    }

    for (const player of trackedCrashPlayers) {
      const bet = await contracts.crash.playerBets(roundId, player);
      if (!bet.exists || bet.settled) {
        continue;
      }

      const tx = await contracts.crash.settleBet(roundId, player);
      console.log(`[Crash] settleBet(${roundId}, ${player}) -> ${tx.hash}`);
      await tx.wait();
    }
  }
}

async function tick() {
  await resolveCasinoBets("CoinFlip", contracts.coinFlip);
  await resolveCasinoBets("Dice", contracts.dice);
  await processCrashRounds();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let contracts;

async function main() {
  if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === "your_private_key_here") {
    throw new Error("Set PRIVATE_KEY before starting the keeper.");
  }

  contracts = getContracts();

  console.log("CasFin keeper started");
  console.log("Signer:", await signer.getAddress());
  console.log("Poll interval (ms):", pollIntervalMs);
  console.log("Tracked crash players:", trackedCrashPlayers.length > 0 ? trackedCrashPlayers.join(", ") : "none");

  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error("[Keeper]", error.message || error);
    }

    await sleep(pollIntervalMs);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
