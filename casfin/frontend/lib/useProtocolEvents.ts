"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Shape of a protocol event received through the SSE stream.
 * Covers bet resolutions, crash rounds, market changes, and vault events.
 */
export interface ProtocolEvent {
  type:
    | "bet:resolved"
    | "crash:round_closed"
    | "crash:round_finalized"
    | "market:resolved"
    | "market:finalized"
    | "vault:paused"
    | string;
  game?: "coinflip" | "dice" | "crash";
  betId?: string;
  roundId?: string;
  player?: string;
  market?: string;
  action?: string;
  txHash?: string;
  timestamp?: number;
}

interface UseProtocolEventsOptions {
  /** If set, only receive bet events for this player address. */
  player?: string;
  /** Whether the hook should be active. Default: true. */
  enabled?: boolean;
}

const MIN_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * React hook that connects to the `/api/events/bets` SSE endpoint
 * and calls `onEvent` every time a protocol event arrives (bet settlement,
 * market resolution, crash round close, vault pause, etc.).
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1s → 2s → 4s → max 30s)
 * - Pauses when the browser tab is hidden
 * - Refreshes protocol state when tab becomes visible
 * - Cleans up on unmount
 */
export function useProtocolEvents(
  onEvent: (event: ProtocolEvent) => void,
  options: UseProtocolEventsOptions = {}
) {
  const { player, enabled = true } = options;
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

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
      console.log("[useProtocolEvents] SSE connected to Redis stream.");
      reconnectAttemptRef.current = 0;
    });

    source.addEventListener("bet", (event) => {
      try {
        const data = JSON.parse(event.data) as ProtocolEvent;
        callbackRef.current(data);
      } catch (err) {
        console.warn("[useProtocolEvents] Failed to parse event:", err);
      }
    });

    source.addEventListener("error", () => {
      console.warn("[useProtocolEvents] SSE connection lost. Scheduling reconnect.");
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

    console.log(`[useProtocolEvents] Reconnecting in ${delay}ms (attempt ${attempt + 1})`);

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
    // AND trigger a synthetic event to refresh stale state
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (!eventSourceRef.current) {
          reconnectAttemptRef.current = 0;
          connect();
        }
        // Always refresh protocol state when tab becomes visible
        // to catch events that may have been missed while hidden
        callbackRef.current({ type: "visibility:restored", timestamp: Math.floor(Date.now() / 1_000) });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cleanup();
    };
  }, [enabled, connect, cleanup]);
}

// Re-export the old interface for backward compatibility
export type BetEvent = ProtocolEvent;
export const useBetEvents = useProtocolEvents;
