require("dotenv").config();

import type { ContractTransactionResponse } from "ethers";

const ethers = require("ethers") as typeof import("ethers");
const IoRedis = require("ioredis");

type DynamicContract = import("ethers").Contract & Record<string, any>;
type SharedSigner = import("ethers").NonceManager;

const encryptedCoinFlipAbi = require("../frontend/lib/generated-abis/EncryptedCoinFlip.json") as readonly string[];
const encryptedDiceAbi = require("../frontend/lib/generated-abis/EncryptedDiceGame.json") as readonly string[];
const encryptedCrashAbi = require("../frontend/lib/generated-abis/EncryptedCrashGame.json") as readonly string[];
const marketFactoryAbi = require("../frontend/lib/generated-abis/MarketFactory.json") as readonly string[];
const predictionMarketAbi = require("../frontend/lib/generated-abis/PredictionMarket.json") as readonly string[];
const marketResolverAbi = require("../frontend/lib/generated-abis/MarketResolver.json") as readonly string[];
const feeDistributorAbi = require("../frontend/lib/generated-abis/FeeDistributor.json") as readonly string[];

const RPC_URL =
  process.env.ARBITRUM_SEPOLIA_RPC_URL ||
  process.env.FHENIX_RPC_URL ||
  "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVATE_KEY = normalizePrivateKey(process.env.PRIVATE_KEY || process.env.FHENIX_PRIVATE_KEY || "");
const CASINO_POLL_MS = getEnvNumber("KEEPER_POLL_MS", 5_000);
const PREDICTION_POLL_MS = getEnvNumber("KEEPER_PREDICTION_POLL_MS", 5_000);
const EVENT_BACKFILL_START_BLOCK = getEnvNumber("KEEPER_START_BLOCK", 0);
const EVENT_BACKFILL_BATCH_SIZE = Math.max(1, getEnvNumber("KEEPER_EVENT_BATCH_BLOCKS", 2_000));
const REDIS_URL = process.env.REDIS_URL || "";
const BET_EVENTS_CHANNEL = "casfin:bets";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer: SharedSigner = new ethers.NonceManager(new ethers.Wallet(PRIVATE_KEY, provider));

let transactionQueue: Promise<void> = Promise.resolve();
let redisPublisher: import("ioredis").Redis | null = null;

if (REDIS_URL) {
  redisPublisher = new IoRedis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  redisPublisher.connect().catch((err: { message?: string }) => {
    console.warn("[Redis] Failed to connect publisher:", err?.message || String(err));
    redisPublisher = null;
  });
  redisPublisher.on("error", (err: { message?: string }) => {
    console.error("[Redis] Publisher error:", err?.message || String(err));
  });
  console.log("[Redis] Publisher configured for bet event notifications.");
} else {
  console.log("[Redis] REDIS_URL not set - bet event publishing disabled.");
}

function publishBetEvent(
  game: "coinflip" | "dice" | "crash",
  betId: string,
  player: string,
  txHash: string,
  roundId?: string
): void {
  if (!redisPublisher) {
    return;
  }

  const event = JSON.stringify({
    game,
    betId,
    ...(roundId != null ? { roundId } : {}),
    player,
    action: "resolved" as const,
    txHash,
    timestamp: Math.floor(Date.now() / 1_000),
  });

  redisPublisher.publish(BET_EVENTS_CHANNEL, event).catch((err: { message?: string }) => {
    console.warn(`[Redis] Failed to publish ${game} event:`, err?.message || String(err));
  });
}

