# Fhenix CoFHE Reference

Last checked: 2026-05-24

Official docs:

- Main docs: https://cofhe-docs.fhenix.zone/
- Documentation index: https://cofhe-docs.fhenix.zone/llms.txt
- Client SDK overview: https://cofhe-docs.fhenix.zone/client-sdk/introduction/overview
- Access control: https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/access-control
- FHE operations: https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/encrypted-operations
- FHE library overview: https://cofhe-docs.fhenix.zone/fhe-library/introduction/overview
- Decryption reference: https://cofhe-docs.fhenix.zone/fhe-library/reference/fhe-sol/decryption
- Migrating from `FHE.decrypt`: https://cofhe-docs.fhenix.zone/tutorials/migrating-from-fhe-decrypt
- CoFHE error decoder: https://cofhe-docs.fhenix.zone/fhe-library/reference/cofhe-errors
- Architecture overview: https://cofhe-docs.fhenix.zone/deep-dive/cofhe-components/overview

## How to Use This File

Use this as the first local checklist for any Fhenix/CoFHE issue in CasFin. If a point here conflicts with the official docs, trust the official docs and update this file.

## Client SDK

The `@cofhe/sdk` client handles browser-side encrypted inputs, permits, and decryption requests. The normal lifecycle is:

1. Create a config with the supported chain.
2. Create a CoFHE client from that config.
3. Connect the client with a public client and wallet client.
4. Encrypt inputs before passing them into contract calls.
5. Use permits for view decryption.

CasFin uses:

- `@cofhe/sdk/web` in the browser.
- `Ethers6Adapter` from `@cofhe/sdk/adapters`.
- `Encryptable.uint128(...)`, `Encryptable.uint8(...)`, and `Encryptable.bool(...)` for game inputs.

Important implementation note: do not import browser-only TFHE/WASM code at server module scope in Next.js. Load TFHE lazily in browser code, guarded by `typeof window !== "undefined"`, otherwise Next server rendering can try to evaluate worker code and hang or crash.

## Encrypted Inputs

Frontend flow for game transactions:

1. Parse the plaintext user amount or guess locally.
2. Call `client.encryptInputs([...]).execute()`.
3. Pass the returned encrypted input object directly into the Solidity function expecting `InEuint*` or `InEbool`.
4. Only then open the wallet transaction for the target game contract.

If a wallet popup says the contract interaction failed before a transaction succeeds, the keeper cannot resolve that attempted bet because no valid `EncryptedBetPlaced` event was created.

## Access Control

CoFHE ciphertext handles are permissioned. FHE operations revert when the calling contract lacks access to every handle used in the operation.

Use these rules in CasFin contracts:

- Use `FHE.allowThis(handle)` when a contract stores a handle and must use it in a later transaction.
- Use `FHE.allow(handle, otherContract)` before another contract needs to consume the handle.
- Use `FHE.allow(handle, user)` or `FHE.allowSender(handle)` when a user needs later read/decrypt access.
- Use `FHE.allowTransient(handle, otherContract)` for access needed only inside the current transaction.
- Use `FHE.allowPublic(handle)` only for values intended to become publicly decryptable.

For the casino flow, check these permissions carefully:

- The vault must keep access to stored balances and locked balances.
- The game contract must keep access to stored bet handles and encrypted guesses.
- The vault must be granted access to return handles before `vault.settleBet(...)`.
- The player should retain access to balance handles needed for UI display.

## Decryption and Resolution

CoFHE decryption is asynchronous. Treat "not decrypted yet" as a pending state, not a failed bet.

For the current CasFin keeper/contracts:

- Game contracts must mark intended-public result handles with `FHE.allowPublic(handle)`.
- The keeper requests the plaintext and Threshold Network signature off-chain with `client.decryptForTx(handle).withoutPermit().execute()`.
- The keeper publishes the signed result on-chain with `FHE.publishDecryptResult(...)` / TaskManager `publishDecryptResult(...)`.
- The keeper should retry finalization until the published decrypt result is available.
- `getDecryptResultSafe`-style reads should be handled as `(result, decrypted)`; `decrypted === false` means retry later.
- Testnet mock task managers may support mock decrypt helpers; production-style flows should follow official decryption docs.

Do not use the old on-chain decrypt request pattern (`FHE.decrypt(...)` or direct `createDecryptTask(...)`) for new CasFin casino resolution code. Current docs describe decryption as: on-chain `allowPublic`, off-chain `decryptForTx`, then on-chain `publishDecryptResult`.

## TaskManager and Off-Chain Components

The FHE library uses CoFHE infrastructure for encrypted computation and decryption requests. The docs describe these components:

- Client SDK: encrypts inputs, manages permits, decrypts outputs.
- FHE.sol: Solidity interface for encrypted types and operations.
- TaskManager: on-chain entry point for FHE operations and decrypt request handling.
- Result Processor / Threshold Network: off-chain services that process encrypted operations and decrypt requests.

For CasFin keeper bugs, separate the failure stage:

- `placeBet(...)` wallet failure: frontend input, contract precondition, vault paused/unauthorized/insufficient encrypted balance, or CoFHE input verification issue.
- Bet event emitted but unresolved: keeper, resolver authorization, decrypt readiness, RPC/WSS, or vault solvency issue.
- SSE/pubsub not updating UI: Redis/SSE delivery issue; the chain may still resolve correctly.

## Error Decoding

For opaque CoFHE reverts such as `execution reverted: 0x...`, use:

```bash
npx cofhe-errors <selector>
```

Also check ordinary Solidity revert strings from CasFin contracts, especially:

- `NOT_AUTHORIZED_GAME`
- `NOT_RESOLVER`
- `PAUSED`
- `SESSION_KEY_CANNOT_DEPOSIT`
- `RESOLUTION_PENDING`
- `RESOLUTION_NOT_REQUESTED`
- `WIN_FLAG_PENDING`
- `WITHDRAWAL_PENDING`

## Keeper Checklist

When a bet does not resolve:

1. Confirm the user transaction actually succeeded and emitted the game event.
2. Confirm the keeper wallet is authorized as resolver on the game contract.
3. Confirm the vault authorizes the game contract.
4. Confirm vault and game contracts are not paused.
5. Confirm vault ETH is above `minimumReserveWei`.
6. Confirm `ARBITRUM_SEPOLIA_WSS_URL` works; if not, polling should still catch bets.
7. Confirm `REDIS_URL` works only for UI push updates; Redis failure should not stop on-chain resolution.
8. Inspect keeper logs for `WIN_FLAG_PENDING`, RPC rate limits, nonce errors, or authorization errors.

## CasFin Files to Check

- Keeper entrypoint: `keeper/index.ts`
- WSS reconnect logic: `keeper/ws-provider.ts`
- Frontend CoFHE provider: `frontend/lib/cofhe-provider.tsx`
- Browser TFHE runtime loading: `frontend/lib/cofhe-runtime.ts`
- Redis/SSE bridge: `frontend/lib/redis.ts` and `frontend/app/api/events/bets/route.ts`
- Casino contracts: `contracts/fhenix/EncryptedCasinoVault.sol`, `EncryptedCoinFlip.sol`, `EncryptedDiceGame.sol`, `EncryptedCrashGame.sol`
