import type { Context, ScheduledEvent } from "aws-lambda";
import { runKeeperTick } from "./keeper-logic";

export async function tick(event: ScheduledEvent, context: Context): Promise<{ statusCode: number; body: string }> {
  console.log("CasFin Keeper Lambda invoked");
  console.log("Event source:", event.source ?? "unknown");
  console.log("Request ID:", context.awsRequestId);

  try {
    const logs = await runKeeperTick();
    logs.forEach((line) => console.log(line));

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, logs })
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Keeper error:", message);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: message })
    };
  }
}
