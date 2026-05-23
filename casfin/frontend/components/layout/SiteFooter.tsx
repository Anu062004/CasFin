import Link from "next/link";
import { CASFIN_CONFIG } from "@/lib/casfin-config";

const PRODUCT_LINKS = [
  { href: "/casino/dice", label: "Casino" },
  { href: "/predictions", label: "Prediction Markets" },
  { href: "/wallet", label: "Wallet" }
];

const INFRA_LINKS = [
  { href: "https://www.fhenix.io", label: "Fhenix" },
  { href: "https://chain.link", label: "Chainlink" },
  { href: "https://thegraph.com", label: "The Graph" },
  { href: CASFIN_CONFIG.explorerBaseUrl, label: "Arbiscan" }
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-mark is-logo">
            <img alt="" className="site-footer-logo" src="/casfin-logo-emblem.jpg" />
          </span>
          <div>
            <p className="site-footer-kicker">CasFin</p>
            <h2>Private casino and prediction rails on {CASFIN_CONFIG.chainName}.</h2>
          </div>
        </div>

        <div className="site-footer-columns">
          <div className="site-footer-column">
            <span className="site-footer-heading">Product</span>
            {PRODUCT_LINKS.map((link) => (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </div>

          <div className="site-footer-column">
            <span className="site-footer-heading">Infrastructure</span>
            {INFRA_LINKS.map((link) => (
              <a href={link.href} key={link.href} rel="noreferrer" target="_blank">
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <p className="site-footer-legal">
          This interface visualizes live blockchain data and helps users interact with deployed CasFin
          contracts. Always verify network, contract address, and transaction details before signing.
        </p>
      </div>
    </footer>
  );
}
