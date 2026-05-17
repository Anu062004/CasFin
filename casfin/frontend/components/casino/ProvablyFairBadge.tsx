"use client";

import { buildExplorerUrl } from "@/lib/casfin-config";

interface Props {
  contractAddress: string;
  modeLabel: string;
}

export default function ProvablyFairBadge({ contractAddress, modeLabel }: Props) {
  return (
    <a
      className="provably-fair-badge"
      href={buildExplorerUrl("address", contractAddress)}
      rel="noreferrer"
      target="_blank"
    >
      <span className="provably-fair-icon" aria-hidden="true">PF</span>
      <span className="provably-fair-copy">
        <strong>Provably Fair</strong>
        <span>{modeLabel}</span>
      </span>
    </a>
  );
}
