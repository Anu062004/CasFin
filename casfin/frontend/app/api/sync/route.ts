import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GameType, VaultTxType, TradeType } from "@prisma/client";

function authorized(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key");
  return !!key && key === process.env.SYNC_API_KEY;
}

async function ensureUser(walletAddress: string) {
  await prisma.user.upsert({
    where: { walletAddress },
    update: { lastActiveAt: new Date() },
    create: { walletAddress },
  });
}

interface CasinoBetEvent {
  type: "casino_bet";
  gameType: GameType;
  onChainBetId: string;
  playerAddress: string;
  betAmountWei: string;
  txHash: string;
  blockNumber: string;
}

interface CasinoBetResolvedEvent {
  type: "casino_bet_resolved";
  gameType: GameType;
  onChainBetId: string;
  playerAddress: string;
  won: boolean;
  payoutWei?: string;
  diceRolled?: number;
  txHash: string;
  blockNumber: string;
}

interface CrashRoundEvent {
  type: "crash_round_started" | "crash_round_closed";
  onChainRoundId: string;
  crashMultiplierBps?: number;
  txHash: string;
  blockNumber: string;
}

interface VaultEvent {
  type: "vault_deposit" | "vault_withdrawal" | "vault_bankroll_fund" | "vault_house_withdraw";
  playerAddress: string;
  amountWei: string;
  txHash: string;
  blockNumber: string;
}

interface MarketCreatedEvent {
  type: "market_created";
  onChainAddress: string;
  factoryAddress: string;
  creatorAddress: string;
  question: string;
  description?: string;
  outcomes: string[];
  resolvesAt: string;
  disputeWindowSecs: number;
  platformFeeBps: number;
  lpFeeBps: number;
  resolverFeeBps: number;
  ammAddress?: string;
  poolAddress?: string;
  resolverAddress?: string;
  blockNumber: string;
}

interface MarketResolvedEvent {
  type: "market_resolved";
  onChainAddress: string;
  winningOutcome: number;
  blockNumber: string;
}

interface MarketFinalizedEvent {
  type: "market_finalized";
  onChainAddress: string;
}

interface MarketTradeEvent {
  type: "market_trade";
  marketAddress: string;
  traderAddress: string;
  tradeType: TradeType;
  outcomeIndex: number;
  amountWei: string;
  sharesAmount: string;
  txHash: string;
  blockNumber: string;
}

type SyncEvent =
  | CasinoBetEvent
  | CasinoBetResolvedEvent
  | CrashRoundEvent
  | VaultEvent
  | MarketCreatedEvent
  | MarketResolvedEvent
  | MarketFinalizedEvent
  | MarketTradeEvent;

