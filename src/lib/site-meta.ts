import type { Metadata, Viewport } from "next";
import { CHAIN, CHAIN_LABEL, HOSTS, IS_LIVE, chainUrl } from "@/lib/env";

const chainName = CHAIN_LABEL[CHAIN].split(" ")[0];
// The host this build serves: solana.entx.space has one deployment (demo until M3); NEAR splits live and demo.
const siteUrl = IS_LIVE || CHAIN === "solana" ? chainUrl(CHAIN) : HOSTS.nearDemo;
export const title = "ENTX — Entertainment, now tradable";
export const description = `An entertainment exchange on ${chainName}: trade movie & show markets priced by popularity, performance and sentiment.`;

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

export const viewport: Viewport = { themeColor: "#141414", colorScheme: "light" };
