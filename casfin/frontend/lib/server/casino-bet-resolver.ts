import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import {
  ENCRYPTED_COIN_FLIP_ABI,
  ENCRYPTED_CRASH_ABI,
  ENCRYPTED_DICE_ABI
} from "@/lib/casfin-abis";

const TASK_MANAGER_ADDRESS = "0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9";
const TASK_MANAGER_ABI = [
  "function getDecryptResultSafe(uint256 ctHash) view returns (uint256 result, bool decrypted)",
  "function publishDecryptResult(uint256 ctHash, uint256 result, bytes signature) external"
] as const;

const ARBITRUM_SEPOLIA = { chainId: 421614, name: "arbitrum-sepolia" } as const;
const FINALIZE_MAX_ATTEMPTS = 20;
const FINALIZE_DELAY_MS = 2_000;

type CasinoGame = "coinflip" | "dice" | "crash";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getResolverPrivateKey(): string {
  const key =
    process.env.KEEPER_PRIVATE_KEY ||
    process.env.RESOLVER_PRIVATE_KEY ||
    process.env.PRIVATE_KEY;

  if (!key) {
    throw new Error("KEEPER_PRIVATE_KEY or RESOLVER_PRIVATE_KEY is not configured on the server.");
  }

  return key;
}

function getResolverRpcUrl(): string {
  return (
    process.env.ARBITRUM_SEPOLIA_RPC_URL ||
    process.env.KEEPER_RPC_URL ||
    process.env.NEXT_PUBLIC_CASFIN_RPC_URL ||
    "https://sepolia-rollup.arbitrum.io/rpc"
  );
}

function formatError(error: unknown): string {
  const value = error as { shortMessage?: string; reason?: string; message?: string };
  return value?.shortMessage || value?.reason || value?.message || String(error);
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

let cofheClientPromise: Promise<Awaited<ReturnType<typeof createCofheClientInstance>>> | null = null;

async function createCofheClientInstance(
  signer: ethers.Wallet,
  provider: ethers.JsonRpcProvider
) {
  const { createCofheClient, createCofheConfig } = await import("@cofhe/sdk/node");
  const { Ethers6Adapter } = await import("@cofhe/sdk/adapters");
  const { arbSepolia } = await import("@cofhe/sdk/chains");
  const config = createCofheConfig({ supportedChains: [arbSepolia] });
  const client = createCofheClient(config);
  const { publicClient, walletClient } = await Ethers6Adapter(provider, signer);
  await client.connect(publicClient, walletClient);
  return client;
}

async function getCofheClient(signer: ethers.Wallet, provider: ethers.JsonRpcProvider) {
  if (!cofheClientPromise) {
    cofheClientPromise = createCofheClientInstance(signer, provider).catch((error) => {
      cofheClientPromise = null;
      throw error;
    });
  }

  return cofheClientPromise;
}

async function isDecryptReady(
  taskManager: ethers.Contract,
  handle: bigint
): Promise<boolean> {
  if (handle === 0n) {
    return true;
  }

  try {
    const [, decrypted] = await taskManager.getDecryptResultSafe(handle);
    return Boolean(decrypted);
  } catch {
    return false;
  }
}

async function publishDecryptHandle(
  taskManager: ethers.Contract,
  signer: ethers.Wallet,
  provider: ethers.JsonRpcProvider,
  handle: bigint,
  label: string
) {
  if (handle === 0n) {
    return;
  }

  if (await isDecryptReady(taskManager, handle)) {
    return;
  }

  const client = await getCofheClient(signer, provider);
  const result = await client.decryptForTx(handle).withoutPermit().execute();
  const publishedHash = result.ctHash !== undefined ? BigInt(result.ctHash) : handle;
  const tx = await taskManager.publishDecryptResult(
    publishedHash,
    result.decryptedValue,
    result.signature
  );
  await tx.wait();
  console.info(`[casino-resolver] published decrypt ${label}:${handle.toString().slice(0, 12)}`);
}

async function publishDecryptHandles(
  taskManager: ethers.Contract,
  signer: ethers.Wallet,
  provider: ethers.JsonRpcProvider,
  handles: bigint[],
  label: string
) {
  for (const handle of handles) {
    await publishDecryptHandle(taskManager, signer, provider, handle, label);
  }
}

function getDecryptHandles(game: "coinflip" | "dice", bet: ethers.Result): bigint[] {
  const pendingWonFlag = BigInt(bet[6]);
  if (game === "coinflip") {
    return [pendingWonFlag];
  }
  return [pendingWonFlag, BigInt(bet[3])];
}

async function resolveCoinFlipOrDice(game: "coinflip" | "dice", betId: bigint) {
  const provider = new ethers.JsonRpcProvider(getResolverRpcUrl(), ARBITRUM_SEPOLIA, {
    staticNetwork: true
  });
  const signer = new ethers.Wallet(getResolverPrivateKey(), provider);
  const gameAddress =
    game === "coinflip"
      ? process.env.ENCRYPTED_COIN_FLIP_ADDRESS || CASFIN_CONFIG.addresses.coinFlipGame
      : process.env.ENCRYPTED_DICE_GAME_ADDRESS || CASFIN_CONFIG.addresses.diceGame;
  const abi = game === "coinflip" ? ENCRYPTED_COIN_FLIP_ABI : ENCRYPTED_DICE_ABI;

  const contract = new ethers.Contract(gameAddress, abi, signer);
  const taskManager = new ethers.Contract(TASK_MANAGER_ADDRESS, TASK_MANAGER_ABI, signer);

  let bet = await contract.bets(betId);
  if (Boolean(bet[4])) {
    return { status: "already_resolved" as const, game, betId: betId.toString() };
  }

  if (!Boolean(bet[5])) {
    const requestTx = await contract.requestResolution(betId);
    await requestTx.wait();
    bet = await contract.bets(betId);
  }

  await publishDecryptHandles(taskManager, signer, provider, getDecryptHandles(game, bet), game);

  let finalizeTxHash = "";
  for (let attempt = 0; attempt < FINALIZE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const finalizeTx = await contract.finalizeResolution(betId);
      await finalizeTx.wait();
      finalizeTxHash = finalizeTx.hash;
      return {
        status: "resolved" as const,
        game,
        betId: betId.toString(),
        txHash: finalizeTxHash
      };
    } catch (error) {
      if (!isPendingFinalizeError(error) || attempt === FINALIZE_MAX_ATTEMPTS - 1) {
        throw error;
      }

      bet = await contract.bets(betId);
      await publishDecryptHandles(taskManager, signer, provider, getDecryptHandles(game, bet), game);
      await sleep(FINALIZE_DELAY_MS);
    }
  }

  throw new Error(`${game} bet ${betId.toString()} resolution timed out waiting for CoFHE decrypt.`);
}

