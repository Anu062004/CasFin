import { buildExplorerUrl } from "@/lib/casfin-config";
import { EMPTY_ADDRESS, formatAddress } from "@/lib/casfin-client";

export function StatCard({ label, value, detail }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export function AddressLink({ address, label }) {
  if (!address || address === EMPTY_ADDRESS) {
    return <span className="inline-muted">{label || "Not set"}</span>;
  }

  return (
    <a className="address-link" href={buildExplorerUrl("address", address)} rel="noreferrer" target="_blank">
      {label || formatAddress(address)}
    </a>
  );
}

export function ActionButton({ children, disabled, onClick, variant = "primary" }) {
  return (
    <button className={`action-button ${variant}`} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}
