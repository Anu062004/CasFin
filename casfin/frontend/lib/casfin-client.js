import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import {
  COIN_FLIP_ABI,
  CRASH_ABI,
  DICE_ABI,
  LIQUIDITY_POOL_ABI,
  MARKET_FACTORY_ABI,
  MARKET_RESOLVER_ABI,
  PREDICTION_MARKET_ABI,
  RANDOMNESS_ROUTER_ABI,
  VAULT_ABI
} from "@/lib/casfin-abis";

export const publicProvider = new ethers.JsonRpcProvider(CASFIN_CONFIG.publicRpcUrl);
export const EMPTY_ADDRESS = ethers.ZeroAddress;

export const EMPTY_CASINO_STATE = {
  vaultOwner: "",
  vaultBalance: 0n,
  playerBalance: 0n,
  playerLockedBalance: 0n,
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
    error?.info?.error?.message ||
    error?.message ||
    "Transaction failed.";

  return message.replace("execution reverted: ", "").replace("Error: ", "");
}

function mapCoinBet(id, bet) {
  if (!bet) {
    return null;
  }

  return {
    id,
    player: bet.player,
    lockedAmount: bet.lockedAmount,
    guessHeads: bet.guessHeads,
    requestId: bet.requestId,
    resolved: bet.resolved,
    won: bet.won
  };
}

function mapDiceBet(id, bet) {
  if (!bet) {
    return null;
  }

  return {
    id,
    player: bet.player,
    lockedAmount: bet.lockedAmount,
    guess: Number(bet.guess),
    requestId: bet.requestId,
    resolved: bet.resolved,
    rolled: Number(bet.rolled),
    won: bet.won
  };
}

function mapCrashRound(id, round) {
  if (!round) {
    return null;
  }

  return {
    id,
    exists: round.exists,
    requestId: round.requestId,
    crashMultiplierBps: Number(round.crashMultiplierBps),
    closed: round.closed
  };
}

function mapCrashPlayerBet(bet) {
  if (!bet) {
    return null;
  }

  return {
    lockedAmount: bet.lockedAmount,
    cashOutMultiplierBps: Number(bet.cashOutMultiplierBps),
    exists: bet.exists,
    settled: bet.settled,
    won: bet.won
  };
}

