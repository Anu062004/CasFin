# TASK: Build FHE Encrypted Video Poker for CasFin Casino

You are building a **fully encrypted Video Poker game** for the CasFin casino platform. This is a "Jacks or Better" single-player game (player vs house) using Fhenix CoFHE for on-chain encryption. Cards are encrypted — only the player can see their own hand.

---

## PROJECT STRUCTURE

```
c:\Users\ankur\OneDrive\Desktop\CasFin\casfin\
├── contracts/
│   ├── base/          → Ownable.sol, Pausable.sol, ReentrancyGuard.sol
│   ├── fhenix/        → All FHE game contracts live here
│   │   ├── EncryptedCasinoVault.sol    → Vault (handles bets/payouts)
│   │   ├── EncryptedCoinFlip.sol       → REFERENCE: follow this exact pattern
│   │   ├── EncryptedDiceGame.sol
│   │   ├── EncryptedCrashGame.sol
│   │   ├── GameRandomness.sol          → Has randomCardIndex() you MUST use
│   │   └── IEncryptedCasinoVault.sol   → Vault interface
│   └── libraries/MathLib.sol
├── frontend/
│   ├── app/
│   │   ├── casino/page.tsx             → MODIFY: add poker tab
│   │   └── globals.css                 → MODIFY: add poker styles
│   ├── components/
│   │   ├── casino/
│   │   │   ├── CleanCoinFlipCard.tsx   → REFERENCE: follow this exact pattern
│   │   │   ├── CleanDiceCard.tsx
│   │   │   ├── CleanCrashCard.tsx
│   │   │   └── CasinoOutcomeCard.tsx  → Reuse for results
│   │   ├── GlassButton.tsx
│   │   ├── GlassCard.tsx
│   │   └── WalletProvider.tsx
│   ├── lib/
│   │   ├── casfin-abis.ts             → MODIFY: add poker ABI
│   │   ├── casfin-config.ts           → MODIFY: add poker address
│   │   ├── casfin-client.ts
│   │   └── cofhe-provider.tsx         → Has encryptUint128, encryptBool, decryptForView
│   └── prisma/schema.prisma           → MODIFY: add VIDEO_POKER to GameType
├── scripts/
│   ├── deployFhenix.ts                → REFERENCE for deploy pattern
│   └── (keeper scripts)
└── hardhat.config.ts                  → ABI auto-exports to frontend/lib/generated-abis/
```

---

## FHE RULES — MANDATORY (BREAK THESE = BROKEN CONTRACT)

```solidity
// IMPORTS — use exactly this:
import {FHE, InEuint128, InEbool, InEuint8, TASK_MANAGER_ADDRESS, ebool, euint8, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";

// RULE 1: After EVERY FHE operation, call FHE.allowThis()
euint8 card = FHE.randomEuint8();
FHE.allowThis(card);  // CONTRACT KEEPS ACCESS

// RULE 2: To let player see (decrypt) a value:
FHE.allowSender(card);  // PLAYER CAN DECRYPT

// RULE 3: To let another contract (vault) use a value:
FHE.allow(value, address(vault));

// RULE 4: No if/else on encrypted values. Use FHE.select():
euint8 result = FHE.select(encryptedCondition, trueValue, falseValue);

// RULE 5: Decrypt is ASYNC (2-transaction pattern):
// Tx 1 — request:
ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(
    uint256(bytes32(euint8.unwrap(encValue))), address(this)
);
// Tx 2 — finalize (later):
(uint8 plaintext, bool ready) = FHE.getDecryptResultSafe(encHandle);
require(ready, "PENDING");

// RULE 6: Random card (0-51 range) — already exists in GameRandomness.sol:
euint8 card = GameRandomnessLib.randomCardIndex();
// Returns encrypted value in [0, 51]
```

---

## VAULT INTERFACE — How games interact with the house bankroll

```solidity
// File: contracts/fhenix/IEncryptedCasinoVault.sol
interface IEncryptedCasinoVault {
    function reserveFunds(address player, euint128 encAmount) external returns (euint128);
    function settleBet(address player, euint128 lockedHandle, euint128 returnHandle) external;
    function authorizeGame(address game, bool allowed) external;
}

// Usage in game contract:
// 1. Lock player's bet:      euint128 locked = vault.reserveFunds(msg.sender, encAmount);
// 2. After resolution:        vault.settleBet(player, locked, payoutHandle);
//    payoutHandle = encrypted payout (0 if lost, multiplied amount if won)
```

