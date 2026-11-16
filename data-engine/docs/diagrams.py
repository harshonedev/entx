#!/usr/bin/env python3
"""Generates the data-engine README diagrams (Day + Night editions) into data-engine/docs/assets/.

Run from the repo root:  python3 data-engine/docs/diagrams.py
Reuses the drawing kit and DESIGN.md colours from scripts/readme-diagrams.py. Edit this file, never the SVGs.
"""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("kit", ROOT / "scripts" / "readme-diagrams.py")
kit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kit)
Svg, THEMES = kit.Svg, kit.THEMES

OUT = ROOT / "data-engine" / "docs" / "assets"


def pipeline(t):
    s = Svg(1000, 640, t)
    s.header("Data engine", "evidence first · trust later · score last")

    # ---- sources ------------------------------------------------------------------------------------------
    s.label(32, 104, "Sources")
    sources = [
        ("TMDB API", "api", t["near"]),
        ("Wikidata SPARQL", "api", t["near"]),
        ("Wikimedia pageviews", "api", t["near"]),
        ("Wikipedia articles", "api", t["near"]),
        ("Netflix Top 10 TSV", "published", t["warn"]),
        ("Sacnilk", "scraped", t["accent"]),
    ]
    for i, (name, kind, c) in enumerate(sources):
        y = 120 + i * 50
        s.rect(32, y, 200, 38, fill=t["panel"], stroke=t["line2"], sw=1)
        s.text(46, y + 24, name, 13.5, t["ink"], kit.BODY, 600)
        s.chip(240, y + 7, kind, c, mono=False, size=11)
        s.path(f"M{322} {y + 19} H{352}", t["line2"], 1.5)

    # ---- data engine (this service) ------------------------------------------------------------------------
    s.card(358, 96, 330, 330, t["accent"], "entx-data-engine", "this service", fill_op=0.05)
    rows = [
        ("Scheduler", "croner · UTC cron · advisory lock per job"),
        ("Collectors", "7 jobs · plan → fetch → snapshot"),
        ("Polite fetch", "UA · rate per host · robots · retry · timeout"),
        ("Discovery", "title_links · discovered_items"),
    ]
    for i, (h, sub) in enumerate(rows):
        y = 140 + i * 66
        s.rect(374, y, 298, 54, fill=t["panel2"], stroke=t["line"], sw=1)
        s.head(388, y + 23, h, 16)
        s.text(388, y + 42, sub, 12, t["muted"])
        if i < len(rows) - 1:
            s.path(f"M523 {y + 54} V{y + 66}", t["line2"], 1.5, arrow=False)
    s.text(374, 412, "bun data-engine/main.ts · /health :8080", 12, t["muted"], kit.MONO)

    # ---- postgres -------------------------------------------------------------------------------------------
    s.path("M688 260 H720", t["accent"], 2)
    s.card(726, 96, 242, 330, t["ink"], "Postgres", "evidence store", fill_op=0)
    tables = [
        ("snapshots", "immutable · sha256 · gzip"),
        ("tracked_titles", "market · watch · cohort"),
        ("title_links", "imdb · wikidata · wiki:*"),
        ("discovered_items", "Sacnilk film pages"),
        ("job_runs", "ok · degraded · failed"),
    ]
    for i, (name, sub) in enumerate(tables):
        y = 136 + i * 54
        s.code(742, y + 14, name, 13, t["ink"])
        s.text(742, y + 32, sub, 12, t["muted"])
    s.text(742, 412, "role viewer: SELECT only", 12, t["near"], kit.MONO)

    # ---- later phases ----------------------------------------------------------------------------------------
    s.label(32, 470, "Next phases (not built yet)")
    later = [
        ("Normalizer", "phase 2 · data engine", t["muted"], 32),
        ("entx-trust-engine", "phase 3 · read-only on evidence", t["muted"], 272),
        ("EPI models", "phase 4 · theatrical · streaming · series", t["muted"], 512),
        ("Live app + oracle", "phase 6", t["muted"], 772),
    ]
    for i, (h, sub, c, x) in enumerate(later):
        s.rect(x, 488, 196, 64, fill=t["panel"], stroke=t["line2"], sw=1, dash="5 4")
        s.head(x + 14, 514, h, 15, t["muted"])
        s.text(x + 14, 536, sub, 11.5, t["muted"])
        if i < 3:
            s.path(f"M{x + 196} 520 H{x + 236}", t["line2"], 1.5, dash="5 4")

    s.text(32, 600, "Every fetch is stored as raw evidence before anything reads it. Nothing is parsed, matched or scored in phase 1.",
           13, t["muted"], italic=True)
    return s.render("EPI data engine",
                    "Six sources (four documented APIs, one published Netflix dataset, one scraped site) feed the "
                    "entx-data-engine worker: a scheduler runs seven collectors through a polite fetch layer and "
                    "stores every response as an immutable snapshot in Postgres, alongside tracked titles, discovered "
                    "links and job runs. Normalizer, trust engine, EPI models and the live app are later phases.")


