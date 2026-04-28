/**
 * Phase 3 — Redeploy EncryptedMarketResolver implementation and EncryptedMarketFactory.
 *
 * The resolver's initialize() now accepts a `factoryOwnerAddress` (8th param) so the
 * keeper wallet can call resolveManual() directly on any sports market.
 *
 * Steps:
 *   1. Deploy new EncryptedMarketResolver implementation
 *   2. Read the other 5 implementation addresses from the current on-chain factory
 *   3. Deploy new EncryptedMarketFactory with the new resolver impl
 *   4. Approve creator wallet(s)
 *
 * After this script completes, update:
 *   casfin/frontend/.env.local  — NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS, etc.
 *   casfin/.env                 — MARKET_FACTORY_ADDRESS
 *
 * Usage (from casfin/ directory):
 *   npx hardhat compile
 *   npx hardhat run scripts/redeployMarketResolver.ts --network arbitrumSepolia
 *
 * Required env vars (from casfin/.env):
 *   PRIVATE_KEY                   — deployer / factory owner private key
 *   ARBITRUM_SEPOLIA_RPC_URL      — RPC endpoint
 *
 * Optional env vars:
 *   OLD_FACTORY_ADDRESS           — defaults to NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS or 0x6753A055CC37240De70DF635ce1E1E15cF466283
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
    "0x6753A055CC37240De70DF635ce1E1E15cF466283";

  const creatorAddress =
    process.env.CREATOR_ADDRESS ||
    process.env.PREDICTION_APPROVED_CREATOR_ADDRESS ||
    process.env.DEPLOYER_ADDRESS ||
    deployer.address;

  console.log("Reading implementation addresses from current factory:", oldFactoryAddress);

  const oldAbi = JSON.parse(fs.readFileSync(FACTORY_ABI_PATH, "utf8"));
  const oldFactory = new ethers.Contract(oldFactoryAddress, oldAbi, deployer);

  const [
    feeDistributorImpl,
    disputeRegistryImpl,
    marketAMMImpl,
    liquidityPoolImpl,
    predictionMarketImpl,
    oldOwner
  ] = await Promise.all([
    oldFactory.feeDistributorImplementation(),
    oldFactory.disputeRegistryImplementation(),
    oldFactory.marketAMMImplementation(),
    oldFactory.liquidityPoolImplementation(),
    oldFactory.predictionMarketImplementation(),
    oldFactory.owner()
  ]);

  console.log("\nImplementation addresses (from on-chain factory):");
  console.log("  feeDistributor:   ", feeDistributorImpl);
  console.log("  disputeRegistry:  ", disputeRegistryImpl);
  console.log("  marketAMM:        ", marketAMMImpl);
  console.log("  liquidityPool:    ", liquidityPoolImpl);
  console.log("  predictionMarket: ", predictionMarketImpl);
  console.log("  old owner:        ", oldOwner);

  if (oldOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.warn(
      `WARNING: Signer ${deployer.address} is not the old factory owner (${oldOwner}). ` +
      "New factory will use signer as owner."
    );
  }

  // ── 1. Deploy new EncryptedMarketResolver implementation ──────────────────
  console.log("\n[1/3] Deploying new EncryptedMarketResolver implementation...");
  const Resolver = await ethers.getContractFactory("EncryptedMarketResolver");
  const newResolverImpl = await Resolver.deploy();
  await newResolverImpl.waitForDeployment();
  const newResolverImplAddress = await newResolverImpl.getAddress();
  console.log("  New resolver impl:", newResolverImplAddress);

  // ── 2. Deploy new EncryptedMarketFactory ─────────────────────────────────
  const feeConfig = [200, 100, 50]; // platformFeeBps, lpFeeBps, resolverFeeBps
  const minDisputeBond = ethers.parseEther("0.1");

  console.log("\n[2/3] Deploying new EncryptedMarketFactory...");
  const Factory = await ethers.getContractFactory("EncryptedMarketFactory");
  const newFactory = await Factory.deploy(
    deployer.address,       // initialOwner
    deployer.address,       // initialTreasury
    feeConfig,
    minDisputeBond,
    feeDistributorImpl,
    disputeRegistryImpl,
    marketAMMImpl,
    liquidityPoolImpl,
    predictionMarketImpl,
    newResolverImplAddress
  );
  await newFactory.waitForDeployment();
  const newFactoryAddress = await newFactory.getAddress();
  console.log("  New factory:", newFactoryAddress);

  // Verify constants
  const [spreadBps, liquidityFloor] = await Promise.all([
    newFactory.DEFAULT_AMM_SPREAD_BPS(),
    newFactory.DEFAULT_AMM_VIRTUAL_LIQUIDITY_FLOOR()
  ]);
  console.log("  DEFAULT_AMM_SPREAD_BPS:", spreadBps.toString(), "(expected 400)");
  console.log("  DEFAULT_AMM_VIRTUAL_LIQUIDITY_FLOOR:", liquidityFloor.toString(), "(expected 1e17)");

  if (spreadBps !== 400n) throw new Error("Spread constant mismatch");
  if (liquidityFloor !== BigInt("100000000000000000")) throw new Error("Floor constant mismatch");

  // ── 3. Approve creator wallet(s) ─────────────────────────────────────────
  console.log("\n[3/3] Approving creator wallets...");
  const walletsToApprove = [...new Set([creatorAddress, deployer.address])];
  for (const wallet of walletsToApprove) {
    console.log("  Approving:", wallet);
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
  console.log("\n══ Phase 3 Complete ════════════════════════════════════════");
  console.log("New factory:              ", newFactoryAddress);
  console.log("New resolver impl:        ", newResolverImplAddress);
  console.log("New feeDistributor:       ", newFeeDistributor);
  console.log("New disputeRegistry:      ", newDisputeRegistry);
  console.log("\nUpdate casfin/frontend/.env.local:");
  console.log(`  NEXT_PUBLIC_FHE_MARKET_FACTORY_ADDRESS=${newFactoryAddress}`);
  console.log(`  NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=${newFactoryAddress}`);
  console.log(`  NEXT_PUBLIC_FEE_DISTRIBUTOR_ADDRESS=${newFeeDistributor}`);
  console.log(`  NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS=${newDisputeRegistry}`);
  console.log("\nUpdate casfin/.env:");
  console.log(`  MARKET_FACTORY_ADDRESS=${newFactoryAddress}`);
  console.log("═════════════════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