---

## GAME DESIGN: "Jacks or Better" Video Poker

### Game Flow (3 transactions)
1. **`deal(encAmount)`** — Player bets. 5 encrypted cards dealt. Player decrypts client-side to see hand.
2. **`draw(gameId, encHolds[5])`** — Player sends 5 encrypted booleans (hold=true, replace=false). Non-held cards replaced with new random cards.
3. **`requestResolution(gameId)` + `finalizeResolution(gameId)`** — Keeper decrypts all 5 final cards, evaluates hand in plaintext, settles payout via vault.

### Privacy Model
- During deal → draw: cards are ENCRYPTED, only player can see them (FHE.allowSender)
- After draw: keeper decrypts cards for hand evaluation. This is safe because player already locked in decisions.
- The house CANNOT see cards during gameplay = no cheating possible

### Card Encoding
- Card index 0-51: `suit = index / 13`, `rank = index % 13`
- Ranks: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
- Suits: 0=♣, 1=♦, 2=♥, 3=♠

### Payout Table (multiplier of bet)
| Hand | Multiplier |
|---|---|
| Royal Flush | 250x |
| Straight Flush | 50x |
| Four of a Kind | 25x |
| Full House | 9x |
| Flush | 6x |
| Straight | 4x |
| Three of a Kind | 3x |
| Two Pair | 2x |
| Jacks or Better (pair of J/Q/K/A) | 1x (get bet back) |
| Nothing | 0x (lose bet) |

---

## FILE 1: SMART CONTRACT

### Create: `contracts/fhenix/EncryptedVideoPoker.sol`

Follow the EXACT same structure as `EncryptedCoinFlip.sol`. Key differences:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "../base/Ownable.sol";
import {Pausable} from "../base/Pausable.sol";
import {ReentrancyGuard} from "../base/ReentrancyGuard.sol";
import {MathLib} from "../libraries/MathLib.sol";
import {IEncryptedCasinoVault} from "./IEncryptedCasinoVault.sol";
import {GameRandomnessLib} from "./GameRandomness.sol";
import {FHE, InEuint128, InEbool, TASK_MANAGER_ADDRESS, ebool, euint8, euint128} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {ITaskManager} from "@fhenixprotocol/cofhe-contracts/ICofhe.sol";
```

**Struct:**
```solidity
enum GamePhase { NONE, DEALT, DRAWN, RESOLUTION_PENDING, RESOLVED }

