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

  useEffect(() => {
    if (sessionInitializing) {
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
    <div className={`fhe-progress-bar${exiting ? " is-exiting" : ""}`} role="status" aria-live="polite">
      <div className="fhe-progress-inner">
        <span className="fhe-progress-icon" aria-hidden="true">🔐</span>
        <div className="fhe-progress-content">
          <div className="fhe-progress-label">{label}</div>
          <div className="fhe-progress-track">
            <div className="fhe-progress-fill" style={{ width: `${sessionProgress}%` }} />
          </div>
        </div>
        <span className="fhe-progress-pct">{sessionProgress}%</span>
      </div>
    </div>
  );
}
