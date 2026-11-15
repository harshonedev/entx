#!/usr/bin/env python3
"""Generates the README architecture diagrams (Day + Night editions) into docs/assets/diagrams/.

Run from the repo root:  python3 scripts/readme-diagrams.py
Colours come from DESIGN.md tokens. Edit the layout here, never the SVGs.
"""
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path("docs/assets/diagrams")

THEMES = {
    "light": dict(bg="#f4f1ea", panel="#fbfaf6", panel2="#ebe6da", ink="#141414", muted="#5f5a4f",
                  line="#d9d3c5", line2="#bdb5a4", accent="#b81f19", up="#1d7446", sol="#6b4fd0",
                  near="#0b746f", warn="#8f5a00", onaccent="#ffffff"),
    "dark": dict(bg="#12110f", panel="#1b1a17", panel2="#24221e", ink="#ece6d8", muted="#a69f90",
                 line="#35322c", line2="#504b41", accent="#f45a4a", up="#4cc085", sol="#a493f7",
                 near="#3fc6b9", warn="#e3a63f", onaccent="#12110f"),
}

HEAD = "'Barlow Condensed','Roboto Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif"
BODY = "Archivo,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"


class Svg:
    def __init__(self, w, h, t):
        self.w, self.h, self.t, self.parts = w, h, t, []

    def add(self, s):
        self.parts.append(s)

    # primitives -------------------------------------------------------------------------------------------
    def rect(self, x, y, w, h, fill=None, stroke=None, r=6, sw=1.5, dash=None, op=None):
        a = f'x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}"'
        a += f' fill="{fill or "none"}"'
        if op is not None:
            a += f' fill-opacity="{op}"'
        if stroke:
            a += f' stroke="{stroke}" stroke-width="{sw}"'
        if dash:
            a += f' stroke-dasharray="{dash}"'
        self.add(f"<rect {a}/>")

    def text(self, x, y, s, size=14, fill=None, font=BODY, weight=400, anchor="start", ls=None, italic=False):
        a = f'x="{x}" y="{y}" font-family="{font}" font-size="{size}" font-weight="{weight}" fill="{fill or self.t["ink"]}"'
        if anchor != "start":
            a += f' text-anchor="{anchor}"'
        if ls:
            a += f' letter-spacing="{ls}"'
        if italic:
            a += ' font-style="italic"'
        self.add(f"<text {a}>{escape(s)}</text>")

    def label(self, x, y, s, size=13, fill=None, anchor="start"):
        """Condensed small caps label, the trade-press section voice."""
        self.text(x, y, s.upper(), size, fill or self.t["muted"], HEAD, 700, anchor, "0.08em")

    def head(self, x, y, s, size=20, fill=None, anchor="start"):
        self.text(x, y, s.upper(), size, fill or self.t["ink"], HEAD, 700, anchor, "0.03em")

    def code(self, x, y, s, size=12.5, fill=None, anchor="start"):
        self.text(x, y, s, size, fill or self.t["ink"], MONO, 500, anchor)

    def path(self, d, color, sw=2, dash=None, arrow=True, start_arrow=False):
        a = f'd="{d}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"'
        if dash:
            a += f' stroke-dasharray="{dash}"'
        mid = self.marker(color)
        if arrow:
            a += f' marker-end="url(#{mid})"'
        if start_arrow:
            a += f' marker-start="url(#{mid}s)"'
        self.add(f"<path {a}/>")

    _markers = None

    def marker(self, color):
        self._markers = self._markers or {}
        if color not in self._markers:
            mid = f"m{len(self._markers)}"
            self._markers[color] = mid
        return self._markers[color]

    def chip(self, x, y, s, color, mono=True, solid=False, size=12.5):
        w = len(s) * size * (0.62 if mono else 0.56) + 18
        if solid:
            self.rect(x, y, w, 24, fill=color, r=12)
            fill = self.t["onaccent"]
        else:
            self.rect(x, y, w, 24, fill=color, op=0.1, stroke=color, sw=1, r=12)
            fill = color
        self.text(x + w / 2, y + 16.5, s, size, fill, MONO if mono else BODY, 600, "middle")
        return w

    def badge(self, cx, cy, n, color):
        self.add(f'<circle cx="{cx}" cy="{cy}" r="13" fill="{color}"/>')
        self.text(cx, cy + 5, str(n), 14, self.t["onaccent"], HEAD, 700, "middle")

    def card(self, x, y, w, h, color, title, tag=None, fill_op=0.07, dash=None):
        """Panel with a coloured top rule, condensed title and optional right-aligned tag."""
        self.rect(x, y, w, h, fill=self.t["panel"], stroke=self.t["line2"], sw=1, dash=dash)
        if fill_op:
            self.rect(x, y, w, h, fill=color, op=fill_op, r=6)
        self.add(f'<path d="M{x + 6} {y} H{x + w - 6} A6 6 0 0 1 {x + w} {y + 6} V{y + 4} H{x} V{y + 6} A6 6 0 0 1 {x + 6} {y} Z" fill="{color}"/>')
        self.head(x + 14, y + 28, title, 18, color)
        if tag:
            self.label(x + w - 12, y + 26, tag, 11.5, anchor="end")

    def header(self, title, sub):
        t = self.t
        self.head(32, 46, title, 30)
        self.text(self.w - 32, 44, sub, 14, t["muted"], BODY, 400, "end", italic=True)
        self.rect(32, 60, self.w - 64, 3, fill=t["accent"], r=0)
        self.rect(32, 66, self.w - 64, 1, fill=t["ink"], r=0)

    def render(self, title, desc):
        t = self.t
        defs = []
        for color, mid in (self._markers or {}).items():
            defs.append(f'<marker id="{mid}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="{color}"/></marker>')
            defs.append(f'<marker id="{mid}s" viewBox="0 0 10 10" refX="1.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10 0 L0 5 L10 10 z" fill="{color}"/></marker>')
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" role="img" aria-labelledby="t d">'
                f'<title id="t">{escape(title)}</title><desc id="d">{escape(desc)}</desc>'
                f'<defs>{"".join(defs)}</defs>'
                f'<rect width="{self.w}" height="{self.h}" fill="{t["bg"]}"/>'
                + "".join(self.parts) + "</svg>\n")


