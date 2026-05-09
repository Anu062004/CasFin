# CasFin Game Logic Bugs & Fixes

## 1. The "Infinite Deck" Bug in Encrypted Video Poker

### Description
Both `CasFin` and `CofhePoker` suffer from a critical randomness flaw in card generation. Cards are currently drawn by picking a completely independent random number modulo 52. Because the random draws do not remember previously drawn cards (they don't simulate a shuffled 52-card deck), it is mathematically possible to draw duplicate cards in the same hand.

### Affected Files
- `casfin/contracts/fhenix/GameRandomness.sol`
- `casfin/contracts/fhenix/EncryptedVideoPoker.sol`

### Code Impact
In `GameRandomnessLib.sol`:
```solidity
function randomCardIndex() internal returns (euint8 card) {
    euint8 randomValue = FHE.randomEuint8();
    euint8 fiftyTwo = FHE.asEuint8(52);
    // BUG: Drawing mod 52 repeatedly allows duplicates (e.g. drawing two 7 of Hearts)
    card = FHE.rem(randomValue, fiftyTwo);
}
```

### The Fix
To properly simulate drawing cards from a deck without replacement in an encrypted state, the contract should track drawn cards and re-roll or deterministically shift indices if a collision occurs. Given FHE gas constraints, the most efficient approach is to implement a **Fisher-Yates shuffle** on an array of 52 indices, or implement a stateful bitmask of drawn cards that prevents the same index from being selected twice within a single game session.

## 2. Centralized Resolution Latency (Keeper Dependency)

### Description
Currently, `EncryptedVideoPoker.sol` requires a centralized Keeper bot to pick up the `requestResolution` event and submit an `ITaskManager` decryption task. This adds latency and a point of failure if the AWS/Vercel Keeper goes down.

### Affected Files
- `casfin/contracts/fhenix/EncryptedVideoPoker.sol`

### The Fix
Shift towards Fhenix's native `FHE.decrypt` feature (async threshold decryption) which does not require a custom backend Keeper. However, since the current architecture evaluates the hand in plaintext to save gas, this hybrid approach (Keeper resolving) is acceptable for V1, but should be documented as a centralization vector.
