import { NextRequest } from "next/server";
import { createSubscriberClient, BET_EVENTS_CHANNEL } from "@/lib/redis";

/**
 * GET /api/events/bets
 *
 * Server-Sent Events endpoint that streams live bet resolution events
 * from Redis pub/sub to the browser. The keeper publishes to the
 * `casfin:bets` channel after each bet settlement, and this route
 * forwards those events to any connected frontend client.
 *
 * Optional query param: ?player=0x... to filter events for a specific player.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 30_000;

export async function GET(req: NextRequest) {
  const playerFilter = req.nextUrl.searchParams.get("player")?.toLowerCase() || "";

  const subscriber = createSubscriberClient();

  if (!subscriber) {
    return new Response(
      JSON.stringify({ error: "Redis is not configured. Set REDIS_URL in environment." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ channel: BET_EVENTS_CHANNEL })}\n\n`)
      );

      // Heartbeat to keep connection alive through proxies/load balancers
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Stream already closed
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Subscribe to Redis channel
      subscriber.on("message", (channel, message) => {
        if (closed || channel !== BET_EVENTS_CHANNEL) return;

        try {
          // If a player filter is set, only forward matching events
          if (playerFilter) {
            const parsed = JSON.parse(message);
            if (parsed.player && parsed.player.toLowerCase() !== playerFilter) {
              return;
            }
          }

          controller.enqueue(encoder.encode(`event: bet\ndata: ${message}\n\n`));
        } catch {
          // Malformed message or closed stream — skip
        }
      });

      subscriber.on("error", (err) => {
        console.error("[SSE] Redis subscriber error:", err.message);
        if (!closed) {
          try {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ error: "Redis connection lost" })}\n\n`
              )
            );
          } catch {
            // Stream closed
          }
        }
      });

      try {
        await subscriber.connect();
        await subscriber.subscribe(BET_EVENTS_CHANNEL);
      } catch (err) {
        console.error("[SSE] Failed to subscribe to Redis:", err);
        if (!closed) {
          try {
            controller.enqueue(
              encoder.encode(
                `event: error\ndata: ${JSON.stringify({ error: "Failed to connect to Redis" })}\n\n`
              )
            );
            controller.close();
          } catch {
            // Already closed
          }
        }
      }
    },

    cancel() {
      closed = true;

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      subscriber.unsubscribe(BET_EVENTS_CHANNEL).catch(() => {});
      subscriber.quit().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