struct PokerGame {
    address player;
    euint128 lockedHandle;
    euint8[5] cards;
    euint8[5] finalCards;
    GamePhase phase;
    bool won;
    uint16 payoutMultiplier; // set after resolution
}
```

**Constructor:** Same as CoinFlip — takes `(address initialOwner, address vaultAddress, uint16 initialHouseEdgeBps)`. Initialize ENCRYPTED_ZERO, store vault, houseEdgeBps.

**Functions to implement:**

1. `deal(InEuint128 calldata encAmount) external nonReentrant whenNotPaused returns (uint256 gameId)`
   - Validate encrypted amount: `euint128 amount = FHE.asEuint128(encAmount);`
   - Allow vault: `FHE.allow(amount, address(vault));`
   - Lock funds: `euint128 locked = vault.reserveFunds(msg.sender, amount);`
   - Deal 5 cards using `GameRandomnessLib.randomCardIndex()` each
   - For each card: `FHE.allowThis(card)` AND `FHE.allowSender(card)` (so player sees them)
   - Store game, set phase = DEALT
   - Emit `PokerDealt(gameId, msg.sender)`

2. `draw(uint256 gameId, InEbool[5] calldata holds) external nonReentrant whenNotPaused`
   - Require: `game.player == msg.sender`, `game.phase == GamePhase.DEALT`
   - For each position i (0-4):
     - `ebool holdFlag = FHE.asEbool(holds[i]); FHE.allowThis(holdFlag);`
     - `euint8 replacement = GameRandomnessLib.randomCardIndex();`
     - `game.finalCards[i] = FHE.select(holdFlag, game.cards[i], replacement);`
     - `FHE.allowThis(game.finalCards[i]); FHE.allowSender(game.finalCards[i]);`
   - Set phase = DRAWN
   - Emit `PokerDrawn(gameId, msg.sender)`

3. `requestResolution(uint256 gameId) external nonReentrant whenNotPaused onlyResolver`
   - Require phase == DRAWN
   - Request decrypt for all 5 final cards:
     ```solidity
     for (uint i = 0; i < 5; i++) {
         ITaskManager(TASK_MANAGER_ADDRESS).createDecryptTask(
             uint256(bytes32(euint8.unwrap(game.finalCards[i]))), address(this)
         );
     }
     ```
   - Set phase = RESOLUTION_PENDING
   - Emit `PokerResolutionRequested(gameId)`

4. `finalizeResolution(uint256 gameId) external nonReentrant whenNotPaused onlyResolver`
   - Require phase == RESOLUTION_PENDING
   - Decrypt all 5 cards:
     ```solidity
     uint8[5] memory revealed;
     for (uint i = 0; i < 5; i++) {
         (uint8 card, bool ready) = FHE.getDecryptResultSafe(game.finalCards[i]);
         require(ready, "CARD_PENDING");
         revealed[i] = card;
     }
     ```
   - Evaluate hand: `uint16 multiplier = _evaluateHand(revealed);`
   - Calculate payout:
     ```solidity
     euint128 payout;
     if (multiplier == 0) {
         payout = ENCRYPTED_ZERO;
     } else {
         euint128 encMultiplier = FHE.asEuint128(uint128(multiplier));
         FHE.allowThis(encMultiplier);
         payout = FHE.mul(game.lockedHandle, encMultiplier);
         FHE.allowThis(payout);
         // Apply house edge
         payout = _applyHouseEdge(payout);
     }
     FHE.allow(payout, address(vault));
     vault.settleBet(game.player, game.lockedHandle, payout);
     ```
   - Set phase = RESOLVED, store won/multiplier
   - Emit `PokerResolved(gameId, game.player, multiplier > 0, multiplier)`

5. `_evaluateHand(uint8[5] memory cards) internal pure returns (uint16 multiplier)`
   - This is PURE PLAINTEXT math (cards already decrypted)
   - Extract ranks and suits:
     ```solidity
     uint8[5] memory ranks;
     uint8[5] memory suits;
     for (uint i = 0; i < 5; i++) {
         ranks[i] = cards[i] % 13;
         suits[i] = cards[i] / 13;
     }
     ```
   - Sort ranks (simple bubble sort on 5 elements)
   - Count rank frequencies (use array uint8[13] for rank counts)
   - Check flush: all same suit
   - Check straight: 5 consecutive ranks (handle ace-low: 0,1,2,3,12)
   - Return multiplier based on hand:
     - Royal flush (straight + flush + lowest rank is 8(=10)): 250
     - Straight flush: 50
     - Four of a kind (any rank count == 4): 25
     - Full house (3+2): 9
     - Flush: 6
     - Straight: 4
     - Three of a kind: 3
     - Two pair: 2
     - Jacks or better (pair where rank >= 9, i.e. J/Q/K/A): 1
     - Nothing: 0

6. `_applyHouseEdge(euint128 gross) internal returns (euint128)` — same as CoinFlip:
   ```solidity
   euint128 numerator = FHE.mul(gross, ENCRYPTED_NET_PAYOUT_BPS);
   FHE.allowThis(numerator);
   return FHE.div(numerator, ENCRYPTED_BPS_DENOMINATOR);
   ```

7. Standard admin: `setResolver`, `pause`, `unpause` — copy from CoinFlip.

**Events:**
```solidity
event PokerDealt(uint256 indexed gameId, address indexed player);
event PokerDrawn(uint256 indexed gameId, address indexed player);
event PokerResolutionRequested(uint256 indexed gameId);
event PokerResolved(uint256 indexed gameId, address indexed player, bool won, uint16 payoutMultiplier);
```

---

## FILE 2: FRONTEND ABI REGISTRATION

### Modify: `frontend/lib/casfin-abis.ts`

Add after line 9:
```typescript
import EncryptedVideoPokerJson from "@/lib/generated-abis/EncryptedVideoPoker.json";
```

Add after line 19:
```typescript
export const ENCRYPTED_VIDEO_POKER_ABI = EncryptedVideoPokerJson;
```

---

## FILE 3: FRONTEND CONFIG

### Modify: `frontend/lib/casfin-config.ts`

Add `pokerGame: string` to the `addresses` interface (after `crashGame`).

Add to CASFIN_CONFIG.addresses:
```typescript
pokerGame: process.env.NEXT_PUBLIC_FHE_POKER_ADDRESS || ethers.ZeroAddress,
```

---

## FILE 4: POKER CARD COMPONENT

### Create: `frontend/components/casino/PokerCardDisplay.tsx`

```tsx
"use client";

