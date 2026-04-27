const TASK_MANAGER_ADDRESS = "0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const COIN_FLIP_ADDRESS = "0x1000000000000000000000000000000000000001";
const DICE_ADDRESS = "0x2000000000000000000000000000000000000002";
const CRASH_ADDRESS = "0x3000000000000000000000000000000000000003";

const contractRegistry = new Map<string, any>();
const providerQueue: any[] = [];
const providerConstructed: any[] = [];

function defaultProvider() {
  return {
    getBlockNumber: jest.fn().mockResolvedValue(123n),
    getBlock: jest.fn().mockResolvedValue({ hash: "0x2" }),
  };
}

jest.mock("@aws-sdk/client-cloudwatch", () => {
  return {
    CloudWatchClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({}),
    })),
    PutMetricDataCommand: jest.fn().mockImplementation((input) => input),
  };
}, { virtual: true });

jest.mock("ethers", () => {
  const ethersMock = {
    FetchRequest: jest.fn().mockImplementation((url: string) => ({ url, timeout: 0 })),
    JsonRpcProvider: jest.fn().mockImplementation((request: { url?: string } | string) => {
      const provider = providerQueue.shift() ?? defaultProvider();
      provider._casfinRpcUrl = typeof request === "string" ? request : request?.url;
      providerConstructed.push(provider);
      return provider;
    }),
    Wallet: jest.fn().mockImplementation((keeperKey: string, provider: any) => ({
      keeperKey,
      provider,
      address: "0x4000000000000000000000000000000000000004",
      getAddress: jest.fn().mockResolvedValue("0x4000000000000000000000000000000000000004"),
    })),
    Contract: jest.fn().mockImplementation((address: string) => {
      const contract = contractRegistry.get(address);
      if (!contract) {
        throw new Error(`No mock contract registered for ${address}`);
      }
      return { target: address, ...contract };
    }),
    isAddress: jest.fn((address: string) => /^0x[a-fA-F0-9]{40}$/.test(address)),
    ZeroAddress: ZERO_ADDRESS,
  };

  return { ethers: ethersMock };
});

function makeBet(overrides: {
  player?: string;
  resolved?: boolean;
  resolutionPending?: boolean;
  pendingWonFlag?: string;
  won?: boolean;
} = {}) {
  return [
    overrides.player ?? "0x5000000000000000000000000000000000000005",
    "0x01",
    "0x02",
    "0x03",
    overrides.resolved ?? false,
    overrides.resolutionPending ?? false,
    overrides.pendingWonFlag ?? "0x04",
    overrides.won ?? false,
  ];
}

function makeRound(overrides: {
  exists?: boolean;
  closeRequested?: boolean;
  closed?: boolean;
} = {}) {
  return [
    overrides.exists ?? true,
    "0x01",
    overrides.closeRequested ?? false,
    0n,
    overrides.closed ?? false,
  ];
}

async function loadKeeperLogic(env: Record<string, string | undefined> = {}) {
  contractRegistry.clear();
  providerQueue.length = 0;
  providerConstructed.length = 0;

  process.env.KEEPER_RPC_URL_1 = env.KEEPER_RPC_URL_1 ?? "https://primary.example";
  process.env.KEEPER_RPC_URL_2 = env.KEEPER_RPC_URL_2 ?? "https://secondary.example";
  process.env.KEEPER_RPC_URL_3 = env.KEEPER_RPC_URL_3 ?? "";
  if (env.ENCRYPTED_COIN_FLIP_ADDRESS == null) {
    delete process.env.ENCRYPTED_COIN_FLIP_ADDRESS;
  } else {
    process.env.ENCRYPTED_COIN_FLIP_ADDRESS = env.ENCRYPTED_COIN_FLIP_ADDRESS;
  }
  if (env.ENCRYPTED_DICE_GAME_ADDRESS == null) {
    delete process.env.ENCRYPTED_DICE_GAME_ADDRESS;
  } else {
    process.env.ENCRYPTED_DICE_GAME_ADDRESS = env.ENCRYPTED_DICE_GAME_ADDRESS;
  }
  if (env.ENCRYPTED_CRASH_GAME_ADDRESS == null) {
    delete process.env.ENCRYPTED_CRASH_GAME_ADDRESS;
  } else {
    process.env.ENCRYPTED_CRASH_GAME_ADDRESS = env.ENCRYPTED_CRASH_GAME_ADDRESS;
  }
  if (env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS == null) {
    delete process.env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS;
  } else {
    process.env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS = env.ENCRYPTED_PREDICTION_FACTORY_ADDRESS;
  }

  const keeperLogic = require("../lambda/keeper-logic");

  keeperLogic.keeperDeps.createProvider = jest.fn((url: string) => {
    const provider = providerQueue.shift() ?? defaultProvider();
    provider._casfinRpcUrl = url;
    providerConstructed.push(provider);
    return provider;
  });
  keeperLogic.keeperDeps.makeContract = jest.fn((address: string) => {
    const contract = contractRegistry.get(address);
    if (!contract) {
      throw new Error(`No mock contract registered for ${address}`);
    }
    return { target: address, ...contract };
  });
  keeperLogic.keeperDeps.getSigner = jest.fn(async () => {
    const provider = await keeperLogic.getWorkingProvider();
    return {
      provider,
      signer: {
        getAddress: jest.fn().mockResolvedValue("0x4000000000000000000000000000000000000004"),
      },
    };
  });
  keeperLogic.keeperDeps.createCloudWatchClient = jest.fn(() => ({
    putMetricData: jest.fn().mockResolvedValue(undefined),
  }));

  return keeperLogic;
}

