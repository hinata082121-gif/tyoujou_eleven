"use client";

import { TACTICS_ITEM_NAMES, TACTICS_LABELS } from "@/engine/config/names";
import type { Tactics } from "@/engine/types";
import { Segmented } from "../ui";

const OPTIONS = {
  attack: ["attacking", "balanced", "defensive"],
  buildUp: ["buildUp", "long"],
  press: ["high", "mid", "low"],
  line: ["high", "low"],
} as const;

export function TacticsEditor({ tactics, onChange }: { tactics: Tactics; onChange: (t: Tactics) => void }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-sm font-black">戦術</h2>
      {(Object.keys(OPTIONS) as (keyof Tactics)[]).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-bold text-gray-600">{TACTICS_ITEM_NAMES[k]}</span>
          <div className="flex-1">
            <Segmented
              options={OPTIONS[k] as readonly string[]}
              value={tactics[k]}
              onChange={(v) => onChange({ ...tactics, [k]: v } as Tactics)}
              labels={TACTICS_LABELS[k] as Record<string, string>}
            />
          </div>
        </div>
      ))}
    </section>
  );
}
