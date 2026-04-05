const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Prediction Market", function () {
  async function deployImplementation(name) {
    const Contract = await ethers.getContractFactory(name);
    const instance = await Contract.deploy();
    await instance.waitForDeployment();
    return instance;
  }

  async function deployFixture() {
    const [owner, trader1, trader2, challenger, treasury] = await ethers.getSigners();

    const [
      feeDistributorImplementation,
      disputeRegistryImplementation,
      marketAMMImplementation,
      liquidityPoolImplementation,
      predictionMarketImplementation,
      marketResolverImplementation
    ] = await Promise.all([
      deployImplementation("FeeDistributor"),
      deployImplementation("DisputeRegistry"),
      deployImplementation("MarketAMM"),
      deployImplementation("LiquidityPool"),
      deployImplementation("PredictionMarket"),
      deployImplementation("MarketResolver")
    ]);

    const MarketFactory = await ethers.getContractFactory("MarketFactory");
    const feeConfig = {
      platformFeeBps: 100,
      lpFeeBps: 50,
      resolverFeeBps: 50
    };

    const factory = await MarketFactory.deploy(
      owner.address,
      treasury.address,
      feeConfig,
      ethers.parseEther("0.1"),
      await feeDistributorImplementation.getAddress(),
      await disputeRegistryImplementation.getAddress(),
      await marketAMMImplementation.getAddress(),
      await liquidityPoolImplementation.getAddress(),
      await predictionMarketImplementation.getAddress(),
      await marketResolverImplementation.getAddress()
    );
    await factory.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const resolvesAt = BigInt(latestBlock.timestamp) + 7200n;

    const params = {
      question: "Will ETH close above $4,000 by Friday?",
      description: "Binary market used for local integration testing.",
      outcomes: ["YES", "NO"],
      resolvesAt,
      disputeWindowSecs: 3600,
      oracleType: 0,
      oracleAddress: ethers.ZeroAddress,
      oracleParams: "0x",
      initialLiquidity: ethers.parseEther("1")
    };

    await factory.createMarket(params, { value: params.initialLiquidity });

    const marketAddress = await factory.allMarkets(0);
    const meta = await factory.marketMeta(marketAddress);

    const market = await ethers.getContractAt("PredictionMarket", marketAddress);
    const resolver = await ethers.getContractAt("MarketResolver", meta.resolver);
    const pool = await ethers.getContractAt("LiquidityPool", meta.pool);
    const disputeRegistry = await ethers.getContractAt("DisputeRegistry", await factory.disputeRegistry());

    return {
      owner,
      trader1,
      trader2,
      challenger,
      treasury,
      factory,
      market,
      resolver,
      pool,
      disputeRegistry,
      resolvesAt
    };
  }

  async function increaseTime(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  async function expectRevert(txPromise, expectedMessage) {
    let reverted = false;
    try {
      await txPromise;
    } catch (error) {
      reverted = true;
      expect(String(error.message).includes(expectedMessage)).to.equal(true);
    }
    expect(reverted).to.equal(true);
  }

  it("creates a market and supports direct sell flow", async function () {
    const { trader1, market } = await deployFixture();

    await market.connect(trader1).buyShares(0, 0, { value: ethers.parseEther("1") });
    const totalsBefore = await market.getTotalSharesPerOutcome();
    expect(totalsBefore[0] > 0n).to.equal(true);

    const sellAmount = totalsBefore[0] / 2n;
    await market.connect(trader1).sell(0, sellAmount);
    const totalsAfter = await market.getTotalSharesPerOutcome();

    expect(totalsAfter[0] < totalsBefore[0]).to.equal(true);
  });

  it("enforces buy slippage protection", async function () {
    const { trader1, market } = await deployFixture();

    await expectRevert(
      market.connect(trader1).buyShares(0, ethers.MaxUint256, { value: ethers.parseEther("1") }),
      "SLIPPAGE_EXCEEDED"
    );
  });

  it("resolves, finalizes, and lets winning traders claim", async function () {
    const { owner, trader1, trader2, market, resolver } = await deployFixture();

    await market.connect(trader1).buyShares(0, 0, { value: ethers.parseEther("1") });
    await market.connect(trader2).buyShares(1, 0, { value: ethers.parseEther("1") });

    await increaseTime(7201);
    await resolver.connect(owner).resolveManual(0);
    await increaseTime(3601);

    await market.finalizeMarket();
    expect(await market.finalized()).to.equal(true);

    await market.connect(trader1).claim();

    expect(await market.hasClaimed(trader1.address)).to.equal(true);
    await expectRevert(market.connect(trader2).claim(), "NO_WINNING_SHARES");
  });

  it("supports dispute filing and admin settlement through the factory", async function () {
    const { owner, challenger, factory, market, resolver, disputeRegistry } = await deployFixture();

    await increaseTime(7201);
    await resolver.connect(owner).resolveManual(0);

    await disputeRegistry
      .connect(challenger)
      .fileDispute(await market.getAddress(), ethers.keccak256(ethers.toUtf8Bytes("resolution mismatch")), {
        value: ethers.parseEther("0.1")
      });

    expect(await market.disputed()).to.equal(true);

    await factory.connect(owner).settleMarketDispute(await market.getAddress(), 1, true);

    expect(await market.finalized()).to.equal(true);
    expect(await market.winningOutcome()).to.equal(1n);
  });

  it("mints transferable LP shares and allows withdrawal after finalization", async function () {
    const { owner, trader1, trader2, pool, market, resolver } = await deployFixture();

    await pool.connect(trader1).addLiquidity(trader1.address, { value: ethers.parseEther("2") });
    expect(await pool.balanceOf(trader1.address)).to.equal(ethers.parseEther("2"));

    await pool.connect(trader1).transfer(trader2.address, ethers.parseEther("0.5"));
    expect(await pool.balanceOf(trader2.address)).to.equal(ethers.parseEther("0.5"));

    await pool.connect(trader2).approve(trader1.address, ethers.parseEther("0.25"));
    await pool.connect(trader1).transferFrom(trader2.address, trader1.address, ethers.parseEther("0.25"));

    expect(await pool.balanceOf(trader1.address)).to.equal(ethers.parseEther("1.75"));
    expect(await pool.balanceOf(trader2.address)).to.equal(ethers.parseEther("0.25"));

    await increaseTime(7201);
    await resolver.connect(owner).resolveManual(0);
    await increaseTime(3601);
    await market.finalizeMarket();

    await pool.connect(trader1).removeLiquidity(ethers.parseEther("1"));
    expect(await pool.balanceOf(trader1.address)).to.equal(ethers.parseEther("0.75"));
  });
});