# ---------------------------------------------------------------------------------------------------------------
def system_map(t):
    s = Svg(1000, 760, t)
    s.header("System map", "simulated in the browser · verified on chain")

    # build time strip
    s.label(32, 104, "Build time")
    x = 130
    for i, (txt, mono) in enumerate([("TMDB API", False), ("scripts/seed-tmdb.ts", True), ("src/data/catalog.json", True)]):
        w = s.chip(x, 88, txt, t["muted"], mono=mono)
        if i < 2:
            s.path(f"M{x + w + 6} 100 H{x + w + 34}", t["muted"], 1.5)
        x += w + 40
    cat_x = x - 40 - 90  # centre-ish of the catalog chip
    s.path(f"M{cat_x} 114 V150", t["muted"], 1.5)

    # browser panel
    s.rect(32, 152, 936, 270, fill=t["panel2"], stroke=t["ink"], sw=1.5, r=8)
    s.head(52, 184, "Browser · Next.js 16 app", 20)
    x = 300
    for r in ["/", "/markets", "/asset/[id]", "/predictions", "/epi", "/portfolio", "/onchain"]:
        x += s.chip(x, 166, r, t["ink"], size=11.5) + 6

    # store
    s.card(52, 204, 640, 200, t["accent"], "Market store", "zustand · ticks every 1.5 s")
    cols = [
        ("AMM", ["constant product", "0.3% fee per trade", "YES/NO CPMM for", "every prediction"]),
        ("EPI", [".35 box office", ".25 popularity", ".25 votes", ".15 rating  (TMDB)"]),
        ("News → price", ["ΔEPI × 2.6", "= target price", "bot traders walk", "the pool there"]),
    ]
    for i, (h, lines) in enumerate(cols):
        cx = 68 + i * 206
        s.rect(cx, 248, 194, 140, fill=t["panel"], stroke=t["line2"], sw=1)
        s.head(cx + 12, 274, h, 17, t["accent"])
        for j, ln in enumerate(lines):
            s.text(cx + 12, 300 + j * 21, ln, 14, t["ink"] if j < 2 else t["muted"])

    # localStorage cylinder
    lx, ly, lw = 740, 214, 210
    s.add(f'<path d="M{lx} {ly + 12} V{ly + 70} A{lw / 2} 12 0 0 0 {lx + lw} {ly + 70} V{ly + 12}" fill="{t["panel"]}" stroke="{t["ink"]}" stroke-width="1.5"/>')
    s.add(f'<ellipse cx="{lx + lw / 2}" cy="{ly + 12}" rx="{lw / 2}" ry="12" fill="{t["panel2"]}" stroke="{t["ink"]}" stroke-width="1.5"/>')
    s.head(lx + lw / 2, ly + 52, "localStorage", 18, anchor="middle")
    s.text(lx + lw / 2, ly + 74, "positions · trades · candles", 13, t["muted"], anchor="middle")
    s.path(f"M{698} 262 H{734}", t["ink"], 1.5, start_arrow=True)

    # analyst
    s.card(740, 318, 210, 86, t["up"], "ENTX Analyst")
    s.text(754, 368, "rule-based, explainable", 14)
    s.text(754, 388, "advisory only", 14, t["muted"])

    # server routes
    s.rect(560, 452, 200, 52, fill=t["panel"], stroke=t["ink"], sw=1.5, dash="5 4")
    s.code(660, 474, "/api/oracle", 13.5, anchor="middle")
    s.text(660, 494, "auth · rate limit · signs", 12.5, t["muted"], anchor="middle")
    s.rect(778, 452, 190, 52, fill=t["panel"], stroke=t["ink"], sw=1.5, dash="5 4")
    s.code(873, 474, "/api/intents/quote", 13.5, anchor="middle")
    s.text(873, 494, "8 s timeout · rate limit", 12.5, t["muted"], anchor="middle")

    # destinations
    s.card(32, 560, 220, 130, t["sol"], "Solana devnet")
    s.text(46, 614, "SPL Memo receipt", 15, weight=600)
    s.text(46, 636, "one memo tx per trade", 13.5, t["muted"])
    s.code(46, 668, "Memo program", 12, t["sol"])

    s.card(282, 560, 478, 130, t["near"], "NEAR testnet · entx contract", "Rust · near-sdk 5.30")
    x, y = 296, 604
    for m in ["record_trade", "report_epi", "register_markets", "stake", "resolve", "claim"]:
        w = len(m) * 12.5 * 0.62 + 18
        if x + w > 750:
            x, y = 296, y + 32
        x += s.chip(x, y, m, t["near"]) + 6
    s.code(296, 680, "views: get_stats · get_markets · get_recent_receipts …", 11.5, t["muted"])

    s.card(790, 560, 178, 130, t["warn"], "NEAR Intents", dash="6 4")
    s.text(804, 614, "1Click API", 15, weight=600)
    s.text(804, 636, "mainnet quotes", 13.5, t["muted"])
    s.text(804, 656, "dry run, never", 13.5, t["muted"])
    s.text(804, 674, "executed", 13.5, t["muted"])

    # flows out of the browser
    s.path("M142 422 V554", t["sol"], 2.5)
    s.text(150, 500, "wallet-adapter", 13, t["sol"], weight=600)
    s.text(150, 517, "user signs", 12.5, t["muted"])
    s.path("M400 422 V554", t["near"], 2.5)
    s.text(408, 500, "near-connect", 13, t["near"], weight=600)
    s.text(408, 517, "user signs", 12.5, t["muted"])
    s.path("M660 422 V446", t["ink"], 2)
    s.path("M660 504 V530 Q660 540 650 540 H640 Q630 540 630 550 V554", t["accent"], 2.5)
    s.text(668, 537, "FC key · report_epi only", 12.5, t["accent"], weight=600)
    s.path("M873 422 V446", t["ink"], 2)
    s.path("M873 504 V554", t["warn"], 2, dash="5 5")
    # solana signature rides into NEAR
    s.path("M252 625 H276", t["sol"], 2, dash="3 4")
    s.text(32, 714, "Dashed purple: the Solana signature rides into NEAR as chain_ref, linking one trade across both chains.", 13, t["muted"])

    # legend
    ly = 744
    s.add(f'<path d="M32 {ly - 4} H62" stroke="{t["ink"]}" stroke-width="2.5"/>')
    s.text(70, ly, "signed transaction", 12.5, t["muted"])
    s.add(f'<path d="M210 {ly - 4} H240" stroke="{t["ink"]}" stroke-width="2" stroke-dasharray="5 5"/>')
    s.text(248, ly, "quote / read only", 12.5, t["muted"])
    s.add(f'<rect x="380" y="{ly - 12}" width="40" height="14" rx="3" fill="none" stroke="{t["ink"]}" stroke-dasharray="5 4"/>')
    s.text(428, ly, "runs on the server, never in the browser", 12.5, t["muted"])
    return s.render("ENTX system map",
                    "TMDB data seeds a catalogue at build time. The browser runs the market simulation (AMM, EPI, "
                    "news-driven prices) and persists to localStorage. Users sign Solana memo receipts and NEAR "
                    "transactions directly; the server oracle signs report_epi with a restricted key; the Intents "
                    "route fetches dry-run quotes.")


