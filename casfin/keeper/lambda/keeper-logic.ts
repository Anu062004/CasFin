import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import type { PutMetricDataCommandInput } from "@aws-sdk/client-cloudwatch";
import { ethers } from "ethers";

const EncryptedCoinFlipAbi = require("./abis/EncryptedCoinFlip.json");
const EncryptedDiceGameAbi = require("./abis/EncryptedDiceGame.json");
const EncryptedCrashGameAbi = require("./abis/EncryptedCrashGame.json");
const EncryptedMarketFactoryAbi = require("./abis/EncryptedMarketFactory.json");
const EncryptedPredictionMarketAbi = require("./abis/EncryptedPredictionMarket.json");
const EncryptedMarketResolverAbi = require("./abis/EncryptedMarketResolver.json");

type KeeperContract = ethers.Contract & Record<string, any>;
type ContractValue = Awaited<ReturnType<KeeperContract["bets"]>>;
type KeeperProvider = ethers.JsonRpcProvider & { _casfinRpcUrl?: string };
export type CloudWatchLike = {
  putMetricData: (input: PutMetricDataCommandInput) => Promise<void>;
};

const TASK_MANAGER_ADDRESS = "0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9";
const TASK_MANAGER_ABI = [
  "function getDecryptResultSafe(uint256 ctHash) view returns (uint256 result, bool decrypted)"
];

const DEFAULT_RPC_URL = "https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f";
const ARBITRUM_SEPOLIA_NETWORK = {
  chainId: 421614,
  name: "arbitrum-sepolia"
};
const RPC_TIMEOUT_MS = 30_000;
const HARD_DEADLINE_MS = 250_000;
const RPC_URLS = [
  process.env.KEEPER_RPC_URL_1 || process.env.KEEPER_RPC_URL || "",
  process.env.KEEPER_RPC_URL_2 || "",
  process.env.KEEPER_RPC_URL_3 || ""
].filter(Boolean);

type KeeperRuntime = {
  keeperKey: string;
};

