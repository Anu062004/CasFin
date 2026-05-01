/**
 * CasFin Event Indexer
 *
 * Syncs on-chain events from FHE casino, vault, and prediction market
 * contracts into the Prisma PostgreSQL database.
 *
 * Usage:
 *   npx tsx scripts/indexer.ts              # continuous mode (loop every 30s)
 *   npx tsx scripts/indexer.ts --once       # single pass then exit
 *   npx tsx scripts/indexer.ts --backfill   # backfill from block 0
 */

import { ethers } from "ethers";
import { PrismaClient, GameType, VaultTxType, TradeType } from "@prisma/client";

// ─── ABIs (event fragments only) ─────────────────────────────────────

import EncryptedCoinFlipAbi from "../lib/generated-abis/EncryptedCoinFlip.json";
import EncryptedDiceGameAbi from "../lib/generated-abis/EncryptedDiceGame.json";
import EncryptedCrashGameAbi from "../lib/generated-abis/EncryptedCrashGame.json";
import EncryptedCasinoVaultAbi from "../lib/generated-abis/EncryptedCasinoVault.json";
import EncryptedMarketFactoryAbi from "../lib/generated-abis/EncryptedMarketFactory.json";
import EncryptedPredictionMarketAbi from "../lib/generated-abis/EncryptedPredictionMarket.json";

// ─── Config ──────────────────────────────────────────────────────────

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL_1 ||
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_1 ||
  process.env.NEXT_PUBLIC_FHE_RPC_URL ||
  "https://sepolia-rollup.arbitrum.io/rpc";

const ADDRESSES = {
  coinFlip:
    process.env.NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS || "0x084408DC6278f599C9A41A0CF594852afd26b662",
  dice:
    process.env.NEXT_PUBLIC_FHE_DICE_ADDRESS || "0xDfC7da5259aEe8BaEd8A07449FD771ce6683896E",
  crash:
    process.env.NEXT_PUBLIC_FHE_CRASH_ADDRESS || "0xd920Ca5F942Cf7EfE4E389E8F98830d4664de668",
  vault:
    process.env.NEXT_PUBLIC_FHE_VAULT_ADDRESS || "0xA6406C70FaF7E86B9B8b1cdbC21F7148f6d3E175",
  marketFactory:
    process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS || "0x6753A055CC37240De70DF635ce1E1E15cF466283",
};

const POLL_INTERVAL_MS = Number(process.env.INDEXER_POLL_MS) || 30_000;
const BLOCK_BATCH_SIZE = 2000; // max blocks per getLogs call

// ─── Prisma ──────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────

async function ensureUser(address: string) {
  await prisma.user.upsert({
    where: { walletAddress: address },
    update: { lastActiveAt: new Date() },
    create: { walletAddress: address },
  });
}

async function getSyncCursor(id: string): Promise<bigint> {
  const cursor = await prisma.syncCursor.findUnique({ where: { id } });
  return cursor ? cursor.lastBlock : 0n;
}

async function setSyncCursor(id: string, block: bigint) {
  await prisma.syncCursor.upsert({
    where: { id },
    update: { lastBlock: block, lastUpdatedAt: new Date() },
    create: { id, lastBlock: block },
  });
}

async function updatePlatformStats(newBets: number, newVolume: bigint, newMarkets: number, newUsers: string[]) {
  // Deduplicate by checking existing user count
  const uniqueNew = newUsers.length > 0
    ? await prisma.user.count({ where: { walletAddress: { in: newUsers } } })
    : 0;

  if (newBets === 0 && newVolume === 0n && newMarkets === 0 && uniqueNew === 0) return;

  const stats = await prisma.platformStats.findUnique({ where: { id: "global" } });
  const prev = stats || { totalBets: 0, totalVolumeWei: "0", totalMarketsCreated: 0, uniqueUsers: 0 };
  const totalUsers = await prisma.user.count();

  await prisma.platformStats.upsert({
    where: { id: "global" },
    update: {
      totalBets: prev.totalBets + newBets,
      totalVolumeWei: (BigInt(prev.totalVolumeWei) + newVolume).toString(),
      totalMarketsCreated: prev.totalMarketsCreated + newMarkets,
      uniqueUsers: totalUsers,
      updatedAt: new Date(),
    },
    create: {
      totalBets: newBets,
      totalVolumeWei: newVolume.toString(),
      totalMarketsCreated: newMarkets,
      uniqueUsers: totalUsers,
    },
  });
}

