import { ethers } from "ethers";
import { custom } from "viem";

const DEFAULT_RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";

const RPC_URLS = [
  process.env.NEXT_PUBLIC_RPC_URL_1 || process.env.NEXT_PUBLIC_READ_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC_URL,
  process.env.NEXT_PUBLIC_RPC_URL_2 || process.env.NEXT_PUBLIC_FHE_RPC_URL || "",
  process.env.NEXT_PUBLIC_RPC_URL_3 || process.env.NEXT_PUBLIC_POLLING_RPC_URL || "",
  process.env.NEXT_PUBLIC_RPC_URL_4 || process.env.NEXT_PUBLIC_WALLET_RPC_URL || ""
]
  .filter(Boolean)
  .filter((url, index, urls) => urls.indexOf(url) === index);

let rpcIndex = 0;

function getRpcUrls() {
  return RPC_URLS.length > 0 ? RPC_URLS : [DEFAULT_RPC_URL];
}

function nextRpcUrl() {
  const urls = getRpcUrls();
  return urls[rpcIndex++ % urls.length];
}

function isRateLimitedResponse(response: any) {
  const errorCode = response?.error?.code;
  const errorMessage = String(response?.error?.message || "");

  return errorCode === -32005 || /too many requests|rate limit|429/i.test(errorMessage);
}

async function fetchJsonRpc(url: string, payload: any) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (response.status === 429) {
    return [{ error: { code: -32005, message: "HTTP 429 Too Many Requests" } }];
  }

  const text = await response.text();
  return JSON.parse(text);
}

function normalizeJsonRpcBatch(json: any) {
  return Array.isArray(json) ? json : [json];
}

function createRpcError(response: any) {
  const error = new Error(response?.error?.message || "JSON-RPC request failed.");
  Object.assign(error, {
    code: response?.error?.code,
    data: response?.error?.data
  });
  return error;
}

export const loadBalancedTransport = custom({
  async request({ method, params }) {
    const urls = getRpcUrls();
    let lastError: unknown = null;

    for (let attempt = 0; attempt < urls.length; attempt += 1) {
      const url = nextRpcUrl();

      try {
        const json = normalizeJsonRpcBatch(
          await fetchJsonRpc(url, {
            jsonrpc: "2.0",
            id: Date.now(),
            method,
            params
          })
        )[0];

        if (isRateLimitedResponse(json)) {
          console.warn(`[loadBalanced] RPC ${url} rate limited, rotating...`);
          lastError = createRpcError(json);
          continue;
        }

        if (json?.error) {
          throw createRpcError(json);
        }

        return json?.result;
      } catch (error) {
        lastError = error;
        console.warn(`[loadBalanced] RPC ${url} failed:`, error);
      }
    }

    throw lastError || new Error("[loadBalanced] All RPC endpoints failed or rate limited.");
  }
});

class LoadBalancedJsonRpcProvider extends ethers.JsonRpcProvider {
  constructor(network: { chainId: number; name: string }) {
    super(getRpcUrls()[0], network, {
      staticNetwork: true,
      batchMaxCount: 1,
      batchStallTime: 0
    });
  }

  async _send(payload: any) {
    const urls = getRpcUrls();
    let lastError: unknown = null;

    for (let attempt = 0; attempt < urls.length; attempt += 1) {
      const url = nextRpcUrl();

      try {
        const responses = normalizeJsonRpcBatch(await fetchJsonRpc(url, payload));

        if (responses.some(isRateLimitedResponse)) {
          console.warn(`[loadBalanced] RPC ${url} rate limited, rotating...`);
          lastError = createRpcError(responses.find(isRateLimitedResponse));
          continue;
        }

        return responses;
      } catch (error) {
        lastError = error;
        console.warn(`[loadBalanced] RPC ${url} failed:`, error);
      }
    }

    throw lastError || new Error("[loadBalanced] All RPC endpoints failed or rate limited.");
  }
}

export function createLoadBalancedProvider(network: { chainId: number; name: string }) {
  return new LoadBalancedJsonRpcProvider(network);
}

export function getLoadBalancedRpcUrls() {
  return [...getRpcUrls()];
}