function getLatestRequestMeta(latestCoinBet, latestDiceBet, latestCrashRound) {
  const candidates = [];

  if (latestCoinBet) {
    candidates.push({ source: "Coin Flip", requestId: latestCoinBet.requestId });
  }
  if (latestDiceBet) {
    candidates.push({ source: "Dice", requestId: latestDiceBet.requestId });
  }
  if (latestCrashRound) {
    candidates.push({ source: "Crash", requestId: latestCrashRound.requestId });
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((latest, current) => (current.requestId > latest.requestId ? current : latest));
}

export async function loadCasinoState(currentAccount) {
  const vault = new ethers.Contract(CASFIN_CONFIG.addresses.casinoVault, VAULT_ABI, publicProvider);
  const router = new ethers.Contract(CASFIN_CONFIG.addresses.randomnessRouter, RANDOMNESS_ROUTER_ABI, publicProvider);
  const coin = new ethers.Contract(CASFIN_CONFIG.addresses.coinFlipGame, COIN_FLIP_ABI, publicProvider);
  const dice = new ethers.Contract(CASFIN_CONFIG.addresses.diceGame, DICE_ABI, publicProvider);
  const crash = new ethers.Contract(CASFIN_CONFIG.addresses.crashGame, CRASH_ABI, publicProvider);

  const [
    vaultOwner,
    vaultBalance,
    routerOwner,
    coinHouseEdgeBps,
    coinMaxBetAmount,
    coinNextBetId,
    diceHouseEdgeBps,
    diceMaxBetAmount,
    diceNextBetId,
    crashNextRoundId,
    crashMaxCashOutMultiplierBps
  ] = await Promise.all([
    vault.owner(),
    publicProvider.getBalance(CASFIN_CONFIG.addresses.casinoVault),
    router.owner(),
    coin.houseEdgeBps(),
    coin.maxBetAmount(),
    coin.nextBetId(),
    dice.houseEdgeBps(),
    dice.maxBetAmount(),
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
  const latestRequestMeta = getLatestRequestMeta(latestCoinBet, latestDiceBet, latestCrashRound);
  const rawLatestRequest = latestRequestMeta ? await router.requests(latestRequestMeta.requestId) : null;

  const [playerBalance, playerLockedBalance, latestCrashPlayerBet] = currentAccount
    ? await Promise.all([
        vault.balanceOf(currentAccount),
        vault.lockedBalanceOf(currentAccount),
        latestCrashRound ? crash.playerBets(latestCrashRound.id, currentAccount) : Promise.resolve(null)
      ])
    : [0n, 0n, null];

  return {
    vaultOwner,
    vaultBalance,
    playerBalance,
    playerLockedBalance,
    router: {
      owner: routerOwner,
      latestRequestId: latestRequestMeta?.requestId ?? null,
      latestRequestSource: latestRequestMeta?.source || "",
      latestRequest: rawLatestRequest
        ? {
            requester: rawLatestRequest.requester,
            context: rawLatestRequest.context,
            randomWord: rawLatestRequest.randomWord,
            fulfilled: rawLatestRequest.fulfilled
          }
        : null
    },
    coin: {
      houseEdgeBps: Number(coinHouseEdgeBps),
      maxBetAmount: coinMaxBetAmount,
      nextBetId: coinNextBetId,
      latestBet: latestCoinBet
    },
    dice: {
      houseEdgeBps: Number(diceHouseEdgeBps),
      maxBetAmount: diceMaxBetAmount,
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

export async function loadPredictionState(currentAccount) {
  const factory = new ethers.Contract(CASFIN_CONFIG.addresses.marketFactory, MARKET_FACTORY_ABI, publicProvider);
  const [factoryOwner, totalMarketsRaw, feeConfig, approvedCreator] = await Promise.all([
    factory.owner(),
    factory.totalMarkets(),
    factory.feeConfig(),
    currentAccount ? factory.approvedCreators(currentAccount) : Promise.resolve(false)
  ]);

  const totalMarkets = Number(totalMarketsRaw);
  const indexes = Array.from({ length: totalMarkets }, (_, index) => totalMarkets - index - 1);
  const marketAddresses = await Promise.all(indexes.map((index) => factory.allMarkets(index)));

  const markets = await Promise.all(
    marketAddresses.map(async (address) => {
      const market = new ethers.Contract(address, PREDICTION_MARKET_ABI, publicProvider);
      const meta = await factory.marketMeta(address);
      const pool = new ethers.Contract(meta.pool, LIQUIDITY_POOL_ABI, publicProvider);

      const [
        question,
        description,
        resolvesAt,
        resolved,
        finalized,
        winningOutcome,
        creator,
        resolverAddress,
        collateralPool,
        totalShares,
        poolBalance
      ] = await Promise.all([
        market.question(),
        market.description(),
        market.resolvesAt(),
        market.resolved(),
        market.finalized(),
        market.winningOutcome(),
        market.creator(),
        market.resolver(),
        market.collateralPool(),
        market.getTotalSharesPerOutcome(),
        currentAccount ? pool.balanceOf(currentAccount) : Promise.resolve(0n)
      ]);

      const outcomeIndexes = Array.from({ length: totalShares.length }, (_, index) => index);
      const outcomeLabels = await Promise.all(outcomeIndexes.map((index) => market.outcomes(index)));

      const [userShares, hasClaimed] = currentAccount
        ? await Promise.all([
            Promise.all(outcomeIndexes.map((index) => market.getShares(currentAccount, index))),
            market.hasClaimed(currentAccount)
          ])
        : [outcomeIndexes.map(() => 0n), false];

      const resolver = new ethers.Contract(resolverAddress, MARKET_RESOLVER_ABI, publicProvider);
      const [manualResolver, feeRecipient, oracleType, resolutionRequested] = await Promise.all([
        resolver.manualResolver(),
        resolver.feeRecipient(),
        resolver.oracleType(),
        resolver.resolutionRequested()
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
        collateralPool,
        outcomeLabels,
        totalShares,
        userShares,
        hasClaimed,
        poolBalance,
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