// ─── Event Processors ────────────────────────────────────────────────

async function indexCoinFlip(provider: ethers.JsonRpcProvider, fromBlock: bigint, toBlock: bigint) {
  const contract = new ethers.Contract(ADDRESSES.coinFlip, EncryptedCoinFlipAbi, provider);
  let betsAdded = 0;

  // BetPlaced events
  const placedFilter = contract.filters.EncryptedBetPlaced();
  const placedLogs = await contract.queryFilter(placedFilter, Number(fromBlock), Number(toBlock));

  for (const log of placedLogs) {
    const parsed = log as ethers.EventLog;
    const betId = parsed.args[0];
    const player = parsed.args[1].toLowerCase();
    await ensureUser(player);
    await prisma.casinoBet.upsert({
      where: { gameType_onChainBetId: { gameType: GameType.COIN_FLIP, onChainBetId: BigInt(betId) } },
      update: {},
      create: {
        gameType: GameType.COIN_FLIP,
        onChainBetId: BigInt(betId),
        playerAddress: player,
        betAmountWei: "0", // encrypted — not visible on-chain
        txHash: parsed.transactionHash,
        blockNumber: BigInt(parsed.blockNumber),
      },
    });
    betsAdded++;
  }

  // BetResolved events
  const resolvedFilter = contract.filters.EncryptedBetResolved();
  const resolvedLogs = await contract.queryFilter(resolvedFilter, Number(fromBlock), Number(toBlock));

  for (const log of resolvedLogs) {
    const parsed = log as ethers.EventLog;
    const betId = parsed.args[0];
    const won = parsed.args[2];
    try {
      await prisma.casinoBet.update({
        where: { gameType_onChainBetId: { gameType: GameType.COIN_FLIP, onChainBetId: BigInt(betId) } },
        data: { resolved: true, resolutionPending: false, won, resolvedAt: new Date() },
      });
    } catch {
      // Bet might not exist if placed before indexer start — create stub
      const player = (parsed.args[1] as string).toLowerCase();
      await ensureUser(player);
      await prisma.casinoBet.upsert({
        where: { gameType_onChainBetId: { gameType: GameType.COIN_FLIP, onChainBetId: BigInt(betId) } },
        update: { resolved: true, resolutionPending: false, won, resolvedAt: new Date() },
        create: {
          gameType: GameType.COIN_FLIP,
          onChainBetId: BigInt(betId),
          playerAddress: player,
          betAmountWei: "0",
          resolved: true,
          won,
          resolvedAt: new Date(),
          txHash: parsed.transactionHash,
          blockNumber: BigInt(parsed.blockNumber),
        },
      });
    }
  }

  return betsAdded;
}

