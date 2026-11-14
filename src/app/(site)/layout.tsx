/* eslint-disable @next/next/no-css-tags, @next/next/no-page-custom-font */
import type { Metadata } from "next";
import Script from "next/script";
import { metadata as siteMetadata } from "@/lib/site-meta";
import { themeScript } from "@/lib/theme-script";

export { viewport } from "@/lib/site-meta";

const title = "ENTX: a movie and TV exchange on NEAR testnet";
const description =
  "Trade movies and shows priced by one score built from TMDB data, and bet YES or NO on box office, awards and renewals with testnet NEAR.";

export const metadata: Metadata = {
  ...siteMetadata,
  title: { absolute: title },
  description,
  openGraph: { ...siteMetadata.openGraph, title, description },
  twitter: { card: "summary_large_image", title, description },
  other: { "site-kind": "software", "page-type": "software" },
};

// The landing page runs on the tasteskill kit (public/assets), loaded as plain files so it never meets Tailwind.
// The hero's entrance class goes on <html> before the first paint; the kit's scripts run after hydration.
const enterGuard =
  "document.documentElement.classList.add('m-enter');setTimeout(()=>document.documentElement.classList.add('m-enter-done'),700);" +
  "document.documentElement.classList.add('mo-js');setTimeout(()=>document.documentElement.classList.add('mo-safe'),2500);";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-type="software" data-radius="sharp" data-buttons="solid" data-motion="" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Archivo:wght@400;500;600;700&display=swap"
        />
        <link rel="stylesheet" href="/assets/system.css" />
        <link rel="stylesheet" href="/assets/ui/cards.css" />
        <link rel="stylesheet" href="/assets/motion/motion.css" />
        <link rel="stylesheet" href="/assets/backgrounds/backgrounds.css" />
        <link rel="stylesheet" href="/assets/layout/layout.css" />
        <link rel="stylesheet" href="/assets/icons/icon.css" />
        <link rel="stylesheet" href="/assets/ui/base.css" />
        <link rel="stylesheet" href="/assets/ui/notify/fragment.css" />
        <link rel="stylesheet" href="/assets/diagrams/diagram.css" />
        <link rel="stylesheet" href="/site/landing.css" />
        <link rel="stylesheet" href="/site/landing-dark.css" />
        <script dangerouslySetInnerHTML={{ __html: enterGuard }} />
        <link rel="modulepreload" href="/assets/moments/moments.js" />
        <link rel="modulepreload" href="/assets/moments/lib.js" />
        <link rel="modulepreload" href="/assets/moments/liquid-hover/moment.js" />
        <link rel="modulepreload" href="/assets/moments/line-carries-colour/moment.js" />
      </head>
      <body>
        {children}
        <Script src="/assets/backgrounds/backgrounds.js" strategy="afterInteractive" />
        <Script src="/assets/system.js" type="module" strategy="afterInteractive" />
        <Script src="/assets/motion/motion.js" type="module" strategy="afterInteractive" />
        <Script src="/assets/layout/layout.js" type="module" strategy="afterInteractive" />
        <Script src="/assets/diagrams/mount.js" type="module" strategy="afterInteractive" />
      </body>
    </html>
  );
}
