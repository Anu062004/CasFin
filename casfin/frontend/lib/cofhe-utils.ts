import { ethers } from "ethers";

type CofheEncryptedInputObject = {
  ctHash: bigint | string | number;
  securityZone: bigint | string | number;
  utype: bigint | string | number;
  signature: string | Uint8Array;
};

export type CofheEncryptedInputLike =
  | readonly [bigint | string | number, bigint | string | number, bigint | string | number, string | Uint8Array]
  | CofheEncryptedInputObject;

export type SolidityEncryptedInputTuple = readonly [bigint, number, number, string];

function isEncryptedInputObject(input: CofheEncryptedInputLike): input is CofheEncryptedInputObject {
  return !Array.isArray(input);
}

export function toEncryptedInputTuple(input: CofheEncryptedInputLike): SolidityEncryptedInputTuple {
  if (Array.isArray(input)) {
    const [ctHash, securityZone, utype, signature] = input;

    return [
      ethers.toBigInt(ctHash),
      Number(securityZone),
      Number(utype),
      typeof signature === "string" ? signature : ethers.hexlify(signature)
    ] as const;
  }

  if (!isEncryptedInputObject(input)) {
    throw new Error("Encrypted CoFHE input must be an object or tuple.");
  }

  if (
    input == null
    || input.ctHash == null
    || input.securityZone == null
    || input.utype == null
    || input.signature == null
  ) {
    throw new Error("Encrypted CoFHE input is missing one or more required tuple fields.");
  }

  return [
    ethers.toBigInt(input.ctHash),
    Number(input.securityZone),
    Number(input.utype),
    typeof input.signature === "string" ? input.signature : ethers.hexlify(input.signature)
  ] as const;
}

export function toEncryptedInputTuples(inputs: CofheEncryptedInputLike[]): SolidityEncryptedInputTuple[] {
  return inputs.map(toEncryptedInputTuple);
}
