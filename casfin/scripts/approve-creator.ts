/**
 * Approve a wallet address as a market creator on EncryptedMarketFactory.
 *
 * Usage (from casfin/ directory):
 *   npx hardhat run scripts/approve-creator.ts --network arbitrumSepolia
 *
 * Required env vars (from casfin/.env):
 *   PRIVATE_KEY                        — deployer / factory owner private key
 *   ARBITRUM_SEPOLIA_RPC_URL           — RPC endpoint
 *
 * Optional env vars:
 *   CREATOR_ADDRESS                    — wallet to approve (defaults to DEPLOYER_ADDRESS)
 *   FACTORY_ADDRESS                    — factory to use (defaults to 0xC876De943508B4938d3d8f010cc97dbac7Ab0B43)
 */

const hre = require("hardhat");
const { ethers } = hre;
const path = require("path");
const fs = require("fs");

const ENCRYPTED_MARKET_FACTORY_ABI_PATH = path.join(
  __dirname,
  "../frontend/lib/generated-abis/EncryptedMarketFactory.json"
);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer / signer:", deployer.address);

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

  const abi = JSON.parse(fs.readFileSync(ENCRYPTED_MARKET_FACTORY_ABI_PATH, "utf8"));
  const factory = new ethers.Contract(factoryAddress, abi, deployer);

  const owner = await factory.owner();
  console.log("Factory:", factoryAddress);
  console.log("Factory owner:", owner);
  console.log("Creator to approve:", creatorAddress);

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `Signer ${deployer.address} is not the factory owner (${owner}). Use the owner's private key.`
    );
  }

  const alreadyApproved = await factory.approvedCreators(creatorAddress);
  if (alreadyApproved) {
    console.log("Creator is already approved — nothing to do.");
    return;
  }

  console.log("Sending setCreatorApproval transaction...");
  const tx = await factory.setCreatorApproval(creatorAddress, true);
  console.log("Tx hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt.blockNumber);
  console.log("Creator approved successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
