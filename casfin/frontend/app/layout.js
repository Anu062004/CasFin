import "./globals.css";

export const metadata = {
  title: "CasFin",
  description: "Privacy-oriented prediction markets and casino infrastructure built for modular scale."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
