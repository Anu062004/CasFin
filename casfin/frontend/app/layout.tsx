import "./globals.css";
import { Inter, JetBrains_Mono, DM_Serif_Display } from "next/font/google";
import FheProgressBar from "@/components/FheProgressBar";
import NavbarPrivy from "@/components/NavbarPrivy";
import PrivyAppProvider from "@/components/PrivyAppProvider";
import StatusBar from "@/components/StatusBar";
import VideoBackground from "@/components/VideoBackground";
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
  description: "Premium glass prediction markets and casino gaming on Arbitrum Sepolia."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrains.variable} ${dmSerif.variable}`}>
        <PrivyAppProvider>
          <CofheProvider>
            <WalletProvider>
              <VideoBackground />
              <NavbarPrivy />
              <StatusBar />
              <FheProgressBar />
              <div className="app-chrome">{children}</div>
            </WalletProvider>
          </CofheProvider>
        </PrivyAppProvider>
      </body>
    </html>
  );
}
