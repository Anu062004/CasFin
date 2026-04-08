import { ethers, type JsonRpcPayload, type JsonRpcResult } from "ethers";
import { custom } from "viem";

const ALCHEMY_URL_1 = "https://arb-sepolia.g.alchemy.com/v2/RUD3GCfgGKQp7P72Erk4I";
const ALCHEMY_URL_2 = "https://arb-sepolia.g.alchemy.com/v2/uCs7eGpjojBGArvRbHp6R";
const ALCHEMY_URL_3 = "https://arb-sepolia.g.alchemy.com/v2/nyDzDlRhwlmT5EEDYPptVofrMsqH78G5";
const ALCHEMY_URL_4 = "https://arb-sepolia.g.alchemy.com/v2/nyDzDlRhwlmT5EEDYPptVofrMsqH78G5";

const RPC_ENDPOINTS = [ALCHEMY_URL_1, ALCHEMY_URL_2, ALCHEMY_URL_3, ALCHEMY_URL_4] as const;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const COOLDOWN_MS = 30_000;
const NETWORK_BUSY_MESSAGE = "Network is busy, please try again shortly.";

type JsonRpcErrorObject = {
  code?: number | string;
  message?: string;
  data?: unknown;
};

type JsonRpcResponseObject = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: JsonRpcErrorObject;
};

let currentRpcIndex = 0;
let activeRpcIndex: number | null = null;
const cooldownUntilByIndex = new Map<number, number>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toErrorCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRateLimitedError(error: JsonRpcErrorObject): boolean {
  const code = toErrorCode(error.code);
  const message = typeof error.message === "string" ? error.message : "";
  return code === -32005 || /too many requests|rate limit|429/i.test(message);
}

function extractRpcErrors(payload: unknown): JsonRpcErrorObject[] {
  if (Array.isArray(payload)) {
    return payload
      .map((entry) => (isObject(entry) && isObject(entry.error) ? (entry.error as JsonRpcErrorObject) : null))
      .filter((entry): entry is JsonRpcErrorObject => entry !== null);
  }

  if (isObject(payload) && isObject(payload.error)) {
    return [payload.error as JsonRpcErrorObject];
  }

  return [];
}

function getBackoffMs(retryNumber: number): number {
  return BASE_BACKOFF_MS * 2 ** retryNumber;
}

function isCoolingDown(index: number): boolean {
  const until = cooldownUntilByIndex.get(index);

  if (!until) {
    return false;
  }

  if (Date.now() >= until) {
    cooldownUntilByIndex.delete(index);
    return false;
  }

  return true;
}

function markCooldown(index: number) {
  cooldownUntilByIndex.set(index, Date.now() + COOLDOWN_MS);
}

function selectNextHealthyRpcIndex(): number | null {
  const total = RPC_ENDPOINTS.length;
  const start = currentRpcIndex % total;

  for (let offset = 0; offset < total; offset += 1) {
    const index = (start + offset) % total;

    if (isCoolingDown(index)) {
      continue;
    }

    currentRpcIndex = (index + 1) % total;

    if (activeRpcIndex !== index) {
      console.info(`[loadBalanced] Switching endpoint to ${RPC_ENDPOINTS[index]}`);
      activeRpcIndex = index;
    }

    return index;
  }

  return null;
}

function getHealthyRpcIndex(): number | null {
  const total = RPC_ENDPOINTS.length;
  const start = currentRpcIndex % total;

  for (let offset = 0; offset < total; offset += 1) {
    const index = (start + offset) % total;
    if (!isCoolingDown(index)) {
      return index;
    }
  }

  return null;
}

export function getHealthyRpc(): string {
  const index = getHealthyRpcIndex();
  if (index !== null) {
    return RPC_ENDPOINTS[index];
  }

  return RPC_ENDPOINTS[currentRpcIndex % RPC_ENDPOINTS.length];
}

