import "./globals.css";
import "./casino-guide.css";
import { Inter, JetBrains_Mono, DM_Serif_Display } from "next/font/google";
import FheProgressBar from "@/components/FheProgressBar";
import CosmicBackground from "@/components/layout/CosmicBackground";
import NavbarPrivy from "@/components/NavbarPrivy";
import PrivyAppProvider from "@/components/PrivyAppProvider";
import SiteFooter from "@/components/layout/SiteFooter";
import StatusBar from "@/components/StatusBar";
import WalletProvider from "@/components/WalletProvider";
import { CofheProvider } from "@/lib/cofhe-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["300", "400", "500"]
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: "400"
});

export const metadata = {
  title: "CasFin",
  description: "Encrypted casino gaming and prediction markets on Arbitrum Sepolia."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrains.variable} ${dmSerif.variable} casfin-body`}>
        <CosmicBackground />
        <PrivyAppProvider>
          <CofheProvider>
            <WalletProvider>
              <NavbarPrivy />
              <StatusBar />
              <FheProgressBar />
              <div className="app-chrome">{children}</div>
              <SiteFooter />
            </WalletProvider>
          </CofheProvider>
        </PrivyAppProvider>
      </body>
    </html>
  );
}