# ---------------------------------------------------------------------------------------------------------------
def trade_flow(t):
    s = Svg(1000, 470, t)
    s.header("One trade, end to end", "every fill is local; receipts are opt-in")

    s.label(32, 104, "In the browser · instant")
    steps = [
        (1, "Trade panel", ["Buy $25 of a title"]),
        (2, "engine.ts", ["AMM quote, 0.3% fee"]),
        (3, "Store fill", ["position, trade, candle", "→ localStorage"]),
    ]
    for i, (n, h, lines) in enumerate(steps):
        x = 32 + i * 215
        s.rect(x, 120, 190, 96, fill=t["panel"], stroke=t["line2"], sw=1)
        s.badge(x + 24, 146, n, t["accent"])
        s.head(x + 46, 152, h, 19)
        for j, ln in enumerate(lines):
            s.text(x + 16, 182 + j * 20, ln, 14, t["ink"] if j == 0 else t["muted"])
        if i < 2:
            s.path(f"M{x + 196} 168 H{x + 209}", t["ink"], 2)

    # decision
    dx, dy = 790, 168
    s.path("M628 168 H716", t["ink"], 2)
    s.add(f'<path d="M{dx} {dy - 54} L{dx + 74} {dy} L{dx} {dy + 54} L{dx - 74} {dy} Z" fill="{t["panel2"]}" stroke="{t["ink"]}" stroke-width="1.5"/>')
    s.text(dx, dy - 6, "Wallet connected", 13.5, weight=600, anchor="middle")
    s.text(dx, dy + 13, "+ receipts on?", 13.5, weight=600, anchor="middle")
    s.path(f"M{dx + 74} {dy} H{dx + 118}", t["muted"], 1.5)
    s.label(dx + 82, dy - 8, "no", 12)
    s.text(dx + 122, dy - 4, "Done.", 14, weight=600)
    s.text(dx + 122, dy + 14, "simulated", 13, t["muted"])

    s.label(dx + 8, dy + 86, "yes", 12)
    s.path(f"M{dx} {dy + 54} V{dy + 96} Q{dx} {dy + 106} {dx - 10} {dy + 106} H{130} Q{120} {dy + 106} {120} {dy + 116} V{dy + 132}", t["ink"], 2)

    s.label(32, 262, "On chain · receipts.ts, sequential")
    y = 300
    s.card(32, y, 280, 130, t["sol"], "Solana devnet")
    s.badge(288, y + 24, 4, t["sol"])
    s.text(46, y + 58, "SPL Memo tx, user signs", 14, weight=600)
    s.text(46, y + 80, "returns a signature", 13.5, t["muted"])
    s.code(46, y + 110, "5Hk…q9  (example)", 12, t["sol"])

    s.card(372, y, 360, 130, t["near"], "NEAR record_trade")
    s.badge(708, y + 24, 5, t["near"])
    s.code(386, y + 58, 'chain_ref = "solana:devnet:<sig>"', 12.5, t["near"])
    s.text(386, y + 84, "caller pays storage, excess refunded", 13.5)
    s.text(386, y + 106, "notarised claim, not settled volume", 13.5, t["muted"])

    s.card(792, y, 176, 130, t["ink"], "/onchain", fill_op=0)
    s.badge(944, y + 24, 6, t["ink"])
    s.text(806, y + 58, "reads", 13.5, t["muted"])
    s.code(806, y + 80, "get_recent_receipts", 11)
    s.text(806, y + 106, "every 15 s", 13, t["muted"])

    s.path(f"M318 {y + 65} H366", t["sol"], 2.5)
    s.text(342, y + 55, "sig", 12.5, t["sol"], weight=700, anchor="middle")
    s.path(f"M738 {y + 65} H786", t["near"], 2, dash="5 5")

    # failure note
    fx = 342
    s.add(f'<circle cx="{fx}" cy="{y + 92}" r="11" fill="{t["accent"]}"/>')
    s.text(fx, y + 97, "×", 17, t["onaccent"], BODY, 700, "middle")
    s.text(32, y + 160, "If step 4 fails, step 5 is skipped, so a NEAR receipt never points at a missing Solana signature.", 14, t["accent"], weight=600)
    return s.render("One trade, end to end",
                    "A trade is quoted by the AMM and filled in the browser store. If a wallet is connected with "
                    "receipts on, a Solana memo transaction is sent first, then NEAR record_trade carrying the "
                    "Solana signature as chain_ref. If the Solana step fails, the NEAR step is skipped.")


