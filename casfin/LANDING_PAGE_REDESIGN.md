# TASK: Redesign CasFin Landing Page — Premium Casino Dashboard Hero

## WHAT TO DO
Redesign the landing page at `frontend/app/page.tsx` from its current minimal 2-button layout into a **premium crypto casino dashboard hero** — inspired by modern crypto gaming platforms. Keep the **exact same dark/gold color scheme** and **keep the existing video intro animation + looping background video**. Add content ON TOP of the video background.

---

## PROJECT INFO
- Root: `c:\Users\ankur\OneDrive\Desktop\CasFin\casfin`
- Landing page: `frontend/app/page.tsx`
- Global CSS: `frontend/app/globals.css` (landing styles start around line 2098)
- Color scheme: Dark (#0d0d10 background), Gold (#f4bf36 / #d4a017 accent), white text
- Font: Inter (already loaded via Google Fonts)
- NO Tailwind — all styles in globals.css using vanilla CSS
- CSS variables available: `--accent: #f4bf36`, `--text-primary`, `--text-secondary`, `--text-muted`, `--bg-card`, `--bg-sunken`, `--navbar-height`

---

## CURRENT CODE (keep the video/animation logic, redesign the overlay content)

```tsx
// frontend/app/page.tsx — current (111 lines)
// The video intro + loop + skip button + fade logic MUST stay exactly as-is
// Only the content inside .landing-overlay needs to change
```

### What to KEEP untouched:
- `introVideoRef`, `introTimerRef`, `exitTimerRef` refs
- `introFinished`, `introFading`, `appEntered` states
- `finishIntro()` and `enterApp(route)` functions
- The `<video>` elements (intro + loop)
- The skip button
- The `is-exiting` class logic
- The `landing-lock` body class

### What to REDESIGN:
The content inside the `.landing-overlay` div — currently just 2 buttons. Replace with a full hero dashboard.

---

## NEW LAYOUT (what the landing-overlay should contain)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [looping casino video background — already exists, keep it]        │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  [ENCRYPTED] [PRIVATE] [ON-CHAIN]          Vault Balance        │ │
│  │                                             ┌───────────────┐   │ │
│  │  Bet Private.                               │  Encrypted    │   │ │
│  │  Win Big.                                   │  0.05 ETH     │   │ │
│  │                                             │  ▲ Vault TVL  │   │ │
│  │  The first fully encrypted casino           └───────────────┘   │ │
│  │  powered by FHE. Your bets, your                                │ │
│  │  balance, your privacy.                                         │ │
│  │                                                                 │ │
│  │  [★ Enter Casino]  [Predictions]                                │ │
│  │                                                                 │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐          │ │
│  │  │ 🎰 Casino   │ │ 📊 Markets  │ │ 🔒 FHE Privacy   │          │ │
│  │  │ 4 games,    │ │ Predict     │ │ CoFHE encrypted  │          │ │
│  │  │ instant     │ │ real-world  │ │ bets, balances,  │          │ │
│  │  │ payouts     │ │ outcomes    │ │ and outcomes     │          │ │
│  │  └─────────────┘ └─────────────┘ └──────────────────┘          │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## NEW JSX for the landing-overlay (replace the current .landing-overlay contents)

```tsx
<div className={`landing-overlay ${introFinished ? "is-visible" : ""}`}>
  <div className="landing-hero-container">

    {/* Top row: tag pills */}
    <div className="landing-tag-row">
      <span className="landing-tag">🔐 Encrypted</span>
      <span className="landing-tag">🛡️ Private</span>
      <span className="landing-tag">⛓️ On-Chain</span>
    </div>

    {/* Main hero content: 2-column */}
    <div className="landing-hero-grid">

      {/* Left: headline + subtitle + buttons */}
      <div className="landing-hero-left">
        <h1 className="landing-headline">
          Bet Private.<br />
          <span className="landing-headline-accent">Win Big.</span>
        </h1>
        <p className="landing-subtitle">
          The first fully encrypted casino powered by Fully Homomorphic Encryption.
          Your bets, your balance, your privacy — all on-chain.
        </p>
        <div className="landing-actions">
          <button
            className="land-btn land-btn-primary"
            onClick={() => enterApp("/casino")}
            type="button"
          >
            Enter Casino
          </button>
          <button
            className="land-btn land-btn-secondary"
            onClick={() => enterApp("/predictions")}
            type="button"
          >
            Predictions
          </button>
        </div>
      </div>

      {/* Right: vault balance card (glassmorphism) */}
      <div className="landing-vault-card">
        <span className="landing-vault-eyebrow">Vault Balance</span>
        <span className="landing-vault-label">Encrypted</span>
        <span className="landing-vault-value">0.05 ETH</span>
        <span className="landing-vault-tvl">Shared Vault · One balance for all games</span>
      </div>
    </div>

    {/* Bottom: 3 feature cards */}
    <div className="landing-features-row">
      <div className="landing-feature-card" onClick={() => enterApp("/casino")}>
        <div className="landing-feature-icon">🎰</div>
        <div className="landing-feature-info">
          <strong>Casino Games</strong>
          <span>Coin Flip · Dice · Crash · Poker</span>
        </div>
      </div>
      <div className="landing-feature-card" onClick={() => enterApp("/predictions")}>
        <div className="landing-feature-icon">📊</div>
        <div className="landing-feature-info">
          <strong>Prediction Markets</strong>
          <span>Bet on real-world outcomes</span>
        </div>
      </div>
      <div className="landing-feature-card">
        <div className="landing-feature-icon">🔒</div>
        <div className="landing-feature-info">
          <strong>FHE Privacy</strong>
          <span>CoFHE encrypted bets &amp; balances</span>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## NEW CSS (add to globals.css, replace old landing-overlay styles at line ~2127-2162)

Keep the existing `.landing-page`, `.landing-experience`, `.landing-loop-layer`, `.video-intro`, `.skip-btn` styles. Only add/replace the overlay and hero content styles:

```css
/* ── Landing Hero Container ── */
.landing-hero-container {
  width: min(1140px, calc(100% - 3rem));
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
  padding-top: calc(var(--navbar-height, 64px) + 3rem);
  padding-bottom: 3rem;
  animation: heroFadeUp 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
}

@keyframes heroFadeUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Tag pills ── */
.landing-tag-row {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.landing-tag {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 0.3rem 0.85rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ── Hero 2-column grid ── */
.landing-hero-grid {
  display: grid;
  grid-template-columns: 1.3fr 0.7fr;
  gap: 3rem;
  align-items: center;
}

/* ── Headline ── */
.landing-headline {
  font-size: clamp(2.2rem, 5vw, 3.8rem);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.03em;
  color: #fff;
  margin: 0;
}
.landing-headline-accent {
  background: linear-gradient(135deg, #f6be39, #d4a017);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Subtitle ── */
.landing-subtitle {
  font-size: 1rem;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.55);
  max-width: 480px;
  margin: 1rem 0 0;
}

/* ── CTA buttons row ── */
.landing-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin-top: 1.75rem;
}
.land-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 2rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-transform: uppercase;
}
.land-btn-primary {
  background: linear-gradient(135deg, #f6be39, #d4a017);
  border: none;
  color: #231700;
  box-shadow: 0 6px 28px rgba(212, 160, 23, 0.35), 0 0 0 1px rgba(246, 190, 57, 0.2);
}
.land-btn-primary:hover {
  box-shadow: 0 10px 40px rgba(212, 160, 23, 0.55), 0 0 0 1px rgba(246, 190, 57, 0.4);
  transform: translateY(-2px);
}
.land-btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.85);
}
.land-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.35);
  transform: translateY(-2px);
}