const VAULT_TYPE_MAP: Record<string, VaultTxType> = {
  vault_deposit: "DEPOSIT",
  vault_withdrawal: "WITHDRAWAL",
  vault_bankroll_fund: "BANKROLL_FUND",
  vault_house_withdraw: "HOUSE_WITHDRAW",
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { events: SyncEvent[] };
    if (!Array.isArray(body.events)) {
      return NextResponse.json({ error: "events array required" }, { status: 400 });
    }

    let processed = 0;

    for (const evt of body.events) {
      switch (evt.type) {
        case "casino_bet": {
          const e = evt as CasinoBetEvent;
          await ensureUser(e.playerAddress);
          await prisma.casinoBet.upsert({
            where: { gameType_onChainBetId: { gameType: e.gameType, onChainBetId: BigInt(e.onChainBetId) } },
            update: {},
            create: {
              gameType: e.gameType,
              onChainBetId: BigInt(e.onChainBetId),
              playerAddress: e.playerAddress,
              betAmountWei: e.betAmountWei,
              txHash: e.txHash,
              blockNumber: BigInt(e.blockNumber),
            },
          });
          processed++;
          break;
        }

        case "casino_bet_resolved": {
          const e = evt as CasinoBetResolvedEvent;
          await prisma.casinoBet.update({
            where: { gameType_onChainBetId: { gameType: e.gameType, onChainBetId: BigInt(e.onChainBetId) } },
            data: {
              resolved: true,
              resolutionPending: false,
              won: e.won,
              payoutWei: e.payoutWei ?? null,
              diceRolled: e.diceRolled ?? null,
              resolvedAt: new Date(),
            },
          });
          processed++;
          break;
        }

        case "crash_round_started": {
          const e = evt as CrashRoundEvent;
          await prisma.crashRound.upsert({
            where: { onChainRoundId: BigInt(e.onChainRoundId) },
            update: {},
            create: {
              onChainRoundId: BigInt(e.onChainRoundId),
              txHash: e.txHash,
              blockNumber: BigInt(e.blockNumber),
            },
          });
          processed++;
          break;
        }

        case "crash_round_closed": {
          const e = evt as CrashRoundEvent;
          await prisma.crashRound.update({
            where: { onChainRoundId: BigInt(e.onChainRoundId) },
            data: {
              closed: true,
              crashMultiplierBps: e.crashMultiplierBps ?? null,
              closedAt: new Date(),
            },
          });
          processed++;
          break;
        }

        case "vault_deposit":
        case "vault_withdrawal":
        case "vault_bankroll_fund":
        case "vault_house_withdraw": {
          const e = evt as VaultEvent;
          await ensureUser(e.playerAddress);
          await prisma.vaultTransaction.create({
            data: {
              txType: VAULT_TYPE_MAP[e.type],
              playerAddress: e.playerAddress,
              amountWei: e.amountWei,
              txHash: e.txHash,
              blockNumber: BigInt(e.blockNumber),
            },
          });
          processed++;
          break;
        }

        case "market_created": {
          const e = evt as MarketCreatedEvent;
          await ensureUser(e.creatorAddress);
          await prisma.predictionMarket.upsert({
            where: { onChainAddress: e.onChainAddress },
            update: {},
            create: {
              onChainAddress: e.onChainAddress,
              factoryAddress: e.factoryAddress,
              creatorAddress: e.creatorAddress,
              question: e.question,
              description: e.description,
              outcomes: e.outcomes,
              resolvesAt: new Date(Number(e.resolvesAt) * 1000),
              disputeWindowSecs: e.disputeWindowSecs,
              platformFeeBps: e.platformFeeBps,
              lpFeeBps: e.lpFeeBps,
              resolverFeeBps: e.resolverFeeBps,
              ammAddress: e.ammAddress,
              poolAddress: e.poolAddress,
              resolverAddress: e.resolverAddress,
              blockNumber: BigInt(e.blockNumber),
            },
          });
          processed++;
          break;
        }

        case "market_resolved": {
          const e = evt as MarketResolvedEvent;
          await prisma.predictionMarket.update({
            where: { onChainAddress: e.onChainAddress },
            data: { resolved: true, winningOutcome: e.winningOutcome, resolvedAt: new Date() },
          });
          processed++;
          break;
        }

        case "market_finalized": {
          const e = evt as MarketFinalizedEvent;
          await prisma.predictionMarket.update({
            where: { onChainAddress: e.onChainAddress },
            data: { finalized: true },
          });
          processed++;
          break;
        }

        case "market_trade": {
          const e = evt as MarketTradeEvent;
          await ensureUser(e.traderAddress);
          await prisma.marketTrade.create({
            data: {
              marketAddress: e.marketAddress,
              traderAddress: e.traderAddress,
              tradeType: e.tradeType,
              outcomeIndex: e.outcomeIndex,
              amountWei: e.amountWei,
              sharesAmount: e.sharesAmount,
              txHash: e.txHash,
              blockNumber: BigInt(e.blockNumber),
            },
          });

          // Update or create position
          const delta = e.tradeType === "BUY" ? BigInt(e.sharesAmount) : -BigInt(e.sharesAmount);
          const existing = await prisma.marketPosition.findUnique({
            where: {
              marketAddress_playerAddress_outcomeIndex: {
                marketAddress: e.marketAddress,
                playerAddress: e.traderAddress,
                outcomeIndex: e.outcomeIndex,
              },
            },
          });
          const prevShares = BigInt(existing?.shares ?? "0");
          const prevSpent = BigInt(existing?.netSpentWei ?? "0");
          const spentDelta = e.tradeType === "BUY" ? BigInt(e.amountWei) : -BigInt(e.amountWei);

          await prisma.marketPosition.upsert({
            where: {
              marketAddress_playerAddress_outcomeIndex: {
                marketAddress: e.marketAddress,
                playerAddress: e.traderAddress,
                outcomeIndex: e.outcomeIndex,
              },
            },
            update: {
              shares: (prevShares + delta).toString(),
              netSpentWei: (prevSpent + spentDelta).toString(),
              updatedAt: new Date(),
            },
            create: {
              marketAddress: e.marketAddress,
              playerAddress: e.traderAddress,
              outcomeIndex: e.outcomeIndex,
              shares: e.sharesAmount,
              netSpentWei: e.amountWei,
            },
          });
          processed++;
          break;
        }
      }
    }

    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    console.error("POST /api/sync error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
