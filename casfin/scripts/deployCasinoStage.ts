const hre = require("hardhat");
const { ethers, network } = hre;
const {
  deployContract,
  getRequiredVrfConfig,
  isManualRouterForced,
  serializeDeployment,
  trackTransaction,
  verifyMany,
  writeDeploymentFile
} = require("./deployUtils");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying CasFin casino stage from:", deployer.address);
  console.log("Network:", network.name);

  const chips = await deployContract(ethers, "CasinoToken", [deployer.address, ethers.parseEther("10000000")]);
  const stakingPool = await deployContract(ethers, "StakingPool", [deployer.address, chips.address]);
  const vault = await deployContract(ethers, "CasinoVault", [deployer.address]);

  let randomnessRouter;
  if (isManualRouterForced()) {
    randomnessRouter = await deployContract(ethers, "CasinoRandomnessRouter", [deployer.address]);
    randomnessRouter.type = "CasinoRandomnessRouter";
  } else {
    const vrfConfig = getRequiredVrfConfig();
    randomnessRouter = await deployContract(ethers, "ChainlinkVRFAdapter", [
      deployer.address,
      vrfConfig.coordinatorAddress,
      vrfConfig.keyHash,
      vrfConfig.subscriptionId,
      vrfConfig.requestConfirmations,
      vrfConfig.callbackGasLimit,
      vrfConfig.numWords,
      vrfConfig.nativePayment
    ]);
    randomnessRouter.type = "ChainlinkVRFAdapter";
  }

  const coinFlip = await deployContract(ethers, "CoinFlipGame", [
    deployer.address,
    vault.address,
    randomnessRouter.address,
    200,
    ethers.parseEther("0.25")
  ]);

  const dice = await deployContract(ethers, "DiceGame", [
    deployer.address,
    vault.address,
    randomnessRouter.address,
    200,
    ethers.parseEther("0.15")
  ]);

  const crash = await deployContract(ethers, "CrashGame", [
    deployer.address,
    vault.address,
    randomnessRouter.address,
    200,
    ethers.parseEther("0.20")
  ]);

  const configTxs = {
    authorizeCoinFlipVault: await trackTransaction("authorizeCoinFlipVault", vault.contract.authorizeGame(coinFlip.address, true)),
    authorizeDiceVault: await trackTransaction("authorizeDiceVault", vault.contract.authorizeGame(dice.address, true)),
    authorizeCrashVault: await trackTransaction("authorizeCrashVault", vault.contract.authorizeGame(crash.address, true)),
    authorizeCoinFlipRouter: await trackTransaction(
      "authorizeCoinFlipRouter",
      randomnessRouter.contract.authorizeGame(coinFlip.address, true)
    ),
    authorizeDiceRouter: await trackTransaction(
      "authorizeDiceRouter",
      randomnessRouter.contract.authorizeGame(dice.address, true)
    ),
    authorizeCrashRouter: await trackTransaction(
      "authorizeCrashRouter",
      randomnessRouter.contract.authorizeGame(crash.address, true)
    ),
    setRewardNotifier: await trackTransaction("setRewardNotifier", stakingPool.contract.setRewardNotifier(deployer.address, true))
  };

  const verification = await verifyMany(hre, [chips, stakingPool, vault, randomnessRouter, coinFlip, dice, crash]);

  const output = {
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      casinoToken: serializeDeployment(chips),
      stakingPool: serializeDeployment(stakingPool),
      casinoVault: serializeDeployment(vault),
      randomnessRouter: serializeDeployment(randomnessRouter, { type: randomnessRouter.type }),
      coinFlipGame: serializeDeployment(coinFlip),
      diceGame: serializeDeployment(dice),
      crashGame: serializeDeployment(crash)
    },
    configTxs,
    verification
  };

  const outFile = writeDeploymentFile(__dirname, network.name, "casino-stage.json", output);

  console.log("CasinoToken:", chips.address);
  console.log("Randomness Router:", randomnessRouter.address, `(${randomnessRouter.type})`);
  console.log("Deployment output:", outFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
