export type AutoResolveGame = "coinflip" | "dice" | "crash";

export type AutoResolvePayload = {
  game: AutoResolveGame;
  betId?: string;
  roundId?: string;
  player?: string;
};

export async function requestCasinoAutoResolve(payload: AutoResolvePayload): Promise<void> {
  const response = await fetch("/api/casino/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `Auto-resolve failed (${response.status}).`);
  }
}

export async function requestCasinoAutoResolveWithRetry(
  payload: AutoResolvePayload,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<void> {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 1_500;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await requestCasinoAutoResolve(payload);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
