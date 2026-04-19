# TASK: Complete Casino UI/UX Overhaul — Poker Cards + All Games

The casino UI needs a major visual upgrade. The poker game has no visible cards in the bet phase, the card components are tiny blank rectangles, and every game looks like a plain form. Fix ALL of this.

---

## PROJECT PATHS
- Root: `c:\Users\ankur\OneDrive\Desktop\CasFin\casfin`
- Frontend: `frontend/`
- Casino page: `frontend/app/casino/page.tsx`
- Game components: `frontend/components/casino/`
- CSS: `frontend/app/globals.css` (ALL styles go here, 5400 lines, poker styles start at line 5275)

## DESIGN SYSTEM
- **Theme**: "Midnight Nebula" — dark backgrounds (#0d0d10), gold accent (#f4bf36), glassmorphism cards
- **CSS Variables already defined**: `--accent`, `--text-primary`, `--text-secondary`, `--text-muted`, `--bg-card`, `--bg-card-high`, `--bg-sunken`, `--glass-radius-lg`, `--success (#4ade80)`, `--danger (#f87171)`
- **Font**: Inter (via Google Fonts, already loaded)
- **NO Tailwind** — all styles in globals.css using vanilla CSS

---

## PROBLEM 1: Poker Cards Are Invisible / Ugly

### Current state (broken):
- `PokerCardDisplay.tsx` (49 lines): renders a tiny `<button>` with rank text + suit emoji. No card shape, no design, no face card art
- In "bet" phase, NO cards are shown at all (empty space)
- Cards are 80x112px transparent rectangles with barely visible borders
- No 3D flip animation, no dealing animation, no visual feedback

### Fix: Complete card redesign

#### Rewrite: `frontend/components/casino/PokerCardDisplay.tsx`

Make playing cards look like REAL casino cards:

```tsx
"use client";

const RANK_LABELS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const SUIT_SYMBOLS = ["♣","♦","♥","♠"];
const SUIT_NAMES = ["clubs","diamonds","hearts","spades"];

interface Props {
  rank?: number;       // 0-12 (2 through A)
  suit?: number;       // 0-3
  faceDown?: boolean;
  held?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  dealing?: boolean;   // NEW: animate dealing in
  index?: number;      // NEW: 0-4, for stagger animation delay
}
```

**Card visual requirements:**
- **Size**: 96px × 134px (desktop), 68px × 95px (mobile)
- **Face-up card structure**:
  - White/cream background (#fefef8) with subtle inner shadow
  - Top-left corner: rank + suit (small, stacked)
  - Center: large suit symbol (♠♥♦♣)
  - Bottom-right corner: rank + suit (inverted/rotated 180°)
  - Face cards (J=9, Q=10, K=11): add a gradient overlay + crown/sword/scepter unicode icon in center
  - Ace (12): extra large suit symbol in center
  - Red suits (♦♥): rank and suit text in #dc2626
  - Black suits (♣♠): rank and suit text in #1a1a2e
  - Subtle rounded corners (8px) with thin border
  - Card has a very subtle drop shadow
- **Face-down card**:
  - Rich purple/navy gradient back pattern
  - Repeating diamond/crosshatch pattern using CSS (no images needed)
  - Subtle gold border accent
  - NO question mark — that looks cheap
- **Held state**:
  - Card lifts up 16px
  - Gold glowing border (2px solid var(--accent))
  - Gold "HOLD" badge appears BELOW the card, not as ::after pseudo
  - Subtle gold glow shadow around entire card
- **Dealing animation**:
  - Cards slide in from right, staggered by `index * 120ms`
  - Slight rotation during deal, settling to 0deg
  - Scale from 0.7 to 1.0

**Render structure:**
```tsx
<button className={classes} onClick={onClick} disabled={disabled} style={{"--deal-delay": `${(index || 0) * 120}ms`}}>
  {faceDown ? (
    <div className="poker-card-back">
      <div className="poker-card-back-pattern" />
    </div>
  ) : (
    <div className="poker-card-face">
      <div className="poker-card-corner top-left">
        <span className="corner-rank">{RANK_LABELS[rank]}</span>
        <span className="corner-suit">{SUIT_SYMBOLS[suit]}</span>
      </div>
      <div className="poker-card-center">
        {rank >= 9 && rank <= 11 ? (
          // Face card: show a crown/icon + ornate design
          <span className="face-card-icon">{rank === 9 ? "⚔" : rank === 10 ? "👑" : "🗡"}</span>
        ) : rank === 12 ? (
          // Ace: big suit
          <span className="ace-suit">{SUIT_SYMBOLS[suit]}</span>
        ) : (
          // Number card: medium suit
          <span className="number-suit">{SUIT_SYMBOLS[suit]}</span>
        )}
      </div>
      <div className="poker-card-corner bottom-right">
        <span className="corner-rank">{RANK_LABELS[rank]}</span>
        <span className="corner-suit">{SUIT_SYMBOLS[suit]}</span>
      </div>
    </div>
  )}
  {held && <span className="poker-hold-badge">HOLD</span>}
</button>
```

---

## PROBLEM 2: Poker Game Component Layout

### Current state:
- Bet phase just shows a text input + flat payout grid — boring, no card preview
- No visual dealer table feel
- Phase transitions are abrupt with no visual feedback

### Fix: Rewrite `frontend/components/casino/CleanPokerCard.tsx`

Keep ALL existing logic (handleDeal, handleDraw, handleCheckResult, decryptHandles etc.) but restructure the JSX:

**Bet Phase layout:**
```
┌────────────────────────────────────────────┐
│  "Video Poker"  badge: "Up to 250x"       │
│                                            │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                │  ← 5 face-down cards as preview
│  │░░│ │░░│ │░░│ │░░│ │░░│                │
│  └──┘ └──┘ └──┘ └──┘ └──┘                │
│        "Deal to reveal"                    │
│                                            │
│  ┌─ Bet Amount ─────────────────────────┐  │
│  │  [0.01                    ]          │  │
│  │  [0.001] [0.005] [0.01] [0.05]      │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌─ Payouts ────────────────────────────┐  │
│  │ Royal Flush ············· 250x  ★   │  │  ← styled as premium
│  │ Straight Flush ··········  50x  ★   │  │     table with dots
│  │ Four of a Kind ··········  25x      │  │
│  │ ... etc                              │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  [★★★ DEAL HAND ★★★]                     │  ← big gold button
│                                            │
│  Settlement: Keeper │ Phase: Bet           │
└────────────────────────────────────────────┘
```

**Dealt Phase layout:**
```
┌────────────────────────────────────────────┐
│  "Video Poker"  badge: "Select & Draw"     │
│                                            │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                │  ← real cards, face up
│  │K♠│ │10♥│ │K♦│ │3♣│ │7♠│               │
│  └──┘ └──┘ └──┘ └──┘ └──┘                │
│  HOLD        HOLD                          │  ← gold badges under held
│                                            │
│  "Tap cards to hold · then Draw"           │  ← instruction
│                                            │
│  [★★★ DRAW CARDS ★★★]                    │
└────────────────────────────────────────────┘
```

**Waiting Phase layout:**
- Show the final 5 cards (face up, no click)
- Pulsing gold border around the card area
- Animated "Resolving hand..." text with dot animation
- "Check Result" button below

**Result Phase layout:**
- Final 5 cards with winning cards highlighted (gold glow)
- Large hand name in center: "FULL HOUSE!" with celebration animation for wins
- CasinoOutcomeCard below
- "New Game" button

**Key changes to the component:**
1. In bet phase, show 5 face-down cards as preview (pass `faceDown={true}` to all 5)
2. Add `dealing` state — when deal completes, animate cards flipping from face-down to face-up
3. Use the existing `CasinoOutcomeCard` only in result/waiting phase (not in bet phase — move it)
4. Show payout table as a collapsible in dealt/waiting/result phases

---

## PROBLEM 3: Payout Table Design

### Current (ugly flat grid):
```css
.poker-payout-table { display: grid; grid-template-columns: 1fr auto; }
```

### Fix: Make it look like a real casino payout strip

Replace the payout table rendering in `CleanPokerCard.tsx`:
```tsx
<div className="poker-payout-strip">
  <div className="payout-strip-header">
    <span>Hand</span>
    <span>Pays</span>
  </div>
  {PAYOUT_TABLE.map(({ hand, payout, highlight }) => (
    <div key={hand} className={`payout-strip-row${highlight ? " is-jackpot" : ""}`}>
      <span className="payout-strip-hand">{hand}</span>
      <span className="payout-strip-dots" />
      <span className="payout-strip-value">{payout}</span>
    </div>
  ))}
</div>
```

CSS for the payout strip (replace old `.poker-payout-table`):
```css
.poker-payout-strip {
  border-radius: 12px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  overflow: hidden;
  margin-bottom: 1rem;
}
.payout-strip-header {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: rgba(255,255,255,0.04);
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.payout-strip-row {
  display: flex;
  align-items: center;
  padding: 0.4rem 1rem;
  border-top: 1px solid rgba(255,255,255,0.03);
  font-size: 0.78rem;
}
.payout-strip-row.is-jackpot {
  background: linear-gradient(90deg, rgba(244,191,54,0.06), transparent);
}
.payout-strip-hand {
  color: rgba(255,255,255,0.6);
  white-space: nowrap;
}
.payout-strip-dots {
  flex: 1;
  margin: 0 0.5rem;
  border-bottom: 1px dotted rgba(255,255,255,0.1);
}
.payout-strip-value {
  font-weight: 800;
  color: rgba(255,255,255,0.85);
  white-space: nowrap;
}
.payout-strip-row.is-jackpot .payout-strip-value {
  color: var(--accent);
  text-shadow: 0 0 8px rgba(244,191,54,0.3);
}
.payout-strip-row.is-jackpot .payout-strip-hand {
  color: var(--accent);
}
```

---

## PROBLEM 4: Poker Card CSS Overhaul

### Replace ALL CSS from line 5275 to 5399 in `frontend/app/globals.css`

Delete the old poker styles and replace with the new realistic card CSS. Key new classes:

```css
/* Card container */
.poker-card {
  width: 96px; height: 134px;
  border-radius: 8px;
  position: relative;
  cursor: pointer;
  transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease;
  transform-style: preserve-3d;
  background: none;
  border: none;
  padding: 0;
  outline: none;
}

/* Face-up card */
.poker-card-face {
  width: 100%; height: 100%;
  background: linear-gradient(145deg, #fefef8, #f0efe8);
  border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.15);
  box-shadow: 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.8);
  position: relative;
  overflow: hidden;
}

/* Corner rank+suit */
.poker-card-corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  gap: 1px;
}
.poker-card-corner.top-left { top: 6px; left: 6px; }
.poker-card-corner.bottom-right { bottom: 6px; right: 6px; transform: rotate(180deg); }
.corner-rank { font-size: 0.85rem; font-weight: 800; }
.corner-suit { font-size: 0.7rem; }

/* Center area */
.poker-card-center {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 2.2rem;
}

/* Red/black coloring */
.poker-card.is-red .poker-card-face { color: #dc2626; }
.poker-card.is-black .poker-card-face { color: #1a1a2e; }

/* Face card styling */
.face-card-icon { font-size: 1.8rem; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.15)); }
.ace-suit { font-size: 3rem; }
.number-suit { font-size: 2rem; opacity: 0.85; }

/* Back of card */
.poker-card-back {
  width: 100%; height: 100%;
  border-radius: 8px;
  background: linear-gradient(135deg, #1a0a3e, #2d1b69);
  border: 2px solid rgba(244,191,54,0.2);
  box-shadow: 0 2px 12px rgba(0,0,0,0.4);
  overflow: hidden;
  position: relative;
}
.poker-card-back-pattern {
  position: absolute; inset: 4px;
  border-radius: 5px;
  border: 1px solid rgba(244,191,54,0.15);
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 8px,
    rgba(244,191,54,0.04) 8px,
    rgba(244,191,54,0.04) 9px
  ), repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 8px,
    rgba(244,191,54,0.04) 8px,
    rgba(244,191,54,0.04) 9px
  );
}

/* Hold badge */
.poker-hold-badge {
  position: absolute;
  bottom: -24px;
  left: 50%; transform: translateX(-50%);
  background: linear-gradient(135deg, var(--accent), #d4a017);
  color: #231700;
  font-size: 0.55rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  padding: 2px 10px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(244,191,54,0.4);
}

/* Held card */
.poker-card.is-held {
  transform: translateY(-16px);
  filter: drop-shadow(0 0 12px rgba(244,191,54,0.4));
}
.poker-card.is-held .poker-card-face {
  border-color: var(--accent);
  box-shadow: 0 0 20px rgba(244,191,54,0.25), 0 4px 16px rgba(0,0,0,0.3);
}

/* Dealing animation */
.poker-card.is-dealing {
  animation: pokerDealIn 0.5s cubic-bezier(0.34,1.56,0.64,1) var(--deal-delay, 0ms) both;
}
@keyframes pokerDealIn {
  from { opacity: 0; transform: translateX(120px) rotate(15deg) scale(0.7); }
  to { opacity: 1; transform: translateX(0) rotate(0deg) scale(1); }
}

/* Card flip */
.poker-card.is-flipping {
  animation: pokerFlip 0.6s cubic-bezier(0.4,0,0.2,1) var(--deal-delay, 0ms) both;
}
@keyframes pokerFlip {
  0% { transform: rotateY(0deg); }
  50% { transform: rotateY(90deg) scale(1.05); }
  100% { transform: rotateY(0deg) scale(1); }
}

/* Winner highlight for result phase */
.poker-card.is-winner .poker-card-face {
  border-color: var(--accent);
  box-shadow: 0 0 24px rgba(244,191,54,0.35);
}

/* Hand area */
.poker-hand {
  display: flex;
  gap: 0.85rem;
  justify-content: center;
  align-items: flex-end;
  padding: 2.5rem 0 2rem;
  min-height: 180px;
  perspective: 800px;
}

/* Table felt effect behind cards */
.poker-table-area {
  background: radial-gradient(ellipse at center, rgba(16,59,32,0.15), transparent 70%);
  border-radius: 16px;
  padding: 1.5rem 1rem;
  margin: 0 -0.5rem;
  position: relative;
}
.poker-table-area::before {
  content: "";
  position: absolute; inset: 0;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.04);
  pointer-events: none;
}

/* Mobile responsive */
@media (max-width: 640px) {
  .poker-card { width: 64px; height: 90px; }
  .corner-rank { font-size: 0.65rem; }
  .corner-suit { font-size: 0.55rem; }
  .poker-card-center { font-size: 1.5rem; }
  .ace-suit { font-size: 2rem; }
  .poker-hand { gap: 0.4rem; padding: 1.5rem 0; }
  .poker-hold-badge { font-size: 0.5rem; bottom: -20px; }
}
```

---

## PROBLEM 5: Other Games Need Visual Improvements Too

### CoinFlip improvements (`CleanCoinFlipCard.tsx`):
The coin display (`.coin-display-token`) is a flat circle with "H" or "T". Make it:
- **3D coin** with metallic gold gradient
- CSS 3D rotation animation while spinning (use `rotateY`)
- Heads side: embossed "H" with light bevel
- Tails side: embossed "T"
- When result comes in, coin does a dramatic spin then lands showing result

Add these CSS rules:
```css
.coin-display-token {
  width: 120px; height: 120px;
  border-radius: 50%;
  background: linear-gradient(145deg, #f6be39, #c4941a);
  border: 3px solid rgba(255,255,255,0.15);
  box-shadow: 0 4px 24px rgba(212,160,23,0.35), inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2);
  display: flex; align-items: center; justify-content: center;
  font-size: 2.5rem; font-weight: 900;
  color: #231700;
  text-shadow: 0 1px 0 rgba(255,255,255,0.3);
  transition: transform 0.3s ease;
  transform-style: preserve-3d;
}
.coin-display-token.is-spinning {
  animation: coinSpin3D 1s cubic-bezier(0.4,0,0.2,1) infinite;
}
@keyframes coinSpin3D {
  0% { transform: rotateY(0deg); }
  100% { transform: rotateY(360deg); }
}
```

### Dice improvements (`CleanDiceCard.tsx`):
- Replace the text number display with visual dice faces using CSS dots
- Add a "rolling" animation (CSS shake + rotation)
- Dice should be 3D-looking with shadows

### Crash improvements (`CleanCrashCard.tsx`):
- The crash multiplier display should be large, centered, and dramatic
- Use a color gradient from green → yellow → red as multiplier increases
- Add a pulsing glow effect around the multiplier number
- The "CRASHED" state should have a dramatic red flash

### Casino page (`frontend/app/casino/page.tsx`):
- Each tab in `.casino-section-switcher` should have an icon:
  - Coin: 🪙
  - Dice: 🎲
  - Crash: 📈
  - Poker: 🃏
- Active tab should have gold underline + glow

---

## WHAT NOT TO CHANGE
- Do NOT change any game logic (handleDeal, handleDraw, handleSubmit, etc.)
- Do NOT change the cofhe encryption/decryption code
- Do NOT change the ABI imports or contract addresses
- Do NOT change the WalletProvider or CofheProvider
- Do NOT move files between directories
- Keep all existing functionality working

## BUILD & VERIFY
```bash
cd c:\Users\ankur\OneDrive\Desktop\CasFin\casfin\frontend
npm run build
npm run dev
```
Open `http://localhost:3000/casino` and verify:
1. **Poker tab**: Shows 5 face-down cards in bet phase, realistic white playing cards after deal
2. **Coin Flip tab**: 3D metallic gold coin that spins
3. **Dice tab**: Visual dice face with dots instead of plain numbers
4. **Crash tab**: Dramatic multiplier display with color gradients
5. **All tabs**: Game icons in tab switcher, smooth animations, mobile responsive
