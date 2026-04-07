import { ethers } from "ethers";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { toEncryptedInputTuple } from "@/lib/cofhe-utils";
import EncryptedMarketFactoryAbi from "@/lib/generated-abis/EncryptedMarketFactory.json";
import EncryptedPredictionMarketAbi from "@/lib/generated-abis/EncryptedPredictionMarket.json";

const fhePredictionRpcUrl =
  process.env.NEXT_PUBLIC_FHE_RPC_URL
  || CASFIN_CONFIG.fheRpcUrl;

const fhePredictionProvider = new ethers.JsonRpcProvider(
  fhePredictionRpcUrl,
  {
    chainId: CASFIN_CONFIG.chainId,
    name: "arbitrum-sepolia"
  },
  { staticNetwork: true }
);

export const EMPTY_FHE_PREDICTION_STATE = {
  factory: {
    address: ethers.ZeroAddress,
    totalMarkets: 0,
    approvedCreator: false
  },
  markets: []
};

function serializeHandle(handle) {
  if (!handle) {
    return null;
  }

  return typeof handle === "string" ? handle : ethers.hexlify(handle);
}

function mapPosition(id, position) {
  if (!position) {
    return null;
  }

  return {
    id,
    player: position.player ?? position[0],
    amountHandle: serializeHandle(position.amount ?? position[1]),
    lockedHandle: serializeHandle(position.lockedHandle ?? position[2]),
    chosenOutcome: serializeHandle(position.chosenOutcome ?? position[3]),
    claimRequested: position.claimRequested ?? position[4],
    claimed: position.claimed ?? position[5],
    won: position.won ?? position[7]
  };
}

export async function loadFhePredictionState(
  factoryAddress = CASFIN_CONFIG.addresses.encryptedMarketFactory,
  currentAccount
) {
  if (!factoryAddress || factoryAddress === ethers.ZeroAddress) {
    return EMPTY_FHE_PREDICTION_STATE;
  }

  const factory = new ethers.Contract(factoryAddress, EncryptedMarketFactoryAbi, fhePredictionProvider);
  const [totalMarketsRaw, approvedCreator] = await Promise.all([
    factory.totalMarkets(),
    currentAccount ? factory.approvedCreators(currentAccount) : Promise.resolve(false)
  ]);

  const totalMarkets = Number(totalMarketsRaw);
  const marketAddresses = await Promise.all(
    Array.from({ length: totalMarkets }, (_, index) => factory.allMarkets(index))
  );

  const markets = await Promise.all(
    marketAddresses.map(async (marketAddress) => {
      const market = new ethers.Contract(marketAddress, EncryptedPredictionMarketAbi, fhePredictionProvider);

      const [question, resolvesAt, resolved, finalized, winningOutcome, resolverAddress, nextPositionId, outcomesCount] =
        await Promise.all([
          market.question(),
          market.resolvesAt(),
          market.resolved(),
          market.finalized(),
          market.winningOutcome(),
          market.resolver(),
          market.nextPositionId(),
          market.outcomesCount()
        ]);

      const outcomeLabels = await Promise.all(
        Array.from({ length: Number(outcomesCount) }, (_, index) => market.outcomes(index))
      );

      const playerPositionIds = currentAccount ? await market.getPlayerPositions(currentAccount) : [];
      const latestPositionId = playerPositionIds.length > 0 ? playerPositionIds[playerPositionIds.length - 1] : null;
      const latestPosition = latestPositionId !== null ? await market.positions(latestPositionId) : null;
      const meta = await factory.marketMeta(marketAddress);

      return {
        address: marketAddress,
        question,
        resolvesAt,
        resolved,
        finalized,
        winningOutcome: Number(winningOutcome),
        resolver: resolverAddress,
        nextPositionId,
        outcomeLabels,
        playerPositionIds,
        latestPosition: mapPosition(latestPositionId, latestPosition),
        meta: {
          market: meta.market,
          resolver: meta.resolver,
          creator: meta.creator,
          createdAt: meta.createdAt,
          oracleType: Number(meta.oracleType)
        }
      };
    })
  );

  return {
    factory: {
      address: factoryAddress,
      totalMarkets,
      approvedCreator
    },
    markets
  };
}

export async function placeFhePredictionBet(signer, marketAddress, encAmountStruct, encOutcomeStruct) {
  const market = new ethers.Contract(marketAddress, EncryptedPredictionMarketAbi, signer);
  const tx = await market.placeBet(
    toEncryptedInputTuple(encAmountStruct),
    toEncryptedInputTuple(encOutcomeStruct)
  );
  return tx.wait();
}

export async function claimFhePredictionWinnings(signer, marketAddress, positionId) {
  const market = new ethers.Contract(marketAddress, EncryptedPredictionMarketAbi, signer);
  const tx = await market.claimWinnings(positionId);
  return tx.wait();
}

export async function finalizeFhePredictionClaim(signer, marketAddress, positionId) {
  const market = new ethers.Contract(marketAddress, EncryptedPredictionMarketAbi, signer);
  const tx = await market.finalizeClaimWinnings(positionId);
  return tx.wait();
}
