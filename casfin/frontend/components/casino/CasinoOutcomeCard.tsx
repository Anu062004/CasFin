"use client";

interface CasinoOutcomeMetric {
  label: string;
  value: string;
}

interface CasinoOutcomeCardProps {
  badge: string;
  detail: string;
  eyebrow: string;
  metrics?: CasinoOutcomeMetric[];
  title: string;
  tone: "idle" | "pending" | "win" | "loss";
}

const TONE_META = {
  idle: {
    glyph: "•",
    label: "Standby"
  },
  pending: {
    glyph: "~",
    label: "Pending"
  },
  win: {
    glyph: "+",
    label: "Win"
  },
  loss: {
    glyph: "x",
    label: "Loss"
  }
} as const;

export default function CasinoOutcomeCard({
  badge,
  detail,
  eyebrow,
  metrics = [],
  title,
  tone
}: CasinoOutcomeCardProps) {
  const toneMeta = TONE_META[tone];

  return (
    <section className={`casino-result-card is-${tone}`}>
      <div className="casino-result-glow" aria-hidden="true" />

      <div className="casino-result-header">
        <div className="casino-result-lead">
          <span className="casino-result-icon" aria-hidden="true">{toneMeta.glyph}</span>
          <div>
            <p className="casino-result-eyebrow">{eyebrow}</p>
            <h4>{title}</h4>
          </div>
        </div>
        <div className="casino-result-badges">
          <span className="casino-result-tone">{toneMeta.label}</span>
          <span className="casino-result-pill">{badge}</span>
        </div>
      </div>

      <p className="casino-result-detail">{detail}</p>

      {metrics.length ? (
        <div className="casino-result-metrics">
          {metrics.map((metric) => (
            <div className="casino-result-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
