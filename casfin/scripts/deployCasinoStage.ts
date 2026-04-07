const hre = require("hardhat");
const { ethers, network } = hre;
const { deployContract, serializeDeployment, trackTransaction, verifyMany, writeDeploymentFile } = require("./deployUtils");

async function main() {
  if (network.name !== "arbitrumSepolia") {
    throw new Error("RUN_WITH_ARBITRUM_SEPOLIA_NETWORK");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deploying CasFin encrypted casino stage from:", deployer.address);
  console.log("Network:", network.name);

  const vault = await deployContract(ethers, "EncryptedCasinoVault", [deployer.address]);
  const coinFlip = await deployContract(ethers, "EncryptedCoinFlip", [deployer.address, vault.address, 200]);
  const dice = await deployContract(ethers, "EncryptedDiceGame", [deployer.address, vault.address, 200]);
  const crash = await deployContract(ethers, "EncryptedCrashGame", [deployer.address, vault.address, 200, 100000]);

  const configTxs = {
    authorizeCoinFlipVault: await trackTransaction("authorizeCoinFlipVault", vault.contract.authorizeGame(coinFlip.address, true)),
    authorizeDiceVault: await trackTransaction("authorizeDiceVault", vault.contract.authorizeGame(dice.address, true)),
    authorizeCrashVault: await trackTransaction("authorizeCrashVault", vault.contract.authorizeGame(crash.address, true)),
    setCoinFlipResolver: await trackTransaction("setCoinFlipResolver", coinFlip.contract.setResolver(deployer.address, true)),
    setDiceResolver: await trackTransaction("setDiceResolver", dice.contract.setResolver(deployer.address, true)),
    setCrashResolver: await trackTransaction("setCrashResolver", crash.contract.setResolver(deployer.address, true))
  };

  const verification = await verifyMany(hre, [vault, coinFlip, dice, crash]);

  const output = {
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      encryptedCasinoVault: serializeDeployment(vault),
      encryptedCoinFlip: serializeDeployment(coinFlip),
      encryptedDiceGame: serializeDeployment(dice),
      encryptedCrashGame: serializeDeployment(crash)
    },
    configTxs,
    verification
  };

  const outFile = writeDeploymentFile(__dirname, network.name, "casino-stage.json", output);

  console.log("EncryptedCasinoVault:", vault.address);
  console.log("EncryptedCoinFlip:", coinFlip.address);
  console.log("EncryptedDiceGame:", dice.address);
  console.log("EncryptedCrashGame:", crash.address);
  console.log("Deployment output:", outFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