/* ── Vault balance card (glassmorphism) ── */
.landing-vault-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  animation: vaultCardSlide 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
}
@keyframes vaultCardSlide {
  from { opacity: 0; transform: translateX(40px); }
  to { opacity: 1; transform: translateX(0); }
}
.landing-vault-eyebrow {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--accent, #f4bf36);
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
.landing-vault-label {
  font-size: 1.8rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
  margin: 0.4rem 0 0.1rem;
}
.landing-vault-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--accent, #f4bf36);
}
.landing-vault-tvl {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 0.5rem;
}

/* ── Feature cards row ── */
.landing-features-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}
.landing-feature-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 1.1rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.landing-feature-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(246, 190, 57, 0.2);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}
.landing-feature-icon {
  font-size: 1.8rem;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(246, 190, 57, 0.08);
  border-radius: 12px;
  border: 1px solid rgba(246, 190, 57, 0.15);
}
.landing-feature-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.landing-feature-info strong {
  font-size: 0.88rem;
  font-weight: 700;
  color: #fff;
}
.landing-feature-info span {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
}

/* ── Update landing-overlay to be scrollable + aligned top ── */
.landing-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.8s ease;
  background: linear-gradient(
    180deg,
    rgba(13, 13, 16, 0.3) 0%,
    rgba(13, 13, 16, 0.5) 40%,
    rgba(13, 13, 16, 0.85) 100%
  );
  overflow-y: auto;
}
.landing-overlay.is-visible {
  opacity: 1;
  pointer-events: auto;
}

/* ── Mobile responsive ── */
@media (max-width: 768px) {
  .landing-hero-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  .landing-features-row {
    grid-template-columns: 1fr;
  }
  .landing-headline {
    font-size: clamp(1.8rem, 7vw, 2.5rem);
  }
  .landing-hero-container {
    padding-top: calc(var(--navbar-height, 64px) + 1.5rem);
    gap: 1.5rem;
  }
  .landing-vault-card {
    order: -1;
  }
}
```

---

## IMPORTANT RULES
- Do NOT remove or change the intro video, loop video, or skip button
- Do NOT change `finishIntro()` or `enterApp()` logic
- Do NOT change the navbar — it renders from the layout, not this page
- The landing-overlay gradient MUST darken the video enough so text is readable
- All new styles go in `frontend/app/globals.css`
- Feature cards should be clickable — Casino and Predictions cards call `enterApp()`, FHE card is informational only
- The vault card value (0.05 ETH) is a static display for now — not connected to chain

## VERIFY
```bash
cd c:\Users\ankur\OneDrive\Desktop\CasFin\casfin\frontend
npm run build
npm run dev
```
Open `http://localhost:3000` → intro video plays → skip or wait → hero landing page appears with headline, vault card, and feature cards. Buttons navigate to `/casino` and `/predictions`.
