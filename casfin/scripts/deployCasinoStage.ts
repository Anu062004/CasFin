const hre = require("hardhat");
const { ethers, network } = hre;
const { deployContract, serializeDeployment, trackTransaction, verifyMany, writeDeploymentFile } = require("./deployUtils");

async function getUnauthorizedGames(vaultContract, gameContracts) {
  const unauthorizedGames = [];

  for (const game of gameContracts) {
    const ok = await vaultContract.authorizedGames(game.address);
    if (!ok) {
      unauthorizedGames.push(game);
    }
  }

  return unauthorizedGames;
}

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

  const deployedGameContracts = [
    {
      name: "EncryptedCoinFlip",
      address: coinFlip.address,
      authorizeLabel: "authorizeCoinFlipVault"
    },
    {
      name: "EncryptedDiceGame",
      address: dice.address,
      authorizeLabel: "authorizeDiceVault"
    },
    {
      name: "EncryptedCrashGame",
      address: crash.address,
      authorizeLabel: "authorizeCrashVault"
    }
  ];

  console.log("Checking authorization status before setup...");
  const unauthorizedBeforeSetup = await getUnauthorizedGames(vault.contract, deployedGameContracts);
  for (const game of unauthorizedBeforeSetup) {
    console.warn(`WARNING: NOT AUTHORIZED: ${game.address}`);
  }

  console.log("Authorizing all games...");
  const configTxs: Record<string, unknown> = {};

  for (const game of deployedGameContracts) {
    configTxs[game.authorizeLabel] = await trackTransaction(
      game.authorizeLabel,
      vault.contract.authorizeGame(game.address, true)
    );
    console.log(`[ok] Authorized: ${game.address}`);
  }

  configTxs.setCoinFlipResolver = await trackTransaction(
    "setCoinFlipResolver",
    coinFlip.contract.setResolver(deployer.address, true)
  );
  configTxs.setDiceResolver = await trackTransaction(
    "setDiceResolver",
    dice.contract.setResolver(deployer.address, true)
  );
  configTxs.setCrashResolver = await trackTransaction(
    "setCrashResolver",
    crash.contract.setResolver(deployer.address, true)
  );

  const unauthorizedAfterSetup = await getUnauthorizedGames(vault.contract, deployedGameContracts);
  if (unauthorizedAfterSetup.length > 0) {
    throw new Error(
      `AUTHORIZATION_SETUP_INCOMPLETE: ${unauthorizedAfterSetup.map((game) => `${game.name} (${game.address})`).join(", ")}`
    );
  }

  console.log("Verified vault authorization for all deployed encrypted games.");

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