def job_run(t):
    s = Svg(1000, 548, t)
    s.header("One job run", "what happens every time a collector fires")

    steps = [
        (1, "Lock", "pg_try_advisory_lock(job)", "held? → skipped_locked", t["ink"]),
        (2, "Plan", "which titles / files / pages", "role, range, last snapshot age", t["ink"]),
        (3, "Fetch", "polite fetch per request", "robots · spacing · timeout", t["near"]),
        (4, "Store", "recordSnapshot()", "sha256 · gzip · retention", t["accent"]),
        (5, "Discover", "links + film pages", "title_links · discovered_items", t["ink"]),
        (6, "Record", "job_runs row", "ok · degraded · failed", t["up"]),
    ]
    w, h, gap = 296, 104, 22
    for i, (n, hd, a, b, c) in enumerate(steps):
        col, row = i % 3, i // 3
        x, y = 32 + col * (w + gap), 96 + row * (h + 40)
        s.rect(x, y, w, h, fill=t["panel"], stroke=t["line2"], sw=1)
        s.rect(x, y, w, 4, fill=c, r=0)
        s.badge(x + 26, y + 32, n, c)
        s.head(x + 48, y + 38, hd, 18)
        s.text(x + 16, y + 68, a, 13, t["ink"], kit.MONO if "(" in a else kit.BODY)
        s.text(x + 16, y + 89, b, 12.5, t["muted"])
        if col < 2:
            s.path(f"M{x + w + 2} {y + h / 2} H{x + w + gap - 2}", t["line2"], 1.5)
    # row 1 → row 2
    s.path(f"M{32 + 2 * (w + gap) + w / 2} {96 + h} V{96 + h + 20} H{32 + w / 2} V{96 + h + 38}", t["line2"], 1.5)

    # retry loop beside fetch (step 3, top right)
    fx = 32 + 2 * (w + gap)
    s.text(fx + w - 12, 92 - 8, "429 / 503 / network error / timeout → retry, max 3", 11.5, t["near"], anchor="end")

    # outcomes
    s.label(32, 384, "Outcomes")
    outcomes = [
        ("ok", "everything fetched and stored", t["up"]),
        ("degraded", "stored what it could: 404s, 0 links found, bad header", t["warn"]),
        ("failed", "threw: message saved in job_runs.detail", t["accent"]),
        ("skipped_locked", "same job already running elsewhere", t["muted"]),
        ("abandoned", "left running by a dead container, set on start", t["muted"]),
    ]
    for i, (k, d, c) in enumerate(outcomes):
        yy = 398 + i * 26
        cw = s.chip(32, yy, k, c, solid=k == "ok")
        s.text(32 + 150, yy + 17, d, 13, t["ink"])
    return s.render("One job run",
                    "A collector run takes a Postgres advisory lock for its job, plans its requests, fetches each "
                    "through the polite fetch layer (robots for scraped hosts, per-host spacing, timeout, retry with "
                    "backoff), stores every response as an immutable snapshot, records discovered links, and writes "
                    "the outcome to job_runs: ok, degraded, failed, skipped_locked or abandoned.")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in [("pipeline", pipeline), ("job-run", job_run)]:
        for theme, t in THEMES.items():
            (OUT / f"{name}-{theme}.svg").write_text(fn(t))
            print(OUT.relative_to(ROOT) / f"{name}-{theme}.svg")


if __name__ == "__main__":
    main()