async function indexDice(provider: ethers.JsonRpcProvider, fromBlock: bigint, toBlock: bigint) {
  const contract = new ethers.Contract(ADDRESSES.dice, EncryptedDiceGameAbi, provider);
  let betsAdded = 0;

  const placedFilter = contract.filters.EncryptedDiceBetPlaced();
  const placedLogs = await contract.queryFilter(placedFilter, Number(fromBlock), Number(toBlock));

  for (const log of placedLogs) {
    const parsed = log as ethers.EventLog;
    const betId = parsed.args[0];
    const player = parsed.args[1].toLowerCase();
    await ensureUser(player);
    await prisma.casinoBet.upsert({
      where: { gameType_onChainBetId: { gameType: GameType.DICE, onChainBetId: BigInt(betId) } },
      update: {},
      create: {
        gameType: GameType.DICE,
        onChainBetId: BigInt(betId),
        playerAddress: player,
        betAmountWei: "0",
        txHash: parsed.transactionHash,
        blockNumber: BigInt(parsed.blockNumber),
      },
    });
    betsAdded++;
  }

  // DiceBetResolved has extra `rolledValue` arg
  const resolvedFilter = contract.filters.EncryptedDiceBetResolved();
  const resolvedLogs = await contract.queryFilter(resolvedFilter, Number(fromBlock), Number(toBlock));

  for (const log of resolvedLogs) {
    const parsed = log as ethers.EventLog;
    const betId = parsed.args[0];
    const player = (parsed.args[1] as string).toLowerCase();
    const rolledValue = Number(parsed.args[2]);
    const won = parsed.args[3];

    await ensureUser(player);
    await prisma.casinoBet.upsert({
      where: { gameType_onChainBetId: { gameType: GameType.DICE, onChainBetId: BigInt(betId) } },
      update: { resolved: true, resolutionPending: false, won, diceRolled: rolledValue, resolvedAt: new Date() },
      create: {
        gameType: GameType.DICE,
        onChainBetId: BigInt(betId),
        playerAddress: player,
        betAmountWei: "0",
        resolved: true,
        won,
        diceRolled: rolledValue,
        resolvedAt: new Date(),
        txHash: parsed.transactionHash,
        blockNumber: BigInt(parsed.blockNumber),
      },
    });
  }

  return betsAdded;
}

async function indexCrash(provider: ethers.JsonRpcProvider, fromBlock: bigint, toBlock: bigint) {
  const contract = new ethers.Contract(ADDRESSES.crash, EncryptedCrashGameAbi, provider);
  let betsAdded = 0;

  // RoundStarted
  const startedLogs = await contract.queryFilter(contract.filters.RoundStarted(), Number(fromBlock), Number(toBlock));
  for (const log of startedLogs) {
    const parsed = log as ethers.EventLog;
    const roundId = parsed.args[0];
    await prisma.crashRound.upsert({
      where: { onChainRoundId: BigInt(roundId) },
      update: {},
      create: {
        onChainRoundId: BigInt(roundId),
        txHash: parsed.transactionHash,
        blockNumber: BigInt(parsed.blockNumber),
      },
    });
  }

  // RoundClosed(uint256 indexed roundId, uint32 crashMultiplierBps)
  const closedLogs = await contract.queryFilter(contract.filters.RoundClosed(), Number(fromBlock), Number(toBlock));
  for (const log of closedLogs) {
    const parsed = log as ethers.EventLog;
    const roundId = parsed.args[0];
    const multiplier = Number(parsed.args[1]);
    await prisma.crashRound.upsert({
      where: { onChainRoundId: BigInt(roundId) },
      update: { closed: true, crashMultiplierBps: multiplier, closedAt: new Date() },
      create: {
        onChainRoundId: BigInt(roundId),
        closed: true,
        crashMultiplierBps: multiplier,
        closedAt: new Date(),
        txHash: parsed.transactionHash,
        blockNumber: BigInt(parsed.blockNumber),
      },
    });
  }

  // CrashBetPlaced(uint256 indexed roundId, address indexed player)
  const betLogs = await contract.queryFilter(contract.filters.CrashBetPlaced(), Number(fromBlock), Number(toBlock));
  for (const log of betLogs) {
    const parsed = log as ethers.EventLog;
    const roundId = parsed.args[0];
    const player = parsed.args[1].toLowerCase();
    await ensureUser(player);

    // Use txHash as a unique identifier for crash bets since there's no sequential betId
    const betIdProxy = BigInt(parsed.transactionHash.slice(0, 18));

    await prisma.casinoBet.upsert({
      where: { gameType_onChainBetId: { gameType: GameType.CRASH, onChainBetId: betIdProxy } },
      update: {},
      create: {
        gameType: GameType.CRASH,
        onChainBetId: betIdProxy,
        playerAddress: player,
        betAmountWei: "0",
        crashRoundId: BigInt(roundId),
        txHash: parsed.transactionHash,
        blockNumber: BigInt(parsed.blockNumber),
      },
    });
    betsAdded++;
  }

  // CrashBetSettled(uint256 indexed roundId, address indexed player, bool won)
  const settledLogs = await contract.queryFilter(contract.filters.CrashBetSettled(), Number(fromBlock), Number(toBlock));
  for (const log of settledLogs) {
    const parsed = log as ethers.EventLog;
    const player = parsed.args[1].toLowerCase();
    const won = parsed.args[2];

    // Find the bet by player + round
    const betIdProxy = BigInt(parsed.transactionHash.slice(0, 18));
    // Try to update any matching crash bet for this player in this round
    const existing = await prisma.casinoBet.findFirst({
      where: { gameType: GameType.CRASH, playerAddress: player, crashRoundId: BigInt(parsed.args[0]) },
    });

    if (existing) {
      await prisma.casinoBet.update({
        where: { id: existing.id },
        data: { resolved: true, resolutionPending: false, won, resolvedAt: new Date() },
      });
    } else {
      await ensureUser(player);
      await prisma.casinoBet.create({
        data: {
          gameType: GameType.CRASH,
          onChainBetId: betIdProxy,
          playerAddress: player,
          betAmountWei: "0",
          crashRoundId: BigInt(parsed.args[0]),
          resolved: true,
          won,
          resolvedAt: new Date(),
          txHash: parsed.transactionHash,
          blockNumber: BigInt(parsed.blockNumber),
        },
      });
    }
  }

  return betsAdded;
}

