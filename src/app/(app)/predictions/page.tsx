"use client";

import { useState } from "react";
import { PREDICTIONS, type PredictionCategory } from "@/lib/predictions";
import { PredictionCard } from "@/components/prediction-card";
import { SimBadge } from "@/components/ui";

const CATS: ("All" | PredictionCategory)[] = ["All", "Box office", "Awards", "Renewal", "Popularity"];

export default function PredictionsPage() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const list = cat === "All" ? PREDICTIONS : PREDICTIONS.filter((p) => p.category === cat);

  return (
    <div className="space-y-5">
      <div className="masthead">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="h-display">Prediction markets</h1>
            <SimBadge />
          </div>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted">
            Bet YES or NO on box-office targets, awards, renewals and popularity milestones. A share costs its
            price in cents and pays $1 if you&apos;re right, so 32¢ means the market sees a 32% chance. Odds move with
            trading and with news on the linked title.
          </p>
        </div>
        <div className="seg flex-wrap">
          {CATS.map((c) => (
            <button
              key={c}
              className="cursor-pointer"
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {/* Tickets float over the grid (popover / bottom sheet), so opening one never changes a card's height. */}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <PredictionCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}
