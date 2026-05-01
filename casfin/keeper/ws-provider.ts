import { ethers } from "ethers";

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const STABLE_CONNECTION_THRESHOLD_MS = 5_000;

/**
 * Manages a WebSocketProvider that auto-reconnects on close/error.
 * setupListeners is called each time a fresh provider is created so all
 * contract.on() subscriptions are re-attached after a reconnect.
 */
export async function startResilientWssSubscriptions(
  wssUrl: string,
  signal: AbortSignal,
  setupListeners: (provider: ethers.WebSocketProvider) => void
): Promise<void> {
  let backoffMs = BACKOFF_INITIAL_MS;

  while (!signal.aborted) {
    const connectedAt = Date.now();
    const provider = new ethers.WebSocketProvider(wssUrl);

    try {
      setupListeners(provider);
    } catch (err) {
      console.warn("[WSS] setupListeners failed:", err);
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      // Tear down immediately on shutdown.
      const onAbort = () => {
        provider.destroy();
        settle();
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // Guard against signal already being aborted before listener was added.
      if (signal.aborted) {
        onAbort();
        return;
      }

      // ws package emits "close" on the underlying socket after any disconnect.
      const ws = (provider as any)._websocket ?? (provider as any).websocket;
      if (ws && typeof ws.on === "function") {
        ws.on("close", () => {
          signal.removeEventListener("abort", onAbort);
          provider.destroy();
          settle();
        });
        ws.on("error", (err: unknown) => {
          console.warn("[WSS] socket error:", err);
          // "close" always follows "error" in the ws package; no need to settle here.
        });
      } else {
        // Fallback for environments without direct ws access: poll every 5 s.
        const interval = setInterval(() => {
          if (signal.aborted) {
            clearInterval(interval);
            signal.removeEventListener("abort", onAbort);
            provider.destroy();
            settle();
          }
        }, 5_000);
      }
    });

    if (signal.aborted) break;

    const upMs = Date.now() - connectedAt;
    if (upMs >= STABLE_CONNECTION_THRESHOLD_MS) {
      backoffMs = BACKOFF_INITIAL_MS; // reset on stable connection
    }

    console.warn(`[WSS] connection closed (was up ${upMs}ms). Reconnecting in ${backoffMs}ms…`);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, backoffMs);
      const onAbort = () => { clearTimeout(timer); resolve(); };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) { onAbort(); }
    });

    backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
  }

  console.log("[WSS] subscriptions stopped.");
}
