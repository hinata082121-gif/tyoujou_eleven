"use client";

import { useState } from "react";
import { KIT_PALETTE, KIT_TEMPLATES } from "@/engine/config/look";
import { KIT_COLOR_NAMES, KIT_TEMPLATE_NAMES } from "@/engine/config/names";
import { kitsClash, randomKits } from "@/engine/look";
import type { Kit, Look, SchoolKits } from "@/engine/types";
import { Icon } from "../icons";
import { Button, Label, Segmented } from "../ui";
import { KitFigure } from "./Figure";

const SAMPLE_LOOK: Look = { hair: 0, hairColor: 0, skin: 2, eyes: 1, brows: 2, mouth: 1 };
const PARTS = [
  { key: "main", label: "メイン" },
  { key: "sub", label: "サブ" },
  { key: "shorts", label: "パンツ" },
  { key: "socks", label: "ソックス" },
] as const;
type PartKey = (typeof PARTS)[number]["key"];

/**
 * ユニフォームの設定（SPEC 17.2。P4）：1st・2nd のテンプレートと 4 か所の色を、プレビューを見ながら選ぶ。
 * 学校作成とメニューの両方で使う（値は呼び出し側が持つ）。
 * 横画面：左に前後の全身の絵（1st・2nd の切り替え）、右に柄と色の選択
 */
export function UniformEditor({ value, onChange, seed }: { value: SchoolKits; onChange: (k: SchoolKits) => void; seed: string }) {
  const [tab, setTab] = useState<"first" | "second">("first");
  const [part, setPart] = useState<PartKey>("main");
  const [rolls, setRolls] = useState(1);
  const kit = value[tab];
  const set = (patch: Partial<Kit>) => onChange({ ...value, [tab]: { ...kit, ...patch } });
  const clash = kitsClash(value.first, value.second);
  const partLabel = PARTS.find((p) => p.key === part)!.label;

  return (
    <div className="flex min-h-0 flex-1 gap-2">
      {/* 左：前後の全身の絵 */}
      <div className="flex w-[16rem] shrink-0 flex-col gap-1">
        <Segmented options={["first", "second"] as const} value={tab} onChange={setTab} labels={{ first: "1st", second: "2nd" }} className="shrink-0" />
        <div className="bg-pitch-stripes relative flex min-h-0 flex-1 items-end justify-center gap-2 overflow-hidden border-2 border-line-2 pb-6">
          <span className="cut-r font-head absolute left-0 top-0 bg-yellow py-0.5 pl-2 pr-6 text-[0.875rem] text-ink">{tab === "first" ? "1st" : "2nd"}</span>
          <KitFigure kit={kit} number={10} look={SAMPLE_LOOK} size={176} />
          <KitFigure kit={kit} number={10} look={SAMPLE_LOOK} back size={176} />
          <div className="absolute inset-x-0 bottom-0 grid grid-cols-2 bg-panel text-center text-[0.75rem] font-bold text-text-2">
            <span className="py-0.5">前</span>
            <span className="py-0.5">後ろ</span>
          </div>
        </div>
      </div>

      {/* 右：柄と色の選択 */}
      <div className="scroll-y min-h-0 min-w-0 flex-1 bg-panel p-2">
        <div className="mb-1 flex items-center gap-2">
          <Label className="!mb-0 min-w-0 flex-1 truncate">デザイン：{KIT_TEMPLATE_NAMES[kit.template]}</Label>
          <Button
            variant="secondary"
            small
            icon="dice"
            onClick={() => {
              onChange(randomKits(seed, "player", rolls));
              setRolls(rolls + 1);
            }}
          >
            おまかせ（1st・2nd をまとめて作る）
          </Button>
        </div>
        <div className="mb-2 grid grid-cols-8 gap-1">
          {KIT_TEMPLATES.map((t, i) => (
            <button
              key={t}
              type="button"
              onClick={() => set({ template: i })}
              aria-pressed={kit.template === i}
              aria-label={KIT_TEMPLATE_NAMES[i]}
              title={KIT_TEMPLATE_NAMES[i]}
              className={`pressable flex min-h-11 items-center justify-center overflow-hidden py-0.5 ${kit.template === i ? "border-2 border-yellow bg-panel-3" : "border border-line bg-panel-2"}`}
            >
              <KitFigure kit={{ ...kit, template: i }} size={46} />
            </button>
          ))}
        </div>

        <Label>色を変える場所</Label>
        <div className="mb-1.5 grid grid-cols-4 gap-1">
          {PARTS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPart(p.key)}
              aria-pressed={part === p.key}
              className={`pressable flex min-h-11 items-center gap-1.5 px-1.5 text-left ${part === p.key ? "bg-yellow text-ink" : "bg-panel-2 text-text"}`}
            >
              <span className="h-5 w-5 shrink-0 border border-black/40" style={{ background: KIT_PALETTE[kit[p.key]] }} />
              <span className="min-w-0 leading-tight">
                <span className="block text-[0.75rem] font-black">{p.label}</span>
                <span className={`block truncate text-[0.6875rem] font-bold ${part === p.key ? "text-ink-2" : "text-text-3"}`}>{KIT_COLOR_NAMES[kit[p.key]]}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mb-2 grid grid-cols-12 gap-1" role="group" aria-label={`${partLabel}の色`}>
          {KIT_PALETTE.map((hex, i) => {
            const on = kit[part] === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => set({ [part]: i })}
                aria-label={`${partLabel}を${KIT_COLOR_NAMES[i]}に`}
                aria-pressed={on}
                title={KIT_COLOR_NAMES[i]}
                className={`pressable aspect-square min-h-7 ${on ? "border-2 border-white outline-2 outline-offset-0 outline-yellow" : "border border-black/40"}`}
                style={{ background: hex }}
              />
            );
          })}
        </div>

        {clash && (
          <p className="mb-2 flex items-start gap-1.5 border-l-4 border-warn bg-panel-2 px-2 py-1 text-[0.75rem] font-bold text-warn">
            <Icon name="warning" size={14} className="mt-0.5" />
            1st と 2nd のメインの色が近いため、相手と色がかぶったときに見分けにくくなります。
          </p>
        )}
        <p className="text-[0.75rem] leading-relaxed text-text-3">相手と色がかぶったときは、アウェー側が 2nd を着ます。GK のユニフォームは、試合ごとに見分けやすい色が自動で決まります。</p>
      </div>
    </div>
  );
}
