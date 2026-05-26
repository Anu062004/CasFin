import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  asHandle,
  deployMockFheEnvironment,
  mockDecrypt,
  mockEncryptUint128Input,
} from "./helpers/deployFheMocks";

async function expectRevert(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
    expect.fail(`Expected revert containing "${message}"`);
  } catch (error) {
    expect((error as Error).message).to.include(message);
  }
}

describe("EncryptedPredictionMarket", function () {
  async function deployImplementation(name: string) {
    const Contract = await ethers.getContractFactory(name);
    const instance = await Contract.deploy();
    await instance.waitForDeployment();
    return instance;
  }

  async function deployFixture() {
    await network.provider.request({ method: "hardhat_reset", params: [] });
    await deployMockFheEnvironment();

    const [owner, trader, treasury] = await ethers.getSigners();

    const feeDistributorImplementation = await deployImplementation("FeeDistributor");
    const disputeRegistryImplementation = await deployImplementation("DisputeRegistry");
    const marketAMMImplementation = await deployImplementation("EncryptedMarketAMM");
    const liquidityPoolImplementation = await deployImplementation("EncryptedLiquidityPool");
    const predictionMarketImplementation = await deployImplementation("EncryptedPredictionMarket");
    const marketResolverImplementation = await deployImplementation("EncryptedMarketResolver");

    const feeConfig = {
      platformFeeBps: 100,
      lpFeeBps: 50,
      resolverFeeBps: 50,
    };

    const Factory = await ethers.getContractFactory("EncryptedMarketFactory");
    const factory = await Factory.deploy(
      await owner.getAddress(),
      await treasury.getAddress(),
      feeConfig,
      ethers.parseEther("0.1"),
      await feeDistributorImplementation.getAddress(),
      await disputeRegistryImplementation.getAddress(),
      await marketAMMImplementation.getAddress(),
      await liquidityPoolImplementation.getAddress(),
      await predictionMarketImplementation.getAddress(),
      await marketResolverImplementation.getAddress(),
    );
    await factory.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const params = {
      question: "Will ETH close above $4,000 by Friday?",
      description: "Encrypted binary market used for local integration testing.",
      outcomes: ["YES", "NO"],
      resolvesAt: BigInt(latestBlock!.timestamp) + 7200n,
      disputeWindowSecs: 3600,
      oracleType: 0,
      oracleAddress: ethers.ZeroAddress,
      oracleParams: "0x",
      initialLiquidity: ethers.parseEther("1"),
    };

    await (await factory.createMarket(params, { value: params.initialLiquidity })).wait();

    const marketAddress = await factory.allMarkets(0);
    const meta = await factory.marketMeta(marketAddress);
    const market = await ethers.getContractAt("EncryptedPredictionMarket", marketAddress);
    const pool = await ethers.getContractAt("EncryptedLiquidityPool", meta.pool);

    return { trader, treasury, market, pool, feeConfig };
  }

  it("requires real ETH collateral and routes buy fees", async function () {
    const { trader, treasury, market, pool, feeConfig } = await deployFixture();

    const buyValue = ethers.parseEther("1");
    const platformFee = (buyValue * BigInt(feeConfig.platformFeeBps)) / 10_000n;
    const lpFee = (buyValue * BigInt(feeConfig.lpFeeBps)) / 10_000n;
    const netCollateral = buyValue - platformFee - lpFee;
    const encAmount = await mockEncryptUint128Input(buyValue, trader);

    const marketAddress = await market.getAddress();
    const poolAddress = await pool.getAddress();
    const treasuryBefore = await ethers.provider.getBalance(await treasury.getAddress());
    const poolBefore = await ethers.provider.getBalance(poolAddress);

    await (await market.connect(trader).buyShares(0, encAmount, { value: buyValue })).wait();

    expect(await ethers.provider.getBalance(marketAddress)).to.equal(netCollateral);
    expect((await ethers.provider.getBalance(await treasury.getAddress())) - treasuryBefore).to.equal(platformFee);
    expect((await ethers.provider.getBalance(poolAddress)) - poolBefore).to.equal(lpFee);
    expect(await market.publicCollateralPerOutcome(0)).to.equal(netCollateral);

    const totals = await market.getTotalSharesPerOutcome();
    expect((await mockDecrypt(asHandle(totals[0]))) > 0n).to.equal(true);
  });

  it("rejects encrypted share buys without ETH", async function () {
    const { trader, market } = await deployFixture();

    const encAmount = await mockEncryptUint128Input(ethers.parseEther("1"), trader);
    await expectRevert(market.connect(trader).buyShares(0, encAmount), "ZERO_COLLATERAL");
  });
});
