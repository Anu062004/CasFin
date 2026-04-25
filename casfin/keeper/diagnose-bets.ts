/**
 * Diagnostic script for stuck CoinFlip bets.
 *
 * Run: npx tsx keeper/diagnose-bets.ts
 *
 * Checks:
 *   1. TaskManager deployment at hardcoded address
 *   2. Decrypt-result readiness for each pending bet (bets 0-4)
 *   3. eth_call simulation of requestResolution(5) for Pattern B revert
 *   4. Threshold Network API health
 */

import { ethers } from "ethers";

const COIN_FLIP_ADDRESS = process.env.ENCRYPTED_COIN_FLIP_ADDRESS || "0x2a43F77A2286ffC3ebfb5D577123CB7cEf8553Af";
const TASK_MANAGER_ADDRESS = "0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9";
const TN_URL = "https://testnet-cofhe-tn.fhenix.zone";
const RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const CHAIN_ID = 421614;

const TASK_MANAGER_ABI = [
  "function getDecryptResultSafe(uint256 ctHash) view returns (uint256 result, bool decrypted)",
];

const COIN_FLIP_ABI = [
  "function bets(uint256) view returns (address player, bytes32 lockedHandle, bytes32 encGuessHeads, bytes32 outcomeHeads, bool resolved, bool resolutionPending, bytes32 pendingWonFlag, bool won)",
  "function nextBetId() view returns (uint256)",
  "function requestResolution(uint256 betId)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "arbitrum-sepolia" }, { staticNetwork: true });
  const coinFlip = new ethers.Contract(COIN_FLIP_ADDRESS, COIN_FLIP_ABI, provider);
  const taskManager = new ethers.Contract(TASK_MANAGER_ADDRESS, TASK_MANAGER_ABI, provider);

  console.log("=== CasFin Bet Diagnostic ===");
  console.log(`CoinFlip:    ${COIN_FLIP_ADDRESS}`);
  console.log(`TaskManager: ${TASK_MANAGER_ADDRESS}`);
  console.log(`RPC:         ${RPC_URL}`);
  console.log();

  // 1. Check TaskManager deployment
  console.log("--- [1] TaskManager deployment ---");
  const code = await provider.getCode(TASK_MANAGER_ADDRESS);
  if (code === "0x") {
    console.log("❌ TaskManager has NO CODE at this address — all FHE ops will fail.");
  } else {
    console.log(`✅ TaskManager has code (${(code.length - 2) / 2} bytes)`);
  }
  console.log();

  // 2. Decrypt-result readiness for each bet
  console.log("--- [2] Bet state + decrypt readiness ---");
  const nextBetId = Number(await coinFlip.nextBetId());
  console.log(`nextBetId = ${nextBetId} (bets 0 – ${nextBetId - 1} exist)`);
  console.log();

  for (let id = 0; id < nextBetId; id++) {
    const bet = await coinFlip.bets(id);
    const player: string = bet[0];
    const resolved: boolean = bet[4];
    const resolutionPending: boolean = bet[5];
    const pendingWonFlag: string = bet[6]; // bytes32

    process.stdout.write(`Bet ${id}: player=${player.slice(0, 10)}... resolved=${resolved} pending=${resolutionPending}`);

    if (resolved) {
      console.log(" → DONE");
      continue;
    }

    if (!resolutionPending) {
      console.log(" → needs requestResolution()");
      continue;
    }

    // resolutionPending=true → check if decrypt result is ready
    const wonFlagBigInt = BigInt(pendingWonFlag);
    try {
      const [result, decrypted] = await taskManager.getDecryptResultSafe(wonFlagBigInt);
      if (decrypted) {
        console.log(` → decrypt READY, won=${result !== 0n} — safe to call finalizeResolution()`);
      } else {
        console.log(` → decrypt NOT READY (result=${result}, decrypted=false) — TN hasn't published yet`);
      }
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      console.log(` → getDecryptResultSafe REVERTED: ${e?.shortMessage || e?.message || String(err)}`);
    }
  }
  console.log();

  // 3. eth_call simulation of requestResolution(5) to get exact revert
  console.log("--- [3] eth_call simulation: requestResolution(5) ---");
  const KEEPER_ADDRESS = process.env.DEPLOYER_ADDRESS || "0x6b3a924379B9408D8110f10F084ca809863B378A";
  try {
    await coinFlip.requestResolution.staticCall(5, { from: KEEPER_ADDRESS });
    console.log("✅ requestResolution(5) would SUCCEED (no revert)");
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    const data: string = (e?.data as string) || "";
    console.log(`❌ requestResolution(5) reverts:`);
    console.log(`   shortMessage: ${e?.shortMessage || "(none)"}`);
    console.log(`   message:      ${e?.message || String(err)}`);
    console.log(`   revert data:  ${data || "(empty — precompile/require(false))"}`);
    if (data && data !== "0x") {
      try {
        const iface = new ethers.Interface(["error Error(string)", "error Panic(uint256)"]);
        console.log(`   decoded:      ${iface.parseError(data)?.name}`);
      } catch {
        console.log(`   decoded:      (unknown selector ${data.slice(0, 10)})`);
      }
    }
  }
  console.log();

  // 4. Threshold Network API health
  console.log("--- [4] Threshold Network API health ---");
  try {
    const res = await fetch(`${TN_URL}/v2/decrypt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ct_tempkey: "0".repeat(64), host_chain_id: CHAIN_ID }),
    });
    // A 4xx with a JSON error body is fine — it means the API is reachable.
    console.log(`   POST ${TN_URL}/v2/decrypt → HTTP ${res.status}`);
    if (res.status < 500) {
      console.log("✅ TN API is reachable");
    } else {
      console.log("❌ TN API returned 5xx — server-side error");
    }
  } catch (err: unknown) {
    console.log(`❌ TN API unreachable: ${(err as Error)?.message}`);
  }

  console.log();
  console.log("=== Interpretation guide ===");
  console.log("Pattern A (bets 0-4, finalizeResolution fails with unknown custom error):");
  console.log("  If decrypt READY above → contract bug (missing FHE.allowThis on winReturn).");
  console.log("  If decrypt NOT READY  → TN hasn't auto-published; wait or contact Fhenix.");
  console.log("Pattern B (bets 5-6, requestResolution fails with empty revert):");
  console.log("  If TaskManager has NO CODE → wrong address / migration — check FHE.sol.");
  console.log("  If eth_call shows empty revert → FHE precompile (TaskManager createTask) broken.");
  console.log("  Contact Fhenix support with the above output.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
