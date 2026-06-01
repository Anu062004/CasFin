"use client";

import { useEffect, useState } from "react";
import { useCofhe } from "@/lib/cofhe-provider";

const STEP_LABELS: Record<string, string> = {
  initTfhe: "Compiling encryption engine...",
  fetchKeys: "Fetching FHE public keys...",
  pack: "Packing encrypted input...",
  prove: "Generating ZK proof...",
  verify: "Verifying with CoFHE network..."
};

export default function FheProgressBar() {
  const { sessionInitializing, sessionStep, sessionProgress } = useCofhe();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (sessionInitializing) {
      if (!visible) {
        setCompact(false);
      }

      setVisible(true);
      setExiting(false);
    } else if (visible) {
      setExiting(true);
      const timer = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(timer);
    }
  }, [sessionInitializing, visible]);

  if (!visible) return null;

  const label = sessionStep ? (STEP_LABELS[sessionStep] ?? sessionStep) : "Initializing encryption...";

  return (
    <div
      className={[
        "fhe-progress-bar",
        compact ? "is-compact" : "is-fullscreen",
        exiting ? "is-exiting" : ""
      ].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      {!compact ? (
        <>
          <video
            aria-hidden="true"
            autoPlay
            className="fhe-progress-video"
            loop
            muted
            playsInline
            src="/videos/casfin-landing-loop.mp4"
          />
          <div className="fhe-progress-scrim" aria-hidden="true" />
        </>
      ) : null}

      <div className="fhe-progress-inner">
        <span className="fhe-progress-icon" aria-hidden="true">FHE</span>
        <div className="fhe-progress-content">
          {!compact ? (
            <div className="fhe-progress-copy">
              <span className="fhe-progress-kicker">Encrypted Session</span>
              <h2>Preparing private play</h2>
              <p>CasFin is opening the CoFHE session, loading public keys, and proving the encrypted wallet context.</p>
            </div>
          ) : null}
          <div className="fhe-progress-label">{label}</div>
          <div className="fhe-progress-track">
            <div className="fhe-progress-fill" style={{ width: `${sessionProgress}%` }} />
          </div>
        </div>
        <span className="fhe-progress-pct">{sessionProgress}%</span>
        {!compact ? (
          <button className="fhe-progress-skip" onClick={() => setCompact(true)} type="button">
            Skip
          </button>
        ) : null}
      </div>
    </div>
  );
}
