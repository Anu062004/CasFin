/**
 * Redis client utilities for CasFin pub/sub and caching.
 *
 * - `ioredis` is used for the SSE subscriber (needs persistent TCP connection for pub/sub).
 * - `@upstash/redis` is available for REST-based operations (caching, leaderboards).
 *
 * Environment variables:
 *   REDIS_URL — Redis connection string (rediss://... for TLS, redis://... for plain)
 *   UPSTASH_REDIS_REST_URL — Upstash REST endpoint
 *   UPSTASH_REDIS_REST_TOKEN — Upstash REST auth token
 */

import Redis from "ioredis";

/** The pub/sub channel the keeper publishes bet resolution events to. */
export const BET_EVENTS_CHANNEL = "casfin:bets";

/**
 * Creates a new ioredis client configured from REDIS_URL.
 * Each subscriber needs its own connection (Redis restriction),
 * so this returns a fresh instance every time.
 */
export function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;

  if (!url) {
    console.warn("[redis] REDIS_URL is not set — Redis features disabled.");
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      // Exponential backoff: 200ms, 400ms, 800ms ... max 5s
      return Math.min(times * 200, 5_000);
    },
    // Upstash requires TLS — ioredis auto-detects from rediss:// scheme
    lazyConnect: true,
  });

  client.on("error", (err) => {
    console.error("[redis] Connection error:", err.message);
  });

  return client;
}

/**
 * Creates a dedicated subscriber client.
 * Must be a separate connection from any publisher/command client
 * because Redis enters subscriber mode on the connection.
 */
export function createSubscriberClient(): Redis | null {
  return createRedisClient();
}
