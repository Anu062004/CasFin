import initTfhe, { init_panic_hook } from "tfhe";

type CofheClientLike = {
  connected?: boolean;
} | null | undefined;

let tfheRuntimePromise: Promise<void> | null = null;

export async function initializeTfheRuntime() {
  if (!tfheRuntimePromise) {
    tfheRuntimePromise = (async () => {
      await initTfhe({});
      await init_panic_hook();
    })().catch((error) => {
      tfheRuntimePromise = null;
      throw error;
    });
  }

  return tfheRuntimePromise;
}

export async function waitForCofheReady(cofheClient: CofheClientLike, timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();

  while (!cofheClient?.connected) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("CoFHE client failed to initialize within timeout.");
    }

    await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
}

export function disableWorkerIfAvailable<TBuilder extends { setUseWorker?: (enabled: boolean) => TBuilder }>(builder: TBuilder) {
  if (typeof builder?.setUseWorker === "function") {
    builder.setUseWorker(false);
  }

  return builder;
}
