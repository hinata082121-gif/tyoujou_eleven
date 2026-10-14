"use client";

import { TACTICS_ITEM_NAMES, TACTICS_LABELS } from "@/engine/config/names";
import type { Tactics } from "@/engine/types";
import { Label, Segmented } from "../ui";

const OPTIONS = {
  attack: ["attacking", "balanced", "defensive"],
  buildUp: ["buildUp", "long"],
  press: ["high", "mid", "low"],
  line: ["high", "low"],
} as const;

/**
 * 戦術の選択（4 項目）。横長の枠に収まるよう、幅があれば 2 列、狭ければ 1 列に並べる。
 * 試合前の画面の右の列や、観戦中の Sheet の中に入る
 */
export function TacticsEditor({ tactics, onChange }: { tactics: Tactics; onChange: (t: Tactics) => void }) {
  return (
    <section className="@container bg-panel p-1.5">
      <Label className="!mb-1">戦術</Label>
      <div className="grid grid-cols-1 gap-x-3 gap-y-1 @[30rem]:grid-cols-2">
        {(Object.keys(OPTIONS) as (keyof Tactics)[]).map((k) => (
          <div key={k} className="flex min-w-0 items-center gap-2">
            <span className="w-[4.25rem] shrink-0 text-[0.75rem] font-bold text-text-2">{TACTICS_ITEM_NAMES[k]}</span>
            <Segmented
              className="min-w-0 flex-1"
              options={OPTIONS[k] as readonly string[]}
              value={tactics[k]}
              onChange={(v) => onChange({ ...tactics, [k]: v } as Tactics)}
              labels={TACTICS_LABELS[k] as Record<string, string>}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
