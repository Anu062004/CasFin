import { SecretsManager } from "@aws-sdk/client-secrets-manager";

export async function getKeeperKey(): Promise<string> {
  const client = new SecretsManager({ region: process.env.AWS_REGION });
  const { SecretString } = await client.getSecretValue({
    SecretId: "casfin/keeper-key"
  });
  return JSON.parse(SecretString!).KEEPER_PRIVATE_KEY;
}
