import "./globals.css";
import { Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import StatusBar from "@/components/StatusBar";
import VideoBackground from "@/components/VideoBackground";
import WalletProvider from "@/components/WalletProvider";

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
        <WalletProvider>
          <VideoBackground />
          <Navbar />
          <StatusBar />
          <div className="app-chrome">{children}</div>
        </WalletProvider>
      </body>
    </html>
  );
}
