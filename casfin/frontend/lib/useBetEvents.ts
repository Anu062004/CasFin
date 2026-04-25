"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Shape of a bet resolution event received through the SSE stream.
 */
export interface BetEvent {
  game: "coinflip" | "dice" | "crash";
  betId: string;
  roundId?: string;
  player: string;
  action: "resolved";
  txHash: string;
  timestamp: number;
}

interface UseBetEventsOptions {
  /** If set, only receive events for this player address. */
  player?: string;
  /** Whether the hook should be active. Default: true. */
  enabled?: boolean;
}

const MIN_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * React hook that connects to the `/api/events/bets` SSE endpoint
 * and calls `onBetResolved` every time a bet settlement event arrives.
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1s → 2s → 4s → max 30s)
 * - Pauses when the browser tab is hidden
 * - Cleans up on unmount
 */
export function useBetEvents(
  onBetResolved: (event: BetEvent) => void,
  options: UseBetEventsOptions = {}
) {
  const { player, enabled = true } = options;
  const callbackRef = useRef(onBetResolved);
  callbackRef.current = onBetResolved;

  const reconnectAttemptRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();

    const params = new URLSearchParams();
    if (player) {
      params.set("player", player);
    }

    const queryString = params.toString();
    const url = `/api/events/bets${queryString ? `?${queryString}` : ""}`;

    const source = new EventSource(url);
    eventSourceRef.current = source;

    source.addEventListener("connected", () => {
      console.log("[useBetEvents] SSE connected to Redis stream.");
      reconnectAttemptRef.current = 0;
    });

    source.addEventListener("bet", (event) => {
      try {
        const data = JSON.parse(event.data) as BetEvent;
        callbackRef.current(data);
      } catch (err) {
        console.warn("[useBetEvents] Failed to parse bet event:", err);
      }
    });

    source.addEventListener("error", () => {
      console.warn("[useBetEvents] SSE connection lost. Scheduling reconnect.");
      source.close();
      eventSourceRef.current = null;
      scheduleReconnect();
    });
  }, [player, cleanup]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;

    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(
      MIN_RECONNECT_DELAY_MS * Math.pow(2, attempt),
      MAX_RECONNECT_DELAY_MS
    );

    reconnectAttemptRef.current = attempt + 1;

    console.log(`[useBetEvents] Reconnecting in ${delay}ms (attempt ${attempt + 1})`);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (!document.hidden) {
        connect();
      }
    }, delay);
  }, [connect]);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    connect();

    // Reconnect when tab becomes visible after being hidden
    const handleVisibilityChange = () => {
      if (!document.hidden && !eventSourceRef.current) {
        reconnectAttemptRef.current = 0;
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cleanup();
    };
  }, [enabled, connect, cleanup]);
}
