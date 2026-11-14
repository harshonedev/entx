import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/nav";
import { TickerTape, Toasts } from "@/components/chrome";
import { CHAIN, CHAIN_LABEL, CHAIN_ON, HOSTS, IS_LIVE, chainUrl } from "@/lib/env";
import "./globals.css";

const uiFont = IBM_Plex_Sans({ variable: "--font-ui", subsets: ["latin"], weight: ["400", "500", "600"] });
const codeFont = IBM_Plex_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"] });

const chainName = CHAIN_LABEL[CHAIN].split(" ")[0];
// The host this build serves: solana.entx.space has one deployment (demo until M3); NEAR splits live and demo.
const siteUrl = IS_LIVE || CHAIN === "solana" ? chainUrl(CHAIN) : HOSTS.nearDemo;
const title = "ENTX — Entertainment, now tradable";
const description = `An entertainment exchange on ${chainName}: trade movie & show markets priced by popularity, performance and sentiment.`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s · ENTX" },
  description,
  applicationName: "ENTX",
  keywords: ["ENTX", "entertainment exchange", "prediction markets", "movies", "TV shows", chainName, "NEAR", "Solana", "TMDB"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "ENTX",
    url: "/",
    title,
    description,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = { themeColor: "#0e0e0e", colorScheme: "dark" };

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
