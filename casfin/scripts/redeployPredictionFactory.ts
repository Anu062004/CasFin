/**
 * Phase 2 — Redeploy EncryptedMarketFactory with updated AMM defaults.
 *
 * Reads implementation addresses from the CURRENT on-chain factory, then
 * deploys a new factory with:
 *   - DEFAULT_AMM_SPREAD_BPS = 400 (4%)
 *   - DEFAULT_AMM_VIRTUAL_LIQUIDITY_FLOOR = 1e17 (0.1 ETH)
 *   - fees pre-configured (2% / 1% / 0.5%)
 *   - creator approved from the start
 *
 * After this script completes, update the frontend .env.local:
 *   NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS=<new address>
 *   NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=<new address>
 *   NEXT_PUBLIC_FEE_DISTRIBUTOR_ADDRESS=<new feeDistributor>
 *   NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS=<new disputeRegistry>
 *
 * Usage (from casfin/ directory):
 *   npx hardhat compile
 *   npx hardhat run scripts/redeployPredictionFactory.ts --network arbitrumSepolia
 *
 * Required env vars (from casfin/.env):
 *   PRIVATE_KEY                   — deployer / factory owner private key
 *   ARBITRUM_SEPOLIA_RPC_URL      — RPC endpoint
 *
 * Optional env vars:
 *   OLD_FACTORY_ADDRESS           — defaults to 0xC876De943508B4938d3d8f010cc97dbac7Ab0B43
 *   CREATOR_ADDRESS               — wallet to approve (defaults to DEPLOYER_ADDRESS or signer)
 */

const hre = require("hardhat");
const { ethers, network } = hre;
const path = require("path");
const fs = require("fs");

const FACTORY_ABI_PATH = path.join(
  __dirname,
  "../frontend/lib/generated-abis/EncryptedMarketFactory.json"
);

async function main() {
  if (network.name !== "arbitrumSepolia") {
    throw new Error("Run with --network arbitrumSepolia");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const oldFactoryAddress =
    process.env.OLD_FACTORY_ADDRESS ||
    process.env.NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS ||
    "0xC876De943508B4938d3d8f010cc97dbac7Ab0B43";

  const creatorAddress =
    process.env.CREATOR_ADDRESS ||
    process.env.DEPLOYER_ADDRESS ||
    deployer.address;

  console.log("Reading implementation addresses from old factory:", oldFactoryAddress);

  const oldAbi = JSON.parse(fs.readFileSync(FACTORY_ABI_PATH, "utf8"));
  const oldFactory = new ethers.Contract(oldFactoryAddress, oldAbi, deployer);

  const [
    feeDistributorImpl,
    disputeRegistryImpl,
    marketAMMImpl,
    liquidityPoolImpl,
    predictionMarketImpl,
    marketResolverImpl,
    oldOwner
  ] = await Promise.all([
    oldFactory.feeDistributorImplementation(),
    oldFactory.disputeRegistryImplementation(),
    oldFactory.marketAMMImplementation(),
    oldFactory.liquidityPoolImplementation(),
    oldFactory.predictionMarketImplementation(),
    oldFactory.marketResolverImplementation(),
    oldFactory.owner()
  ]);

  console.log("\nImplementation addresses (from on-chain factory):");
  console.log("  feeDistributor:      ", feeDistributorImpl);
  console.log("  disputeRegistry:     ", disputeRegistryImpl);
  console.log("  marketAMM:           ", marketAMMImpl);
  console.log("  liquidityPool:       ", liquidityPoolImpl);
  console.log("  predictionMarket:    ", predictionMarketImpl);
  console.log("  marketResolver:      ", marketResolverImpl);
  console.log("  old owner:           ", oldOwner);

  if (oldOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.warn(
      `WARNING: Signer ${deployer.address} is not the old factory owner (${oldOwner}). ` +
      "Continuing — new factory will use signer as owner."
    );
  }

  // ── Deploy new factory ────────────────────────────────────────────────────
  const feeConfig = [200, 100, 50]; // platformFeeBps, lpFeeBps, resolverFeeBps
  const minDisputeBond = ethers.parseEther("0.1");

  console.log("\nDeploying new EncryptedMarketFactory...");
  console.log("  AMM spread: 400 bps (4%)");
  console.log("  Liquidity floor: 0.1 ETH");

  const Factory = await ethers.getContractFactory("EncryptedMarketFactory");
  const newFactory = await Factory.deploy(
    deployer.address,   // initialOwner
    deployer.address,   // initialTreasury
    feeConfig,
    minDisputeBond,
    feeDistributorImpl,
    disputeRegistryImpl,
    marketAMMImpl,
    liquidityPoolImpl,
    predictionMarketImpl,
    marketResolverImpl
  );
  await newFactory.waitForDeployment();
  const newAddress = await newFactory.getAddress();
  console.log("  New factory deployed:", newAddress);

  // ── Verify constants ──────────────────────────────────────────────────────
  const [spreadBps, liquidityFloor] = await Promise.all([
    newFactory.DEFAULT_AMM_SPREAD_BPS(),
    newFactory.DEFAULT_AMM_VIRTUAL_LIQUIDITY_FLOOR()
  ]);
  console.log("  DEFAULT_AMM_SPREAD_BPS:", spreadBps.toString(), "(expected 400)");
  console.log("  DEFAULT_AMM_VIRTUAL_LIQUIDITY_FLOOR:", liquidityFloor.toString(), "(expected 1e17)");

  if (spreadBps !== 400n) throw new Error("Spread constant mismatch — check EncryptedMarketFactory.sol");
  if (liquidityFloor !== BigInt("100000000000000000")) throw new Error("Floor constant mismatch");

  // ── Approve creator ───────────────────────────────────────────────────────
  const walletsToApprove = [...new Set([creatorAddress, deployer.address])];
  for (const wallet of walletsToApprove) {
    console.log("\nApproving creator:", wallet);
    const tx = await newFactory.setCreatorApproval(wallet, true);
    console.log("  tx:", tx.hash);
    await tx.wait();
    console.log("  Approved.");
  }

  // ── Read clone addresses ──────────────────────────────────────────────────
  const [newFeeDistributor, newDisputeRegistry] = await Promise.all([
    newFactory.feeDistributor(),
    newFactory.disputeRegistry()
  ]);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n══ Phase 2 Complete ════════════════════════════════");
  console.log("New factory:           ", newAddress);
  console.log("New feeDistributor:    ", newFeeDistributor);
  console.log("New disputeRegistry:   ", newDisputeRegistry);
  console.log("\nUpdate casfin/frontend/.env.local:");
  console.log(`  NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS=${newAddress}`);
  console.log(`  NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=${newAddress}`);
  console.log(`  NEXT_PUBLIC_FEE_DISTRIBUTOR_ADDRESS=${newFeeDistributor}`);
  console.log(`  NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS=${newDisputeRegistry}`);
  console.log("═════════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
