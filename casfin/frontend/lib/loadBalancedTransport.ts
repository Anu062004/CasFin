import { ethers, type JsonRpcPayload, type JsonRpcResult } from "ethers";
import { custom } from "viem";

const RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_1,
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_2,
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_3,
  process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_4
].filter(Boolean) as string[];

const MISSING = RPC_ENDPOINTS.filter(
  (url) => !url || !url.startsWith("https://arb-sepolia.g.alchemy.com")
);
if (MISSING.length > 0 || RPC_ENDPOINTS.length < 4) {
  console.error(
    "❌ BROKEN RPC CONFIG — Variables not loaded from Vercel env.",
    "\nExpected: https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY",
    "\nGot:",
    RPC_ENDPOINTS
  );
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;
const THROTTLE_COOLDOWN_MS = 30_000;
const SERVER_ERROR_COOLDOWN_MS = 10_000;
const ALL_DEAD_ERROR_MESSAGE =
  "All Alchemy keys returning 403. Go to dashboard.alchemy.com → verify each app is set to Chain: Arbitrum, Network: Arbitrum Sepolia. Then update NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_1..4 in Vercel.";
const ALL_COOLING_ERROR_MESSAGE = "All RPC endpoints throttled. Retry in 30 seconds.";
const BACKUP_RPC_ERROR_MESSAGE = "RPC error — retrying with backup endpoint";
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

type EndpointHealth = {
  dead: boolean;
  coolingUntil: number;
};

let currentRpcIndex = 0;
let activeRpcIndex: number | null = null;
const endpointHealth: EndpointHealth[] = RPC_ENDPOINTS.map(() => ({
  dead: false,
  coolingUntil: 0
}));

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
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

function isInternalRpcError(error: JsonRpcErrorObject): boolean {
  return toErrorCode(error.code) === -32603;
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
  const state = endpointHealth[index];

  if (!state) {
    return false;
  }

  const until = state.coolingUntil;

  if (!until) {
    return false;
  }

  if (Date.now() >= until) {
    state.coolingUntil = 0;
    return false;
  }

  return true;
}

function markCooling(index: number, durationMs: number) {
  const state = endpointHealth[index];
  if (!state) {
    return;
  }

  state.coolingUntil = Date.now() + durationMs;
}

function markDead(index: number) {
  const state = endpointHealth[index];
  if (!state) {
    return;
  }

  state.dead = true;
  state.coolingUntil = 0;
}

function areAllEndpointsDead(): boolean {
  return endpointHealth.length > 0 && endpointHealth.every((state) => state.dead);
}

function areAllActiveEndpointsCooling(): boolean {
  const activeIndexes = endpointHealth
    .map((state, index) => ({ state, index }))
    .filter(({ state }) => !state.dead)
    .map(({ index }) => index);

  if (activeIndexes.length === 0) {
    return false;
  }

  return activeIndexes.every((index) => isCoolingDown(index));
}

function selectNextHealthyRpcIndex(): number | null {
  const total = RPC_ENDPOINTS.length;
  if (total === 0) {
    return null;
  }

  const start = currentRpcIndex % total;

  for (let offset = 0; offset < total; offset += 1) {
    const index = (start + offset) % total;
    const state = endpointHealth[index];

    if (!state || state.dead || isCoolingDown(index)) {
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
  if (total === 0) {
    return null;
  }

  const start = currentRpcIndex % total;

  for (let offset = 0; offset < total; offset += 1) {
    const index = (start + offset) % total;
    const state = endpointHealth[index];
    if (state && !state.dead && !isCoolingDown(index)) {
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

  return RPC_ENDPOINTS[currentRpcIndex % RPC_ENDPOINTS.length] || "";
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
    internalRpcError: errors.some(isInternalRpcError)
  };
}

export async function sendRpcRequest(body: unknown): Promise<Response> {
  if (RPC_ENDPOINTS.length === 0) {
    console.error("[loadBalanced] All endpoints are exhausted.");
    throw new Error(NETWORK_BUSY_MESSAGE);
  }

  const endpoint500RetryCount = new Map<number, number>();
  let lastError: unknown = null;

  for (let retry = 0; retry <= MAX_RETRIES; retry += 1) {
    if (areAllEndpointsDead()) {
      console.error("[loadBalanced] All endpoints are exhausted.");
      throw new Error(ALL_DEAD_ERROR_MESSAGE);
    }

    if (areAllActiveEndpointsCooling()) {
      console.error("[loadBalanced] All endpoints are exhausted.");
      throw new Error(ALL_COOLING_ERROR_MESSAGE);
    }

    const index = selectNextHealthyRpcIndex();

    if (index === null) {
      if (areAllEndpointsDead()) {
        console.error("[loadBalanced] All endpoints are exhausted.");
        throw new Error(ALL_DEAD_ERROR_MESSAGE);
      }

      if (areAllActiveEndpointsCooling()) {
        console.error("[loadBalanced] All endpoints are exhausted.");
        throw new Error(ALL_COOLING_ERROR_MESSAGE);
      }

      console.error("[loadBalanced] All endpoints are exhausted.");
      throw new Error(NETWORK_BUSY_MESSAGE);
    }

    const url = RPC_ENDPOINTS[index];

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (response.status === 403) {
        markDead(index);
        if (areAllEndpointsDead()) {
          console.error("[loadBalanced] All endpoints are exhausted.");
          throw new Error(ALL_DEAD_ERROR_MESSAGE);
        }
        continue;
      }

      if (response.status === 429) {
        console.warn(`[loadBalanced] 429 throttled endpoint: ${url}`);
        markCooling(index, THROTTLE_COOLDOWN_MS);

        if (retry < MAX_RETRIES) {
          await delay(getBackoffMs(retry));
          continue;
        }

        if (areAllActiveEndpointsCooling()) {
          console.error("[loadBalanced] All endpoints are exhausted.");
          throw new Error(ALL_COOLING_ERROR_MESSAGE);
        }

        continue;
      }

      if (response.status === 500) {
        const retriesForEndpoint = endpoint500RetryCount.get(index) ?? 0;

        if (retriesForEndpoint < 1 && retry < MAX_RETRIES) {
          endpoint500RetryCount.set(index, retriesForEndpoint + 1);
          currentRpcIndex = index;
          await delay(getBackoffMs(retry));
          continue;
        }

        markCooling(index, SERVER_ERROR_COOLDOWN_MS);

        if (retry < MAX_RETRIES) {
          await delay(getBackoffMs(retry));
          continue;
        }

        lastError = new Error(`RPC endpoint returned HTTP 500: ${url}`);
        continue;
      }

      const inspection = await inspectResponseForRetryableErrors(response);

      if (inspection.rateLimited) {
        console.warn(`[loadBalanced] 429 throttled endpoint: ${url}`);
        markCooling(index, THROTTLE_COOLDOWN_MS);

        if (areAllActiveEndpointsCooling()) {
          console.error("[loadBalanced] All endpoints are exhausted.");
          throw new Error(ALL_COOLING_ERROR_MESSAGE);
        }

        if (retry < MAX_RETRIES) {
          await delay(getBackoffMs(retry));
          continue;
        }

        continue;
      }

      if (inspection.internalRpcError) {
        throw new Error(BACKUP_RPC_ERROR_MESSAGE);
      }

      return response;
    } catch (error) {
      lastError = error;

      if (error instanceof Error && error.message === BACKUP_RPC_ERROR_MESSAGE) {
        if (retry < MAX_RETRIES) {
          await delay(getBackoffMs(retry));
          continue;
        }

        throw error;
      }

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

  if (areAllEndpointsDead()) {
    console.error("[loadBalanced] All endpoints are exhausted.");
    throw new Error(ALL_DEAD_ERROR_MESSAGE);
  }

  if (areAllActiveEndpointsCooling()) {
    console.error("[loadBalanced] All endpoints are exhausted.");
    throw new Error(ALL_COOLING_ERROR_MESSAGE);
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

