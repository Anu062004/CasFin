/**
 * Phase 1 — Configure EncryptedMarketFactory without redeployment.
 *
 * Sets fees, approves creator wallet, and sets treasury on the currently
 * deployed factory. Run this BEFORE the Phase 2 redeploy.
 *
 * Usage (from casfin/ directory):
 *   npx hardhat run scripts/configure-factory.ts --network arbitrumSepolia
 *
 * Required env vars (from casfin/.env):
 *   PRIVATE_KEY                      — deployer / factory owner private key
 *   ARBITRUM_SEPOLIA_RPC_URL         — RPC endpoint
 *
 * Optional env vars:
 *   FACTORY_ADDRESS                  — defaults to 0xC876De943508B4938d3d8f010cc97dbac7Ab0B43
 *   CREATOR_ADDRESS                  — wallet to approve (defaults to DEPLOYER_ADDRESS or signer)
 */

const hre = require("hardhat");
const { ethers } = hre;
const path = require("path");
const fs = require("fs");

const FACTORY_ABI_PATH = path.join(
  __dirname,
  "../frontend/lib/generated-abis/EncryptedMarketFactory.json"
);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Signer:", deployer.address);

  const factoryAddress =
    process.env.FACTORY_ADDRESS ||
    process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS ||
    "0xC876De943508B4938d3d8f010cc97dbac7Ab0B43";

  if (!ethers.isAddress(factoryAddress)) {
    throw new Error(`Invalid factory address: ${factoryAddress}`);
  }

  const creatorAddress =
    process.env.CREATOR_ADDRESS ||
    process.env.DEPLOYER_ADDRESS ||
    deployer.address;

  if (!ethers.isAddress(creatorAddress)) {
    throw new Error(`Invalid creator address: ${creatorAddress}`);
  }

  const abi = JSON.parse(fs.readFileSync(FACTORY_ABI_PATH, "utf8"));
  const factory = new ethers.Contract(factoryAddress, abi, deployer);

  const owner = await factory.owner();
  console.log("\nFactory:", factoryAddress);
  console.log("Factory owner:", owner);
  console.log("Deployer:", deployer.address);

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `Signer ${deployer.address} is not the factory owner (${owner}). Use the owner private key.`
    );
  }

  // ── 1. Set fee config ──────────────────────────────────────────────────────
  const feeConfig = {
    platformFeeBps: 200,   // 2%  → treasury
    lpFeeBps: 100,         // 1%  → liquidity providers
    resolverFeeBps: 50     // 0.5% → keeper
  };
  console.log("\n[1/3] Setting fee config:", feeConfig);
  const feeTx = await factory.setFeeConfig([
    feeConfig.platformFeeBps,
    feeConfig.lpFeeBps,
    feeConfig.resolverFeeBps
  ]);
  console.log("  tx:", feeTx.hash);
  await feeTx.wait();
  console.log("  Fee config set.");

  // ── 2. Approve creator wallet(s) ──────────────────────────────────────────
  const walletsToApprove = [...new Set([
    creatorAddress,
    deployer.address
  ])];

  for (const wallet of walletsToApprove) {
    const alreadyApproved = await factory.approvedCreators(wallet);
    if (alreadyApproved) {
      console.log(`\n[2/3] ${wallet} already approved — skipping.`);
      continue;
    }
    console.log(`\n[2/3] Approving creator: ${wallet}`);
    const approveTx = await factory.setCreatorApproval(wallet, true);
    console.log("  tx:", approveTx.hash);
    await approveTx.wait();
    console.log("  Approved.");
  }

  // ── 3. Set treasury ────────────────────────────────────────────────────────
  const currentTreasury = await factory.treasury();
  console.log("\n[3/3] Current treasury:", currentTreasury);
  if (currentTreasury.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log("  Setting treasury to:", deployer.address);
    const treasuryTx = await factory.setTreasury(deployer.address);
    console.log("  tx:", treasuryTx.hash);
    await treasuryTx.wait();
    console.log("  Treasury updated.");
  } else {
    console.log("  Treasury already correct — skipping.");
  }

  // ── Verification ───────────────────────────────────────────────────────────
  const [verifiedFee, verifiedCreator, verifiedTreasury, totalMarkets] = await Promise.all([
    factory.feeConfig(),
    factory.approvedCreators(creatorAddress),
    factory.treasury(),
    factory.totalMarkets()
  ]);

  console.log("\n── Verification ─────────────────────────────────────");
  console.log("Fee config:", {
    platformFeeBps: Number(verifiedFee[0]),
    lpFeeBps: Number(verifiedFee[1]),
    resolverFeeBps: Number(verifiedFee[2])
  });
  console.log(`Creator ${creatorAddress} approved:`, verifiedCreator);
  console.log("Treasury:", verifiedTreasury);
  console.log("Total markets:", Number(totalMarkets));
  console.log("────────────────────────────────────────────────────");
  console.log("Phase 1 complete. Reload the predictions page to verify.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
