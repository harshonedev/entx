import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/nav";
import { TickerTape, Toasts } from "@/components/chrome";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ENTX — Entertainment, now tradable",
  description:
    "A multichain entertainment exchange on NEAR + Solana: trade movie & show markets priced by popularity, performance and sentiment.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>
          <Shell>
            <TickerTape />
            <main className="w-full max-w-[1480px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
            <footer className="border-t border-line px-4 py-4 text-[11px] leading-relaxed text-faint sm:px-6 lg:px-8">
              ENTX hackathon demo · Spot prices, balances and titles are simulated · Trade receipts can be written to
              Solana devnet (Memo) and NEAR testnet (ENTX contract) · Prediction pools on NEAR use real testnet NEAR
              · Intents quotes are dry-run only · Not a real-money exchange.
            </footer>
          </Shell>
          <Toasts />
        </Providers>
      </body>
    </html>
  );
}
