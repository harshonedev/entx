/* eslint-disable @next/next/no-img-element */
/*
  ENTX landing page, built with tasteskill 2.5.1 (the kit lives in public/assets, page CSS in public/site/landing.css).
  kind: software (fintech app; site-kind software)
  deal: hero triptych · nav nav-cards (nav--tone, the app's ink top bar) · close close-type · footer footer-statement
        (on the ink ground) · rhythm surface-pairs · buttons solid (pill re-dealt: the brand is square) · mark: the
        client's own wordmark · palette and type: the client's own ("Weekend Grosses", start.mjs brand) · grounds: none
        (the brand allows no gradients) · effect: none (the dealt grain-gradient dropped: the brand allows no gradients)
  moments: liquid-hover on the poster in #epi (the pointer ripples a real TMDB poster: the inputs behind the score);
           line-carries-colour on #onchain (the page turns to the surface ground where the chain part starts)
  Every count and score below is read from src/data/catalog.json at build time.
*/
import Link from "next/link";
import catalog from "@/data/catalog.json";
import { computeEpi, type EpiParts } from "@/lib/epi";
import { NEAR_CONTRACT, nearAccountUrl } from "@/lib/near-config";

type Asset = (typeof catalog.assets)[number];

const ORACLE = "entx-oracle-1794654167.testnet";
const REPO = "https://github.com/harshonedev/entx";
const assets = catalog.assets as Asset[];
const predictions = catalog.predictions;
const epiOf = (a: Asset) => computeEpi(a.epiParts as EpiParts);
const ranked = [...assets].sort((a, b) => epiOf(b) - epiOf(a));
const byId = (id: string) => assets.find((a) => a.id === id)!;
const titleCount = assets.length;
const predictionCount = predictions.length;
const poster = (a: Asset, size: "w342" | "w500" | "w780") => a.posterUrl.replace("/w342/", `/${size}/`);
const money = (n: number) => `$${n.toFixed(2)}`;
const cents = (p: number) => `${Math.round(p * 100)}¢`;
const one = (n: number) => n.toFixed(1);
const pred = (id: string) => predictions.find((p) => p.id === id)!;

// the people in the pictures are the catalogue's own titles, each poster used once on the page
const lead = ranked[0]; // the board's open item
const heart = byId("heart-of-the-beast"); // the EPI section's poster
const evil = byId("resident-evil");
const navCards = [byId("godzilla-minus-zero"), byId("ebenezer"), byId("visionquest")];

const pSpidey = pred("spider-man-brand-new-day-box-office-0");
const pOdyssey = predictions.find((p) => p.assetId === "the-odyssey")!;
const wall = [
  pred("avengers-doomsday-box-office-2"),
  pred("the-lord-of-the-rings-the-rings-of-power-renewal"),
  pred("resident-evil-popularity-7"),
  pred("12-12-12-renewal-5"),
  pred("heart-of-the-beast-box-office-8"),
].map((p) => ({ p, a: byId(p.assetId) }));

// the demo oracle event "Box office beats forecast": box office +14, votes +6 (src/lib/assets.ts)
const evilAfter = computeEpi({
  ...(evil.epiParts as EpiParts),
  boxOffice: Math.min(100, evil.epiParts.boxOffice + 14),
  social: Math.min(100, evil.epiParts.social + 6),
});

const WEIGHTS: [keyof EpiParts, string, string, number][] = [
  ["boxOffice", "Box office proxy", "Worldwide revenue; budget before release; votes for shows", 35],
  ["streaming", "TMDB popularity", "TMDB popularity, ranked within the catalogue", 25],
  ["social", "Audience votes", "TMDB vote count, not audience size", 25],
  ["critics", "Audience rating", "TMDB vote average times ten", 15],
];

const arrow = (
  <svg className="m-arrow" viewBox="0 0 12 12" aria-hidden="true">
    <path className="m-arrow__stem" d="M1 6h8" />
    <path className="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5" />
  </svg>
);

