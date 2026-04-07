import "./globals.css";
import { Inter } from "next/font/google";
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

export const metadata = {
  title: "CasFin",
  description: "Premium glass prediction markets and casino gaming on Arbitrum Sepolia."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <PrivyAppProvider>
          <CofheProvider>
            <WalletProvider>
              <VideoBackground />
              <NavbarPrivy />
              <StatusBar />
              <div className="app-chrome">{children}</div>
            </WalletProvider>
          </CofheProvider>
        </PrivyAppProvider>
      </body>
    </html>
  );
}
