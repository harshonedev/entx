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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Prediction markets</h1>
            <SimBadge />
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted">
            YES/NO markets on box-office targets, awards, renewals and popularity milestones. Shares pay $1 if
            correct. Odds move with trading and with oracle updates on the linked title.
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <PredictionCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}
