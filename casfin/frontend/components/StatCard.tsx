"use client";

import { useEffect, useState } from "react";
import GlassCard from "@/components/GlassCard";

export default function StatCard({ className = "", detail, label, stagger = 0, value }: any) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    setFlashing(true);
    const timer = window.setTimeout(() => {
      setFlashing(false);
    }, 650);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value]);

  const classes = ["stat-card", flashing ? "is-flashing" : "", className].filter(Boolean).join(" ");

  return (
    <GlassCard className={classes} stagger={stagger}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {detail ? <p className="stat-detail">{detail}</p> : null}
    </GlassCard>
  );
}
