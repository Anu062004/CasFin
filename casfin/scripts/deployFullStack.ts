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
  if (network.name !== "arbitrumSepolia") {
    throw new Error("RUN_WITH_ARBITRUM_SEPOLIA_NETWORK");
  }

  const [deployer] = await ethers.getSigners();
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

  console.log("Deploying full CasFin stack to Arbitrum Sepolia from:", deployer.address);
  console.log("Prediction owner:", owner);
  console.log("Prediction treasury:", treasury);

  const vault = await deployContract(ethers, "EncryptedCasinoVault", [deployer.address]);
  const coinFlip = await deployContract(ethers, "EncryptedCoinFlip", [deployer.address, vault.address, 200]);
  const dice = await deployContract(ethers, "EncryptedDiceGame", [deployer.address, vault.address, 200]);
  const crash = await deployContract(ethers, "EncryptedCrashGame", [deployer.address, vault.address, 200, 100000]);

  const casinoConfigTxs = {
    authorizeCoinFlipVault: await trackTransaction("authorizeCoinFlipVault", vault.contract.authorizeGame(coinFlip.address, true)),
    authorizeDiceVault: await trackTransaction("authorizeDiceVault", vault.contract.authorizeGame(dice.address, true)),
    authorizeCrashVault: await trackTransaction("authorizeCrashVault", vault.contract.authorizeGame(crash.address, true)),
    setCoinFlipResolver: await trackTransaction("setCoinFlipResolver", coinFlip.contract.setResolver(deployer.address, true)),
    setDiceResolver: await trackTransaction("setDiceResolver", dice.contract.setResolver(deployer.address, true)),
    setCrashResolver: await trackTransaction("setCrashResolver", crash.contract.setResolver(deployer.address, true))
  };

  const feeDistributorImplementation = await deployContract(ethers, "FeeDistributor");
  const disputeRegistryImplementation = await deployContract(ethers, "DisputeRegistry");
  const marketAMMImplementation = await deployContract(ethers, "EncryptedMarketAMM");
  const liquidityPoolImplementation = await deployContract(ethers, "EncryptedLiquidityPool");
  const predictionMarketImplementation = await deployContract(ethers, "EncryptedPredictionMarket");
  const marketResolverImplementation = await deployContract(ethers, "EncryptedMarketResolver");

  const factory = await deployContract(ethers, "EncryptedMarketFactory", [
    owner,
    treasury,
    feeConfig,
    minDisputeBond,
    feeDistributorImplementation.address,
    disputeRegistryImplementation.address,
    marketAMMImplementation.address,
    liquidityPoolImplementation.address,
    predictionMarketImplementation.address,
    marketResolverImplementation.address
  ]);

  const casinoToken = await deployContract(ethers, "CasinoToken", [deployer.address, ethers.parseEther("10000000")]);
  const stakingPool = await deployContract(ethers, "StakingPool", [deployer.address, casinoToken.address]);

  const predictionConfigTxs = {};
  if (approvedCreator && approvedCreator.toLowerCase() !== owner.toLowerCase()) {
    predictionConfigTxs.setCreatorApproval = await trackTransaction(
      "setCreatorApproval",
      factory.contract.setCreatorApproval(approvedCreator, true)
    );
  }

  if (stakingShareBps > 0) {
    predictionConfigTxs.setStakingPool = await trackTransaction(
      "setStakingPool",
      factory.contract.setStakingPool(stakingPool.address, stakingShareBps)
    );
  }

  const [feeDistributorClone, disputeRegistryClone] = await Promise.all([
    factory.contract.feeDistributor(),
    factory.contract.disputeRegistry()
  ]);
  const marketFactoryArtifact = await artifacts.readArtifact("EncryptedMarketFactory");
  const runtimeBytes = (marketFactoryArtifact.deployedBytecode.length - 2) / 2;

  const verification = await verifyMany(hre, [
    vault,
    coinFlip,
    dice,
    crash,
    feeDistributorImplementation,
    disputeRegistryImplementation,
    marketAMMImplementation,
    liquidityPoolImplementation,
    predictionMarketImplementation,
    marketResolverImplementation,
    factory,
    casinoToken,
    stakingPool
  ]);

  const output = {
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    casino: {
      contracts: {
        encryptedCasinoVault: serializeDeployment(vault),
        encryptedCoinFlip: serializeDeployment(coinFlip),
        encryptedDiceGame: serializeDeployment(dice),
        encryptedCrashGame: serializeDeployment(crash)
      },
      configTxs: casinoConfigTxs
    },
    prediction: {
      owner,
      treasury,
      feeConfig,
      minDisputeBondWei: minDisputeBond.toString(),
      implementations: {
        feeDistributor: serializeDeployment(feeDistributorImplementation),
        disputeRegistry: serializeDeployment(disputeRegistryImplementation),
        encryptedMarketAMM: serializeDeployment(marketAMMImplementation),
        encryptedLiquidityPool: serializeDeployment(liquidityPoolImplementation),
        encryptedPredictionMarket: serializeDeployment(predictionMarketImplementation),
        encryptedMarketResolver: serializeDeployment(marketResolverImplementation)
      },
      factory: {
        ...serializeDeployment(factory),
        runtimeBytes
      },
      clones: {
        feeDistributor: feeDistributorClone,
        disputeRegistry: disputeRegistryClone
      },
      configTxs: predictionConfigTxs
    },
    shared: {
      casinoToken: serializeDeployment(casinoToken),
      stakingPool: serializeDeployment(stakingPool)
    },
    verification
  };

  const outFile = writeDeploymentFile(__dirname, network.name, "full-stack.json", output);

  console.log("Deployment output:", outFile);
  console.log("EncryptedCasinoVault:", vault.address);
  console.log("EncryptedCoinFlip:", coinFlip.address);
  console.log("EncryptedDiceGame:", dice.address);
  console.log("EncryptedCrashGame:", crash.address);
  console.log("EncryptedMarketFactory:", factory.address);
  console.log("CasinoToken:", casinoToken.address);
  console.log("StakingPool:", stakingPool.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