async function indexVault(provider: ethers.JsonRpcProvider, fromBlock: bigint, toBlock: bigint) {
  const contract = new ethers.Contract(ADDRESSES.vault, EncryptedCasinoVaultAbi, provider);

  const EVENT_MAP: Array<{ filter: ethers.ContractEventName; txType: VaultTxType }> = [
    { filter: "Deposited", txType: VaultTxType.DEPOSIT },
    { filter: "Withdrawn", txType: VaultTxType.WITHDRAWAL },
    { filter: "HouseBankrollFunded", txType: VaultTxType.BANKROLL_FUND },
    { filter: "HouseFundsWithdrawn", txType: VaultTxType.HOUSE_WITHDRAW },
  ];

  for (const { filter, txType } of EVENT_MAP) {
    const logs = await contract.queryFilter(filter, Number(fromBlock), Number(toBlock));
    for (const log of logs) {
      const parsed = log as ethers.EventLog;
      const player = parsed.args[0].toLowerCase();
      await ensureUser(player);
      await prisma.vaultTransaction.create({
        data: {
          txType,
          playerAddress: player,
          amountWei: "0", // encrypted — amount not visible on-chain
          txHash: parsed.transactionHash,
          blockNumber: BigInt(parsed.blockNumber),
        },
      });
    }
  }
}

