import type { Context, ScheduledEvent } from "aws-lambda";
import { runKeeperTick } from "./keeper-logic";
import { getKeeperKey } from "./secrets";

const keeperRuntimePromise = (async () => {
  const keeperKey = await getKeeperKey();
  return {
    keeperKey: keeperKey.startsWith("0x") ? keeperKey : `0x${keeperKey}`
  };
})();

export async function tick(event: ScheduledEvent, context: Context): Promise<{ statusCode: number; body: string }> {
  console.log("CasFin Keeper Lambda invoked");
  console.log("Event source:", event.source ?? "unknown");
  console.log("Request ID:", context.awsRequestId);

  try {
    const { keeperKey } = await keeperRuntimePromise;
    const logs = await runKeeperTick({ keeperKey });

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
