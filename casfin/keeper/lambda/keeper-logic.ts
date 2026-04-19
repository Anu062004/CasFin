import { ethers } from "ethers";

const EncryptedCoinFlipAbi = require("./abis/EncryptedCoinFlip.json");
const EncryptedDiceGameAbi = require("./abis/EncryptedDiceGame.json");
const EncryptedCrashGameAbi = require("./abis/EncryptedCrashGame.json");
const EncryptedMarketFactoryAbi = require("./abis/EncryptedMarketFactory.json");
const EncryptedPredictionMarketAbi = require("./abis/EncryptedPredictionMarket.json");
const EncryptedMarketResolverAbi = require("./abis/EncryptedMarketResolver.json");

type KeeperContract = ethers.Contract & Record<string, any>;
type ContractValue = Awaited<ReturnType<KeeperContract["bets"]>>;

function getProvider(rpcUrl?: string): ethers.JsonRpcProvider {
  const resolvedRpcUrl =
    rpcUrl ||
    process.env.KEEPER_RPC_URL ||
    "https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f";

  return new ethers.JsonRpcProvider(resolvedRpcUrl, undefined, {
    batchMaxCount: 1
  });
}

function getSigner(provider: ethers.JsonRpcProvider): ethers.Wallet {
  const rawKey = process.env.KEEPER_PRIVATE_KEY || "";
  if (!rawKey) {
    throw new Error("KEEPER_PRIVATE_KEY not set");
  }

  const key = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  return new ethers.Wallet(key, provider);
}

function optionalContract(
  address: string | undefined,
  abi: unknown,
  signer: ethers.Wallet
): KeeperContract | null {
  if (!address || !ethers.isAddress(address) || address === ethers.ZeroAddress) {
    return null;
  }

  return new ethers.Contract(address, abi as ethers.InterfaceAbi, signer) as KeeperContract;
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

function getBetState(bet: ContractValue): { player: string; resolved: boolean; resolutionPending: boolean; won: boolean } {
  return {
    player: String(bet[0]),
    resolved: Boolean(bet[4]),
    resolutionPending: Boolean(bet[5]),
    won: Boolean(bet[7] ?? bet[8] ?? false)
  };
}

async function processEncryptedBets(
  label: string,
  game: KeeperContract | null,
  logs: string[],
  provider: ethers.JsonRpcProvider
): Promise<void> {
  if (!game) {
    return;
  }

  const nextBetId = (await game.nextBetId()) as bigint;
  for (let betId = 0n; betId < nextBetId; betId += 1n) {
    try {
      const bet = getBetState(await game.bets(betId));
      if (bet.resolved) {
        continue;
      }

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
      } catch (err: unknown) {
        const msg = formatError(err);
        if (msg.includes("WIN_FLAG_PENDING")) {
          const forceResolve = game.forceResolve;
          if (typeof forceResolve !== "function") {
            logs.push(`[${label}] bet ${betId} pending (forceResolve unavailable): ${msg}`);
            continue;
          }

          try {
            const block = await provider.getBlock("latest");
            const won = block?.hash ? BigInt(block.hash) % 2n === 0n : false;
            const tx = await forceResolve.call(game, betId, won);
            logs.push(`[${label}] forceResolve(${betId}, ${won}) -> ${tx.hash}`);
            await tx.wait();
          } catch (forceError: unknown) {
            logs.push(`[${label}] bet ${betId} pending (no forceResolve): ${formatError(forceError)}`);
          }
        } else {
          logs.push(`[${label}] finalizeResolution(${betId}): ${msg}`);
        }
      }
    } catch (err: unknown) {
      logs.push(`[${label}] bet ${betId}: ${formatError(err)}`);
    }
  }
}

async function processCrashRounds(crash: KeeperContract | null, logs: string[]): Promise<void> {
  if (!crash) {
    return;
  }

  const nextRoundId = (await crash.nextRoundId()) as bigint;
  for (let roundId = 0n; roundId < nextRoundId; roundId += 1n) {
    try {
      const round = await crash.rounds(roundId);
      if (!Boolean(round[0])) {
        continue;
      }

      if (!Boolean(round[2])) {
        const tx = await crash.closeRound(roundId);
        logs.push(`[Crash] closeRound(${roundId}) -> ${tx.hash}`);
        await tx.wait();
        continue;
      }

      if (!Boolean(round[4])) {
        try {
          const tx = await crash.finalizeRound(roundId);
          logs.push(`[Crash] finalizeRound(${roundId}) -> ${tx.hash}`);
          await tx.wait();
        } catch (err: unknown) {
          logs.push(`[Crash] finalizeRound(${roundId}): ${formatError(err)}`);
        }
      }
    } catch (err: unknown) {
      logs.push(`[Crash] round ${roundId}: ${formatError(err)}`);
    }
  }
}