async function indexMarketFactory(provider: ethers.JsonRpcProvider, fromBlock: bigint, toBlock: bigint) {
  const contract = new ethers.Contract(ADDRESSES.marketFactory, EncryptedMarketFactoryAbi, provider);
  let marketsCreated = 0;

  // MarketCreated(uint256 indexed marketId, address indexed creator, address indexed marketAddress,
  //               address ammAddress, address poolAddress, address resolverAddress, string question)
  const logs = await contract.queryFilter(contract.filters.MarketCreated(), Number(fromBlock), Number(toBlock));

  for (const log of logs) {
    const parsed = log as ethers.EventLog;
    const creator = parsed.args[1].toLowerCase();
    const marketAddr = parsed.args[2].toLowerCase();
    const ammAddr = parsed.args[3]?.toLowerCase() ?? null;
    const poolAddr = parsed.args[4]?.toLowerCase() ?? null;
    const resolverAddr = parsed.args[5]?.toLowerCase() ?? null;
    const question = parsed.args[6] ?? "";

    await ensureUser(creator);

    // Read on-chain data from the market contract for full details
    let description = "";
    let outcomes: string[] = ["Yes", "No"];
    let resolvesAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // fallback
    let disputeWindowSecs = 86400;

    try {
      const market = new ethers.Contract(marketAddr, EncryptedPredictionMarketAbi, provider);
      const [desc, rAt, dws, outCount] = await Promise.all([
        market.description().catch(() => ""),
        market.resolvesAt().catch(() => 0n),
        market.disputeWindowSecs().catch(() => 86400n),
        market.outcomesCount().catch(() => 2n),
      ]);
      description = desc;
      if (rAt > 0n) resolvesAt = new Date(Number(rAt) * 1000);
      disputeWindowSecs = Number(dws);

      const outcomePromises: Promise<string>[] = [];
      for (let i = 0; i < Number(outCount); i++) {
        outcomePromises.push(market.outcomes(i).catch(() => `Outcome ${i}`));
      }
      outcomes = await Promise.all(outcomePromises);
    } catch {
      // If on-chain reads fail, use defaults
    }

    await prisma.predictionMarket.upsert({
      where: { onChainAddress: marketAddr },
      update: {},
      create: {
        onChainAddress: marketAddr,
        factoryAddress: ADDRESSES.marketFactory.toLowerCase(),
        creatorAddress: creator,
        question,
        description,
        outcomes,
        resolvesAt,
        disputeWindowSecs,
        ammAddress: ammAddr,
        poolAddress: poolAddr,
        resolverAddress: resolverAddr,
        blockNumber: BigInt(parsed.blockNumber),
      },
    });
    marketsCreated++;
  }

  return marketsCreated;
}

async function indexMarketEvents(provider: ethers.JsonRpcProvider, fromBlock: bigint, toBlock: bigint) {
  // Get all known market addresses from DB
  const markets = await prisma.predictionMarket.findMany({
    select: { onChainAddress: true },
  });

  for (const { onChainAddress } of markets) {
    const market = new ethers.Contract(onChainAddress, EncryptedPredictionMarketAbi, provider);

    // SharesBought(address indexed buyer, uint8 indexed outcomeIndex)
    const buyLogs = await market.queryFilter(market.filters.SharesBought(), Number(fromBlock), Number(toBlock));
    for (const log of buyLogs) {
      const parsed = log as ethers.EventLog;
      const trader = parsed.args[0].toLowerCase();
      const outcomeIndex = Number(parsed.args[1]);
      await ensureUser(trader);
      await prisma.marketTrade.create({
        data: {
          marketAddress: onChainAddress,
          traderAddress: trader,
          tradeType: TradeType.BUY,
          outcomeIndex,
          amountWei: "0", // encrypted
          sharesAmount: "0", // encrypted
          txHash: parsed.transactionHash,
          blockNumber: BigInt(parsed.blockNumber),
        },
      });
    }

    // SharesSold(address indexed seller, uint8 indexed outcomeIndex)
    const sellLogs = await market.queryFilter(market.filters.SharesSold(), Number(fromBlock), Number(toBlock));
    for (const log of sellLogs) {
      const parsed = log as ethers.EventLog;
      const trader = parsed.args[0].toLowerCase();
      const outcomeIndex = Number(parsed.args[1]);
      await ensureUser(trader);
      await prisma.marketTrade.create({
        data: {
          marketAddress: onChainAddress,
          traderAddress: trader,
          tradeType: TradeType.SELL,
          outcomeIndex,
          amountWei: "0",
          sharesAmount: "0",
          txHash: parsed.transactionHash,
          blockNumber: BigInt(parsed.blockNumber),
        },
      });
    }

    // MarketResolved(uint8 indexed winningOutcome, address indexed resolver)
    const resolvedLogs = await market.queryFilter(market.filters.MarketResolved(), Number(fromBlock), Number(toBlock));
    for (const log of resolvedLogs) {
      const parsed = log as ethers.EventLog;
      await prisma.predictionMarket.update({
        where: { onChainAddress },
        data: { resolved: true, winningOutcome: Number(parsed.args[0]), resolvedAt: new Date() },
      });
    }

    // MarketFinalized()
    const finalizedLogs = await market.queryFilter(market.filters.MarketFinalized(), Number(fromBlock), Number(toBlock));
    if (finalizedLogs.length > 0) {
      await prisma.predictionMarket.update({
        where: { onChainAddress },
        data: { finalized: true },
      });
    }
  }
}

