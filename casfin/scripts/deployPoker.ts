const hre = require("hardhat");
const { ethers, network } = hre;
const { deployContract, serializeDeployment, trackTransaction, writeDeploymentFile } = require("./deployUtils");

async function main() {
  if (network.name !== "arbitrumSepolia") {
    throw new Error("RUN_WITH_ARBITRUM_SEPOLIA_NETWORK");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying EncryptedVideoPoker from:", deployer.address);
  console.log("Network:", network.name);

  const vaultAddress = process.env.ENCRYPTED_CASINO_VAULT_ADDRESS;
  if (!vaultAddress || !ethers.isAddress(vaultAddress)) {
    throw new Error("ENCRYPTED_CASINO_VAULT_ADDRESS is not set or invalid in .env");
  }

  const poker = await deployContract(ethers, "EncryptedVideoPoker", [deployer.address, vaultAddress, 200]);
  console.log("EncryptedVideoPoker deployed:", poker.address);

  const vault = await ethers.getContractAt("EncryptedCasinoVault", vaultAddress, deployer);

  const configTxs: Record<string, unknown> = {};

  configTxs.authorizePokerVault = await trackTransaction(
    "authorizePokerVault",
    vault.authorizeGame(poker.address, true)
  );
  console.log("[ok] Authorized poker game with vault:", poker.address);

  configTxs.setPokerResolver = await trackTransaction(
    "setPokerResolver",
    poker.contract.setResolver(deployer.address, true)
  );
  console.log("[ok] Set poker resolver:", deployer.address);

  const isAuthorized = await vault.authorizedGames(poker.address);
  if (!isAuthorized) {
    throw new Error("POKER_VAULT_AUTHORIZATION_FAILED");
  }
  console.log("Verified vault authorization for poker game.");

  const output = {
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    vaultAddress,
    contracts: {
      encryptedVideoPoker: serializeDeployment(poker)
    },
    configTxs
  };

  const outFile = writeDeploymentFile(__dirname, network.name, "poker-stage.json", output);

  console.log("\n=== Deployment Summary ===");
  console.log("EncryptedVideoPoker:", poker.address);
  console.log("Deploy TX:", poker.txHash);
  console.log("Authorize TX:", (configTxs.authorizePokerVault as any).txHash);
  console.log("Resolver TX:", (configTxs.setPokerResolver as any).txHash);
  console.log("Output file:", outFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
