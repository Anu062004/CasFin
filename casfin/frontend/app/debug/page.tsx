"use client";

import { useState } from "react";

const EXPECTED_ALCHEMY_PREFIX = "https://arb-sepolia.g.alchemy.com";

const RPC_ENV_CONFIG = [
  {
    key: "NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_1",
    value: process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_1
  },
  {
    key: "NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_2",
    value: process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_2
  },
  {
    key: "NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_3",
    value: process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_3
  },
  {
    key: "NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_4",
    value: process.env.NEXT_PUBLIC_ALCHEMY_ARB_SEPOLIA_RPC_4
  }
] as const;

type RpcEnvKey = (typeof RPC_ENV_CONFIG)[number]["key"];

type RpcTestResult = {
  ok: boolean;
  message: string;
};

type RpcTestResults = Partial<Record<RpcEnvKey, RpcTestResult>>;

type BlockNumberResponse = {
  result?: unknown;
  error?: {
    message?: unknown;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBlockNumberResponse(value: unknown): value is BlockNumberResponse {
  return isObject(value);
}

function shortenValue(value: string): string {
  return value.length <= 40 ? value : `${value.slice(0, 40)}...`;
}

function hasExpectedPrefix(value: string | undefined): boolean {
  return Boolean(value && value.startsWith(EXPECTED_ALCHEMY_PREFIX));
}

async function testRpcEndpoint(url: string | undefined): Promise<RpcTestResult> {
  if (!url) {
    return { ok: false, message: "❌ Missing" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "eth_blockNumber",
        params: []
      })
    });

    if (!response.ok) {
      return { ok: false, message: `❌ HTTP ${response.status}` };
    }

    const payload: unknown = await response.json();
    if (!isBlockNumberResponse(payload)) {
      return { ok: false, message: "❌ Invalid JSON-RPC response" };
    }

    if (payload.error && isObject(payload.error)) {
      const message = typeof payload.error.message === "string" ? payload.error.message : "Unknown RPC error";
      return { ok: false, message: `❌ ${message}` };
    }

    if (typeof payload.result !== "string") {
      return { ok: false, message: "❌ Missing block number result" };
    }

    const blockNumber = Number.parseInt(payload.result, 16);
    if (Number.isNaN(blockNumber)) {
      return { ok: false, message: "❌ Invalid block number format" };
    }

    return { ok: true, message: `✅ Block ${blockNumber}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    return { ok: false, message: `❌ ${message}` };
  }
}

export default function DebugPage() {
  const [isTesting, setIsTesting] = useState(false);
  const [results, setResults] = useState<RpcTestResults>({});

  async function handleTestRpc() {
    setIsTesting(true);
    setResults({});

    const entries = await Promise.all(
      RPC_ENV_CONFIG.map(async ({ key, value }) => {
        const result = await testRpcEndpoint(value);
        return { key, result };
      })
    );

    const nextResults: RpcTestResults = {};
    for (const entry of entries) {
      nextResults[entry.key] = entry.result;
    }
    setResults(nextResults);
    setIsTesting(false);
  }

  return (
    <main style={{ padding: 24, color: "#e5e7eb", background: "#0b1020", minHeight: "100vh" }}>
      <h1 style={{ marginBottom: 16 }}>Arbitrum Sepolia RPC Debug</h1>

      <div style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={handleTestRpc}
          disabled={isTesting}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #374151",
            background: isTesting ? "#1f2937" : "#111827",
            color: "#f9fafb",
            cursor: isTesting ? "not-allowed" : "pointer"
          }}
        >
          {isTesting ? "Testing RPC..." : "Test RPC"}
        </button>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: "#111827",
          border: "1px solid #374151"
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #374151" }}>Variable</th>
            <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #374151" }}>Loaded Value</th>
            <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #374151" }}>Prefix Check</th>
            <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #374151" }}>RPC Test</th>
          </tr>
        </thead>
        <tbody>
          {RPC_ENV_CONFIG.map(({ key, value }) => {
            const result = results[key];
            return (
              <tr key={key}>
                <td style={{ padding: 10, borderBottom: "1px solid #1f2937" }}>{key}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #1f2937" }}>
                  {value ? shortenValue(value) : "❌ Missing"}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #1f2937" }}>
                  {hasExpectedPrefix(value) ? "✅ Valid Alchemy Arbitrum Sepolia URL" : "❌ Invalid prefix"}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #1f2937" }}>
                  {result ? result.message : "Not tested"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