async function resolveCrashPlayerBet(roundId: bigint, player: string) {
  const provider = new ethers.JsonRpcProvider(getResolverRpcUrl(), ARBITRUM_SEPOLIA, {
    staticNetwork: true
  });
  const signer = new ethers.Wallet(getResolverPrivateKey(), provider);
  const crashAddress = process.env.ENCRYPTED_CRASH_GAME_ADDRESS || CASFIN_CONFIG.addresses.crashGame;
  const crash = new ethers.Contract(crashAddress, ENCRYPTED_CRASH_ABI, signer);
  const taskManager = new ethers.Contract(TASK_MANAGER_ADDRESS, TASK_MANAGER_ABI, signer);
  const normalizedPlayer = ethers.getAddress(player);

  let round = await crash.rounds(roundId);
  if (!Boolean(round[0])) {
    throw new Error(`Unknown crash round ${roundId.toString()}.`);
  }

  if (!Boolean(round[4])) {
    if (!Boolean(round[2])) {
      const closeTx = await crash.closeRound(roundId);
      await closeTx.wait();
      round = await crash.rounds(roundId);
    }

    await publishDecryptHandles(
      taskManager,
      signer,
      provider,
      [BigInt(round[1])],
      `crash:${roundId.toString()}`
    );

    for (let attempt = 0; attempt < FINALIZE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const finalizeTx = await crash.finalizeRound(roundId);
        await finalizeTx.wait();
        break;
      } catch (error) {
        if (!isPendingFinalizeError(error) || attempt === FINALIZE_MAX_ATTEMPTS - 1) {
          throw error;
        }
        round = await crash.rounds(roundId);
        await publishDecryptHandles(taskManager, signer, provider, [BigInt(round[1])], "crash");
        await sleep(FINALIZE_DELAY_MS);
      }
    }
  }

  const playerBet = await crash.playerBets(roundId, normalizedPlayer);
  if (!Boolean(playerBet[3])) {
    throw new Error(`No crash bet for ${normalizedPlayer} in round ${roundId.toString()}.`);
  }

  if (Boolean(playerBet[4])) {
    return { status: "already_resolved" as const, game: "crash" as const, roundId: roundId.toString(), player: normalizedPlayer };
  }

  const settleTx = await crash.settleBet(roundId, normalizedPlayer);
  await settleTx.wait();

  return {
    status: "resolved" as const,
    game: "crash" as const,
    roundId: roundId.toString(),
    player: normalizedPlayer,
    txHash: settleTx.hash
  };
}

export async function resolveCasinoBet(input: {
  game: CasinoGame;
  betId?: string;
  roundId?: string;
  player?: string;
}) {
  if (input.game === "crash") {
    if (!input.roundId || !input.player) {
      throw new Error("Crash resolution requires roundId and player.");
    }
    return resolveCrashPlayerBet(BigInt(input.roundId), input.player);
  }

  if (!input.betId) {
    throw new Error("betId is required for coinflip and dice resolution.");
  }

  return resolveCoinFlipOrDice(input.game, BigInt(input.betId));
}
