import { createLoadBalancedProvider } from "@/lib/loadBalancedTransport";

export const ARBITRUM_SEPOLIA_NETWORK = {
  chainId: 421614,
  name: "arbitrum-sepolia"
} as const;

/** Browser-safe Arbitrum Sepolia provider with RPC failover (avoids single Infura 402/429 failures). */
export function createArbitrumSepoliaProvider() {
  return createLoadBalancedProvider(ARBITRUM_SEPOLIA_NETWORK);
}

export const arbitrumSepoliaProvider = createArbitrumSepoliaProvider();
