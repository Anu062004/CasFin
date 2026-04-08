import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { extractError } from "@/lib/casfin-client";
import { toEncryptedInputTuple } from "@/lib/cofhe-utils";
import EncryptedCasinoVaultAbi from "@/lib/generated-abis/EncryptedCasinoVault.json";
import EncryptedCoinFlipAbi from "@/lib/generated-abis/EncryptedCoinFlip.json";
import EncryptedDiceGameAbi from "@/lib/generated-abis/EncryptedDiceGame.json";
import EncryptedCrashGameAbi from "@/lib/generated-abis/EncryptedCrashGame.json";

export const FHE_CASFIN_CONFIG = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 421614),
  rpcUrl: CASFIN_CONFIG.fheRpcUrl,
  addresses: {
    encryptedCasinoVault: process.env.NEXT_PUBLIC_FHE_VAULT_ADDRESS || ethers.ZeroAddress,
    encryptedCoinFlip: process.env.NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS || ethers.ZeroAddress,
    encryptedDiceGame: process.env.NEXT_PUBLIC_FHE_DICE_ADDRESS || ethers.ZeroAddress,
    encryptedCrashGame: process.env.NEXT_PUBLIC_FHE_CRASH_ADDRESS || ethers.ZeroAddress
  }
};

const ARBITRUM_SEPOLIA_NETWORK = {
  chainId: FHE_CASFIN_CONFIG.chainId,
  name: "arbitrum-sepolia"
} as const;

export const fhePublicProvider = new ethers.JsonRpcProvider(FHE_CASFIN_CONFIG.rpcUrl, ARBITRUM_SEPOLIA_NETWORK, {
  staticNetwork: true
});

export const EMPTY_FHE_STATE = {
  vault: {
    owner: "",
    totalDeposits: 0n,
    encryptedBalance: null,
    encryptedLockedBalance: null,
    pendingWithdrawal: null
  },
  coin: {
    nextBetId: 0n,
    latestBet: null
  },
  dice: {
    nextBetId: 0n,
    latestBet: null
  },
  crash: {
    nextRoundId: 0n,
    maxCashOutMultiplierBps: 0,
    latestRound: null,
    latestPlayerBet: null
  }
};

/*
CoFHE encryption is now handled by the shared provider in lib/cofhe-provider.tsx.

Usage from any client component:

  import { useCofhe } from "@/lib/cofhe-provider";

  const { encryptUint128, encryptBool, decryptForView } = useCofhe();
  const encAmount = await encryptUint128(ethers.parseEther("0.01"));
  const encGuess = await encryptBool(true);
  await contract.placeBet(encAmount, encGuess);
*/

function getContracts(runner = fhePublicProvider) {
  return {
    vault: new ethers.Contract(FHE_CASFIN_CONFIG.addresses.encryptedCasinoVault, EncryptedCasinoVaultAbi, runner),
    coin: new ethers.Contract(FHE_CASFIN_CONFIG.addresses.encryptedCoinFlip, EncryptedCoinFlipAbi, runner),
    dice: new ethers.Contract(FHE_CASFIN_CONFIG.addresses.encryptedDiceGame, EncryptedDiceGameAbi, runner),
    crash: new ethers.Contract(FHE_CASFIN_CONFIG.addresses.encryptedCrashGame, EncryptedCrashGameAbi, runner)
  };
}

function serializeHandle(handle) {
  if (!handle) {
    return null;
  }

  return typeof handle === "string" ? handle : ethers.hexlify(handle);
}

function throwFriendlyTransactionError(error: unknown): never {
  throw new Error(extractError(error));
}

function mapCoinBet(id, bet) {
  if (!bet) {
    return null;
  }

  return {
    id,
    player: bet.player ?? bet[0],
    lockedHandle: serializeHandle(bet.lockedHandle ?? bet[1]),
    encGuessHeads: serializeHandle(bet.encGuessHeads ?? bet[2]),
    requestId: 0n,
    resolved: bet.resolved ?? bet[4],
    resolutionPending: bet.resolutionPending ?? bet[5],
    won: bet.won ?? bet[7]
  };
}

function mapDiceBet(id, bet) {
  if (!bet) {
    return null;
  }

  return {
    id,
    player: bet.player ?? bet[0],
    lockedHandle: serializeHandle(bet.lockedHandle ?? bet[1]),
    encGuess: serializeHandle(bet.encGuess ?? bet[2]),
    requestId: 0n,
    resolved: bet.resolved ?? bet[4],
    resolutionPending: bet.resolutionPending ?? bet[5],
    rolled: Number(bet.rolled ?? bet[8]),
    won: bet.won ?? bet[7]
  };
}

function mapCrashRound(id, round) {
  if (!round) {
    return null;
  }

  return {
    id,
    exists: round.exists ?? round[0],
    requestId: 0n,
    crashMultiplierBps: Number(round.crashMultiplierBps ?? round[3]),
    closed: round.closed ?? round[4]
  };
}

