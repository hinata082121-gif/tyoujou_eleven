"use client";

/**
 * 特殊能力図鑑（メニュー → 特殊能力図鑑。PLAN 7.2）。
 * 1 行に 1 系統（段階を ○→◎→金色 の順に並べる）。右に自校で持っている人数。タップで部員一覧をその特殊能力で絞り込む。
 */
import { useState } from "react";
import { LEGEND_SKILL_NAME, SKILL_CATEGORY_NAMES, SKILL_LINE_NAMES, SKILL_NAMES } from "@/engine/config/names";
import { SKILL_DEFS, SKILL_LINE_TIERS } from "@/engine/config/skills";
import { playerSchool } from "@/engine/season";
import { SKILL_IDS, SKILL_LINES, type Player, type SkillCategory, type SkillId, type SkillLine } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Header } from "../ui";
import { SkillChip, SkillSheet } from "./traits";

type Tab = "legend" | SkillCategory | "minus";
const CATEGORIES: SkillCategory[] = ["shoot", "dribble", "pass", "setPiece", "defense", "gk", "mental", "body"];
const TAB_LABELS: Record<Tab, string> = { legend: LEGEND_SKILL_NAME, ...SKILL_CATEGORY_NAMES, minus: "マイナス" };

interface Row {
  key: string;
  name: string;
  ids: SkillId[];
}

/** その特殊能力を持っている部員か（系統の行は、その系統のプラスを持っていれば数える） */
export function hasSkillForFilter(p: Pick<Player, "skills">, id: SkillId): boolean {
  const def = SKILL_DEFS[id];
  if (def.tier === "minus" || def.tier === "gold" || !def.line) return p.skills.includes(id);
  return p.skills.some((s) => SKILL_DEFS[s].line === def.line && SKILL_DEFS[s].tier !== "minus");
}

function rowsFor(tab: Tab): Row[] {
  const rows: Row[] = [];
  const lineIds = (l: SkillLine) => {
    const t = SKILL_LINE_TIERS[l];
    return [t.plus, t.double, t.gold].filter((x): x is SkillId => !!x);
  };
  if (tab === "legend") return SKILL_IDS.filter((id) => SKILL_DEFS[id].tier === "gold").map((id) => ({ key: id, name: SKILL_NAMES[id], ids: [id] }));
  if (tab === "minus") return SKILL_IDS.filter((id) => SKILL_DEFS[id].tier === "minus").map((id) => ({ key: id, name: SKILL_NAMES[id], ids: [id] }));
  for (const l of SKILL_LINES) {
    const ids = lineIds(l);
    if (ids.length > 0 && SKILL_DEFS[ids[0]].category === tab) rows.push({ key: l, name: SKILL_LINE_NAMES[l], ids });
  }
  for (const id of SKILL_IDS) {
    const d = SKILL_DEFS[id];
    if (!d.line && d.tier !== "minus" && d.category === tab) rows.push({ key: id, name: SKILL_NAMES[id], ids: [id] });
  }
  return rows;
}

export function SkillBook() {
  const game = useGameStore((s) => s.game)!;
  const close = () => useGameStore.getState().setSkillBookOpen(false);
  const openSquadWithSkill = useGameStore((s) => s.openSquadWithSkill);
  const [tab, setTab] = useState<Tab>("legend");
  const [sheet, setSheet] = useState<SkillId | null>(null);
  const players = playerSchool(game).players.filter((p) => p.status === "active");
  const rows = rowsFor(tab);
  return (
    <main className="flex flex-1 flex-col">
      <Header title="特殊能力図鑑" onBack={close} />
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
        {(["legend", ...CATEGORIES, "minus"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-bold ${tab === t ? (t === "legend" ? "bg-amber-400 text-amber-950" : "bg-pitch text-white") : "bg-gray-100 text-gray-600"}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === "legend" && <p className="px-3 text-[11px] text-gray-500">金色の特殊能力。下の段階と試合での成果をそろえた選手だけが、ごくまれに身につけます。</p>}
      <ul className="flex flex-col divide-y divide-gray-100 px-3">
        {rows.map((r) => {
          const count = players.filter((p) => hasSkillForFilter(p, r.ids[0])).length;
          return (
            <li key={r.key} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-xs font-bold text-gray-700">{r.name}</div>
                <div className="flex flex-wrap items-center gap-1">
                  {r.ids.map((id, i) => (
                    <span key={id} className="flex items-center gap-1">
                      {i > 0 && <span className="text-[10px] text-gray-400">→</span>}
                      <SkillChip id={id} onClick={() => setSheet(id)} />
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => count > 0 && openSquadWithSkill(r.ids[0])}
                className={`min-h-11 min-w-12 rounded-lg text-xs font-bold ${count > 0 ? "bg-green-50 text-pitch-dark" : "text-gray-300"}`}
                aria-label={`${r.name}を持っている部員`}
              >
                {count}人
              </button>
            </li>
          );
        })}
      </ul>
      {sheet && <SkillSheet id={sheet} onClose={() => setSheet(null)} />}
    </main>
  );
}
