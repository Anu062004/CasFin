"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { buildExplorerUrl } from "@/lib/casfin-config";

export default function StatusBar() {
  const { lastTransaction, pendingAction, statusEventId, statusMessage, statusTone } = useWallet();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!statusEventId && !pendingAction) {
      return undefined;
    }

    setVisible(true);

    if (pendingAction) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setVisible(false);
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pendingAction, statusEventId, statusMessage]);

  if ((!statusEventId && !pendingAction) || !statusMessage) {
    return null;
  }

  return (
    <aside className={`status-toast tone-${statusTone} ${visible ? "is-visible" : ""}`}>
      <div className="status-toast-head">
        <span className="status-toast-label">{pendingAction ? "Transaction Pending" : "Protocol Status"}</span>
        {pendingAction ? <span className="status-spinner" /> : null}
      </div>
      <p className="status-toast-message">{statusMessage}</p>
      {lastTransaction?.hash ? (
        <a
          className="status-toast-link"
          href={buildExplorerUrl("tx", lastTransaction.hash)}
          rel="noreferrer"
          target="_blank"
        >
          View {lastTransaction.label}
        </a>
      ) : null}
    </aside>
  );
}