function mapCrashPlayerBet(bet) {
  if (!bet) {
    return null;
  }

  return {
    lockedHandle: serializeHandle(bet.lockedHandle ?? bet[0]),
    cashOutMultiplierBps: Number(bet.cashOutMultiplierBps ?? bet[1]),
    exists: bet.exists ?? bet[3],
    settled: bet.settled ?? bet[4],
    won: bet.won ?? bet[5]
  };
}

export async function loadFheState(currentAccount) {
  const { vault, coin, dice, crash } = getContracts();

  const [vaultOwner, totalDeposits, coinNextBetId, diceNextBetId, crashNextRoundId, crashMaxCashOutMultiplierBps] =
    await Promise.all([
      vault.owner(),
      vault.totalDeposits(),
      coin.nextBetId(),
      dice.nextBetId(),
      crash.nextRoundId(),
      crash.maxCashOutMultiplierBps()
    ]);

  const [rawLatestCoinBet, rawLatestDiceBet, rawLatestCrashRound] = await Promise.all([
    coinNextBetId > 0n ? coin.bets(coinNextBetId - 1n) : Promise.resolve(null),
    diceNextBetId > 0n ? dice.bets(diceNextBetId - 1n) : Promise.resolve(null),
    crashNextRoundId > 0n ? crash.rounds(crashNextRoundId - 1n) : Promise.resolve(null)
  ]);

  const latestCrashRound = mapCrashRound(crashNextRoundId > 0n ? crashNextRoundId - 1n : null, rawLatestCrashRound);

  const [encryptedBalance, encryptedLockedBalance, pendingWithdrawal, latestCrashPlayerBet] = currentAccount
    ? await Promise.all([
        vault.getEncryptedBalance.staticCall({ from: currentAccount }),
        vault.getEncryptedLockedBalance.staticCall({ from: currentAccount }),
        vault.getPendingWithdrawal.staticCall({ from: currentAccount }),
        latestCrashRound ? crash.playerBets(latestCrashRound.id, currentAccount) : Promise.resolve(null)
      ])
    : [null, null, null, null];

  return {
    vault: {
      owner: vaultOwner,
      totalDeposits,
      encryptedBalance: serializeHandle(encryptedBalance),
      encryptedLockedBalance: serializeHandle(encryptedLockedBalance),
      pendingWithdrawal: pendingWithdrawal
        ? {
            amountHandle: serializeHandle(pendingWithdrawal[0]),
            exists: pendingWithdrawal[1]
          }
        : null
    },
    coin: {
      nextBetId: coinNextBetId,
      latestBet: mapCoinBet(coinNextBetId > 0n ? coinNextBetId - 1n : null, rawLatestCoinBet)
    },
    dice: {
      nextBetId: diceNextBetId,
      latestBet: mapDiceBet(diceNextBetId > 0n ? diceNextBetId - 1n : null, rawLatestDiceBet)
    },
    crash: {
      nextRoundId: crashNextRoundId,
      maxCashOutMultiplierBps: Number(crashMaxCashOutMultiplierBps),
      latestRound: latestCrashRound,
      latestPlayerBet: mapCrashPlayerBet(latestCrashPlayerBet)
    }
  };
}

export async function placeFheCoinFlipBet(signer, encAmountStruct, encGuessStruct) {
  const { coin } = getContracts(signer);
  try {
    const tx = await coin.placeBet(
      toEncryptedInputTuple(encAmountStruct),
      toEncryptedInputTuple(encGuessStruct)
    );
    return await tx.wait();
  } catch (error) {
    throwFriendlyTransactionError(error);
  }
}

export async function placeFheDiceBet(signer, encAmountStruct, encGuessStruct) {
  const { dice } = getContracts(signer);
  try {
    const tx = await dice.placeBet(
      toEncryptedInputTuple(encAmountStruct),
      toEncryptedInputTuple(encGuessStruct)
    );
    return await tx.wait();
  } catch (error) {
    throwFriendlyTransactionError(error);
  }
}

export async function requestFheResolution(signer, gameAddress, betId) {
  const game = new ethers.Contract(gameAddress, ["function requestResolution(uint256 betId)"], signer);
  try {
    const tx = await game.requestResolution(betId);
    return await tx.wait();
  } catch (error) {
    throwFriendlyTransactionError(error);
  }
}

export async function finalizeFheResolution(signer, gameAddress, betId) {
  const game = new ethers.Contract(gameAddress, ["function finalizeResolution(uint256 betId)"], signer);
  try {
    const tx = await game.finalizeResolution(betId);
    return await tx.wait();
  } catch (error) {
    throwFriendlyTransactionError(error);
  }
}

export async function getFheVaultBalance(account) {
  if (!account) {
    return null;
  }

  const { vault } = getContracts();
  const handle = await vault.getEncryptedBalance.staticCall({ from: account });
  return serializeHandle(handle);
}