function Wordmark({ className }: { className?: string }) {
  // the client's wordmark (src/components/logo.tsx), its X in the brand red as the app's top bar shows it
  return (
    <svg viewBox="0 0 924 155" className={className} role="img" aria-label="ENTX">
      <path fill="currentColor" d="M0 0H154V21H21V65H154V85H21V133H154V155H0ZM248 0H282L407 131V0H430V155H396L271 24V155H248ZM514 0H674V20H605V155H583V20H514Z" />
      <path fill="var(--brand-red)" d="M754 0H784L836 57.6L888 0H918L851 74.2L924 155H894L836 90.8L778 155H748L821 74.2Z" />
    </svg>
  );
}

function Diagram({ spec }: { spec: object }) {
  return (
    <div className="dg" data-diagram="">
      <script type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(spec) }} />
    </div>
  );
}

const hub = {
  layout: "hub",
  alt: "The ENTX contract on NEAR testnet holds the market registry, oracle EPI reports, trade receipts and YES/NO pools; each trade can add a Solana devnet memo, and NEAR Intents quotes run as a dry run.",
  center: { label: "ENTX contract", icon: "si:near" },
  spokes: [
    { label: "Market registry", icon: "ui:list" },
    { label: "Oracle EPI reports", icon: "ui:radio-tower" },
    { label: "Trade receipts", icon: "ui:receipt" },
    { label: "YES/NO pools", icon: "ui:scale" },
    { label: "Solana devnet memo", icon: "si:solana" },
    { label: "NEAR Intents quotes", icon: "ui:arrow-left-right" },
  ],
};