async function processPredictionMarkets(
  factory: KeeperContract | null,
  signer: ethers.Wallet,
  logs: string[]
): Promise<void> {
  const configured = (process.env.ENCRYPTED_MARKET_ADDRESSES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const addresses = new Set(configured);

  if (factory) {
    const total = Number(await factory.totalMarkets());
    for (let index = 0; index < total; index += 1) {
      addresses.add(String(await factory.allMarkets(index)));
    }
  }

  for (const address of addresses) {
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) {
      continue;
    }

    const market = new ethers.Contract(address, EncryptedPredictionMarketAbi, signer) as KeeperContract;
    try {
      const [resolvesAt, resolved, resolverAddress, nextPositionId] = await Promise.all([
        market.resolvesAt() as Promise<bigint>,
        market.resolved() as Promise<boolean>,
        market.resolver() as Promise<string>,
        market.nextPositionId() as Promise<bigint>
      ]);

      if (!resolved && Number(resolvesAt) <= Math.floor(Date.now() / 1000)) {
        try {
          const resolver = new ethers.Contract(resolverAddress, EncryptedMarketResolverAbi, signer) as KeeperContract;
          const tx = await resolver.requestResolution();
          logs.push(`[Market] requestResolution(${address}) -> ${tx.hash}`);
          await tx.wait();
        } catch (error: unknown) {
          logs.push(`[Market] resolve ${address}: ${formatError(error)}`);
        }
      }

      for (let positionId = 0n; positionId < nextPositionId; positionId += 1n) {
        try {
          const position = await market.positions(positionId);
          if (!position[0] || position[0] === ethers.ZeroAddress || Boolean(position[5])) {
            continue;
          }
          if (!Boolean(position[4])) {
            continue;
          }

          const tx = await market.finalizeClaimWinnings(positionId);
          logs.push(`[Market] finalizeClaim(${address},${positionId}) -> ${tx.hash}`);
          await tx.wait();
        } catch (error: unknown) {
          logs.push(`[Market] pos ${positionId}: ${formatError(error)}`);
        }
      }
    } catch (error: unknown) {
      logs.push(`[Market] ${address}: ${formatError(error)}`);
    }
  }
}

export async function runKeeperTick(): Promise<string[]> {
  const logs: string[] = [];
  const rpcUrl =
    process.env.KEEPER_RPC_URL ||
    "https://arbitrum-sepolia.infura.io/v3/2a16fc884a10441eae11c29cd9b9aa5f";
  const provider = getProvider(rpcUrl);
  const signer = getSigner(provider);

  logs.push(`Keeper tick at ${new Date().toISOString()}`);
  logs.push(`Signer: ${await signer.getAddress()}`);
  logs.push(`RPC: ${rpcUrl}`);

  const coinFlip = optionalContract(process.env.ENCRYPTED_COIN_FLIP_ADDRESS, EncryptedCoinFlipAbi, signer);
  const dice = optionalContract(process.env.ENCRYPTED_DICE_GAME_ADDRESS, EncryptedDiceGameAbi, signer);
  const crash = optionalContract(process.env.ENCRYPTED_CRASH_GAME_ADDRESS, EncryptedCrashGameAbi, signer);
  const factory = optionalContract(
    process.env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS || process.env.ENCRYPTED_MARKET_FACTORY_ADDRESS,
    EncryptedMarketFactoryAbi,
    signer
  );

  logs.push(`CoinFlip: ${coinFlip ? String((coinFlip as any).target) : "off"}`);
  logs.push(`Dice: ${dice ? String((dice as any).target) : "off"}`);
  logs.push(`Crash: ${crash ? String((crash as any).target) : "off"}`);
  logs.push(`Prediction Factory: ${factory ? String((factory as any).target) : "off"}`);

  try {
    await processEncryptedBets("CoinFlip", coinFlip, logs, provider);
  } catch (error: unknown) {
    logs.push(`[CoinFlip] tick failed: ${formatError(error)}`);
  }

  try {
    await processEncryptedBets("Dice", dice, logs, provider);
  } catch (error: unknown) {
    logs.push(`[Dice] tick failed: ${formatError(error)}`);
  }

  try {
    await processCrashRounds(crash, logs);
  } catch (error: unknown) {
    logs.push(`[Crash] tick failed: ${formatError(error)}`);
  }

  try {
    await processPredictionMarkets(factory, signer, logs);
  } catch (error: unknown) {
    logs.push(`[Prediction] tick failed: ${formatError(error)}`);
  }

  logs.push(`Done at ${new Date().toISOString()}`);
  return logs;
}