// ─── Main Sync Loop ──────────────────────────────────────────────────

async function syncOnce(provider: ethers.JsonRpcProvider) {
  const latestBlock = BigInt(await provider.getBlockNumber());

  // Use a single cursor for all contracts
  const lastProcessed = await getSyncCursor("global");
  const startBlock = lastProcessed > 0n ? lastProcessed + 1n : latestBlock - 10000n; // on first run, look back 10k blocks

  if (startBlock > latestBlock) {
    console.log(`[indexer] Up to date at block ${latestBlock}`);
    return;
  }

  console.log(`[indexer] Syncing blocks ${startBlock} → ${latestBlock} (${latestBlock - startBlock + 1n} blocks)`);

  let currentFrom = startBlock;
  let totalBets = 0;
  let totalMarkets = 0;

  while (currentFrom <= latestBlock) {
    const currentTo = currentFrom + BigInt(BLOCK_BATCH_SIZE) - 1n > latestBlock
      ? latestBlock
      : currentFrom + BigInt(BLOCK_BATCH_SIZE) - 1n;

    console.log(`[indexer]   batch ${currentFrom}..${currentTo}`);

    try {
      const [coinBets, diceBets, crashBets, , mkts] = await Promise.all([
        indexCoinFlip(provider, currentFrom, currentTo),
        indexDice(provider, currentFrom, currentTo),
        indexCrash(provider, currentFrom, currentTo),
        indexVault(provider, currentFrom, currentTo),
        indexMarketFactory(provider, currentFrom, currentTo),
      ]);

      // Index individual market events after factory events (so new markets are in DB)
      await indexMarketEvents(provider, currentFrom, currentTo);

      totalBets += coinBets + diceBets + crashBets;
      totalMarkets += mkts;
    } catch (err) {
      console.error(`[indexer]   batch error at ${currentFrom}..${currentTo}:`, err);
      // Continue from failed batch on next tick
      await setSyncCursor("global", currentFrom - 1n);
      return;
    }

    currentFrom = currentTo + 1n;
  }

  await setSyncCursor("global", latestBlock);
  await updatePlatformStats(totalBets, 0n, totalMarkets, []);

  console.log(`[indexer] Synced to block ${latestBlock} — ${totalBets} bets, ${totalMarkets} markets indexed`);
}

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes("--once") || args.includes("--backfill");

  console.log(`[indexer] Starting CasFin Event Indexer`);
  console.log(`[indexer] RPC: ${RPC_URL}`);
  console.log(`[indexer] Mode: ${once ? "single pass" : `continuous (${POLL_INTERVAL_MS / 1000}s interval)`}`);
  console.log(`[indexer] Contracts:`);
  console.log(`[indexer]   CoinFlip: ${ADDRESSES.coinFlip}`);
  console.log(`[indexer]   Dice:     ${ADDRESSES.dice}`);
  console.log(`[indexer]   Crash:    ${ADDRESSES.crash}`);
  console.log(`[indexer]   Vault:    ${ADDRESSES.vault}`);
  console.log(`[indexer]   Factory:  ${ADDRESSES.marketFactory}`);

  if (args.includes("--backfill")) {
    // Reset cursor to re-index everything
    await setSyncCursor("global", 0n);
    console.log("[indexer] Backfill mode — cursor reset to block 0");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  if (once) {
    await syncOnce(provider);
    console.log("[indexer] Single pass complete.");
    await prisma.$disconnect();
    process.exit(0);
  }

  // Continuous mode
  const tick = async () => {
    try {
      await syncOnce(provider);
    } catch (err) {
      console.error("[indexer] Tick error:", err);
    }
  };

  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
  console.log("[indexer] Running continuously. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[indexer] Fatal error:", err);
  process.exit(1);
});