describe("keeper-logic", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("skips bets where resolved=true", async () => {
    const keeperLogic = await loadKeeperLogic();
    const logs: string[] = [];
    const game = {
      nextBetId: jest.fn().mockResolvedValue(1n),
      bets: jest.fn().mockResolvedValue(makeBet({ resolved: true })),
      requestResolution: jest.fn(),
      finalizeResolution: jest.fn(),
    };

    const result = await keeperLogic.processEncryptedBets("CoinFlip", game as any, logs, defaultProvider() as any, Date.now() + 1000);

    expect(result).toBe(true);
    expect(game.requestResolution).not.toHaveBeenCalled();
    expect(game.finalizeResolution).not.toHaveBeenCalled();
  });

  it("calls requestResolution for unresolved non-pending bets", async () => {
    const keeperLogic = await loadKeeperLogic();
    const logs: string[] = [];
    const game = {
      nextBetId: jest.fn().mockResolvedValue(1n),
      bets: jest.fn().mockResolvedValue(makeBet({ resolved: false, resolutionPending: false })),
      requestResolution: jest.fn().mockResolvedValue({ hash: "0xreq" }),
      finalizeResolution: jest.fn(),
    };

    await keeperLogic.processEncryptedBets("CoinFlip", game as any, logs, defaultProvider() as any, Date.now() + 1000);

    expect(game.requestResolution).toHaveBeenCalledWith(0n);
    expect(game.finalizeResolution).not.toHaveBeenCalled();
  });

  it("skips finalizeResolution when decrypt not ready", async () => {
    const keeperLogic = await loadKeeperLogic();
    contractRegistry.set(TASK_MANAGER_ADDRESS, {
      getDecryptResultSafe: jest.fn().mockResolvedValue([0n, false]),
    });

    const logs: string[] = [];
    const game = {
      nextBetId: jest.fn().mockResolvedValue(1n),
      bets: jest.fn().mockResolvedValue(makeBet({ resolved: false, resolutionPending: true, pendingWonFlag: "0x10" })),
      requestResolution: jest.fn(),
      finalizeResolution: jest.fn(),
    };

    await keeperLogic.processEncryptedBets("CoinFlip", game as any, logs, defaultProvider() as any, Date.now() + 1000);

    expect(game.finalizeResolution).not.toHaveBeenCalled();
  });

  it("calls finalizeResolution when decrypt IS ready", async () => {
    const keeperLogic = await loadKeeperLogic();
    contractRegistry.set(TASK_MANAGER_ADDRESS, {
      getDecryptResultSafe: jest.fn().mockResolvedValue([1n, true]),
    });

    const logs: string[] = [];
    const game = {
      nextBetId: jest.fn().mockResolvedValue(1n),
      bets: jest.fn().mockResolvedValue(makeBet({ resolved: false, resolutionPending: true, pendingWonFlag: "0x11" })),
      requestResolution: jest.fn(),
      finalizeResolution: jest.fn().mockResolvedValue({ hash: "0xfinal" }),
    };

    await keeperLogic.processEncryptedBets("CoinFlip", game as any, logs, defaultProvider() as any, Date.now() + 1000);

    expect(game.finalizeResolution).toHaveBeenCalledWith(0n);
  });

  it("respects hard deadline - returns false immediately if expired", async () => {
    const keeperLogic = await loadKeeperLogic();
    const logs: string[] = [];
    const game = {
      nextBetId: jest.fn(),
      bets: jest.fn(),
      requestResolution: jest.fn(),
      finalizeResolution: jest.fn(),
    };

    const result = await keeperLogic.processEncryptedBets("CoinFlip", game as any, logs, defaultProvider() as any, Date.now() - 1000);

    expect(result).toBe(false);
    expect(game.nextBetId).not.toHaveBeenCalled();
    expect(game.bets).not.toHaveBeenCalled();
  });

  it("handles RPC timeout gracefully on bets() call", async () => {
    jest.useFakeTimers();
    const keeperLogic = await loadKeeperLogic();
    const logs: string[] = [];

    const game = {
      nextBetId: jest.fn().mockResolvedValue(2n),
      bets: jest.fn()
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockResolvedValueOnce(makeBet({ resolved: false, resolutionPending: false })),
      requestResolution: jest.fn().mockResolvedValue({ hash: "0xreq1" }),
      finalizeResolution: jest.fn(),
    };

    const promise = keeperLogic.processEncryptedBets("CoinFlip", game as any, logs, defaultProvider() as any, Date.now() + 100000);
    await jest.advanceTimersByTimeAsync(15000);
    const result = await promise;

    expect(result).toBe(true);
    expect(game.requestResolution).toHaveBeenCalledWith(1n);
    expect(logs.some((line) => line.includes("bets(0) timed out after 15000ms"))).toBe(true);
  });

  it("multi-RPC failover - uses backup RPC when primary fails", async () => {
    const keeperLogic = await loadKeeperLogic({
      KEEPER_RPC_URL_1: "https://primary.example",
      KEEPER_RPC_URL_2: "https://secondary.example",
    });

    providerQueue.push(
      { getBlockNumber: jest.fn().mockRejectedValue(new Error("connection refused")) },
      { getBlockNumber: jest.fn().mockResolvedValue(456n) },
    );

    const provider = await keeperLogic.getWorkingProvider();

    expect(providerConstructed[0].getBlockNumber).toHaveBeenCalled();
    expect(providerConstructed[1].getBlockNumber).toHaveBeenCalled();
    expect((provider as any)._casfinRpcUrl).toBe("https://secondary.example");
  });

  it("processes all 3 games in sequence (coinflip, dice, crash)", async () => {
    const keeperLogic = await loadKeeperLogic({
      ENCRYPTED_COIN_FLIP_ADDRESS: COIN_FLIP_ADDRESS,
      ENCRYPTED_DICE_GAME_ADDRESS: DICE_ADDRESS,
      ENCRYPTED_CRASH_GAME_ADDRESS: CRASH_ADDRESS,
    });

    contractRegistry.set(TASK_MANAGER_ADDRESS, {
      getDecryptResultSafe: jest.fn().mockResolvedValue([1n, true]),
    });

    const coinFlip = {
      nextBetId: jest.fn().mockResolvedValue(1n),
      bets: jest.fn().mockResolvedValue(makeBet({ resolved: false, resolutionPending: false })),
      requestResolution: jest.fn().mockResolvedValue({ hash: "0xcoin" }),
    };
    const dice = {
      nextBetId: jest.fn().mockResolvedValue(1n),
      bets: jest.fn().mockResolvedValue(makeBet({ resolved: false, resolutionPending: true, pendingWonFlag: "0x12" })),
      finalizeResolution: jest.fn().mockResolvedValue({ hash: "0xdice" }),
    };
    const crash = {
      nextRoundId: jest.fn().mockResolvedValue(1n),
      rounds: jest.fn().mockResolvedValue(makeRound({ exists: true, closeRequested: false, closed: false })),
      closeRound: jest.fn().mockResolvedValue({ hash: "0xcrash" }),
    };

    contractRegistry.set(COIN_FLIP_ADDRESS, coinFlip);
    contractRegistry.set(DICE_ADDRESS, dice);
    contractRegistry.set(CRASH_ADDRESS, crash);

    const cloudWatch = { putMetricData: jest.fn().mockResolvedValue(undefined) };
    keeperLogic.keeperDeps.createCloudWatchClient = jest.fn(() => cloudWatch);

    await keeperLogic.runKeeperTick({ keeperKey: "0xabc" });

    expect(coinFlip.requestResolution).toHaveBeenCalledWith(0n);
    expect(dice.finalizeResolution).toHaveBeenCalledWith(0n);
    expect(crash.closeRound).toHaveBeenCalledWith(0n);
  });

  it("emits CloudWatch metric after successful execution", async () => {
    const keeperLogic = await loadKeeperLogic();
    const cloudWatch = { putMetricData: jest.fn().mockResolvedValue(undefined) };
    keeperLogic.keeperDeps.createCloudWatchClient = jest.fn(() => cloudWatch);

    await keeperLogic.runKeeperTick({ keeperKey: "0xabc" });

    expect(cloudWatch.putMetricData).toHaveBeenCalledWith({
      Namespace: "CasFin/Keeper",
      MetricData: [
        {
          MetricName: "ExecutionComplete",
          Unit: "Count",
          Value: 1,
        },
      ],
    });
  });

  it("logs warning and skips finalize when TN is down", async () => {
    const keeperLogic = await loadKeeperLogic();
    contractRegistry.set(TASK_MANAGER_ADDRESS, {
      getDecryptResultSafe: jest.fn().mockResolvedValue([0n, false]),
    });

    const logs: string[] = [];
    const game = {
      nextBetId: jest.fn().mockResolvedValue(1n),
      bets: jest.fn().mockResolvedValue(makeBet({ resolved: false, resolutionPending: true, pendingWonFlag: "0x13" })),
      requestResolution: jest.fn(),
      finalizeResolution: jest.fn(),
    };

    await keeperLogic.processEncryptedBets("CoinFlip", game as any, logs, defaultProvider() as any, Date.now() + 1000);

    expect(game.finalizeResolution).not.toHaveBeenCalled();
    expect(logs.some((line) => line.includes("Threshold Network may be down"))).toBe(true);
  });
});
