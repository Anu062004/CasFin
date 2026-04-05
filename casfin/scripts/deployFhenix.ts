const hre = require("hardhat");
const { ethers, network } = hre;
const { deployContract, getRequiredAddress, serializeDeployment, trackTransaction, writeDeploymentFile } = require("./deployUtils");

async function main() {
  if (network.name !== "arbitrumSepolia") {
    throw new Error("RUN_WITH_ARBITRUM_SEPOLIA_NETWORK");
  }

  const [deployer] = await ethers.getSigners();
  const routerAddress = getRequiredAddress(ethers, "CASINO_RANDOMNESS_ROUTER_ADDRESS");

  console.log("Deploying CasFin Fhenix stack from:", deployer.address);
  console.log("Network:", network.name);
  console.log("Randomness Router:", routerAddress);

  const vault = await deployContract(ethers, "EncryptedCasinoVault", [deployer.address]);
  const coinFlip = await deployContract(ethers, "EncryptedCoinFlip", [
    deployer.address,
    vault.address,
    routerAddress,
    200
  ]);
  const dice = await deployContract(ethers, "EncryptedDiceGame", [
    deployer.address,
    vault.address,
    routerAddress,
    200
  ]);
  const crash = await deployContract(ethers, "EncryptedCrashGame", [
    deployer.address,
    vault.address,
    routerAddress,
    200
  ]);

  const configTxs = {
    authorizeCoinFlipVault: await trackTransaction("authorizeCoinFlipVault", vault.contract.authorizeGame(coinFlip.address, true)),
    authorizeDiceVault: await trackTransaction("authorizeDiceVault", vault.contract.authorizeGame(dice.address, true)),
    authorizeCrashVault: await trackTransaction("authorizeCrashVault", vault.contract.authorizeGame(crash.address, true))
  };
  const resolverTxs = {
    setCoinFlipResolver: await trackTransaction(
      "setCoinFlipResolver",
      coinFlip.contract.setResolver(deployer.address, true)
    ),
    setDiceResolver: await trackTransaction(
      "setDiceResolver",
      dice.contract.setResolver(deployer.address, true)
    ),
    setCrashResolver: await trackTransaction(
      "setCrashResolver",
      crash.contract.setResolver(deployer.address, true)
    )
  };

  const output = {
    network: network.name,
    chainId: Number(network.config.chainId || 0),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      encryptedCasinoVault: serializeDeployment(vault),
      encryptedCoinFlip: serializeDeployment(coinFlip),
      encryptedDiceGame: serializeDeployment(dice),
      encryptedCrashGame: serializeDeployment(crash),
      casinoRandomnessRouter: {
        name: "ICasinoRandomnessRouter",
        address: routerAddress
      }
    },
    configTxs,
    resolverTxs
  };

  const outFile = writeDeploymentFile(__dirname, network.name, "fhe-casino.json", output);

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
