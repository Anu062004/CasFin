import { ethers } from "ethers";
import EncryptedCasinoVaultAbi from "@/lib/generated-abis/EncryptedCasinoVault.json";
import EncryptedCoinFlipAbi from "@/lib/generated-abis/EncryptedCoinFlip.json";
import EncryptedDiceGameAbi from "@/lib/generated-abis/EncryptedDiceGame.json";
import EncryptedCrashGameAbi from "@/lib/generated-abis/EncryptedCrashGame.json";

export const FHE_CASFIN_CONFIG = {
  chainId: Number(process.env.NEXT_PUBLIC_ARB_SEPOLIA_CHAIN_ID || 421614),
  rpcUrl: process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
  addresses: {
    encryptedCasinoVault: process.env.NEXT_PUBLIC_FHE_VAULT_ADDRESS || ethers.ZeroAddress,
    encryptedCoinFlip: process.env.NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS || ethers.ZeroAddress,
    encryptedDiceGame: process.env.NEXT_PUBLIC_FHE_DICE_ADDRESS || ethers.ZeroAddress,
    encryptedCrashGame: process.env.NEXT_PUBLIC_FHE_CRASH_ADDRESS || ethers.ZeroAddress
  }
};

export const fhePublicProvider = new ethers.JsonRpcProvider(FHE_CASFIN_CONFIG.rpcUrl);

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
Example encryption flow with the CoFHE SDK:

import { CofheSDK } from "@fhenixprotocol/cofhejs";

const provider = new ethers.BrowserProvider(window.ethereum);
const sdk = await CofheSDK.create({ provider });
const encAmount = await sdk.encrypt_uint128(BigInt("1000000000000000")); // 0.001 ETH as wei
const encGuess = await sdk.encrypt_bool(true);
await placeFheCoinFlipBet(await provider.getSigner(), encAmount, encGuess);
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

function mapCoinBet(id, bet) {
  if (!bet) {
    return null;
  }

  return {
    id,
    player: bet.player ?? bet[0],
    lockedHandle: serializeHandle(bet.lockedHandle ?? bet[1]),
    encGuessHeads: serializeHandle(bet.encGuessHeads ?? bet[2]),
    requestId: bet.requestId ?? bet[3],
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
    requestId: bet.requestId ?? bet[3],
    resolved: bet.resolved ?? bet[4],
    resolutionPending: bet.resolutionPending ?? bet[5],
    rolled: Number(bet.rolled ?? bet[7]),
    won: bet.won ?? bet[8]
  };
}

function mapCrashRound(id, round) {
  if (!round) {
    return null;
  }

  return {
    id,
    exists: round.exists ?? round[0],
    requestId: round.requestId ?? round[1],
    crashMultiplierBps: Number(round.crashMultiplierBps ?? round[2]),
    closed: round.closed ?? round[3]
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
  const tx = await coin.placeBet(encAmountStruct, encGuessStruct);
  return tx.wait();
}

export async function placeFheDiceBet(signer, encAmountStruct, encGuessStruct) {
  const { dice } = getContracts(signer);
  const tx = await dice.placeBet(encAmountStruct, encGuessStruct);
  return tx.wait();
}

export async function requestFheResolution(signer, gameAddress, betId) {
  const game = new ethers.Contract(gameAddress, ["function requestResolution(uint256 betId)"], signer);
  const tx = await game.requestResolution(betId);
  return tx.wait();
}

export async function finalizeFheResolution(signer, gameAddress, betId) {
  const game = new ethers.Contract(gameAddress, ["function finalizeResolution(uint256 betId)"], signer);
  const tx = await game.finalizeResolution(betId);
  return tx.wait();
}

export async function getFheVaultBalance(account) {
  if (!account) {
    return null;
  }

  const { vault } = getContracts();
  const handle = await vault.getEncryptedBalance.staticCall({ from: account });
  return serializeHandle(handle);
}
