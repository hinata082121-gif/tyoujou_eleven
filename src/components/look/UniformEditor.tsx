"use client";

import { useState } from "react";
import { KIT_PALETTE, KIT_TEMPLATES } from "@/engine/config/look";
import { KIT_COLOR_NAMES, KIT_TEMPLATE_NAMES } from "@/engine/config/names";
import { kitsClash, randomKits } from "@/engine/look";
import type { Kit, Look, SchoolKits } from "@/engine/types";
import { Button, Segmented } from "../ui";
import { KitFigure } from "./Figure";

const SAMPLE_LOOK: Look = { hair: 0, hairColor: 0, skin: 2, eyes: 1, brows: 2, mouth: 1 };
const PARTS = [
  { key: "main", label: "メイン" },
  { key: "sub", label: "サブ" },
  { key: "shorts", label: "パンツ" },
  { key: "socks", label: "ソックス" },
] as const;

/**
 * ユニフォームの設定（SPEC 17.2。P4）：1st・2nd のテンプレートと 4 か所の色を、プレビューを見ながら選ぶ。
 * 学校作成とメニューの両方で使う（値は呼び出し側が持つ）
 */
export function UniformEditor({ value, onChange, seed }: { value: SchoolKits; onChange: (k: SchoolKits) => void; seed: string }) {
  const [tab, setTab] = useState<"first" | "second">("first");
  const [rolls, setRolls] = useState(1);
  const kit = value[tab];
  const set = (patch: Partial<Kit>) => onChange({ ...value, [tab]: { ...kit, ...patch } });
  const clash = kitsClash(value.first, value.second);

  return (
    <div className="flex flex-col gap-3">
      <Segmented options={["first", "second"] as const} value={tab} onChange={setTab} labels={{ first: "1st", second: "2nd" }} />
      <div className="flex items-end justify-center gap-6 rounded-xl bg-gradient-to-b from-sky-100 to-green-200 py-3">
        <KitFigure kit={kit} number={10} look={SAMPLE_LOOK} size={150} />
        <KitFigure kit={kit} number={10} look={SAMPLE_LOOK} back size={150} />
      </div>
      {clash && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">1st と 2nd のメインの色が近いため、相手と色がかぶったときに見分けにくくなります。</p>}

      <div>
        <div className="mb-1 text-xs font-bold text-gray-600">デザイン：{KIT_TEMPLATE_NAMES[kit.template]}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {KIT_TEMPLATES.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => set({ template: i })}
              aria-pressed={kit.template === i}
              aria-label={KIT_TEMPLATE_NAMES[i]}
              className={`flex flex-col items-center rounded-lg border py-1 ${kit.template === i ? "border-pitch bg-green-50 ring-2 ring-pitch" : "border-gray-200 bg-white"}`}
            >
              <KitFigure kit={{ ...kit, template: i }} size={56} />
              <span className="mt-0.5 text-[10px] leading-tight">{KIT_TEMPLATE_NAMES[i]}</span>
            </button>
          ))}
        </div>
      </div>

      {PARTS.map((part) => (
        <div key={part.key}>
          <div className="mb-1 text-xs font-bold text-gray-600">
            {part.label}：{KIT_COLOR_NAMES[kit[part.key]]}
          </div>
          <div className="grid grid-cols-12 gap-1">
            {KIT_PALETTE.map((hex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => set({ [part.key]: i })}
                aria-label={`${part.label}を${KIT_COLOR_NAMES[i]}に`}
                aria-pressed={kit[part.key] === i}
                className={`aspect-square rounded-md border ${kit[part.key] === i ? "border-gray-900 ring-2 ring-pitch" : "border-black/15"}`}
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
      ))}

      <Button
        variant="secondary"
        onClick={() => {
          onChange(randomKits(seed, "player", rolls));
          setRolls(rolls + 1);
        }}
      >
        🎲 おまかせ（1st・2nd をまとめて作る）
      </Button>
      <p className="text-[11px] leading-relaxed text-gray-500">相手と色がかぶったときは、アウェー側が 2nd を着ます。GK のユニフォームは、試合ごとに見分けやすい色が自動で決まります。</p>
    </div>
  );
}
