import { ethers } from "ethers";
import pLimit from "p-limit";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import {
  ENCRYPTED_COIN_FLIP_ABI,
  ENCRYPTED_CRASH_ABI,
  ENCRYPTED_DICE_ABI,
  ENCRYPTED_VAULT_ABI,
  MARKET_FACTORY_ABI,
  MARKET_RESOLVER_ABI,
  PREDICTION_MARKET_ABI
} from "@/lib/casfin-abis";
import { createLoadBalancedProvider } from "@/lib/loadBalancedTransport";

const ARBITRUM_SEPOLIA_NETWORK = {
  chainId: CASFIN_CONFIG.chainId,
  name: "arbitrum-sepolia"
} as const;

const sharedReadProvider = createLoadBalancedProvider(ARBITRUM_SEPOLIA_NETWORK);
const predictionReadLimit = pLimit(4);

function schedulePredictionRead<T>(task: () => Promise<T>) {
  return predictionReadLimit(task);
}

export const publicProvider = sharedReadProvider;
export const pollingProvider = sharedReadProvider;
export const fheReadProvider = sharedReadProvider;
export const walletReadProvider = sharedReadProvider;
export const EMPTY_ADDRESS = ethers.ZeroAddress;

export const EMPTY_CASINO_STATE = {
  isFhe: false,
  vaultOwner: "",
  vaultBalance: 0n,
  playerBalance: 0n,
  playerLockedBalance: 0n,
  playerBalanceHandle: null,
  playerLockedBalanceHandle: null,
  pendingWithdrawal: null,
  router: {
    owner: "",
    latestRequestId: null,
    latestRequestSource: "",
    latestRequest: null
  },
  coin: {
    houseEdgeBps: 0,
    maxBetAmount: 0n,
    nextBetId: 0n,
    latestBet: null
  },
  dice: {
    houseEdgeBps: 0,
    maxBetAmount: 0n,
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

export const EMPTY_PREDICTION_STATE = {
  factoryOwner: "",
  totalMarkets: 0,
  approvedCreator: false,
  feeConfig: {
    platformFeeBps: 0,
    lpFeeBps: 0,
    resolverFeeBps: 0
  },
  markets: []
};

export function toLocalDateTimeValue(hoursFromNow = 48) {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const shiftedDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return shiftedDate.toISOString().slice(0, 16);
}

export function formatAddress(address) {
  if (!address || address === EMPTY_ADDRESS) {
    return "Not set";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatEth(value, digits = 4) {
  const numericValue = Number(ethers.formatEther(typeof value === "bigint" ? value : BigInt(value || 0)));

  if (!Number.isFinite(numericValue) || numericValue === 0) {
    return "0";
  }

  if (numericValue < 0.0001) {
    return "<0.0001";
  }

  return numericValue.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatNumber(value) {
  if (value === null || value === undefined) {
    return "0";
  }

  return (typeof value === "bigint" ? value : BigInt(value)).toLocaleString();
}

export function formatShares(value, digits = 4) {
  const numericValue = Number(ethers.formatUnits(typeof value === "bigint" ? value : BigInt(value || 0), 18));

  if (!Number.isFinite(numericValue) || numericValue === 0) {
    return "0";
  }

  if (numericValue < 0.0001) {
    return "<0.0001";
  }

  return numericValue.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatDate(timestamp) {
  if (!timestamp) {
    return "Not scheduled";
  }

  return new Date(Number(timestamp) * 1000).toLocaleString();
}

export function formatBps(bps) {
  return `${(Number(bps || 0) / 100).toFixed(2)}%`;
}

export function formatMultiplier(bps) {
  return `${(Number(bps || 0) / 10000).toFixed(2)}x`;
}

export function parseRequiredEth(value, label) {
  if (!value || Number(value) <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return ethers.parseEther(value);
}

export function parseRequiredInteger(value, label) {
  if (value === "" || value === null || value === undefined) {
    throw new Error(`${label} is required.`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a whole number.`);
  }

  return parsed;
}

export function parseRequiredShares(value, label) {
  if (!value || Number(value) <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return ethers.parseUnits(value, 18);
}

export function parseCashOutMultiplier(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1.1) {
    throw new Error("Cash out target must be at least 1.10x.");
  }

  return Math.round(parsed * 10_000);
}

export function getMarketPhase(market) {
  if (market.finalized) {
    return "Finalized";
  }

  if (market.resolved) {
    return "Resolved";
  }

  if (Date.now() >= Number(market.resolvesAt) * 1000) {
    return "Awaiting Resolution";
  }

  return "Open";
}

export function extractError(error) {
  const message =
    error?.shortMessage ||
    error?.reason ||
    error?.error?.message ||
    error?.info?.error?.message ||
    error?.message ||
    "Transaction failed.";

  const normalizedMessage = message.replace("execution reverted: ", "").replace("Error: ", "");

  if (/insufficient funds/i.test(normalizedMessage)) {
    return "Insufficient ETH in the connected wallet for the requested amount and gas. Switch MetaMask to a funded account or reduce the amount.";
  }

  if (
    /RPC endpoint returned too many errors|rate limit|too many requests|429|missing response for request|failed to detect network|cannot start up/i.test(
      normalizedMessage
    )
  ) {
    return "One of the configured Arbitrum Sepolia RPC endpoints is rate-limited or unhealthy. Check NEXT_PUBLIC_RPC_URL_1, NEXT_PUBLIC_RPC_URL_2, NEXT_PUBLIC_RPC_URL_3, and NEXT_PUBLIC_RPC_URL_4, then restart the app and reconnect the wallet network if needed.";
  }

  if (/NOT_CONNECTED|MISSING_PUBLIC_CLIENT|MISSING_WALLET_CLIENT|CoFHE not connected/i.test(normalizedMessage)) {
    return "The CoFHE session is not connected. Reconnect the wallet on Arbitrum Sepolia and try again.";
  }

  if (/CoFHE client failed to initialize within timeout|encrypted CoFHE session is still loading|Initializing CoFHE|Warming encrypted session/i.test(normalizedMessage)) {
    return "The encrypted CoFHE session is still initializing. Wait a moment for TFHE to finish booting, then try again.";
  }

  if (/InvalidEncryptedInput|encrypted input proof/i.test(normalizedMessage)) {
    return "This FHE action needs a valid encrypted CoFHE proof from the connected wallet session.";
  }

  if (/cannot use object value with unnamed components/i.test(normalizedMessage)) {
    return "The encrypted payload was encoded in the wrong shape for the contract ABI. Refresh the page and try the action again.";
  }

  if (/sealoutput request failed: HTTP 403/i.test(normalizedMessage)) {
    return "The CoFHE decrypt endpoint rejected the current wallet session. Reconnect the wallet to refresh the self-permit and try again.";
  }

  if (/WITHDRAWAL_PENDING|WIN_FLAG_PENDING/i.test(normalizedMessage)) {
    return "The encrypted task is still pending at the validator. Wait a bit and try again.";
  }

  return normalizedMessage;
}

function mapCoinBet(id, bet) {
  if (!bet) {
    return null;
  }

  return {
    id,
    player: bet.player ?? bet[0],
    lockedAmount: bet.lockedAmount ?? 0n,
    lockedHandle: serializeHandle(bet.lockedHandle ?? bet[1]),
    guessHeads: bet.guessHeads ?? null,
    requestId: 0n,
    resolved: bet.resolved ?? bet[4],
    resolutionPending: bet.resolutionPending ?? bet[5] ?? false,
    won: bet.won ?? bet[7] ?? false
  };
}

function mapDiceBet(id, bet) {
  if (!bet) {
    return null;
  }

  return {
    id,
    player: bet.player ?? bet[0],
    lockedAmount: bet.lockedAmount ?? 0n,
    lockedHandle: serializeHandle(bet.lockedHandle ?? bet[1]),
    guess: bet.guess !== undefined ? Number(bet.guess) : null,
    requestId: 0n,
    resolved: bet.resolved ?? bet[4],
    resolutionPending: bet.resolutionPending ?? bet[5] ?? false,
    rolled: Number(bet.rolled ?? bet[8] ?? 0),
    won: bet.won ?? bet[7] ?? false
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
    lockedAmount: 0n,
    lockedHandle: serializeHandle(bet.lockedHandle ?? bet[0]),
    cashOutMultiplierBps: Number(bet.cashOutMultiplierBps ?? bet[1]),
    exists: bet.exists ?? bet[3],
    settled: bet.settled ?? bet[4],
    won: bet.won ?? bet[5]
  };
}

function serializeHandle(handle) {
  if (!handle) {
    return null;
  }

  return typeof handle === "string" ? handle : ethers.hexlify(handle);
}

function getOrderedReadProviders(preferredProvider = publicProvider) {
  return [preferredProvider, publicProvider, pollingProvider, fheReadProvider, walletReadProvider].filter(
    (provider, index, providers) => providers.indexOf(provider) === index
  );
}

async function withReadProviderFailover(taskName, preferredProvider, runner) {
  let lastError;

  for (const [index, provider] of getOrderedReadProviders(preferredProvider).entries()) {
    try {
      return await runner(provider);
    } catch (error) {
      lastError = error;
      console.warn(`[casfin-client] ${taskName} failed on RPC candidate ${index + 1}.`, error);
    }
  }

  throw lastError || new Error(`${taskName} failed across all configured RPC endpoints.`);
}

async function loadCasinoStateWithProvider(currentAccount, provider) {
  const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, ENCRYPTED_VAULT_ABI, provider);
  const coin = new ethers.Contract(CASFIN_CONFIG.addresses.coinFlipGame, ENCRYPTED_COIN_FLIP_ABI, provider);
  const dice = new ethers.Contract(CASFIN_CONFIG.addresses.diceGame, ENCRYPTED_DICE_ABI, provider);
  const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, ENCRYPTED_CRASH_ABI, provider);

  const [
    vaultOwner,
    vaultBalance,
    coinHouseEdgeBps,
    coinNextBetId,
    diceHouseEdgeBps,
    diceNextBetId,
    crashNextRoundId,
    crashMaxCashOutMultiplierBps
  ] = await Promise.all([
    vault.owner(),
    provider.getBalance(CASFIN_CONFIG.addresses.casinoVault),
    coin.houseEdgeBps(),
    coin.nextBetId(),
    dice.houseEdgeBps(),
    dice.nextBetId(),
    crash.nextRoundId(),
    crash.maxCashOutMultiplierBps()
  ]);

  const [rawLatestCoinBet, rawLatestDiceBet, rawLatestCrashRound] = await Promise.all([
    coinNextBetId > 0n ? coin.bets(coinNextBetId - 1n) : Promise.resolve(null),
    diceNextBetId > 0n ? dice.bets(diceNextBetId - 1n) : Promise.resolve(null),
    crashNextRoundId > 0n ? crash.rounds(crashNextRoundId - 1n) : Promise.resolve(null)
  ]);

  const latestCoinBet = mapCoinBet(coinNextBetId > 0n ? coinNextBetId - 1n : null, rawLatestCoinBet);
  const latestDiceBet = mapDiceBet(diceNextBetId > 0n ? diceNextBetId - 1n : null, rawLatestDiceBet);
  const latestCrashRound = mapCrashRound(crashNextRoundId > 0n ? crashNextRoundId - 1n : null, rawLatestCrashRound);

  let playerBalanceHandle = null;
  let playerLockedBalanceHandle = null;
  let pendingWithdrawal = null;
  let latestCrashPlayerBet = null;

  if (currentAccount) {
    const [balanceResult, lockedBalanceResult, withdrawalResult, crashPlayerBetResult] = await Promise.allSettled([
      vault.getEncryptedBalance.staticCall({ from: currentAccount }),
      vault.getEncryptedLockedBalance.staticCall({ from: currentAccount }),
      vault.getPendingWithdrawal.staticCall({ from: currentAccount }),
      latestCrashRound ? crash.playerBets(latestCrashRound.id, currentAccount) : Promise.resolve(null)
    ]);

    if (balanceResult.status === "fulfilled") {
      playerBalanceHandle = balanceResult.value;
    }

    if (lockedBalanceResult.status === "fulfilled") {
      playerLockedBalanceHandle = lockedBalanceResult.value;
    }

    if (withdrawalResult.status === "fulfilled") {
      pendingWithdrawal = withdrawalResult.value;
    }

    if (crashPlayerBetResult.status === "fulfilled") {
      latestCrashPlayerBet = crashPlayerBetResult.value;
    }
  }

  return {
    isFhe: true,
    vaultOwner,
    vaultBalance,
    playerBalance: 0n,
    playerLockedBalance: 0n,
    playerBalanceHandle: serializeHandle(playerBalanceHandle),
    playerLockedBalanceHandle: serializeHandle(playerLockedBalanceHandle),
    pendingWithdrawal: pendingWithdrawal
      ? {
          amountHandle: serializeHandle(pendingWithdrawal[0]),
          exists: pendingWithdrawal[1]
        }
      : null,
    router: {
      owner: "",
      latestRequestId: null,
      latestRequestSource: "",
      latestRequest: null
    },
    coin: {
      houseEdgeBps: Number(coinHouseEdgeBps),
      maxBetAmount: 0n,
      nextBetId: coinNextBetId,
      latestBet: latestCoinBet
    },
    dice: {
      houseEdgeBps: Number(diceHouseEdgeBps),
      maxBetAmount: 0n,
      nextBetId: diceNextBetId,
      latestBet: latestDiceBet
    },
    crash: {
      nextRoundId: crashNextRoundId,
      maxCashOutMultiplierBps: Number(crashMaxCashOutMultiplierBps),
      latestRound: latestCrashRound,
      latestPlayerBet: mapCrashPlayerBet(latestCrashPlayerBet)
    }
  };
}

async function loadPredictionStateWithProvider(currentAccount, provider) {
  const factory = new ethers.Contract(CASFIN_CONFIG.addresses.marketFactory, MARKET_FACTORY_ABI, provider);
  const [factoryOwner, totalMarketsRaw, feeConfig, approvedCreator] = await Promise.all([
    schedulePredictionRead(() => factory.owner()),
    schedulePredictionRead(() => factory.totalMarkets()),
    schedulePredictionRead(() => factory.feeConfig()),
    currentAccount ? schedulePredictionRead(() => factory.approvedCreators(currentAccount)) : Promise.resolve(false)
  ]);

  const totalMarkets = Number(totalMarketsRaw);
  const indexes = Array.from({ length: totalMarkets }, (_, index) => totalMarkets - index - 1);
  const marketAddresses = await Promise.all(
    indexes.map((index) => schedulePredictionRead(() => factory.allMarkets(index)))
  );

  const markets = await Promise.all(
    marketAddresses.map(async (address) => {
      const market = new ethers.Contract(address, PREDICTION_MARKET_ABI, provider);
      const meta = await schedulePredictionRead(() => factory.marketMeta(address));

      const [
        question,
        description,
        resolvesAt,
        resolved,
        finalized,
        winningOutcome,
        creator,
        resolverAddress,
        outcomesCount
      ] = await Promise.all([
        schedulePredictionRead(() => market.question()),
        schedulePredictionRead(() => market.description()),
        schedulePredictionRead(() => market.resolvesAt()),
        schedulePredictionRead(() => market.resolved()),
        schedulePredictionRead(() => market.finalized()),
        schedulePredictionRead(() => market.winningOutcome()),
        schedulePredictionRead(() => market.creator()),
        schedulePredictionRead(() => market.resolver()),
        schedulePredictionRead(() => market.outcomesCount())
      ]);

      const outcomeIndexes = Array.from({ length: Number(outcomesCount) }, (_, index) => index);
      const outcomeLabels = await Promise.all(
        outcomeIndexes.map((index) => schedulePredictionRead(() => market.outcomes(index)))
      );

      const hasClaimed = currentAccount
        ? await schedulePredictionRead(() => market.hasClaimed(currentAccount))
        : false;

      const resolver = new ethers.Contract(resolverAddress, MARKET_RESOLVER_ABI, provider);
      const [manualResolver, feeRecipient, oracleType, resolutionRequested] = await Promise.all([
        schedulePredictionRead(() => resolver.manualResolver()),
        schedulePredictionRead(() => resolver.feeRecipient()),
        schedulePredictionRead(() => resolver.oracleType()),
        schedulePredictionRead(() => resolver.resolutionRequested())
      ]);

      return {
        address,
        question,
        description,
        resolvesAt,
        resolved,
        finalized,
        winningOutcome: Number(winningOutcome),
        creator,
        collateralPool: 0n,
        outcomeLabels,
        totalShares: outcomeIndexes.map(() => 0n),
        userShares: outcomeIndexes.map(() => 0n),
        hasClaimed,
        poolBalance: 0n,
        meta: {
          market: meta.market,
          amm: meta.amm,
          pool: meta.pool,
          resolver: meta.resolver,
          creator: meta.creator,
          createdAt: meta.createdAt,
          oracleType: Number(meta.oracleType)
        },
        resolver: {
          address: resolverAddress,
          manualResolver,
          feeRecipient,
          oracleType: Number(oracleType),
          resolutionRequested
        }
      };
    })
  );

  return {
    factoryOwner,
    totalMarkets,
    approvedCreator,
    feeConfig: {
      platformFeeBps: Number(feeConfig.platformFeeBps),
      lpFeeBps: Number(feeConfig.lpFeeBps),
      resolverFeeBps: Number(feeConfig.resolverFeeBps)
    },
    markets
  };
}

export async function loadCasinoState(currentAccount, provider = publicProvider) {
  return withReadProviderFailover("loadCasinoState", provider, (activeProvider) =>
    loadCasinoStateWithProvider(currentAccount, activeProvider)
  );
}

export async function loadPredictionState(currentAccount, provider = publicProvider) {
  return withReadProviderFailover("loadPredictionState", provider, (activeProvider) =>
    loadPredictionStateWithProvider(currentAccount, activeProvider)
  );
}
