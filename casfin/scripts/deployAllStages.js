const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const {
  deployContract,
  getBigIntWeiFromEth,
  getNumber,
  getOptionalAddress,
  getRequiredAddress,
  getRequiredVrfConfig,
  isManualRouterForced,
  serializeDeployment,
  trackTransaction,
  verifyMany,
  writeDeploymentFile
} = require("./deployUtils");

async function deployCasinoStage(deployer) {
  const casino = {};
  const configTxs = {};

  casino.casinoToken = await deployContract(ethers, "CasinoToken", [deployer.address, ethers.parseEther("10000000")]);
  casino.stakingPool = await deployContract(ethers, "StakingPool", [deployer.address, casino.casinoToken.address]);
  casino.casinoVault = await deployContract(ethers, "CasinoVault", [deployer.address]);

  if (isManualRouterForced()) {
    casino.randomnessRouter = await deployContract(ethers, "CasinoRandomnessRouter", [deployer.address]);
    casino.randomnessRouter.type = "CasinoRandomnessRouter";
  } else {
    const vrfConfig = getRequiredVrfConfig();
    casino.randomnessRouter = await deployContract(ethers, "ChainlinkVRFAdapter", [
      deployer.address,
      vrfConfig.coordinatorAddress,
      vrfConfig.keyHash,
      vrfConfig.subscriptionId,
      vrfConfig.requestConfirmations,
      vrfConfig.callbackGasLimit,
      vrfConfig.numWords,
      vrfConfig.nativePayment
    ]);
    casino.randomnessRouter.type = "ChainlinkVRFAdapter";
  }

  casino.coinFlipGame = await deployContract(ethers, "CoinFlipGame", [
    deployer.address,
    casino.casinoVault.address,
    casino.randomnessRouter.address,
    200,
    ethers.parseEther("0.25")
  ]);

  casino.diceGame = await deployContract(ethers, "DiceGame", [
    deployer.address,
    casino.casinoVault.address,
    casino.randomnessRouter.address,
    200,
    ethers.parseEther("0.15")
  ]);

  casino.crashGame = await deployContract(ethers, "CrashGame", [
    deployer.address,
    casino.casinoVault.address,
    casino.randomnessRouter.address,
    200,
    ethers.parseEther("0.20")
  ]);

  configTxs.authorizeCoinFlipVault = await trackTransaction(
    "authorizeCoinFlipVault",
    casino.casinoVault.contract.authorizeGame(casino.coinFlipGame.address, true)
  );
  configTxs.authorizeDiceVault = await trackTransaction(
    "authorizeDiceVault",
    casino.casinoVault.contract.authorizeGame(casino.diceGame.address, true)
  );
  configTxs.authorizeCrashVault = await trackTransaction(
    "authorizeCrashVault",
    casino.casinoVault.contract.authorizeGame(casino.crashGame.address, true)
  );

  configTxs.authorizeCoinFlipRouter = await trackTransaction(
    "authorizeCoinFlipRouter",
    casino.randomnessRouter.contract.authorizeGame(casino.coinFlipGame.address, true)
  );
  configTxs.authorizeDiceRouter = await trackTransaction(
    "authorizeDiceRouter",
    casino.randomnessRouter.contract.authorizeGame(casino.diceGame.address, true)
  );
  configTxs.authorizeCrashRouter = await trackTransaction(
    "authorizeCrashRouter",
    casino.randomnessRouter.contract.authorizeGame(casino.crashGame.address, true)
  );

  configTxs.setRewardNotifier = await trackTransaction(
    "setRewardNotifier",
    casino.stakingPool.contract.setRewardNotifier(deployer.address, true)
  );

  return { casino, configTxs };
}

