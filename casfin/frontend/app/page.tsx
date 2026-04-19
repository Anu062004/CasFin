"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const INTRO_FADE_MS = 800;
const LANDING_EXIT_MS = 950;

export default function HomePage() {
  const router = useRouter();
  const introVideoRef = useRef(null);
  const introTimerRef = useRef(null);
  const exitTimerRef = useRef(null);

  const [introFinished, setIntroFinished] = useState(false);
  const [introFading, setIntroFading] = useState(false);
  const [appEntered, setAppEntered] = useState(false);

  useEffect(() => {
    const introVideo = introVideoRef.current;
    if (!introVideo) return undefined;
    introVideo.play().catch(() => {});
    return undefined;
  }, []);

  useEffect(() => {
    if (!appEntered) document.body.classList.add("landing-lock");
    return () => document.body.classList.remove("landing-lock");
  }, [appEntered]);

  useEffect(() => {
    return () => {
      if (introTimerRef.current) window.clearTimeout(introTimerRef.current);
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current);
    };
  }, []);

  function finishIntro() {
    if (introFinished || introFading) return;
    setIntroFading(true);
    introTimerRef.current = window.setTimeout(() => {
      setIntroFinished(true);
      setIntroFading(false);
      if (introVideoRef.current) introVideoRef.current.pause();
    }, INTRO_FADE_MS);
  }

  function enterApp(route: string) {
    if (appEntered) return;
    setAppEntered(true);
    exitTimerRef.current = window.setTimeout(() => {
      document.body.classList.remove("landing-lock");
      router.push(route);
    }, LANDING_EXIT_MS);
  }

  return (
    <main className={`landing-page ${appEntered ? "is-exiting" : ""}`}>
      <section className="landing-experience">
        {/* Looping background video */}
        <div className="landing-loop-layer" aria-hidden="true">
          <video autoPlay loop muted playsInline preload="auto" className="landing-video">
            <source src="/videos/casfin-landing-loop.mp4" type="video/mp4" />
          </video>
          <div className="landing-backdrop-gradient" />
        </div>

        {/* Intro animation video */}
        <div className={`video-intro ${introFading || introFinished ? "fade-out" : ""}`}>
          <video
            ref={introVideoRef}
            autoPlay
            muted
            playsInline
            preload="auto"
            className="landing-video"
            onEnded={finishIntro}
          >
            <source src="/videos/casfin-intro.mp4" type="video/mp4" />
          </video>
          <button type="button" className="skip-btn" onClick={finishIntro}>
            Skip
          </button>
        </div>

        {/* Hero overlay revealed after intro */}
        <div className={`landing-overlay ${introFinished ? "is-visible" : ""}`}>
          <div className="landing-hero-container">
            <div className="landing-tag-row">
              <span className="landing-tag">Encrypted</span>
              <span className="landing-tag">Private</span>
              <span className="landing-tag">On-Chain</span>
            </div>

            <div className="landing-hero-grid">
              <div className="landing-hero-left">
                <h1 className="landing-headline">
                  Bet Private.
                  <br />
                  <span className="landing-headline-accent">Win Big.</span>
                </h1>
                <p className="landing-subtitle">
                  The first fully encrypted casino powered by Fully Homomorphic
                  Encryption. Your bets, your balance, your privacy - all on-chain.
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

              <div className="landing-vault-card">
                <span className="landing-vault-eyebrow">Vault Balance</span>
                <span className="landing-vault-label">Encrypted</span>
                <span className="landing-vault-value">0.05 ETH</span>
                <span className="landing-vault-tvl">Shared Vault · One balance for all games</span>
              </div>
            </div>

            <div className="landing-features-row">
              <button
                className="landing-feature-card"
                onClick={() => enterApp("/casino")}
                type="button"
              >
                <div className="landing-feature-icon" aria-hidden="true" />
                <div className="landing-feature-info">
                  <strong>Casino Games</strong>
                  <span>Coin Flip · Dice · Crash · Poker</span>
                </div>
              </button>
              <button
                className="landing-feature-card"
                onClick={() => enterApp("/predictions")}
                type="button"
              >
                <div className="landing-feature-icon" aria-hidden="true" />
                <div className="landing-feature-info">
                  <strong>Prediction Markets</strong>
                  <span>Bet on real-world outcomes</span>
                </div>
              </button>
              <div className="landing-feature-card">
                <div className="landing-feature-icon" aria-hidden="true" />
                <div className="landing-feature-info">
                  <strong>FHE Privacy</strong>
                  <span>CoFHE encrypted bets &amp; balances</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
