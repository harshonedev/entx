import type { Metadata, Viewport } from "next";
import { CHAIN, CHAIN_LABEL, HOSTS, IS_LIVE, chainUrl } from "@/lib/env";

const chainName = CHAIN_LABEL[CHAIN].split(" ")[0];
// The host this build serves: solana.entx.space has one deployment (demo until M3); NEAR splits live and demo.
const siteUrl = IS_LIVE || CHAIN === "solana" ? chainUrl(CHAIN) : HOSTS.nearDemo;
export const title = "ENTX — Entertainment, now tradable";
export const description = `An entertainment exchange on ${chainName}: trade movie & show markets priced by popularity, performance and sentiment.`;

// Route-group layouts set `openGraph`/`twitter` objects, which replace (not merge) the file-based
// app/opengraph-image.png, so the share image is named here explicitly.
export const ogImage = { url: "/opengraph-image.png", width: 1200, height: 630, alt: "ENTX wordmark — Entertainment, now tradable" };

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
    images: [ogImage],
  },
  twitter: { card: "summary_large_image", title, description, images: [ogImage] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#141414" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0908" },
  ],
  colorScheme: "light dark",
};