async function deployPredictionStage(deployer, stakingPoolAddress) {
  const owner = getRequiredAddress(ethers, "PREDICTION_OWNER_ADDRESS", deployer.address);
  const treasury = getRequiredAddress(ethers, "PREDICTION_TREASURY_ADDRESS", deployer.address);
  const approvedCreator = getOptionalAddress(ethers, "PREDICTION_APPROVED_CREATOR_ADDRESS");
  const feeConfig = {
    platformFeeBps: getNumber("PREDICTION_PLATFORM_FEE_BPS", 100),
    lpFeeBps: getNumber("PREDICTION_LP_FEE_BPS", 50),
    resolverFeeBps: getNumber("PREDICTION_RESOLVER_FEE_BPS", 50)
  };
  const minDisputeBond = getBigIntWeiFromEth(ethers, "PREDICTION_MIN_DISPUTE_BOND_ETH", "0.1");
  const stakingShareBps = getNumber("PREDICTION_STAKING_SHARE_BPS", 0);

  const implementations = {};
  for (const name of [
    "FeeDistributor",
    "DisputeRegistry",
    "MarketAMM",
    "LiquidityPool",
    "PredictionMarket",
    "MarketResolver"
  ]) {
    implementations[name] = await deployContract(ethers, name);
  }

  const factory = await deployContract(ethers, "MarketFactory", [
    owner,
    treasury,
    feeConfig,
    minDisputeBond,
    implementations.FeeDistributor.address,
    implementations.DisputeRegistry.address,
    implementations.MarketAMM.address,
    implementations.LiquidityPool.address,
    implementations.PredictionMarket.address,
    implementations.MarketResolver.address
  ]);

  const cloneAddresses = {
    feeDistributor: await factory.contract.feeDistributor(),
    disputeRegistry: await factory.contract.disputeRegistry()
  };

  const marketFactoryArtifact = await artifacts.readArtifact("MarketFactory");
  const runtimeBytes = (marketFactoryArtifact.deployedBytecode.length - 2) / 2;

  const configTxs = {};

  if (approvedCreator && approvedCreator.toLowerCase() !== owner.toLowerCase()) {
    configTxs.setCreatorApproval = await trackTransaction(
      "setCreatorApproval",
      factory.contract.setCreatorApproval(approvedCreator, true)
    );
  }

  if (stakingPoolAddress && stakingShareBps > 0) {
    configTxs.setStakingPool = await trackTransaction(
      "setStakingPool",
      factory.contract.setStakingPool(stakingPoolAddress, stakingShareBps)
    );
  }

  return {
    owner,
    treasury,
    feeConfig,
    minDisputeBondWei: minDisputeBond.toString(),
    implementations,
    factory,
    cloneAddresses,
    configTxs,
    runtimeBytes
  };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying full CasFin stack from:", deployer.address);
  console.log("Network:", network.name);

  const casinoStage = await deployCasinoStage(deployer);
  const predictionStage = await deployPredictionStage(deployer, casinoStage.casino.stakingPool.address);
  const verification = await verifyMany(hre, [
    ...Object.values(casinoStage.casino),
    ...Object.values(predictionStage.implementations),
    predictionStage.factory
  ]);

  const output = {
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    casino: {
      contracts: Object.fromEntries(
        Object.entries(casinoStage.casino).map(([key, deployment]) => [
          key,
          serializeDeployment(deployment, { type: deployment.type || deployment.name })
        ])
      ),
      configTxs: casinoStage.configTxs
    },
    prediction: {
      owner: predictionStage.owner,
      treasury: predictionStage.treasury,
      feeConfig: predictionStage.feeConfig,
      minDisputeBondWei: predictionStage.minDisputeBondWei,
      implementations: Object.fromEntries(
        Object.entries(predictionStage.implementations).map(([key, deployment]) => [
          key,
          serializeDeployment(deployment)
        ])
      ),
      factory: {
        ...serializeDeployment(predictionStage.factory),
        runtimeBytes: predictionStage.runtimeBytes
      },
      clones: predictionStage.cloneAddresses,
      configTxs: predictionStage.configTxs
    },
    verification
  };

  const outFile = writeDeploymentFile(__dirname, network.name, "full-stack.json", output);

  console.log("Deployment output:", outFile);
  console.log("CasinoToken:", output.casino.contracts.casinoToken.address);
  console.log("Randomness Router:", output.casino.contracts.randomnessRouter.address);
  console.log("MarketFactory:", output.prediction.factory.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
