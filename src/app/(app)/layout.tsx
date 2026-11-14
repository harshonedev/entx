import { Archivo, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/nav";
import { Toasts } from "@/components/chrome";
import { CHAIN_ON, IS_LIVE } from "@/lib/env";
export { metadata, viewport } from "@/lib/site-meta";
import "../globals.css";

const uiFont = Archivo({ variable: "--font-ui", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const condFont = Barlow_Condensed({ variable: "--font-cond", subsets: ["latin"], weight: ["500", "600", "700"] });
const codeFont = IBM_Plex_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"] });

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${uiFont.variable} ${condFont.variable} ${codeFont.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only z-[60] rounded bg-text px-3 py-2 text-sm font-semibold text-bg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <Providers>
          <Shell>
            <main id="main" tabIndex={-1} className="w-full outline-none max-w-[1480px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
            <footer className="w-full border-t-2 border-ink px-4 py-4 text-xs leading-relaxed text-muted sm:px-6 lg:px-8">
              {IS_LIVE
                ? "ENTX live on testnet · Titles, posters and EPI inputs are real (TMDB); asset prices and balances are a simulated preview ·"
                : "ENTX demo · Titles, posters and popularity inputs are real (TMDB); spot prices, balances and oracle events are simulated ·"}{" "}
              {CHAIN_ON.near
                ? "Trade receipts can be written to NEAR testnet (ENTX contract) · Prediction pools hold testnet NEAR on-chain (no monetary value) · Intents quotes are dry-run only ·"
                : "Trade receipts can be written to Solana devnet (Memo program) ·"}{" "}
              Not a real-money exchange.
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
