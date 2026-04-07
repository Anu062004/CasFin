require("dotenv").config();
const { ethers } = require("ethers");
const encryptedCoinFlipAbi = require("../frontend/lib/generated-abis/EncryptedCoinFlip.json");
const encryptedDiceAbi = require("../frontend/lib/generated-abis/EncryptedDiceGame.json");
const encryptedCrashAbi = require("../frontend/lib/generated-abis/EncryptedCrashGame.json");
const encryptedPredictionMarketAbi = require("../frontend/lib/generated-abis/EncryptedPredictionMarket.json");
const encryptedMarketFactoryAbi = require("../frontend/lib/generated-abis/EncryptedMarketFactory.json");
const encryptedMarketResolverAbi = require("../frontend/lib/generated-abis/EncryptedMarketResolver.json");

const provider = new ethers.JsonRpcProvider(process.env.FHENIX_RPC_URL || "https://api.helium.fhenix.zone");
const signer = new ethers.Wallet(process.env.FHENIX_PRIVATE_KEY || process.env.PRIVATE_KEY || "", provider);

const pollIntervalMs = Number(process.env.KEEPER_POLL_MS || 15000);
const resolutionDelayMs = Number(process.env.KEEPER_RESOLUTION_DELAY_MS || 30000);
const trackedCrashPlayers = (process.env.KEEPER_CRASH_PLAYERS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const configuredPredictionMarkets = (process.env.ENCRYPTED_MARKET_ADDRESSES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const resolutionRequestedAt = new Map();

function optionalContract(address, abi) {
  if (!address || !ethers.isAddress(address) || address === ethers.ZeroAddress) {
    return null;
  }

  return new ethers.Contract(address, abi, signer);
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
    resolved: bet[4],
    resolutionPending: bet[5],
    won: bet[7] ?? bet[8] ?? false
  };
}

async function buildContracts() {
  const coinFlip = optionalContract(
    process.env.ENCRYPTED_COIN_FLIP_ADDRESS || process.env.FHE_COIN_FLIP_ADDRESS,
    encryptedCoinFlipAbi
  );
  const dice = optionalContract(
    process.env.ENCRYPTED_DICE_GAME_ADDRESS || process.env.FHE_DICE_ADDRESS,
    encryptedDiceAbi
  );
  const crash = optionalContract(
    process.env.ENCRYPTED_CRASH_GAME_ADDRESS || process.env.FHE_CRASH_ADDRESS,
    encryptedCrashAbi
  );
  const predictionFactory = optionalContract(
    process.env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS || process.env.FHE_MARKET_FACTORY_ADDRESS,
    encryptedMarketFactoryAbi
  );

  return { coinFlip, dice, crash, predictionFactory };
}

async function processEncryptedBets(label, game) {
  if (!game) {
    return;
  }

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

async function processCrashRounds(crash) {
  if (!crash) {
    return;
  }

  const nextRoundId = await crash.nextRoundId();

  for (let roundId = 0n; roundId < nextRoundId; roundId += 1n) {
    const requestKey = `Crash:${roundId.toString()}`;

    try {
      const round = await crash.rounds(roundId);
      const exists = round[0];
      const closeRequested = round[2];
      const closed = round[4];

      if (!exists) {
        continue;
      }

      if (!closeRequested) {
        const tx = await crash.closeRound(roundId);
        console.log(`[Crash] closeRound(${roundId}) -> ${tx.hash}`);
        await tx.wait();
        resolutionRequestedAt.set(requestKey, Date.now());
        continue;
      }

      if (!closed) {
        if (!resolutionRequestedAt.has(requestKey)) {
          resolutionRequestedAt.set(requestKey, Date.now());
          continue;
        }

        if (Date.now() - resolutionRequestedAt.get(requestKey) < resolutionDelayMs) {
          continue;
        }

        try {
          const tx = await crash.finalizeRound(roundId);
          console.log(`[Crash] finalizeRound(${roundId}) -> ${tx.hash}`);
          await tx.wait();
          resolutionRequestedAt.delete(requestKey);
        } catch (error) {
          console.log(`[Crash] finalizeRound(${roundId}) pending: ${formatError(error)}`);
          continue;
        }
      }

      for (const player of trackedCrashPlayers) {
        try {
          const bet = await crash.playerBets(roundId, player);
          const existsForPlayer = bet[3];
          const settled = bet[4];

          if (!existsForPlayer || settled) {
            continue;
          }

          const tx = await crash.settleBet(roundId, player);
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

async function getPredictionMarketAddresses(predictionFactory) {
  const addresses = new Set(configuredPredictionMarkets);

  if (predictionFactory) {
    const totalMarkets = Number(await predictionFactory.totalMarkets());

    for (let index = 0; index < totalMarkets; index += 1) {
      addresses.add(await predictionFactory.allMarkets(index));
    }
  }

  return [...addresses].filter((value) => ethers.isAddress(value) && value !== ethers.ZeroAddress);
}

async function processPredictionMarkets(predictionFactory) {
  const marketAddresses = await getPredictionMarketAddresses(predictionFactory);

  for (const marketAddress of marketAddresses) {
    const market = new ethers.Contract(marketAddress, encryptedPredictionMarketAbi, signer);

    try {
      const [resolvesAt, resolved, resolverAddress, nextPositionId] = await Promise.all([
        market.resolvesAt(),
        market.resolved(),
        market.resolver(),
        market.nextPositionId()
      ]);

      if (!resolved && Number(resolvesAt) <= Math.floor(Date.now() / 1000)) {
        try {
          const resolver = new ethers.Contract(resolverAddress, encryptedMarketResolverAbi, signer);
          const tx = await resolver.requestResolution();
          console.log(`[Prediction] requestResolution(${marketAddress}) -> ${tx.hash}`);
          await tx.wait();
        } catch (error) {
          console.log(`[Prediction] requestResolution(${marketAddress}) skipped: ${formatError(error)}`);
        }
      }

      for (let positionId = 0n; positionId < nextPositionId; positionId += 1n) {
        const requestKey = `Prediction:${marketAddress}:${positionId.toString()}`;

        try {
          const position = await market.positions(positionId);
          const player = position[0];
          const claimRequested = position[4];
          const claimed = position[5];

          if (!player || player === ethers.ZeroAddress || claimed) {
            resolutionRequestedAt.delete(requestKey);
            continue;
          }

          if (!claimRequested) {
            resolutionRequestedAt.delete(requestKey);
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
            const tx = await market.finalizeClaimWinnings(positionId);
            console.log(`[Prediction] finalizeClaimWinnings(${marketAddress}, ${positionId}) -> ${tx.hash}`);
            await tx.wait();
            resolutionRequestedAt.delete(requestKey);
          } catch (error) {
            console.log(
              `[Prediction] finalizeClaimWinnings(${marketAddress}, ${positionId}) pending: ${formatError(error)}`
            );
          }
        } catch (error) {
          console.error(`[Prediction] market ${marketAddress} position ${positionId} failed: ${formatError(error)}`);
        }
      }
    } catch (error) {
      console.error(`[Prediction] market ${marketAddress} failed: ${formatError(error)}`);
    }
  }
}

async function tick(contracts) {
  await processEncryptedBets("CoinFlip", contracts.coinFlip);
  await processEncryptedBets("Dice", contracts.dice);
  await processCrashRounds(contracts.crash);
  await processPredictionMarkets(contracts.predictionFactory);
}

async function main() {
  if (
    (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === "your_private_key_here")
    && (!process.env.FHENIX_PRIVATE_KEY || process.env.FHENIX_PRIVATE_KEY === "your_private_key_here")
  ) {
    throw new Error("Set PRIVATE_KEY or FHENIX_PRIVATE_KEY before starting the FHE keeper.");
  }

  const contracts = await buildContracts();

  console.log("CasFin FHE keeper started");
  console.log("Signer:", await signer.getAddress());
  console.log("RPC:", process.env.FHENIX_RPC_URL || "https://api.helium.fhenix.zone");
  console.log("CoinFlip:", contracts.coinFlip?.target || "not configured");
  console.log("Dice:", contracts.dice?.target || "not configured");
  console.log("Crash:", contracts.crash?.target || "not configured");
  console.log("Prediction Factory:", contracts.predictionFactory?.target || "not configured");
  console.log(
    "Explicit prediction markets:",
    configuredPredictionMarkets.length > 0 ? configuredPredictionMarkets.join(", ") : "none"
  );
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