async function inspectResponseForRetryableErrors(response: Response): Promise<{
  rateLimited: boolean;
  internalRpcError: boolean;
}> {
  let payload: unknown;

  try {
    payload = await response.clone().json();
  } catch {
    return { rateLimited: false, internalRpcError: false };
  }

  const errors = extractRpcErrors(payload);
  return {
    rateLimited: errors.some(isRateLimitedError),
    internalRpcError: errors.some((error) => toErrorCode(error.code) === -32603)
  };
}

export async function sendRpcRequest(body: unknown): Promise<Response> {
  const throttledIndexes = new Set<number>();
  let lastError: unknown = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry += 1) {
    const index = selectNextHealthyRpcIndex();

    if (index === null) {
      console.error("[loadBalanced] All endpoints are cooling down.");
      throw new Error(NETWORK_BUSY_MESSAGE);
    }

    const url = RPC_ENDPOINTS[index];

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (response.status === 429) {
        markCooldown(index);
        throttledIndexes.add(index);
        console.warn(`[loadBalanced] 429 throttled endpoint: ${url}`);

        if (throttledIndexes.size >= RPC_ENDPOINTS.length) {
          console.error("[loadBalanced] All endpoints returned 429.");
          throw new Error(NETWORK_BUSY_MESSAGE);
        }

        if (retry < MAX_RETRIES) {
          await delay(getBackoffMs(retry));
          continue;
        }
      } else {
        const inspection = await inspectResponseForRetryableErrors(response);

        if (inspection.rateLimited) {
          markCooldown(index);
          throttledIndexes.add(index);
          console.warn(`[loadBalanced] 429-style RPC throttling from endpoint: ${url}`);

          if (throttledIndexes.size >= RPC_ENDPOINTS.length) {
            console.error("[loadBalanced] All endpoints returned 429.");
            throw new Error(NETWORK_BUSY_MESSAGE);
          }

          if (retry < MAX_RETRIES) {
            await delay(getBackoffMs(retry));
            continue;
          }
        }

        if (inspection.internalRpcError) {
          throw new Error("RPC error \u2014 retrying with backup endpoint");
        }

        return response;
      }
    } catch (error) {
      lastError = error;

      if (retry < MAX_RETRIES) {
        await delay(getBackoffMs(retry));
        continue;
      }

      throw error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(NETWORK_BUSY_MESSAGE);
}

function normalizeJsonRpcBatch(json: unknown): JsonRpcResponseObject[] {
  if (Array.isArray(json)) {
    return json.filter(isObject) as JsonRpcResponseObject[];
  }

  if (isObject(json)) {
    return [json as JsonRpcResponseObject];
  }

  return [];
}

function createRpcError(errorObject: JsonRpcErrorObject) {
  const error = new Error(errorObject.message || "JSON-RPC request failed.");
  Object.assign(error, {
    code: toErrorCode(errorObject.code),
    data: errorObject.data
  });
  return error;
}

export const loadBalancedTransport = custom({
  async request({ method, params }) {
    const response = await sendRpcRequest({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    });
    const json: unknown = await response.json();
    const [first] = normalizeJsonRpcBatch(json);

    if (first?.error) {
      throw createRpcError(first.error);
    }

    return first?.result;
  }
});

class LoadBalancedJsonRpcProvider extends ethers.JsonRpcProvider {
  constructor(network: { chainId: number; name: string }) {
    super(getHealthyRpc(), network, {
      staticNetwork: true,
      batchMaxCount: 1,
      batchStallTime: 0
    });
  }

  async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    const response = await sendRpcRequest(payload);
    const json: unknown = await response.json();
    const batch = normalizeJsonRpcBatch(json);

    return batch.map((entry) => {
      if (entry.error) {
        throw createRpcError(entry.error);
      }

      const numericId =
        typeof entry.id === "number"
          ? entry.id
          : typeof entry.id === "string"
            ? Number(entry.id)
            : 0;

      return {
        id: Number.isFinite(numericId) ? numericId : 0,
        result: entry.result
      };
    });
  }
}

export function createLoadBalancedProvider(network: { chainId: number; name: string }) {
  return new LoadBalancedJsonRpcProvider(network);
}

export function getLoadBalancedRpcUrls() {
  return [...RPC_ENDPOINTS];
}

