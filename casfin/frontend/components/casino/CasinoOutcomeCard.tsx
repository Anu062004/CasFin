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

export default function CasinoOutcomeCard({
  badge,
  detail,
  eyebrow,
  metrics = [],
  title,
  tone
}: CasinoOutcomeCardProps) {
  return (
    <section className={`casino-result-card is-${tone}`}>
      <div className="casino-result-header">
        <div>
          <p className="casino-result-eyebrow">{eyebrow}</p>
          <h4>{title}</h4>
        </div>
        <span className="casino-result-pill">{badge}</span>
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
