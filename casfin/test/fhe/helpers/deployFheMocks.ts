import { artifacts, ethers, network } from "hardhat";
import type { BaseContract, Signer } from "ethers";

const TASK_MANAGER_ADDRESS = "0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9";

export const FHE_TYPES = {
  bool: 0,
  uint8: 2,
  uint32: 4,
  uint128: 6,
} as const;

export type EncryptedInput = {
  ctHash: bigint;
  securityZone: number;
  utype: number;
  signature: string;
};

export type MockFheEnvironment = {
  taskManager: BaseContract;
  acl: BaseContract;
};

function toHandle(value: bigint | string): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

async function getRuntimeBytecode(contractName: string): Promise<string> {
  const artifact = await artifacts.readArtifact(contractName);
  return artifact.deployedBytecode;
}

async function getDefaultSigner(): Promise<Signer> {
  const [signer] = await ethers.getSigners();
  return signer;
}

async function getTaskManager() {
  return ethers.getContractAt("MockTaskManager", TASK_MANAGER_ADDRESS);
}

async function buildEncryptedInput(
  value: bigint,
  utype: number,
  signer?: Signer,
  makePublic = true,
): Promise<EncryptedInput> {
  const taskManager = await getTaskManager() as any;
  const effectiveSigner = signer ?? (await getDefaultSigner());
  const account = await effectiveSigner.getAddress();
  const handle = await taskManager.nextHandle();

  await (await taskManager.connect(effectiveSigner).MOCK_encrypt(value, utype, account, makePublic)).wait();

  return {
    ctHash: handle,
    securityZone: 0,
    utype,
    signature: "0x",
  };
}

export async function deployMockFheEnvironment(): Promise<MockFheEnvironment> {
  const signer = await getDefaultSigner();
  const taskManagerRuntime = await getRuntimeBytecode("MockTaskManager");

  await network.provider.send("hardhat_setCode", [TASK_MANAGER_ADDRESS, taskManagerRuntime]);

  const taskManager = await getTaskManager();
  await (await taskManager.initialize(await signer.getAddress())).wait();

  const aclFactory = await ethers.getContractFactory("MockACL");
  const acl = await aclFactory.deploy();
  await acl.waitForDeployment();

  await (await taskManager.setACLContract(await acl.getAddress())).wait();

  return { taskManager, acl };
}

export async function mockEncrypt(value: bigint): Promise<bigint> {
  const input = await buildEncryptedInput(value, FHE_TYPES.uint128);
  return input.ctHash;
}

export async function mockEncryptUint128Input(value: bigint, signer?: Signer): Promise<EncryptedInput> {
  return buildEncryptedInput(value, FHE_TYPES.uint128, signer);
}

export async function mockEncryptUint32Input(value: bigint, signer?: Signer): Promise<EncryptedInput> {
  return buildEncryptedInput(value, FHE_TYPES.uint32, signer);
}

export async function mockEncryptUint8Input(value: bigint, signer?: Signer): Promise<EncryptedInput> {
  return buildEncryptedInput(value, FHE_TYPES.uint8, signer);
}

export async function mockEncryptBoolInput(value: boolean, signer?: Signer): Promise<EncryptedInput> {
  return buildEncryptedInput(value ? 1n : 0n, FHE_TYPES.bool, signer);
}

export async function mockDecrypt(handle: bigint): Promise<bigint> {
  const taskManager = await getTaskManager() as any;
  await (await taskManager.MOCK_resolveDecrypt(handle)).wait();
  return toHandle(await taskManager.mockStorage(handle));
}

export async function mockResolveDecrypt(handle: bigint): Promise<void> {
  const taskManager = await getTaskManager() as any;
  await (await taskManager.MOCK_resolveDecrypt(handle)).wait();
}

export async function mockSetPlaintext(handle: bigint, value: bigint): Promise<void> {
  const taskManager = await getTaskManager() as any;
  await (await taskManager.MOCK_setHandleValue(handle, value)).wait();
}

export async function readPlaintext(handle: bigint | string): Promise<bigint> {
  const taskManager = await getTaskManager();
  return toHandle(await taskManager.mockStorage(toHandle(handle)));
}

export async function readDecryptResult(handle: bigint | string): Promise<{ value: bigint; ready: boolean }> {
  const taskManager = await getTaskManager();
  const [value, ready] = await taskManager.getDecryptResultSafe(toHandle(handle));
  return { value: toHandle(value), ready };
}

export function asHandle(value: bigint | string): bigint {
  return toHandle(value);
}

export { TASK_MANAGER_ADDRESS };