# ---------------------------------------------------------------------------------------------------------------
def news_flow(t):
    s = Svg(1000, 520, t)
    s.header("One news event, end to end", "two EPIs on purpose: the app's and the oracle's")

    # trigger
    s.rect(32, 210, 150, 110, fill=t["accent"], r=8)
    s.head(107, 244, "News button", 19, t["onaccent"], "middle")
    s.text(107, 270, "box-office beat,", 13.5, t["onaccent"], anchor="middle")
    s.text(107, 288, "trailer, award…", 13.5, t["onaccent"], anchor="middle")
    s.code(107, 308, "{assetId, eventId}", 11, t["onaccent"], "middle")

    # lane A
    s.path("M182 250 H200 Q210 250 210 240 V140 Q210 130 220 130 H236", t["ink"], 2)
    s.rect(240, 92, 728, 86, fill=t["panel2"], stroke=t["line2"], sw=1, r=8)
    s.label(256, 114, "App · this browser · instant")
    x = 256
    for i, st in enumerate(["apply event deltas", "App EPI", "target price  (× 2.6)", "bot traders move pool"]):
        w = s.chip(x, 128, st, t["ink"], mono=False, size=13.5)
        if i < 3:
            s.path(f"M{x + w + 6} 140 H{x + w + 28}", t["ink"], 1.5)
        x += w + 34

    # lane B
    s.path("M182 280 H200 Q210 280 210 290 V330 Q210 340 220 340 H236", t["accent"], 2.5)
    s.rect(240, 214, 728, 270, fill=t["panel"], stroke=t["ink"], sw=1.5, r=8)
    s.label(256, 238, "Oracle · POST /api/oracle → NEAR")
    gates = [
        ("Auth", ["Bearer secret, or", "demo flag on"]),
        ("Rate limit", ["global · per title", "· per IP (proxy)"]),
        ("Clamp", ["seed + one event", "± 15 of baseline"]),
        ("Sign", ["FC key, can only", "call report_epi"]),
    ]
    for i, (h, lines) in enumerate(gates):
        gx = 256 + i * 176
        s.rect(gx, 254, 156, 96, fill=t["panel2"], stroke=t["line2"], sw=1)
        s.add(f'<rect x="{gx}" y="254" width="5" height="96" fill="{t["accent"]}"/>')
        s.head(gx + 16, 280, h, 18, t["accent"])
        for j, ln in enumerate(lines):
            s.text(gx + 16, 304 + j * 19, ln, 13.5, t["ink"] if j == 0 else t["muted"])
        if i < 3:
            s.path(f"M{gx + 158} 302 H{gx + 172}", t["accent"], 2)

    # ring
    s.path("M913 352 V372 Q913 380 905 380 H600", t["near"], 2.5, arrow=False)
    s.path("M600 380 Q592 380 592 388 V396", t["near"], 2.5)
    s.card(256, 400, 440, 72, t["near"], "NEAR · 32-slot trusted ring")
    for k in range(32):
        cx = 270 + (k % 16) * 13.5
        cy = 438 + (k // 16) * 14
        filled = k < 19
        s.add(f'<rect x="{cx}" y="{cy}" width="10" height="10" rx="2" fill="{t["near"] if filled else "none"}" stroke="{t["near"]}" stroke-width="1"/>')
    s.text(500, 450, "full ring: oldest report", 13, t["muted"])
    s.text(500, 466, "is overwritten", 13, t["muted"])

    # onchain compare
    s.path("M700 436 H722", t["near"], 2, dash="5 5")
    s.card(728, 400, 240, 72, t["ink"], "/onchain", fill_op=0)
    for i, (lbl, c, wbar) in enumerate([("App EPI", t["ink"], 96), ("Oracle EPI", t["near"], 84)]):
        yy = 438 + i * 18
        s.text(742, yy + 8, lbl, 12.5, t["muted"])
        s.rect(812, yy, wbar * 1.3, 9, fill=c, r=2)
    return s.render("One news event, end to end",
                    "A news button fires a catalogue event. The browser applies it instantly to the app EPI and "
                    "price. In parallel, /api/oracle authenticates, rate-limits, clamps the value to within 15 of "
                    "the seeded baseline and signs report_epi with a function-call key, landing in a 32-slot "
                    "trusted ring on NEAR. /onchain shows both EPIs side by side.")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in [("system-map", system_map), ("trade-flow", trade_flow), ("news-flow", news_flow)]:
        for theme, t in THEMES.items():
            (OUT / f"{name}-{theme}.svg").write_text(fn(t))
            print(OUT / f"{name}-{theme}.svg")


if __name__ == "__main__":
    main()
