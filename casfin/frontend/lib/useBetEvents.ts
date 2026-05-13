"use client";

/**
 * @deprecated Use `useProtocolEvents` from `@/lib/useProtocolEvents` instead.
 * This re-export exists for backward compatibility.
 */
export { useProtocolEvents as useBetEvents } from "./useProtocolEvents";
export type { ProtocolEvent as BetEvent } from "./useProtocolEvents";
