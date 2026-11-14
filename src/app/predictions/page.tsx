"use client";

import { useState } from "react";
import clsx from "clsx";
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
            <h1 className="text-2xl font-bold tracking-tight">Prediction markets</h1>
            <SimBadge />
          </div>
          <p className="mt-1 max-w-xl text-sm text-muted">
            YES/NO markets on box-office targets, awards, renewals and popularity milestones. Shares pay $1 if
            correct. Odds move with trading and with oracle updates on the linked title.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-line p-1">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                cat === c ? "bg-white/[0.07] text-text" : "text-muted hover:text-text",
              )}
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