function logLine(logs: string[], line: string, level: "log" | "error" | "warn" = "log"): void {
  logs.push(line);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function deadlineReached(logs: string[], hardDeadline: number): boolean {
  if (Date.now() <= hardDeadline) {
    return false;
  }

  logLine(logs, "DEADLINE reached - deferring remaining bets to next invocation");
  return true;
}

export function createProvider(rpcUrl: string): KeeperProvider {
  const request = new ethers.FetchRequest(rpcUrl);
  request.timeout = RPC_TIMEOUT_MS;

  const provider = new ethers.JsonRpcProvider(request, ARBITRUM_SEPOLIA_NETWORK, {
    batchMaxCount: 1,
    polling: true,
    pollingInterval: 4000,
    staticNetwork: true
  }) as KeeperProvider;
  provider._casfinRpcUrl = rpcUrl;
  return provider;
}

export async function getWorkingProvider(): Promise<KeeperProvider> {
  const candidates = RPC_URLS.length > 0 ? RPC_URLS : [DEFAULT_RPC_URL];
  let lastError = "unknown error";

  for (const url of candidates) {
    try {
      const provider = keeperDeps.createProvider(url);
      await withTimeout(provider.getBlockNumber(), 8000, "provider health check");
      return provider;
    } catch (error: unknown) {
      lastError = `${url}: ${formatError(error)}`;
    }
  }

  throw new Error(`All RPC URLs failed (${lastError})`);
}

export async function getSigner(keeperKey: string): Promise<{ provider: KeeperProvider; signer: ethers.Wallet }> {
  const provider = await getWorkingProvider();
  if (!keeperKey) {
    throw new Error("KEEPER_PRIVATE_KEY not loaded");
  }

  return {
    provider,
    signer: new ethers.Wallet(keeperKey, provider)
  };
}

function optionalContract(
  address: string | undefined,
  abi: unknown,
  signer: ethers.Wallet
): KeeperContract | null {
  if (!address || !ethers.isAddress(address) || address === ethers.ZeroAddress) {
    return null;
  }

  return keeperDeps.makeContract(address, abi, signer);
}

export const keeperDeps = {
  createProvider,
  getSigner,
  makeContract: (address: string, abi: unknown, runner: ethers.ContractRunner) =>
    new ethers.Contract(address, abi as ethers.InterfaceAbi, runner) as KeeperContract,
  createCloudWatchClient: () => getCloudWatchClient(),
};

export function formatError(error: unknown): string {
  const value = error as Record<string, any> | undefined;
  const data = value?.data ? ` [data: ${value.data}]` : "";
  return (
    value?.shortMessage ||
    value?.reason ||
    value?.info?.error?.message ||
    value?.message ||
    String(error)
  ) + data;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function getBetState(bet: ContractValue): { player: string; resolved: boolean; resolutionPending: boolean; pendingWonFlag: string; won: boolean } {
  return {
    player: String(bet[0]),
    resolved: Boolean(bet[4]),
    resolutionPending: Boolean(bet[5]),
    pendingWonFlag: String(bet[6] ?? "0x0000000000000000000000000000000000000000000000000000000000000000"),
    won: Boolean(bet[7] ?? bet[8] ?? false)
  };
}

export async function processEncryptedBets(
  label: string,
  game: KeeperContract | null,
  logs: string[],
  provider: ethers.JsonRpcProvider,
  hardDeadline: number
): Promise<boolean> {
  if (!game) {
    return true;
  }

  if (deadlineReached(logs, hardDeadline)) {
    return false;
  }

  const nextBetId = (await game.nextBetId()) as bigint;
  logLine(logs, `[${label}] nextBetId=${nextBetId}`);
  for (let betId = 0n; betId < nextBetId; betId += 1n) {
    if (deadlineReached(logs, hardDeadline)) {
      return false;
    }

    try {
      const bet = getBetState(await withTimeout(game.bets(betId), 15_000, `bets(${betId})`));
      if (bet.resolved) {
        continue;
      }

      if (!bet.resolutionPending) {
        if (deadlineReached(logs, hardDeadline)) {
          return false;
        }

        const tx = await game.requestResolution(betId);
        logLine(logs, `[${label}] requestResolution(${betId}) -> ${tx.hash}`);
        continue;
      }

      try {
        if (deadlineReached(logs, hardDeadline)) {
          return false;
        }

        // Pre-check: skip finalizeResolution if TN hasn't published the decrypt result yet.
        try {
          const taskManager = keeperDeps.makeContract(TASK_MANAGER_ADDRESS, TASK_MANAGER_ABI, provider);
          const ctHash = BigInt(bet.pendingWonFlag);
          const [, decrypted] = await withTimeout(
            taskManager.getDecryptResultSafe(ctHash) as Promise<[bigint, boolean]>,
            10_000,
            `getDecryptResultSafe(${betId})`
          );
          if (!decrypted) {
            logLine(
              logs,
              `[${label}] bet ${betId} decrypt not ready - Threshold Network may be down or has not published yet, skipping`,
              "warn"
            );
            continue;
          }
        } catch (preErr: unknown) {
          logLine(logs, `[${label}] bet ${betId} decrypt pre-check failed (proceeding): ${formatError(preErr)}`);
        }

        const tx = await game.finalizeResolution(betId);
        logLine(logs, `[${label}] finalizeResolution(${betId}) -> ${tx.hash}`);
      } catch (err: unknown) {
        const msg = formatError(err);
        if (msg.includes("WIN_FLAG_PENDING")) {
          const forceResolve = game.forceResolve;
          if (typeof forceResolve !== "function") {
            logLine(logs, `[${label}] bet ${betId} pending (forceResolve unavailable): ${msg}`);
            continue;
          }

          try {
            const block = await provider.getBlock("latest");
            const won = block?.hash ? BigInt(block.hash) % 2n === 0n : false;
            if (deadlineReached(logs, hardDeadline)) {
              return false;
            }

            const tx = await forceResolve.call(game, betId, won);
            logLine(logs, `[${label}] forceResolve(${betId}, ${won}) -> ${tx.hash}`);
          } catch (forceError: unknown) {
            logLine(logs, `[${label}] bet ${betId} pending (no forceResolve): ${formatError(forceError)}`);
          }
        } else {
          logLine(logs, `[${label}] finalizeResolution(${betId}): ${msg}`);
        }
      }
    } catch (err: unknown) {
      logLine(logs, `[${label}] bet ${betId}: ${formatError(err)}`);
    }
  }

  return true;
}

export async function processCrashRounds(
  crash: KeeperContract | null,
  logs: string[],
  hardDeadline: number
): Promise<boolean> {
  if (!crash) {
    return true;
  }

  if (deadlineReached(logs, hardDeadline)) {
    return false;
  }

  const nextRoundId = (await crash.nextRoundId()) as bigint;
  logLine(logs, `[Crash] nextRoundId=${nextRoundId}`);
  for (let roundId = 0n; roundId < nextRoundId; roundId += 1n) {
    if (deadlineReached(logs, hardDeadline)) {
      return false;
    }

    try {
      const round = await crash.rounds(roundId);
      if (!Boolean(round[0])) {
        continue;
      }

      if (!Boolean(round[2])) {
        if (deadlineReached(logs, hardDeadline)) {
          return false;
        }

        const tx = await crash.closeRound(roundId);
        logLine(logs, `[Crash] closeRound(${roundId}) -> ${tx.hash}`);
        continue;
      }

      if (!Boolean(round[4])) {
        try {
          if (deadlineReached(logs, hardDeadline)) {
            return false;
          }

          const tx = await crash.finalizeRound(roundId);
          logLine(logs, `[Crash] finalizeRound(${roundId}) -> ${tx.hash}`);
        } catch (err: unknown) {
          logLine(logs, `[Crash] finalizeRound(${roundId}): ${formatError(err)}`);
        }
      }
    } catch (err: unknown) {
      logLine(logs, `[Crash] round ${roundId}: ${formatError(err)}`);
    }
  }

  return true;
}

export async function processPredictionMarkets(
  factory: KeeperContract | null,
  signer: ethers.Wallet,
  logs: string[],
  hardDeadline: number
): Promise<boolean> {
  const configured = (process.env.ENCRYPTED_MARKET_ADDRESSES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const addresses = new Set(configured);

  if (factory) {
    if (deadlineReached(logs, hardDeadline)) {
      return false;
    }

    const total = Number(await factory.totalMarkets());
    logLine(logs, `[Market] totalMarkets=${total}`);
    for (let index = 0; index < total; index += 1) {
      addresses.add(String(await factory.allMarkets(index)));
    }
  }

  for (const address of addresses) {
    if (deadlineReached(logs, hardDeadline)) {
      return false;
    }

    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
      continue;
    }

    const market = keeperDeps.makeContract(address, EncryptedPredictionMarketAbi, signer);
    try {
      const [resolvesAt, resolved, finalized, disputed, resolvedAt, disputeWindowSecs, resolverAddress] = await Promise.all([
        market.resolvesAt() as Promise<bigint>,
        market.resolved() as Promise<boolean>,
        market.finalized() as Promise<boolean>,
        market.disputed() as Promise<boolean>,
        market.resolvedAt() as Promise<bigint>,
        market.disputeWindowSecs() as Promise<bigint>,
        market.resolver() as Promise<string>
      ]);

      const now = Math.floor(Date.now() / 1000);

      if (!resolved && now >= Number(resolvesAt)) {
        try {
          const resolver = keeperDeps.makeContract(resolverAddress, EncryptedMarketResolverAbi, signer);
          if (deadlineReached(logs, hardDeadline)) {
            return false;
          }

          const tx = await resolver.requestResolution();
          logLine(logs, `[Market] requestResolution(${address}) -> ${tx.hash}`);
        } catch (error: unknown) {
          logLine(logs, `[Market] resolve ${address}: ${formatError(error)}`);
        }
      }

      if (resolved && !finalized && !disputed && now >= Number(resolvedAt) + Number(disputeWindowSecs)) {
        try {
          if (deadlineReached(logs, hardDeadline)) {
            return false;
          }

          const tx = await market.finalizeMarket();
          logLine(logs, `[Market] finalizeMarket(${address}) -> ${tx.hash}`);
        } catch (error: unknown) {
          logLine(logs, `[Market] finalizeMarket ${address}: ${formatError(error)}`);
        }
      }
    } catch (error: unknown) {
      logLine(logs, `[Market] ${address}: ${formatError(error)}`);
    }
  }

  return true;
}

export function getCloudWatchClient(): CloudWatchLike {
  const client = new CloudWatchClient({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1",
  });

  return {
    putMetricData: async (input) => {
      await client.send(new PutMetricDataCommand(input));
    },
  };
}

export async function emitExecutionMetric(cloudWatch: CloudWatchLike = keeperDeps.createCloudWatchClient()): Promise<void> {
  await cloudWatch.putMetricData({
    Namespace: "CasFin/Keeper",
    MetricData: [
      {
        MetricName: "ExecutionComplete",
        Unit: "Count" as const,
        Value: 1,
      },
    ],
  });
}

export async function runKeeperTick(runtime: KeeperRuntime): Promise<string[]> {
  const logs: string[] = [];
  const hardDeadline = Date.now() + HARD_DEADLINE_MS;
  const candidates = RPC_URLS.length > 0 ? RPC_URLS : [DEFAULT_RPC_URL];

  logLine(logs, `Keeper tick started at ${new Date().toISOString()}`);
  logLine(logs, `RPC candidates: ${candidates.join(" | ")}`);
  logLine(logs, `CoinFlip addr: ${process.env.ENCRYPTED_COIN_FLIP_ADDRESS || "unset"}`);
  logLine(logs, `Dice addr: ${process.env.ENCRYPTED_DICE_GAME_ADDRESS || "unset"}`);
  logLine(logs, `Crash addr: ${process.env.ENCRYPTED_CRASH_GAME_ADDRESS || "unset"}`);
  logLine(logs, `Prediction Factory addr: ${process.env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS || process.env.ENCRYPTED_MARKET_FACTORY_ADDRESS || "unset"}`);
  logLine(logs, `Hard deadline: ${new Date(hardDeadline).toISOString()}`);

  const { provider, signer } = await keeperDeps.getSigner(runtime.keeperKey);

  logLine(logs, `Signer: ${await signer.getAddress()}`);
  logLine(logs, `Selected RPC: ${(provider as KeeperProvider)._casfinRpcUrl || "unknown"}`);

  const coinFlip = optionalContract(process.env.ENCRYPTED_COIN_FLIP_ADDRESS, EncryptedCoinFlipAbi, signer);
  const dice = optionalContract(process.env.ENCRYPTED_DICE_GAME_ADDRESS, EncryptedDiceGameAbi, signer);
  const crash = optionalContract(process.env.ENCRYPTED_CRASH_GAME_ADDRESS, EncryptedCrashGameAbi, signer);
  const factory = optionalContract(
    process.env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS || process.env.ENCRYPTED_MARKET_FACTORY_ADDRESS,
    EncryptedMarketFactoryAbi,
    signer
  );

  logLine(logs, `CoinFlip target: ${coinFlip ? String((coinFlip as any).target) : "off"}`);
  logLine(logs, `Dice target: ${dice ? String((dice as any).target) : "off"}`);
  logLine(logs, `Crash target: ${crash ? String((crash as any).target) : "off"}`);
  logLine(logs, `Prediction Factory target: ${factory ? String((factory as any).target) : "off"}`);

  try {
    if (!(await processEncryptedBets("CoinFlip", coinFlip, logs, provider, hardDeadline))) {
      return logs;
    }
  } catch (error: unknown) {
    logLine(logs, `[CoinFlip] tick failed: ${formatError(error)}`, "error");
    if (deadlineReached(logs, hardDeadline)) {
      return logs;
    }
  }

  try {
    if (!(await processEncryptedBets("Dice", dice, logs, provider, hardDeadline))) {
      return logs;
    }
  } catch (error: unknown) {
    logLine(logs, `[Dice] tick failed: ${formatError(error)}`, "error");
    if (deadlineReached(logs, hardDeadline)) {
      return logs;
    }
  }

  try {
    if (!(await processCrashRounds(crash, logs, hardDeadline))) {
      return logs;
    }
  } catch (error: unknown) {
    logLine(logs, `[Crash] tick failed: ${formatError(error)}`, "error");
    if (deadlineReached(logs, hardDeadline)) {
      return logs;
    }
  }

  try {
    if (!(await processPredictionMarkets(factory, signer, logs, hardDeadline))) {
      return logs;
    }
  } catch (error: unknown) {
    logLine(logs, `[Prediction] tick failed: ${formatError(error)}`, "error");
    if (deadlineReached(logs, hardDeadline)) {
      return logs;
    }
  }

  try {
    await emitExecutionMetric();
  } catch (error: unknown) {
    logLine(logs, `[Metrics] ${formatError(error)}`, "error");
  }
  logLine(logs, `Done at ${new Date().toISOString()}`);
  return logs;
}
