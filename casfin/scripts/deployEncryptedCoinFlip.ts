const hre = require("hardhat");
const { ethers } = hre;

const OLD_ADDRESS = "0x2a43F77A2286ffC3ebfb5D577123CB7cEf8553Af";
const HOUSE_EDGE_BPS = 200;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying EncryptedCoinFlip with account:", deployer.address);

  const vaultAddress = process.env.FHE_VAULT_ADDRESS;
  if (!vaultAddress) {
    throw new Error("FHE_VAULT_ADDRESS not set in env");
  }

  const vault = await ethers.getContractAt("EncryptedCasinoVault", vaultAddress);
  const vaultOwner = await vault.owner();
  if (vaultOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`DEPLOYER_NOT_VAULT_OWNER: signer=${deployer.address} vaultOwner=${vaultOwner}`);
  }

  const CoinFlip = await ethers.getContractFactory("EncryptedCoinFlip");
  const coinFlip = await CoinFlip.deploy(deployer.address, vaultAddress, HOUSE_EDGE_BPS);
  await coinFlip.waitForDeployment();

  const newAddress = await coinFlip.getAddress();
  console.log("EncryptedCoinFlip deployed to:", newAddress);

  await (await vault.authorizeGame(newAddress, true)).wait();
  console.log("New CoinFlip authorized in vault");

  await (await vault.authorizeGame(OLD_ADDRESS, false)).wait();
  console.log("Old CoinFlip deauthorized");

  console.log("\n=== UPDATE THESE ENV VARS ===");
  console.log(`NEXT_PUBLIC_FHE_COIN_FLIP_ADDRESS=${newAddress}`);
  console.log(`ENCRYPTED_COIN_FLIP_ADDRESS=${newAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
