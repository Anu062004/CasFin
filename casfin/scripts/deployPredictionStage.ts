const hre = require("hardhat");
const { ethers, network, artifacts } = hre;
const {
  deployContract,
  getBigIntWeiFromEth,
  getNumber,
  getOptionalAddress,
  getRequiredAddress,
  serializeDeployment,
  trackTransaction,
  verifyMany,
  writeDeploymentFile
} = require("./deployUtils");

async function main() {
  const [deployer] = await ethers.getSigners();
  const owner = getRequiredAddress(ethers, "PREDICTION_OWNER_ADDRESS", deployer.address);
  const treasury = getRequiredAddress(ethers, "PREDICTION_TREASURY_ADDRESS", deployer.address);
  const approvedCreator = getOptionalAddress(ethers, "PREDICTION_APPROVED_CREATOR_ADDRESS");
  const stakingPool = getOptionalAddress(ethers, "PREDICTION_STAKING_POOL_ADDRESS");

  const feeConfig = {
    platformFeeBps: getNumber("PREDICTION_PLATFORM_FEE_BPS", 100),
    lpFeeBps: getNumber("PREDICTION_LP_FEE_BPS", 50),
    resolverFeeBps: getNumber("PREDICTION_RESOLVER_FEE_BPS", 50)
  };
  const minDisputeBond = getBigIntWeiFromEth(ethers, "PREDICTION_MIN_DISPUTE_BOND_ETH", "0.1");
  const stakingShareBps = getNumber("PREDICTION_STAKING_SHARE_BPS", 0);

  console.log("Deploying prediction stage from:", deployer.address);
  console.log("Owner:", owner);
  console.log("Treasury:", treasury);

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
    console.log(`${name} implementation:`, implementations[name].address);
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

  const configTxs = {};

  if (approvedCreator && approvedCreator.toLowerCase() !== owner.toLowerCase()) {
    configTxs.setCreatorApproval = await trackTransaction(
      "setCreatorApproval",
      factory.contract.setCreatorApproval(approvedCreator, true)
    );
    console.log("Approved creator:", approvedCreator);
  }

  if (stakingPool && stakingShareBps > 0) {
    configTxs.setStakingPool = await trackTransaction(
      "setStakingPool",
      factory.contract.setStakingPool(stakingPool, stakingShareBps)
    );
    console.log("Configured staking pool:", stakingPool, "shareBps:", stakingShareBps);
  }

  const feeDistributor = await factory.contract.feeDistributor();
  const disputeRegistry = await factory.contract.disputeRegistry();
  const marketFactoryArtifact = await artifacts.readArtifact("MarketFactory");
  const runtimeBytes = (marketFactoryArtifact.deployedBytecode.length - 2) / 2;
  const verification = await verifyMany(hre, [...Object.values(implementations), factory]);

  const output = {
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    owner,
    treasury,
    feeConfig,
    minDisputeBondWei: minDisputeBond.toString(),
    implementations: Object.fromEntries(
      Object.entries(implementations).map(([name, deployment]) => [name, serializeDeployment(deployment)])
    ),
    factory: {
      ...serializeDeployment(factory),
      runtimeBytes
    },
    clones: {
      feeDistributor,
      disputeRegistry
    },
    configTxs,
    verification
  };

  const outFile = writeDeploymentFile(__dirname, network.name, "prediction-stage.json", output);

  console.log("MarketFactory:", output.factory.address);
  console.log("FeeDistributor clone:", feeDistributor);
  console.log("DisputeRegistry clone:", disputeRegistry);
  console.log("MarketFactory runtime bytes:", runtimeBytes);
  console.log("Deployment output:", outFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
