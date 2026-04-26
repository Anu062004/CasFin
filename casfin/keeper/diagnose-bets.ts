import { ethers } from "ethers";

const OLD_COIN_FLIP_ADDRESS = "0x2a43F77A2286ffC3ebfb5D577123CB7cEf8553Af";
const TASK_MANAGER_ADDRESS = "0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9";
const RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const NETWORK = {
  chainId: 421614,
  name: "arbitrum-sepolia"
} as const;

const TASK_MANAGER_ABI = [
  "function getDecryptResultSafe(uint256 ctHash) view returns (uint256 result, bool decrypted)"
];

const COIN_FLIP_ABI = [
  "function bets(uint256) view returns (address player, bytes32 lockedHandle, bytes32 encGuessHeads, bytes32 outcomeHeads, bool resolved, bool resolutionPending, bytes32 pendingWonFlag, bool won)",
  "function nextBetId() view returns (uint256)"
];

type SummaryRow = {
  betId: number;
  player: string;
  resolved: boolean;
  resolutionPending: boolean;
  pendingWonFlag: string;
  lockedHandle: string;
  decryptReady: boolean | "n/a" | "error";
  classification: string;
  note: string;
};

function formatAddress(value: string): string {
  return value === ethers.ZeroAddress ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatHandle(value: string): string {
  return value === ethers.ZeroHash ? value : `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatError(error: unknown): string {
  const value = error as Record<string, unknown> | undefined;
  return String(value?.["shortMessage"] || value?.["reason"] || value?.["message"] || error);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, NETWORK, { staticNetwork: true });
  const coinFlip = new ethers.Contract(OLD_COIN_FLIP_ADDRESS, COIN_FLIP_ABI, provider);
  const taskManager = new ethers.Contract(TASK_MANAGER_ADDRESS, TASK_MANAGER_ABI, provider);
  const summary: SummaryRow[] = [];

  console.log("=== CasFin CoinFlip Bet Diagnosis ===");
  console.log(`CoinFlip: ${OLD_COIN_FLIP_ADDRESS}`);
  console.log(`TaskManager: ${TASK_MANAGER_ADDRESS}`);
  console.log(`RPC: ${RPC_URL}`);
  console.log();

  const nextBetId = Number(await coinFlip.nextBetId());
  console.log(`nextBetId on old contract: ${nextBetId}`);
  console.log("Inspecting bet IDs 0-6");
  console.log();

  for (let betId = 0; betId <= 6; betId += 1) {
    const rawBet = await coinFlip.bets(betId);
    const player = String(rawBet[0]);
    const lockedHandle = ethers.hexlify(rawBet[1]);
    const resolved = Boolean(rawBet[4]);
    const resolutionPending = Boolean(rawBet[5]);
    const pendingWonFlag = ethers.hexlify(rawBet[6]);

    let decryptReady: boolean | "n/a" | "error" = "n/a";
    let classification = "resolved";
    let note = "bet already settled";

    console.log(`Bet ${betId}`);
    console.log(`  player:            ${player}`);
    console.log(`  resolved:          ${resolved}`);
    console.log(`  resolutionPending: ${resolutionPending}`);
    console.log(`  pendingWonFlag:    ${pendingWonFlag}`);
    console.log(`  lockedHandle:      ${lockedHandle}`);

    if (!resolved && resolutionPending && pendingWonFlag !== ethers.ZeroHash) {
      try {
        const [result, decrypted] = await taskManager.getDecryptResultSafe(BigInt(pendingWonFlag));
        decryptReady = Boolean(decrypted);
        console.log(`  decryptReady:      ${decrypted}`);
        console.log(`  decryptResult:     ${result}`);
      } catch (error: unknown) {
        decryptReady = "error";
        console.log(`  decryptReady:      error`);
        console.log(`  decryptError:      ${formatError(error)}`);
      }

      classification = "permanently_stuck";
      note = decryptReady === true
        ? "decrypt is ready, but old finalizeResolution is still bugged"
        : "pending decrypt on an obsolete contract that is being retired";
    } else if (!resolved) {
      classification = "recoverable_check_manually";
      note = "requestResolution was not pending when sampled; verify before touching the old contract";
    }

    console.log(`  classification:    ${classification}`);
    console.log(`  note:              ${note}`);
    console.log();

    summary.push({
      betId,
      player: formatAddress(player),
      resolved,
      resolutionPending,
      pendingWonFlag: formatHandle(pendingWonFlag),
      lockedHandle: formatHandle(lockedHandle),
      decryptReady,
      classification,
      note
    });
  }

  console.log("=== Summary ===");
  console.table(summary);

  const recoverable = summary.filter((row) => row.classification === "recoverable_check_manually").length;
  const permanentlyStuck = summary.filter((row) => row.classification === "permanently_stuck").length;
  const resolvedCount = summary.filter((row) => row.classification === "resolved").length;

  console.log("Resolved bets:", resolvedCount);
  console.log("Recoverable bets:", recoverable);
  console.log("Permanently stuck bets:", permanentlyStuck);
}

main().catch((error) => {
  console.error("Fatal:", formatError(error));
  process.exit(1);
});