// Single playing card with flip animation and hold state
// Props: { rank: number (0-12), suit: number (0-3), faceDown: boolean, held: boolean, onClick: () => void }
// rank: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
// suit: 0=♣, 1=♦, 2=♥, 3=♠
// Glassmorphism style matching existing casino components
// When held: gold border + "HOLD" label below + lifted up
// When faceDown: purple gradient background, no rank/suit shown
// Suit colors: ♥♦ = #ef4444 (red), ♠♣ = rgba(255,255,255,0.7)

const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUIT_SYMBOLS = ["♣", "♦", "♥", "♠"];
```

---

## FILE 5: MAIN GAME COMPONENT

### Create: `frontend/components/casino/CleanPokerCard.tsx`

**Follow `CleanCoinFlipCard.tsx` EXACTLY for structure.** Same props, same hooks, same button states.

```tsx
"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/components/WalletProvider";
import CasinoOutcomeCard from "@/components/casino/CasinoOutcomeCard";
import PokerCardDisplay from "@/components/casino/PokerCardDisplay";
import { CASFIN_CONFIG } from "@/lib/casfin-config";
import { ENCRYPTED_VIDEO_POKER_ABI } from "@/lib/casfin-abis";
import { parseRequiredEth } from "@/lib/casfin-client";
import { useCofhe } from "@/lib/cofhe-provider";
```

**State:**
```tsx
const [amount, setAmount] = useState("0.01");
const [phase, setPhase] = useState<"bet" | "dealt" | "drawing" | "waiting" | "result">("bet");
const [gameId, setGameId] = useState<string | null>(null);
const [cards, setCards] = useState<Array<{ rank: number; suit: number } | null>>([null, null, null, null, null]);
const [held, setHeld] = useState([false, false, false, false, false]);
const [result, setResult] = useState<{ won: boolean; hand: string; multiplier: number } | null>(null);
const [isSubmitting, setIsSubmitting] = useState(false);
```

**Key functions:**

1. `handleDeal()` — encrypts amount, calls `poker.deal(encAmount)`, parses gameId from receipt events, then decrypts 5 card handles using `decryptForView` from cofhe provider to show cards to player.

2. `toggleHold(index)` — flips held[index]

3. `handleDraw()` — encrypts 5 hold booleans, calls `poker.draw(gameId, encHolds)`, decrypts new cards to show updated hand. Sets phase to "waiting".

4. `handleNewGame()` — resets all state to bet phase.

**UI Layout (inside `.casino-game-card.theme-poker`):**

- **Bet phase:** Amount input with presets (same as CoinFlip) + payout table + "Deal" button
- **Dealt phase:** 5 PokerCardDisplay components in `.poker-hand` div + click to toggle hold + "Draw" button
- **Waiting phase:** "Waiting for keeper to resolve..." message with spinner
- **Result phase:** Final hand displayed + CasinoOutcomeCard showing win/loss + hand name + multiplier + "New Game" button

**Button label logic** (same pattern as CoinFlip):
```tsx
{isSubmitting
  ? phase === "bet" ? "Dealing..." : "Drawing..."
  : !isConnected
    ? "Connect wallet to play"
    : !isCorrectChain
      ? "Switch to Arbitrum Sepolia"
      : cofheSessionReady
        ? phase === "bet" ? "Deal Hand" : "Draw Cards"
        : "Initializing CoFHE..."}
```

---

## FILE 6: CASINO PAGE INTEGRATION

### Modify: `frontend/app/casino/page.tsx`

Add import:
```tsx
import CleanPokerCard from "@/components/casino/CleanPokerCard";
```

Change type:
```tsx
type CasinoSection = "coin" | "dice" | "crash" | "poker";
```

Add to tabLabel:
```tsx
const tabLabel: Record<CasinoSection, string> = {
  coin: "Coin Flip",
  dice: "Dice",
  crash: "Crash",
  poker: "Poker"
};
```

Add to tab buttons array:
```tsx
{(["coin", "dice", "crash", "poker"] as CasinoSection[]).map(/* ... */)}
```

Add to game panel:
```tsx
{activeSection === "poker" && (
  <CleanPokerCard
    casinoState={casinoState}
    pendingAction={pendingAction}
    runTransaction={runTransaction}
    walletBlocked={walletBlocked}
  />
)}
```

---

## FILE 7: CSS STYLES

### Modify: `frontend/app/globals.css`

Add these styles at the end (BEFORE the final closing comment if any). Follow existing glassmorphism patterns:

```css
/* ──────────────────────────────────────────────────────────
   Video Poker
   ────────────────────────────────────────────────────────── */