export default function Landing() {
  const board = ranked.slice(0, 8);
  return (
    <>
      <header className="nav nav--tone">
        <div className="wrap nav__bar">
          <a className="skip-link" href="#top">Skip to content</a>
          <a className="nav__logo" href="#top" aria-label="ENTX home"><Wordmark className="logo-mark" /></a>
          <nav className="nav__links" aria-label="Main">
            <div className="nav__item">
              <a className="nav__link" href="#markets">
                Markets{" "}
                <svg className="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
              <div className="nav__menu">
                <div className="wrap grid">
                  {[
                    ["#top", "The board", `${titleCount} titles ranked by EPI`, navCards[0]],
                    ["#markets", "Prediction markets", `${predictionCount} YES/NO markets on what happens next`, navCards[1]],
                    ["#onchain", "On-chain proof", "Registry, oracle, receipts and pools on NEAR", navCards[2]],
                  ].map(([href, name, line, a]) => (
                    <a key={name as string} className="menu-card span-4" href={href as string}>
                      <div className="panel"><img className="frame__img" src={poster(a as Asset, "w500")} alt={`${(a as Asset).title} poster`} loading="lazy" data-source="client" data-subject="TMDB poster" /></div>
                      <span className="t-card">{name as string}</span>
                      <span className="t-small muted">{line as string}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <div className="nav__item"><a className="nav__link" href="#epi">EPI</a></div>
            <div className="nav__item"><a className="nav__link" href="#trade">Trading</a></div>
            <div className="nav__item"><a className="nav__link" href="#onchain">On-chain</a></div>
            <div className="nav__item"><a className="nav__link" href="#faq">Questions</a></div>
          </nav>
          <div className="nav__actions">
            <Link className="btn btn--primary" href="/markets">Open the markets</Link>
          </div>
          <button className="nav__toggle" type="button" aria-expanded="false" aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M2 5h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>

      <main id="top">
        {/* HERO: collage (dealt). The h1 and two actions on span-5; the app's own board on the paper ground,
            cut by the frame's right and bottom edges, with one YES/NO ticket over its lower-left corner that
            steps through a stake (layout.js data-ly-steps). */}
        <section className="hero hero--collage" data-enter="" aria-labelledby="hero-h">
          <div className="wrap"><div className="hero-text grid hero__grid">
            <div className="hero__text span-5">
              <h1 id="hero-h">Movie and TV exchange on NEAR</h1>
              <p className="hero__lead">
                One score, the EPI, built from TMDB box office, popularity, votes and ratings, prices {titleCount} movies and shows and {predictionCount} YES or NO markets.
              </p>
              <div className="btn-row">
                <Link className="btn btn--primary" href="/markets">Open the markets{arrow}</Link>
                <Link className="btn btn--secondary" href="/onchain">Check the contract</Link>
              </div>
              <p className="hero__proof">Built for NEAR Hackathon 2026. Pools stake testnet NEAR; prices are simulated.</p>
            </div>
            <div className="hero__art span-6 start-7" role="img" aria-label={`The ENTX board ranked by EPI, led by ${lead.title}, and a YES/NO ticket on ${pSpidey.question}`}>
              <div className="ly-piece ly-piece--main hw" aria-hidden="true">
                <div className="bd">
                  <div className="bd__mast">
                    <strong>The board</strong>
                    <span>Ranked by EPI</span>
                  </div>
                  <div className="bd__wire"><b>Oracle wire</b><span>{evil.title} EPI {one(epiOf(evil))} to {one(evilAfter)}</span></div>
                  <table className="bd__table">
                    <thead><tr><th>Rank</th><th className="l">Title</th><th>Price</th><th className="s">EPI</th></tr></thead>
                    <tbody>
                      {board.map((a, i) => (
                        <tr key={a.id} className={i === 0 ? "is-sel" : undefined}>
                          <td className="rk">{i + 1}</td>
                          <td className="l"><div className="bd__t"><img src={poster(a, "w342")} alt="" width="26" height="38" data-source="client" data-subject="TMDB poster" /><div><b>{a.title}</b><small>{a.ticker} · {a.kind === "movie" ? "Movie" : "Show"}</small></div></div></td>
                          <td className="pr">{money(a.basePrice)}</td>
                          <td>{one(epiOf(a))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="ly-piece ly-piece--note pc-ticket pc-ticket--ui hn" aria-hidden="true" data-ly-steps="700">
                <span className="pc-kicker">{pSpidey.category} · closes in {pSpidey.closesInDays} days</span>
                <p className="pc-q">{pSpidey.question}</p>
                <div className="pc-yesno"><span className="yes">Yes {cents(pSpidey.yesProb)}</span><span className="no">No {cents(1 - pSpidey.yesProb)}</span></div>
                <div className="tk__rows">
                  <div data-step=""><span>Stake</span><span>0.1 testnet NEAR on YES</span></div>
                  <div data-step=""><span>Pays if right</span><span>$1 a share</span></div>
                  <div data-step=""><span>Signed</span><span>stake on NEAR testnet</span></div>
                </div>
              </div>
            </div>
          </div></div>
        </section>

        {/* MARKETS: a poster wall of four live YES/NO markets, each linked to the prediction board */}
        <section className="section" id="markets" aria-labelledby="markets-h">
          <div className="wrap">
            <div className="grid grid--top">
              <h2 id="markets-h" className="span-5">{predictionCount} markets on what happens next</h2>
              <div className="span-6 start-7 stack-4">
                <p className="t-lead">Box office, awards, renewals and popularity. A share costs its price in cents and pays $1 if right, so the price is the odds.</p>
                <Link className="link" href="/predictions">See every prediction market</Link>
              </div>
            </div>
            <div className="grid mk-wall">
              <Link className="mk-lead span-6" href="/predictions">
                <div className="mk__pic"><img className="frame__img" src={poster(wall[0].a, "w780")} alt={`${wall[0].a.title} poster`} loading="lazy" data-source="client" data-subject="TMDB poster" /></div>
                <div className="mk-lead__body">
                  <span className="pc-kicker">{wall[0].p.category} · closes in {wall[0].p.closesInDays} days</span>
                  <h3>{wall[0].p.question}</h3>
                  <div className="pc-yesno"><span className="yes">Yes {cents(wall[0].p.yesProb)}</span><span className="no">No {cents(1 - wall[0].p.yesProb)}</span></div>
                  <p className="pc-fact">{wall[0].a.title} holds an EPI of {one(epiOf(wall[0].a))}. When the oracle reports a new EPI on NEAR, these odds move with it.</p>
                </div>
              </Link>
              <ul className="mk-list span-6">
                {wall.slice(1).map(({ p, a }) => (
                  <li key={p.id}>
                    <Link className="mk-row" href="/predictions">
                      <img src={poster(a, "w342")} alt={`${a.title} poster`} width="72" height="108" loading="lazy" data-source="client" data-subject="TMDB poster" />
                      <span className="mk-row__q"><span className="pc-kicker">{p.category} · closes in {p.closesInDays} days</span><b>{p.question}</b></span>
                      <span className="mk-row__odds"><span className="yes">Yes {cents(p.yesProb)}</span><span className="no">No {cents(1 - p.yesProb)}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* SPLIT: the EPI's four inputs beside a real poster; the poster carries the liquid-hover moment */}
        <section className="section g2m" id="epi" aria-labelledby="epi-h">
          <div className="wrap">
            <div className="grid grid--top">
              <div className="span-5 stack-5">
                <h2 id="epi-h">One score from four TMDB inputs</h2>
                <p className="t-lead">The EPI runs from 0 to 100 and sets each title&rsquo;s fair value. Here is {heart.title}, scored {one(epiOf(heart))}.</p>
                <ul className="epi-rows">
                  {WEIGHTS.map(([k, label, note, w]) => (
                    <li key={k}>
                      <span className="epi-rows__name">{label}<small>{note}</small></span>
                      <span className="epi-rows__w">{w}%</span>
                      <span className="epi-rows__v">{one(heart.epiParts[k])}</span>
                    </li>
                  ))}
                </ul>
                <Link className="link" href="/epi">See every title&rsquo;s EPI</Link>
              </div>
              <figure className="frame frame--photo frame--split span-6 start-7 poster-frame" data-moment="liquid-hover" data-moment-opts='{"strength": 0.7}'>
                <img
                  className="frame__img"
                  src={`/_next/image?url=${encodeURIComponent(poster(heart, "w780"))}&w=1080&q=75`}
                  alt={`${heart.title} poster`}
                  width="780"
                  height="1170"
                  loading="lazy"
                  crossOrigin="anonymous"
                  data-source="client"
                  data-subject="TMDB poster"
                />
              </figure>
            </div>
          </div>
        </section>

        {/* FEATURES-2X2: what a visitor does, on flat panels (the brand has no gradient grounds) */}
        <section className="section g2" id="trade" aria-labelledby="trade-h">
          <div className="wrap">
            <div className="group">
              <div className="section-head">
                <h2 id="trade-h">Trade the title or the result. <span className="muted">Every price says what moved it.</span></h2>
                <Link className="link" href="/predictions">See the prediction markets</Link>
              </div>
              <div className="grid">
                <article className="card card--row card--open span-6 m-nolift">
                  <h3>Buys title units</h3>
                  <p>An AMM fills the order off-chain at a simulated price that follows the title&rsquo;s EPI.</p>
                  <div className="panel panel--flat">
                    <div className="stage"><div className="at-rise fit" style={{ ["--fit-max" as string]: "360px", ["--ax" as string]: "max(24px, 50% - 180px)", ["--ay" as string]: "40px", ["--ay-sm" as string]: "16px" }}>
                      <div className="ui ui-panel tk tk--card">
                        <div className="tk__head tk__head--plain"><div><strong>{byId("other-mommy").title}</strong><span>{byId("other-mommy").ticker} · EPI {one(epiOf(byId("other-mommy")))}</span></div></div>
                        <div className="tk__tabs"><span className="is-buy">Buy</span><span>Sell</span></div>
                        <div className="tk__rows">
                          <div><span>Units</span><span>25</span></div>
                          <div><span>Price (simulated)</span><span>{money(byId("other-mommy").basePrice)}</span></div>
                        </div>
                        <span className="tk__go">Buy {byId("other-mommy").ticker}</span>
                      </div>
                    </div></div>
                  </div>
                </article>
                <article className="card card--row card--open span-6 m-nolift">
                  <h3>Bets YES or NO</h3>
                  <p>A share costs its price in cents and pays $1 if right. Pools stake real testnet NEAR.</p>
                  <div className="panel panel--flat">
                    <div className="stage"><div className="at-rise fit" style={{ ["--fit-max" as string]: "380px", ["--ax" as string]: "max(24px, 50% - 190px)", ["--ay" as string]: "40px", ["--ay-sm" as string]: "16px" }}>
                      <div className="ui ui-panel pc-ticket pc-ticket--ui">
                        <span className="pc-kicker">{pOdyssey.category} · closes in {pOdyssey.closesInDays} days</span>
                        <p className="pc-q">{pOdyssey.question}</p>
                        <div className="pc-yesno"><span className="yes">Yes {cents(pOdyssey.yesProb)}</span><span className="no">No {cents(1 - pOdyssey.yesProb)}</span></div>
                        <div className="tk__rows"><div><span>Stake</span><span>0.1 testnet NEAR on YES</span></div></div>
                      </div>
                    </div></div>
                  </div>
                </article>
              </div>
            </div>
            <div className="grid">
              <article className="card card--row card--open span-6 m-nolift">
                <h3>Reprices on oracle news</h3>
                <p>A trusted oracle signs the new EPI on NEAR; simulated traders reprice and the linked odds move.</p>
                <div className="panel panel--flat">
                  <div className="stage stage--fade-b"><div className="at-rise fit" style={{ ["--fit-max" as string]: "380px", ["--ax" as string]: "max(24px, 50% - 190px)", ["--ay" as string]: "calc(100% - 180px)", ["--ay-sm" as string]: "calc(100% - 180px)" }} data-ui-loop="">
                    <div className="ui ui-notify" data-ui="notify">
                      <ul className="ui-notify__list" data-notify-list="">
                        <li className="ui-note"><span className="ui-agent ui-note__av" aria-hidden="true" /><span className="ui-note__text"><span className="ui-note__title">Oracle report on NEAR<time>now</time></span><span className="ui-note__body">{evil.ticker} EPI {one(epiOf(evil))} to {one(evilAfter)}</span></span></li>
                        <li className="ui-note"><span className="ui-note__ico"><svg className="ui-icon" viewBox="0 0 16 16"><path d="M2 11l4-4 3 3 5-6" /></svg></span><span className="ui-note__text"><span className="ui-note__title">Price repriced<time>now</time></span><span className="ui-note__body">{evil.title}, simulated traders</span></span></li>
                        <li className="ui-note"><span className="ui-note__ico"><svg className="ui-icon" viewBox="0 0 16 16"><path d="m3.5 8.4 2.8 2.8 6.2-6.4" /></svg></span><span className="ui-note__text"><span className="ui-note__title">Odds moved<time>now</time></span><span className="ui-note__body">{evil.title} reaches an EPI of 90</span></span></li>
                      </ul>
                    </div>
                  </div></div>
                </div>
              </article>
              <article className="card card--row card--open span-6 m-nolift">
                <h3>Signs a receipt per trade</h3>
                <p>The wallet signs record_trade on NEAR testnet; the Solana build writes a devnet memo too.</p>
                <div className="panel panel--flat">
                  <div className="stage"><div className="at-rise fit" style={{ ["--fit-max" as string]: "380px", ["--ax" as string]: "max(24px, 50% - 190px)", ["--ay" as string]: "40px", ["--ay-sm" as string]: "16px" }}>
                    <div className="ui ui-panel pc-ticket pc-ticket--ui">
                      <span className="pc-kicker">Trade receipt</span>
                      <div className="tk__rows">
                        <div><span>Method</span><span>record_trade</span></div>
                        <div><span>Network</span><span>NEAR testnet</span></div>
                        <div><span>Linked memo</span><span>Solana devnet</span></div>
                        <div><span>Trade</span><span>Buy 10 {lead.ticker}</span></div>
                      </div>
                    </div>
                  </div></div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* CHAPTER on the surface ground, with the line-carries-colour moment */}
        <section className="section ground-surface" id="onchain" aria-labelledby="onchain-h" data-moment="line-carries-colour" data-moment-opts='{"from": "base"}'>
          <div className="wrap">
            <div className="grid grid--top">
              <h2 id="onchain-h" className="span-5">What runs on NEAR testnet</h2>
              <div className="span-6 start-7 stack-4">
                <p className="t-lead">One contract holds the market registry, the oracle&rsquo;s EPI reports, trade receipts and YES/NO pools that settle and pay claims in testnet NEAR.</p>
                <Link className="link" href="/onchain">See the on-chain proof</Link>
              </div>
            </div>
            <div className="frame chain-frame"><Diagram spec={hub} /></div>
            <div className="grid chain-facts">
              <div className="span-3"><h3>Contract</h3><a className="link acct" href={nearAccountUrl(NEAR_CONTRACT)}>{NEAR_CONTRACT}</a></div>
              <div className="span-3"><h3>Oracle</h3><a className="link acct" href={nearAccountUrl(ORACLE)}>{ORACLE}</a></div>
              <div className="span-3"><h3>Solana devnet</h3><p>A linked memo receipt for each trade.</p></div>
              <div className="span-3"><h3>NEAR Intents</h3><p>Live quotes, sent as a dry run.</p></div>
            </div>
          </div>
        </section>

        {/* FAQ: the plain zone */}
        <section className="section g2m" id="faq" aria-labelledby="faq-h">
          <div className="wrap">
            <div className="grid grid--top">
              <div className="span-5 stack-4">
                <h2 id="faq-h">Questions</h2>
                <p className="t-lead">What is real, what is simulated, and what you need.</p>
                <ul className="runs-on" aria-label="Runs on">
                  <li><img data-icon="si:themoviedatabase" src="/assets/icons/themoviedatabase.svg" alt="" width="40" height="40" />TMDB data</li>
                  <li><img data-icon="si:near" src="/assets/icons/near.svg" alt="" width="40" height="40" />NEAR testnet</li>
                  <li><img data-icon="si:solana" src="/assets/icons/solana.svg" alt="" width="40" height="40" />Solana devnet</li>
                </ul>
                <a className="link" href={REPO}>Read the source on GitHub</a>
              </div>
              <div className="faq span-6 start-7">
                <div className="faq__item"><h3>Is this real money?</h3><p>No. Prices, AMM trades and balances are simulated off-chain. Prediction pools stake testnet NEAR, which has no monetary value.</p></div>
                <div className="faq__item"><h3>Where does the EPI come from?</h3><p>From TMDB: a box office proxy (35%), popularity (25%), vote count (25%) and rating (15%). Popularity is TMDB&rsquo;s, not streaming viewership.</p></div>
                <div className="faq__item"><h3>What does a prediction share pay?</h3><p>It costs its price in cents and pays $1 if the market resolves your way. The price is the market&rsquo;s implied probability.</p></div>
                <div className="faq__item"><h3>Do I need a wallet?</h3><p>Only to stake or sign a receipt: a NEAR testnet wallet such as Meteor, Intear or MyNearWallet, and testnet NEAR from the faucet.</p></div>
                <div className="faq__item"><h3>Are the NEAR Intents quotes real?</h3><p>They are live mainnet quotes requested as a dry run, so no deposit address is made and no funds move.</p></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer closing footer--statement g2m" id="contact" aria-labelledby="close-h">
        <div className="wrap">
          <div className="closing__cta close--type">
            <div className="section-head">
              <h2 id="close-h">Open the board on NEAR testnet</h2>
              <p>{titleCount} titles and {predictionCount} prediction markets. Testnet NEAR only, no real money.</p>
            </div>
            <Link className="btn btn--primary btn--xl btn--wide" href="/markets">Open the markets{arrow}</Link>
          </div>
          <div className="closing__links">
            <div className="grid">
              <div className="span-6 stack-4">
                <a className="nav__logo" href="#top" aria-label="ENTX, back to top"><Wordmark className="logo-mark" /></a>
                <p className="footer__lede">An entertainment exchange for movies and TV, built for the NEAR Hackathon 2026.</p>
              </div>
              <div className="span-2 footer__col"><h3>App</h3><ul><li><Link href="/markets">Markets</Link></li><li><Link href="/predictions">Predictions</Link></li><li><Link href="/epi">EPI</Link></li></ul></div>
              <div className="span-2 footer__col"><h3>Proof</h3><ul><li><Link href="/onchain">On-chain</Link></li><li><a href={nearAccountUrl(NEAR_CONTRACT)}>Contract</a></li><li><a href={nearAccountUrl(ORACLE)}>Oracle</a></li><li><a href={REPO}>Source</a></li></ul></div>
              <div className="span-2 footer__col"><h3>Page</h3><ul><li><a href="#epi">EPI</a></li><li><a href="#trade">Trading</a></li><li><a href="#faq">Questions</a></li></ul></div>
            </div>
            <div className="footer__legal">
              <span>&copy; 2026 ENTX</span>
              <span className="credits">{catalog.attribution} Product names and logos are trademarks of their owners.</span>
            </div>
          </div>
        </div>
      </footer>
      <nav className="actionbar" aria-label="Quick actions">
        <Link className="btn btn--primary" href="/markets">Open the markets</Link>
      </nav>
    </>
  );
}
