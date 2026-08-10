import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VERIQAS — Quantum Governance Operating System",
  description: "Verified Quantum Assurance & Governance Platform",
  icons: { icon: "/icon_veriqas.png", shortcut: "/icon_veriqas.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${montserrat.variable}`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
