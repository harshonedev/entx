import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/nav";
import { TickerTape, Toasts } from "@/components/chrome";
import "./globals.css";

const uiFont = IBM_Plex_Sans({ variable: "--font-ui", subsets: ["latin"], weight: ["400", "500", "600"] });
const codeFont = IBM_Plex_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "ENTX — Entertainment, now tradable",
  description:
    "A multichain entertainment exchange on NEAR + Solana: trade movie & show markets priced by popularity, performance and sentiment.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${uiFont.variable} ${codeFont.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only z-[60] rounded bg-text px-3 py-2 text-sm font-semibold text-bg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <Providers>
          <Shell>
            <TickerTape />
            <main id="main" tabIndex={-1} className="w-full outline-none max-w-[1480px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
            <footer className="border-t border-line px-4 py-4 text-xs leading-relaxed text-muted sm:px-6 lg:px-8">
              ENTX hackathon demo · Titles, posters and popularity inputs are real (TMDB); spot prices, balances and
              oracle events are simulated · Trade receipts can be written to Solana devnet (Memo) and NEAR testnet
              (ENTX contract) · Prediction pools hold testnet NEAR on-chain (no monetary value) · Intents quotes are dry-run only · Not
              a real-money exchange.
              <span className="mt-2 flex items-center gap-2">
                <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="cursor-pointer inline-flex items-center justify-center font-semibold text-muted hover:text-text pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                  TMDB
                </a>
                This product uses the TMDB API but is not endorsed or certified by TMDB.
              </span>
            </footer>
          </Shell>
          <Toasts />
        </Providers>
      </body>
    </html>
  );
}