interface PredictionMarketState {
  address: string;
  resolverAddress: string;
  feeDistributorAddress: string;
  resolvesAt: number;
  disputeWindowSecs: number;
  resolved: boolean;
  resolvedAt: number;
  finalized: boolean;
  oracleType: number | null;
  expiryLogged: boolean;
  feeDistributionLogged: boolean;
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function getEnvNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatError(error: unknown): string {
  const value = error as Record<string, any> | undefined;
  return (
    value?.shortMessage ||
    value?.reason ||
    value?.info?.error?.message ||
    value?.message ||
    String(error)
  );
}

function isZeroAddress(address: string | null | undefined): boolean {
  return !address || !ethers.isAddress(address) || address === ethers.ZeroAddress;
}

function toDynamicContract(address: string | null | undefined, abi: readonly string[]): DynamicContract | null {
  if (isZeroAddress(address)) {
    return null;
  }

  return new ethers.Contract(address, abi, signer) as DynamicContract;
}

function sortNumericIds(ids: Iterable<string>): string[] {
  return [...ids].sort((left, right) => {
    const leftId = BigInt(left);
    const rightId = BigInt(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableTransactionError(error: unknown): boolean {
  const message = formatError(error).toLowerCase();

  if (
    message.includes("unknown_bet") ||
    message.includes("bet_resolved") ||
    message.includes("resolution_pending") ||
    message.includes("resolution_not_requested") ||
    message.includes("win_flag_pending") ||
    message.includes("roll_pending") ||
    message.includes("unknown_round") ||
    message.includes("round_pending") ||
    message.includes("round_closed") ||
    message.includes("round_not_closed") ||
    message.includes("round_close_pending") ||
    message.includes("round_close_not_requested") ||
    message.includes("bet_settled") ||
    message.includes("already known") ||
    message.includes("nonce too low")
  ) {
    return false;
  }

  return true;
}

async function withRetry<T>(
  label: string,
  signal: AbortSignal,
  callback: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean = () => true
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (signal.aborted) {
      throw new Error("Shutdown requested");
    }

    try {
      return await callback();
    } catch (error) {
      lastError = error;
      if (attempt === 3 || !shouldRetry(error)) {
        break;
      }

      const backoffMs = 1_000 * 2 ** (attempt - 1);
      console.warn(`[Retry] ${label} failed (${formatError(error)}). Retrying in ${backoffMs}ms`);
      await sleep(backoffMs, signal);
    }
  }

  throw lastError;
}

async function enqueueTransaction(action: () => Promise<void>): Promise<void> {
  const next = transactionQueue.then(action, action);
  transactionQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function sendTransaction(
  label: string,
  signal: AbortSignal,
  callback: () => Promise<ContractTransactionResponse>
): Promise<string> {
  return withRetry(
    label,
    signal,
    async () => {
      let txHash = "";
      await enqueueTransaction(async () => {
        const tx = await callback();
        txHash = tx.hash;
        console.log(`${label} -> ${txHash}`);
        await tx.wait();
      });
      return txHash;
    },
    isRetryableTransactionError
  );
}

function isPendingFinalizeError(error: unknown): boolean {
  const message = formatError(error).toLowerCase();
  return (
    message.includes("win_flag_pending") ||
    message.includes("roll_pending") ||
    message.includes("round_pending") ||
    message.includes("resolution_not_requested")
  );
}

async function runLoop(
  label: string,
  intervalMs: number,
  signal: AbortSignal,
  task: () => Promise<void>
): Promise<void> {
  while (!signal.aborted) {
    try {
      await task();
    } catch (error) {
      console.error(`[${label}] ${formatError(error)}`);
    }

    await sleep(intervalMs, signal);
  }
}

async function buildSharedRuntime(): Promise<void> {
  const network = await provider.getNetwork();

  console.log("CasFin combined keeper starting");
  console.log(`Signer: ${await signer.getAddress()}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Network: ${network.name} (${network.chainId})`);
  console.log(`Casino poll: ${CASINO_POLL_MS}ms`);
  console.log(`Prediction poll: ${PREDICTION_POLL_MS}ms`);
  console.log(`Backfill start block: ${EVENT_BACKFILL_START_BLOCK}`);
}

function oracleTypeLabel(oracleType: number | null): string {
  if (oracleType === null) {
    return "unknown";
  }

  return oracleType === 0 ? "manual" : `oracle-${oracleType}`;
}

async function runCasinoKeeper(signal: AbortSignal): Promise<void> {
  const coinFlip = toDynamicContract(process.env.ENCRYPTED_COIN_FLIP_ADDRESS, encryptedCoinFlipAbi);
  const dice = toDynamicContract(process.env.ENCRYPTED_DICE_GAME_ADDRESS, encryptedDiceAbi);
  const crash = toDynamicContract(process.env.ENCRYPTED_CRASH_GAME_ADDRESS, encryptedCrashAbi);

  const pendingCoinFlipIds = new Set<string>();
  const pendingDiceIds = new Set<string>();
  const pendingCrashRoundIds = new Set<string>();

  const seenCoinFlipIds = new Set<string>();
  const seenDiceIds = new Set<string>();
  const seenCrashBets = new Set<string>();
  const trackedCrashPlayers = new Map<string, Set<string>>();

  let lastCrashBackfillBlock = EVENT_BACKFILL_START_BLOCK > 0 ? EVENT_BACKFILL_START_BLOCK - 1 : -1;

  const detectCoinFlipBet = (betId: bigint, player: string, source: string) => {
    const id = betId.toString();
    if (!seenCoinFlipIds.has(id)) {
      seenCoinFlipIds.add(id);
      console.log(`[Casino][CoinFlip] bet detected id=${id} player=${player} source=${source}`);
    }
    pendingCoinFlipIds.add(id);
  };

  const detectDiceBet = (betId: bigint, player: string, source: string) => {
    const id = betId.toString();
    if (!seenDiceIds.has(id)) {
      seenDiceIds.add(id);
      console.log(`[Casino][Dice] bet detected id=${id} player=${player} source=${source}`);
    }
    pendingDiceIds.add(id);
  };

  const detectCrashBet = (roundId: bigint, player: string, source: string) => {
    const roundKey = roundId.toString();
    const playerKey = player.toLowerCase();
    let players = trackedCrashPlayers.get(roundKey);
    if (!players) {
      players = new Set<string>();
      trackedCrashPlayers.set(roundKey, players);
    }

    const marker = `${roundKey}:${playerKey}`;
    if (!seenCrashBets.has(marker)) {
      seenCrashBets.add(marker);
      console.log(`[Casino][Crash] bet detected round=${roundKey} player=${player} source=${source}`);
    }

    players.add(playerKey);
    pendingCrashRoundIds.add(roundKey);
  };

  const scanCrashEvents = async (fromBlock: number, toBlock: number) => {
    if (!crash || fromBlock > toBlock) {
      return;
    }

    for (let start = fromBlock; start <= toBlock && !signal.aborted; start += EVENT_BACKFILL_BATCH_SIZE) {
      const end = Math.min(toBlock, start + EVENT_BACKFILL_BATCH_SIZE - 1);
      const events = await crash.queryFilter(crash.filters.CrashBetPlaced(), start, end);
      for (const event of events) {
        const args = (event as any).args;
        if (!args) {
          continue;
        }

        detectCrashBet(BigInt(args[0].toString()), String(args[1]), `backfill:${start}-${end}`);
      }
    }
  };

  const pollCoinFlipBets = async () => {
    if (!coinFlip) {
      return;
    }

    const totalBets = (await coinFlip.nextBetId()) as bigint;
    for (let betId = 0n; betId < totalBets; betId += 1n) {
      const bet = await coinFlip.bets(betId);
      const player = String(bet[0]);
      const resolved = Boolean(bet[4]);
      if (!isZeroAddress(player) && !resolved) {
        detectCoinFlipBet(betId, player, "poll");
      }
    }
  };

  const pollDiceBets = async () => {
    if (!dice) {
      return;
    }

    const totalBets = (await dice.nextBetId()) as bigint;
    for (let betId = 0n; betId < totalBets; betId += 1n) {
      const bet = await dice.bets(betId);
      const player = String(bet[0]);
      const resolved = Boolean(bet[4]);
      if (!isZeroAddress(player) && !resolved) {
        detectDiceBet(betId, player, "poll");
      }
    }
  };

  const pollCrashRounds = async () => {
    if (!crash) {
      return;
    }

    const latestBlock = await provider.getBlockNumber();
    if (latestBlock > lastCrashBackfillBlock) {
      await scanCrashEvents(lastCrashBackfillBlock + 1, latestBlock);
      lastCrashBackfillBlock = latestBlock;
    }

    const totalRounds = (await crash.nextRoundId()) as bigint;
    for (let roundId = 0n; roundId < totalRounds; roundId += 1n) {
      const round = await crash.rounds(roundId);
      const exists = Boolean(round[0]);
      const closed = Boolean(round[4]);
      const roundKey = roundId.toString();
      const players = trackedCrashPlayers.get(roundKey);

      if (!exists) {
        pendingCrashRoundIds.delete(roundKey);
        continue;
      }

      if (!players || players.size === 0) {
        pendingCrashRoundIds.delete(roundKey);
        continue;
      }

      if (!closed) {
        pendingCrashRoundIds.add(roundKey);
        continue;
      }

      let hasUnsettledBet = false;
      for (const player of players) {
        const playerBet = await crash.playerBets(roundId, player);
        if (Boolean(playerBet[3]) && !Boolean(playerBet[4])) {
          hasUnsettledBet = true;
          break;
        }
      }

      if (hasUnsettledBet) {
        pendingCrashRoundIds.add(roundKey);
      } else {
        pendingCrashRoundIds.delete(roundKey);
      }
    }
  };

  const processResolvableBet = async (
    label: "CoinFlip" | "Dice",
    contract: DynamicContract,
    pendingIds: Set<string>
  ) => {
    for (const id of sortNumericIds(pendingIds)) {
      try {
        const betId = BigInt(id);
        const bet = await contract.bets(betId);
        const player = String(bet[0]);
        const resolved = Boolean(bet[4]);
        const resolutionPending = Boolean(bet[5]);

        if (isZeroAddress(player) || resolved) {
          pendingIds.delete(id);
          continue;
        }

        if (!resolutionPending) {
          console.log(`[Casino][${label}] resolving id=${id}`);
          await sendTransaction(`[Casino][${label}] requestResolution(${id})`, signal, () => contract.requestResolution(betId));
          continue;
        }

        console.log(`[Casino][${label}] resolving id=${id}`);
        const txHash = await sendTransaction(
          `[Casino][${label}] finalizeResolution(${id})`,
          signal,
          () => contract.finalizeResolution(betId)
        );
        pendingIds.delete(id);
        console.log(`[Casino][${label}] resolved id=${id}`);
        publishBetEvent(label === "CoinFlip" ? "coinflip" : "dice", id, player, txHash);
      } catch (error) {
        if (isPendingFinalizeError(error)) {
          continue;
        }

        console.error(`[Casino][${label}] failed id=${id}: ${formatError(error)}`);
      }
    }
  };

  const processCrashRounds = async () => {
    if (!crash) {
      return;
    }

    for (const roundId of sortNumericIds(pendingCrashRoundIds)) {
      try {
        const id = BigInt(roundId);
        const round = await crash.rounds(id);
        const exists = Boolean(round[0]);
        const closeRequested = Boolean(round[2]);
        const closed = Boolean(round[4]);

        if (!exists) {
          pendingCrashRoundIds.delete(roundId);
          trackedCrashPlayers.delete(roundId);
          continue;
        }

        if (!closeRequested) {
          console.log(`[Casino][Crash] resolving round=${roundId}`);
          await sendTransaction(`[Casino][Crash] closeRound(${roundId})`, signal, () => crash.closeRound(id));
          continue;
        }

        if (!closed) {
          console.log(`[Casino][Crash] resolving round=${roundId}`);
          await sendTransaction(`[Casino][Crash] finalizeRound(${roundId})`, signal, () => crash.finalizeRound(id));
        }

        const players = trackedCrashPlayers.get(roundId);
        if (!players || players.size === 0) {
          pendingCrashRoundIds.delete(roundId);
          continue;
        }

        let hasOutstandingSettlement = false;
        for (const player of players) {
          try {
            const playerBet = await crash.playerBets(id, player);
            const existsForPlayer = Boolean(playerBet[3]);
            const settled = Boolean(playerBet[4]);

            if (!existsForPlayer || settled) {
              continue;
            }

            hasOutstandingSettlement = true;
            console.log(`[Casino][Crash] resolving round=${roundId} player=${player}`);
            const txHash = await sendTransaction(
              `[Casino][Crash] settleBet(${roundId},${player})`,
              signal,
              () => crash.settleBet(id, player)
            );
            console.log(`[Casino][Crash] resolved round=${roundId} player=${player}`);
            publishBetEvent("crash", "", player, txHash, roundId);
          } catch (error) {
            if (isPendingFinalizeError(error)) {
              hasOutstandingSettlement = true;
              continue;
            }

            hasOutstandingSettlement = true;
            console.error(`[Casino][Crash] failed round=${roundId} player=${player}: ${formatError(error)}`);
          }
        }

        if (!hasOutstandingSettlement) {
          pendingCrashRoundIds.delete(roundId);
        }
      } catch (error) {
        if (isPendingFinalizeError(error)) {
          continue;
        }

        console.error(`[Casino][Crash] failed round=${roundId}: ${formatError(error)}`);
      }
    }
  };

  coinFlip?.on("EncryptedBetPlaced", (betId: bigint, player: string) => detectCoinFlipBet(betId, player, "event"));
  dice?.on("EncryptedDiceBetPlaced", (betId: bigint, player: string) => detectDiceBet(betId, player, "event"));
  crash?.on("CrashBetPlaced", (roundId: bigint, player: string) => detectCrashBet(roundId, player, "event"));

  signal.addEventListener(
    "abort",
    () => {
      coinFlip?.removeAllListeners();
      dice?.removeAllListeners();
      crash?.removeAllListeners();
    },
    { once: true }
  );

  console.log("[Casino Keeper] started");
  console.log(`CoinFlip: ${coinFlip?.target ?? "not configured"}`);
  console.log(`Dice: ${dice?.target ?? "not configured"}`);
  console.log(`Crash: ${crash?.target ?? "not configured"}`);

  if (crash && EVENT_BACKFILL_START_BLOCK >= 0) {
    const latestBlock = await provider.getBlockNumber();
    await scanCrashEvents(EVENT_BACKFILL_START_BLOCK, latestBlock);
    lastCrashBackfillBlock = latestBlock;
  }

  await runLoop("Casino Keeper", CASINO_POLL_MS, signal, async () => {
    await Promise.all([pollCoinFlipBets(), pollDiceBets(), pollCrashRounds()]);
    if (coinFlip) {
      await processResolvableBet("CoinFlip", coinFlip, pendingCoinFlipIds);
    }
    if (dice) {
      await processResolvableBet("Dice", dice, pendingDiceIds);
    }
    await processCrashRounds();
  });
}

async function runPredictionKeeper(signal: AbortSignal): Promise<void> {
  const factory = toDynamicContract(process.env.MARKET_FACTORY_ADDRESS, marketFactoryAbi);
  const activeMarkets = new Map<string, PredictionMarketState>();
  let nextFactoryIndex = 0;
  let syncInFlight: Promise<void> | null = null;

  const loadMarketState = async (marketAddress: string): Promise<PredictionMarketState> => {
    const market = toDynamicContract(marketAddress, predictionMarketAbi);
    if (!market) {
      throw new Error(`Invalid market address: ${marketAddress}`);
    }

    const [resolverAddress, feeDistributorAddress, resolvesAtRaw, disputeWindowRaw, resolved, resolvedAtRaw, finalized] =
      await Promise.all([
        market.resolver() as Promise<string>,
        market.feeDistributor() as Promise<string>,
        market.resolvesAt() as Promise<bigint>,
        market.disputeWindowSecs() as Promise<bigint>,
        market.resolved() as Promise<boolean>,
        market.resolvedAt() as Promise<bigint>,
        market.finalized() as Promise<boolean>
      ]);

    let oracleType: number | null = null;
    const resolver = toDynamicContract(resolverAddress, marketResolverAbi);
    if (resolver) {
      try {
        oracleType = Number(await resolver.oracleType());
      } catch (error) {
        console.warn(`[Prediction] could not read oracleType for ${marketAddress}: ${formatError(error)}`);
      }
    }

    return {
      address: marketAddress,
      resolverAddress,
      feeDistributorAddress,
      resolvesAt: Number(resolvesAtRaw),
      disputeWindowSecs: Number(disputeWindowRaw),
      resolved,
      resolvedAt: Number(resolvedAtRaw),
      finalized,
      oracleType,
      expiryLogged: false,
      feeDistributionLogged: false
    };
  };

  const registerMarket = async (marketAddress: string) => {
    const key = marketAddress.toLowerCase();
    if (activeMarkets.has(key)) {
      return;
    }

    const state = await loadMarketState(marketAddress);
    if (state.finalized) {
      return;
    }

    activeMarkets.set(key, state);
    console.log(
      `[Prediction] market deployed address=${marketAddress} expires=${new Date(state.resolvesAt * 1000).toISOString()} resolver=${oracleTypeLabel(
        state.oracleType
      )}`
    );
  };

  const syncFactoryMarkets = async () => {
    if (!factory) {
      return;
    }

    if (syncInFlight) {
      return syncInFlight;
    }

    syncInFlight = (async () => {
      const totalMarkets = Number(await factory.totalMarkets());
      while (nextFactoryIndex < totalMarkets && !signal.aborted) {
        const marketAddress = (await factory.allMarkets(nextFactoryIndex)) as string;
        nextFactoryIndex += 1;

        if (isZeroAddress(marketAddress)) {
          continue;
        }

        try {
          await registerMarket(marketAddress);
        } catch (error) {
          console.error(`[Prediction] failed to register market ${marketAddress}: ${formatError(error)}`);
        }
      }
    })().finally(() => {
      syncInFlight = null;
    });

    return syncInFlight;
  };

  const maybeTriggerFeeDistribution = async (marketState: PredictionMarketState) => {
    if (marketState.feeDistributionLogged || isZeroAddress(marketState.feeDistributorAddress)) {
      return;
    }

    const hasDistributeFunction = feeDistributorAbi.some((entry) => entry.startsWith("function distribute("));
    if (!hasDistributeFunction) {
      marketState.feeDistributionLogged = true;
      console.log(
        `[Prediction] fee distribution skipped for ${marketState.address}: current FeeDistributor ABI has no distribute() function`
      );
      return;
    }

    const feeDistributor = toDynamicContract(marketState.feeDistributorAddress, feeDistributorAbi);
    if (!feeDistributor) {
      return;
    }

    await sendTransaction(
      `[Prediction] distribute(${marketState.address})`,
      signal,
      () => feeDistributor.distribute() as Promise<ContractTransactionResponse>
    );
    marketState.feeDistributionLogged = true;
  };

  const processMarket = async (state: PredictionMarketState) => {
    const market = toDynamicContract(state.address, predictionMarketAbi);
    if (!market) {
      activeMarkets.delete(state.address.toLowerCase());
      return;
    }

    try {
      const [resolved, finalized, resolvedAtRaw, disputeWindowRaw, resolverAddress, feeDistributorAddress] = await Promise.all([
        market.resolved() as Promise<boolean>,
        market.finalized() as Promise<boolean>,
        market.resolvedAt() as Promise<bigint>,
        market.disputeWindowSecs() as Promise<bigint>,
        market.resolver() as Promise<string>,
        market.feeDistributor() as Promise<string>
      ]);

      state.resolved = resolved;
      state.finalized = finalized;
      state.resolvedAt = Number(resolvedAtRaw);
      state.disputeWindowSecs = Number(disputeWindowRaw);
      state.resolverAddress = resolverAddress;
      state.feeDistributorAddress = feeDistributorAddress;

      const now = Math.floor(Date.now() / 1000);
      if (now >= state.resolvesAt && !state.expiryLogged) {
        state.expiryLogged = true;
        console.log(`[Prediction] expiry detected address=${state.address}`);
      }

      if (!state.resolved) {
        if (now < state.resolvesAt) {
          return;
        }

        const resolver = toDynamicContract(state.resolverAddress, marketResolverAbi);
        if (!resolver) {
          throw new Error(`Missing resolver for market ${state.address}`);
        }

        const resolutionRequested = (await resolver.resolutionRequested().catch(() => false)) as boolean;
        if (!resolutionRequested) {
          console.log(`[Prediction] resolving address=${state.address}`);
          await sendTransaction(
            `[Prediction] requestResolution(${state.address})`,
            signal,
            () => resolver.requestResolution() as Promise<ContractTransactionResponse>
          );
        }
        return;
      }

      const finalizableAt = state.resolvedAt + state.disputeWindowSecs;
      if (!state.finalized) {
        if (now < finalizableAt) {
          return;
        }

        console.log(`[Prediction] resolving address=${state.address}`);
        await sendTransaction(
          `[Prediction] finalizeMarket(${state.address})`,
          signal,
          () => market.finalizeMarket() as Promise<ContractTransactionResponse>
        );
        state.finalized = true;
        console.log(`[Prediction] resolved address=${state.address}`);
      }

      await maybeTriggerFeeDistribution(state);
      activeMarkets.delete(state.address.toLowerCase());
    } catch (error) {
      console.error(`[Prediction] failed address=${state.address}: ${formatError(error)}`);
    }
  };

  factory?.on("MarketCreated", () => {
    void syncFactoryMarkets();
  });

  signal.addEventListener(
    "abort",
    () => {
      factory?.removeAllListeners();
    },
    { once: true }
  );

  console.log("[Prediction Keeper] started");
  console.log(`MarketFactory: ${factory?.target ?? "not configured"}`);

  if (factory) {
    await syncFactoryMarkets();
  }

  await runLoop("Prediction Keeper", PREDICTION_POLL_MS, signal, async () => {
    if (factory) {
      await syncFactoryMarkets();
    }

    const markets = [...activeMarkets.values()].sort((left, right) => left.resolvesAt - right.resolvesAt);
    for (const marketState of markets) {
      await processMarket(marketState);
    }
  });
}

async function main(): Promise<void> {
  if (!PRIVATE_KEY || PRIVATE_KEY === "0xyour_private_key_here") {
    throw new Error("Set PRIVATE_KEY in casfin/.env before starting the keeper.");
  }

  const controller = new AbortController();
  const stop = (signalName: string) => {
    if (!controller.signal.aborted) {
      console.log(`[Keeper] ${signalName} received, shutting down`);
      controller.abort();
      if (redisPublisher) {
        redisPublisher.quit().catch(() => {});
      }
    }
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  await buildSharedRuntime();
  await Promise.all([runCasinoKeeper(controller.signal), runPredictionKeeper(controller.signal)]);
}

main().catch((error) => {
  console.error(`[Keeper] Fatal error: ${formatError(error)}`);
  process.exitCode = 1;
});
