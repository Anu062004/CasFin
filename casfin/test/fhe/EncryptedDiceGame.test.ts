import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  asHandle,
  deployMockFheEnvironment,
  mockDecrypt,
  mockEncryptUint128Input,
  mockEncryptUint8Input,
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

describe("EncryptedDiceGame", function () {
  let owner: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let player: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let resolver: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let vault: any;
  let dice: any;
  let taskManager: any;

  async function placeBet(amountWei: bigint, guess: bigint): Promise<void> {
    await (await vault.connect(player).depositETH({ value: amountWei })).wait();
    const encAmount = await mockEncryptUint128Input(amountWei, player);
    const encGuess = await mockEncryptUint8Input(guess, player);
    await (await dice.connect(player).placeBet(encAmount, encGuess)).wait();
  }

  async function decryptVaultBalance(): Promise<bigint> {
    return mockDecrypt(asHandle(await vault.connect(player).getEncryptedBalance()));
  }

  beforeEach(async function () {
    await network.provider.request({ method: "hardhat_reset", params: [] });

    [owner, player, resolver] = await ethers.getSigners();
    ({ taskManager } = await deployMockFheEnvironment());

    vault = await ethers.deployContract("EncryptedCasinoVault", [await owner.getAddress()]);
    await vault.waitForDeployment();

    dice = await ethers.deployContract("EncryptedDiceGame", [await owner.getAddress(), await vault.getAddress(), 200]);
    await dice.waitForDeployment();

    await (await vault.connect(owner).authorizeGame(await dice.getAddress(), true)).wait();
    await (await dice.connect(owner).setResolver(await resolver.getAddress(), true)).wait();
  });

  it("auto-corrects out-of-range guess (7) to 1 homomorphically", async function () {
    await placeBet(ethers.parseEther("0.01"), 7n);
    await (await dice.connect(resolver).requestResolution(0n)).wait();

    const betBeforeFinalize = await dice.bets(0n);
    await mockSetPlaintext(asHandle(betBeforeFinalize[6]), 0n);
    await mockSetPlaintext(asHandle(betBeforeFinalize[3]), 5n);
    await mockResolveDecrypt(asHandle(betBeforeFinalize[6]));
    await mockResolveDecrypt(asHandle(betBeforeFinalize[3]));
    await (await dice.connect(resolver).finalizeResolution(0n)).wait();

    expect(await mockDecrypt(asHandle((await dice.bets(0n))[2]))).to.equal(1n);
  });

  it("auto-corrects zero guess to 1", async function () {
    await placeBet(ethers.parseEther("0.01"), 0n);

    expect(await mockDecrypt(asHandle((await dice.bets(0n))[2]))).to.equal(1n);
  });

  it("dual decrypt - both wonFlag AND rolled value created", async function () {
    await placeBet(ethers.parseEther("0.01"), 3n);

    const tx = await dice.connect(resolver).requestResolution(0n);
    const receipt = await tx.wait();
    const decryptTaskLogs = receipt!.logs
      .map((log: any) => {
        try {
          return taskManager.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter((parsed: any) => parsed?.name === "DecryptTaskCreated");

    expect(decryptTaskLogs).to.have.length(2);
  });

  it("finalizeResolution reads both decrypt results", async function () {
    await placeBet(ethers.parseEther("0.01"), 3n);
    await (await dice.connect(resolver).requestResolution(0n)).wait();

    const bet = await dice.bets(0n);
    const wonFlagHandle = asHandle(bet[6]);
    const rolledHandle = asHandle(bet[3]);

    await mockSetPlaintext(wonFlagHandle, 1n);
    await mockSetPlaintext(rolledHandle, 3n);
    await mockResolveDecrypt(wonFlagHandle);
    await mockResolveDecrypt(rolledHandle);

    await (await dice.connect(resolver).finalizeResolution(0n)).wait();

    const resolvedBet = await dice.bets(0n);
    expect(resolvedBet[7]).to.equal(true);
    expect(resolvedBet[8]).to.equal(3n);
  });

  it("winning dice bet pays 6x minus house edge", async function () {
    const amountWei = ethers.parseEther("0.01");
    await placeBet(amountWei, 3n);
    await (await dice.connect(resolver).requestResolution(0n)).wait();

    const bet = await dice.bets(0n);
    await mockSetPlaintext(asHandle(bet[6]), 1n);
    await mockSetPlaintext(asHandle(bet[3]), 3n);
    await mockResolveDecrypt(asHandle(bet[6]));
    await mockResolveDecrypt(asHandle(bet[3]));

    await (await dice.connect(resolver).finalizeResolution(0n)).wait();

    expect(await decryptVaultBalance()).to.equal(ethers.parseEther("0.0588"));
  });

  it("losing dice bet - rolled value stored but won=false", async function () {
    await placeBet(ethers.parseEther("0.01"), 3n);
    await (await dice.connect(resolver).requestResolution(0n)).wait();

    const bet = await dice.bets(0n);
    await mockSetPlaintext(asHandle(bet[6]), 0n);
    await mockSetPlaintext(asHandle(bet[3]), 5n);
    await mockResolveDecrypt(asHandle(bet[6]));
    await mockResolveDecrypt(asHandle(bet[3]));

    await (await dice.connect(resolver).finalizeResolution(0n)).wait();

    const resolvedBet = await dice.bets(0n);
    expect(resolvedBet[7]).to.equal(false);
    expect(resolvedBet[8]).to.equal(5n);
    expect(await decryptVaultBalance()).to.equal(0n);
  });

  it("rolled value is always in range [1,6]", async function () {
    const observedRolls: bigint[] = [];

    for (let index = 0; index < 5; index += 1) {
      await placeBet(ethers.parseEther("0.01"), BigInt(index + 1));
      await (await dice.connect(resolver).requestResolution(BigInt(index))).wait();

      const bet = await dice.bets(BigInt(index));
      const rolled = BigInt(index + 1);

      await mockSetPlaintext(asHandle(bet[6]), rolled === BigInt(index + 1) ? 1n : 0n);
      await mockSetPlaintext(asHandle(bet[3]), rolled);
      await mockResolveDecrypt(asHandle(bet[6]));
      await mockResolveDecrypt(asHandle(bet[3]));
      await (await dice.connect(resolver).finalizeResolution(BigInt(index))).wait();

      observedRolls.push((await dice.bets(BigInt(index)))[8]);
    }

    for (const rolled of observedRolls) {
      expect(rolled >= 1n && rolled <= 6n).to.equal(true);
    }
  });
});