.casino-game-card.theme-poker .casino-game-badge {
  background: linear-gradient(135deg, #6b21a8, #9333ea);
}

.poker-hand {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  align-items: flex-end;
  padding: 2rem 0 1.5rem;
  min-height: 160px;
}

.poker-card {
  width: 80px;
  height: 112px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1.5px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  user-select: none;
}

.poker-card:hover {
  transform: translateY(-6px);
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.poker-card.is-held {
  border-color: var(--accent, #f4bf36);
  box-shadow: 0 0 24px rgba(244, 191, 54, 0.35);
  transform: translateY(-12px);
}

.poker-card.is-held::after {
  content: "HOLD";
  position: absolute;
  bottom: -22px;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--accent, #f4bf36);
  text-shadow: 0 0 8px rgba(244, 191, 54, 0.5);
}

.poker-card.face-down {
  background: linear-gradient(135deg, rgba(99, 54, 214, 0.4), rgba(45, 25, 120, 0.6));
  border-color: rgba(99, 54, 214, 0.5);
  cursor: default;
}

.poker-card.face-down::before {
  content: "?";
  font-size: 2rem;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.15);
}

.poker-card-rank {
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1;
}

.poker-card-suit {
  font-size: 1rem;
  margin-top: 2px;
  line-height: 1;
}

.poker-card-suit.is-red {
  color: #ef4444;
}

.poker-card-suit.is-black {
  color: rgba(255, 255, 255, 0.7);
}

.poker-hand-label {
  text-align: center;
  padding: 0.5rem 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent, #f4bf36);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 0 0 12px rgba(244, 191, 54, 0.3);
}

.poker-payout-table {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.3rem 1.5rem;
  font-size: 0.72rem;
  padding: 1rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 1rem;
}

.poker-payout-hand {
  color: rgba(255, 255, 255, 0.5);
}

.poker-payout-value {
  text-align: right;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
}

.poker-payout-value.is-highlight {
  color: var(--accent, #f4bf36);
}

@media (max-width: 640px) {
  .poker-hand {
    gap: 0.35rem;
    padding: 1.5rem 0 1rem;
  }
  .poker-card {
    width: 56px;
    height: 78px;
  }
  .poker-card-rank {
    font-size: 1.1rem;
  }
  .poker-card-suit {
    font-size: 0.75rem;
  }
}
```

---

## FILE 8: PRISMA SCHEMA UPDATE

### Modify: `frontend/prisma/schema.prisma`

Change the GameType enum (around line 191):
```prisma
enum GameType {
  COIN_FLIP
  DICE
  CRASH
  VIDEO_POKER
}
```

Then run: `cd frontend && npx prisma generate`

---

## FILE 9: ENV UPDATES

### Modify: `.env.example` — add:
```
NEXT_PUBLIC_FHE_POKER_ADDRESS=0x0000000000000000000000000000000000000000
```

---

## BUILD & VERIFY

```bash
# 1. Compile contract
cd c:\Users\ankur\OneDrive\Desktop\CasFin\casfin
npx hardhat compile

# 2. ABI should auto-export to frontend/lib/generated-abis/EncryptedVideoPoker.json

# 3. Generate Prisma client
cd frontend
npx prisma generate

# 4. Build frontend
npm run build

# 5. Dev server
npm run dev
```

Navigate to `http://localhost:3000/casino` → click "Poker" tab → verify UI renders.

---

## IMPORTANT NOTES

1. **Do NOT use `if/else` on any euint or ebool value.** Always use `FHE.select()`.
2. **Every `FHE.*()` call MUST be followed by `FHE.allowThis(result)`**.
3. **The hand evaluation `_evaluateHand()` runs on PLAINTEXT cards** (already decrypted). This is NOT a privacy leak because evaluation happens AFTER the player has finished their decisions.
4. **Follow the EXACT pattern from `EncryptedCoinFlip.sol`** for constructor, modifiers, resolver pattern, pause/unpause.
5. **The ABI exporter in hardhat.config.ts auto-exports** on compile — no manual ABI copy needed.
6. **Use `GameRandomnessLib.randomCardIndex()`** from `GameRandomness.sol` — do NOT write your own card random function.
7. **CSS must use existing CSS custom properties**: `var(--accent)`, `var(--text-primary)`, `var(--text-secondary)` — check `globals.css` for exact names.
