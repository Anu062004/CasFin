import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  asHandle,
  deployMockFheEnvironment,
  mockDecrypt,
  mockEncryptBoolInput,
  mockEncryptUint128Input,
  mockResolveDecrypt,
  mockSetPlaintext,
} from "./helpers/deployFheMocks";

async function expectRevert(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
    expect.fail(`Expected revert containing "${message}"`);
  } catch (error) {
    expect((error as Error).message).to.include(message);
  }
}

describe("EncryptedCoinFlip", function () {
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let player: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let resolver: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let stranger: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let vault: any;
  let coinFlip: any;
  let taskManager: any;

  async function decryptVaultBalance(): Promise<bigint> {
    return mockDecrypt(asHandle(await vault.connect(player).getEncryptedBalance()));
  }

  async function placeBet(amountWei: bigint, guessHeads: boolean): Promise<void> {
    await (await vault.connect(player).depositETH({ value: amountWei })).wait();
    const encAmount = await mockEncryptUint128Input(amountWei, player);
    const encGuess = await mockEncryptBoolInput(guessHeads, player);
    await (await coinFlip.connect(player).placeBet(encAmount, encGuess)).wait();
  }

  beforeEach(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });

    [owner, player, resolver, stranger] = await ethers.getSigners();
    ({ taskManager } = await deployMockFheEnvironment());

    vault = await ethers.deployContract("EncryptedCasinoVault", [await owner.getAddress()]);
    await vault.waitForDeployment();

    coinFlip = await ethers.deployContract("EncryptedCoinFlip", [await owner.getAddress(), await vault.getAddress(), 200]);
    await coinFlip.waitForDeployment();

    await (await vault.connect(owner).authorizeGame(await coinFlip.getAddress(), true)).wait();
    await (await coinFlip.connect(owner).setResolver(await resolver.getAddress(), true)).wait();
  });

  it("placeBet creates bet with correct initial state", async function () {
    await placeBet(ethers.parseEther("0.01"), true);

    const bet = await coinFlip.bets(0n);

    expect(bet[0]).to.equal(await player.getAddress());
    expect(bet[4]).to.equal(false);
    expect(bet[5]).to.equal(false);
    expect(await coinFlip.nextBetId()).to.equal(1n);
  });

  it("requestResolution sets resolutionPending and creates decrypt task", async function () {
    await placeBet(ethers.parseEther("0.01"), true);

    const tx = await coinFlip.connect(resolver).requestResolution(0n);
    const receipt = await tx.wait();
    const bet = await coinFlip.bets(0n);

    const decryptTaskLogs = receipt!.logs
      .map((log: any) => {
        try {
          return taskManager.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((parsed: any) => parsed?.name === "DecryptTaskCreated");

    expect(bet[5]).to.equal(true);
    expect(decryptTaskLogs).to.have.length(1);
  });

  it("finalizeResolution for WINNING bet credits vault", async function () {
    const amountWei = ethers.parseEther("0.01");
    await placeBet(amountWei, true);
    await (await coinFlip.connect(resolver).requestResolution(0n)).wait();

    const pendingWonFlag = asHandle((await coinFlip.bets(0n))[6]);
    await mockSetPlaintext(pendingWonFlag, 1n);
    await mockResolveDecrypt(pendingWonFlag);

    await (await coinFlip.connect(resolver).finalizeResolution(0n)).wait();

    const bet = await coinFlip.bets(0n);
    expect(bet[4]).to.equal(true);
    expect(bet[7]).to.equal(true);
    expect(await decryptVaultBalance()).to.equal(ethers.parseEther("0.0196"));
  });

  it("finalizeResolution for LOSING bet returns zero", async function () {
    const amountWei = ethers.parseEther("0.01");
    await placeBet(amountWei, true);
    await (await coinFlip.connect(resolver).requestResolution(0n)).wait();

    const pendingWonFlag = asHandle((await coinFlip.bets(0n))[6]);
    await mockSetPlaintext(pendingWonFlag, 0n);
    await mockResolveDecrypt(pendingWonFlag);

    await (await coinFlip.connect(resolver).finalizeResolution(0n)).wait();

    const bet = await coinFlip.bets(0n);
    expect(bet[4]).to.equal(true);
    expect(bet[7]).to.equal(false);
    expect(await decryptVaultBalance()).to.equal(0n);
  });

  it("finalizeResolution reverts if decrypt not ready", async function () {
    await placeBet(ethers.parseEther("0.01"), true);
    await (await coinFlip.connect(resolver).requestResolution(0n)).wait();

    await expectRevert(
      coinFlip.connect(resolver).finalizeResolution(0n),
      "WIN_FLAG_PENDING",
    );
  });

  it("cannot requestResolution on already resolved bet", async function () {
    await placeBet(ethers.parseEther("0.01"), true);
    await (await coinFlip.connect(resolver).requestResolution(0n)).wait();

    const pendingWonFlag = asHandle((await coinFlip.bets(0n))[6]);
    await mockSetPlaintext(pendingWonFlag, 1n);
    await mockResolveDecrypt(pendingWonFlag);
    await (await coinFlip.connect(resolver).finalizeResolution(0n)).wait();

    await expectRevert(
      coinFlip.connect(resolver).requestResolution(0n),
      "BET_RESOLVED",
    );
  });

  it("house edge applied correctly (2% = 200 bps)", async function () {
    const amountWei = ethers.parseEther("0.1");
    await placeBet(amountWei, true);
    await (await coinFlip.connect(resolver).requestResolution(0n)).wait();

    const pendingWonFlag = asHandle((await coinFlip.bets(0n))[6]);
    await mockSetPlaintext(pendingWonFlag, 1n);
    await mockResolveDecrypt(pendingWonFlag);

    await (await coinFlip.connect(resolver).finalizeResolution(0n)).wait();

    expect(await decryptVaultBalance()).to.equal(ethers.parseEther("0.196"));
  });

  it("only authorized resolver can call requestResolution", async function () {
    await placeBet(ethers.parseEther("0.01"), true);

    await expectRevert(
      coinFlip.connect(stranger).requestResolution(0n),
      "NOT_RESOLVER",
    );
  });

  it("require(!bet.resolutionPending) - blocks duplicate requestResolution", async function () {
    await placeBet(ethers.parseEther("0.01"), true);
    await (await coinFlip.connect(resolver).requestResolution(0n)).wait();

    await expectRevert(
      coinFlip.connect(resolver).requestResolution(0n),
      "RESOLUTION_PENDING",
    );
  });

  it("placeBet with zero encrypted amount - vault returns zero handle", async function () {
    const encAmount = await mockEncryptUint128Input(0n, player);
    const encGuess = await mockEncryptBoolInput(true, player);
    await (await coinFlip.connect(player).placeBet(encAmount, encGuess)).wait();

    const bet = await coinFlip.bets(0n);
    expect(await mockDecrypt(asHandle(bet[1]))).to.equal(0n);
  });
});
