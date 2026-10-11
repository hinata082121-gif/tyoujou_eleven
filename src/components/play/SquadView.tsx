"use client";

import { useState } from "react";
import { PLAY_STYLE_NAMES, PLAY_STYLE_SHORT, POSITION_NAMES, SKILL_CATEGORY_NAMES, SKILL_LINE_NAMES, SKILL_NAMES } from "@/engine/config/names";
import { PLAY_STYLE_DEFS } from "@/engine/config/playStyle";
import { SKILL_DEFS, SKILL_LINE_TIERS } from "@/engine/config/skills";
import { goldCount, plusCount } from "@/engine/skills";
import { playerSchool } from "@/engine/season";
import { PLAY_STYLES, POSITIONS, SKILL_IDS, SKILL_LINES, type Player, type PlayStyle, type Position, type SkillCategory, type SkillId, type StyleGroup } from "@/engine/types";
import { hasSkillForFilter } from "./SkillBook";
import { useGameStore } from "@/store/gameStore";
import { Bar, fitnessColor, RankBadge, Segmented } from "../ui";
import { StaffList } from "../staff/StaffView";
import { CONDITION_COLOR, CONDITION_ICON, overallRank, overallValue } from "./format";

type SortKey = "overall" | "grade" | "position" | "fitness" | "height" | "proficiency" | "skills";
const SORT_LABELS: Record<SortKey, string> = { overall: "総合", grade: "学年", position: "ポジ", fitness: "体力", height: "身長", proficiency: "熟練", skills: "特能" };
const STYLE_GROUPS: StyleGroup[] = ["FW", "MF", "DF", "GK"];
const SKILL_CATEGORIES: SkillCategory[] = ["shoot", "dribble", "pass", "setPiece", "defense", "gk", "mental", "body"];

/** 絞り込みの候補（系統は ○ の ID で代表する。マイナスは最後） */
function skillFilterOptions(cat: SkillCategory): { id: SkillId; name: string }[] {
  const out: { id: SkillId; name: string }[] = [];
  for (const l of SKILL_LINES) {
    const t = SKILL_LINE_TIERS[l];
    const id = t.plus ?? t.gold;
    if (id && SKILL_DEFS[id].category === cat) out.push({ id, name: SKILL_LINE_NAMES[l] });
  }
  for (const id of SKILL_IDS) if (!SKILL_DEFS[id].line && SKILL_DEFS[id].category === cat && SKILL_DEFS[id].tier !== "minus") out.push({ id, name: SKILL_NAMES[id] });
  for (const id of SKILL_IDS) if (SKILL_DEFS[id].tier === "minus" && SKILL_DEFS[id].category === cat) out.push({ id, name: SKILL_NAMES[id] });
  return out;
}
type Filter = "all" | Position;

export function SquadView() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const selectPlayer = useGameStore((s) => s.selectPlayer);
  const [tab, setTab] = useState<"players" | "staff">("players");
  const [sort, setSort] = useState<SortKey>("overall");
  const [filter, setFilter] = useState<Filter>("all");
  const [styleFilter, setStyleFilter] = useState<PlayStyle | "">("");
  const skillFilter = useGameStore((s) => s.squadSkillFilter);
  const setSkillFilter = useGameStore((s) => s.openSquadWithSkill);
  const school = playerSchool(game);
  const players = school.players;

  const filtered = players.filter(
    (p) =>
      (filter === "all" || p.mainPosition === filter || p.aptitude[filter] >= 2) &&
      (!styleFilter || p.playStyle === styleFilter) &&
      (!skillFilter || hasSkillForFilter(p, skillFilter)),
  );
  const cmp: Record<SortKey, (a: Player, b: Player) => number> = {
      overall: (a, b) => overallValue(b) - overallValue(a),
      grade: (a, b) => b.grade - a.grade || overallValue(b) - overallValue(a),
      position: (a, b) => POSITIONS.indexOf(a.mainPosition) - POSITIONS.indexOf(b.mainPosition) || overallValue(b) - overallValue(a),
      fitness: (a, b) => b.fitness - a.fitness,
      height: (a, b) => b.heightCm - a.heightCm,
      proficiency: (a, b) => b.styleProficiency - a.styleProficiency,
      skills: (a, b) => plusCount(b) - plusCount(a) || goldCount(b) - goldCount(a) || overallValue(b) - overallValue(a),
    };
  const list = [...filtered].sort(cmp[sort]);

  if (tab === "staff")
    return (
      <div className="flex flex-col gap-2 p-3">
        <Segmented options={["players", "staff"] as const} value={tab} onChange={setTab} labels={{ players: "部員", staff: "スタッフ" }} />
        <StaffList />
      </div>
    );

  return (
    <div className="flex flex-col gap-2 p-3">
      <Segmented options={["players", "staff"] as const} value={tab} onChange={setTab} labels={{ players: "部員", staff: "スタッフ" }} />
      <Segmented options={Object.keys(SORT_LABELS) as SortKey[]} value={sort} onChange={setSort} labels={SORT_LABELS} />
      <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3">
        {(["all", ...POSITIONS] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-bold ${filter === f ? "bg-pitch text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {f === "all" ? "全員" : POSITION_NAMES[f]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={styleFilter}
          onChange={(e) => setStyleFilter(e.target.value as PlayStyle | "")}
          className="min-h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs"
          aria-label="スタイルで絞り込む"
        >
          <option value="">スタイル：すべて</option>
          {STYLE_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {PLAY_STYLES.filter((s) => PLAY_STYLE_DEFS[s].groups[0] === g).map((s) => (
                <option key={s} value={s}>
                  {PLAY_STYLE_NAMES[s]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={skillFilter ?? ""}
          onChange={(e) => setSkillFilter((e.target.value || null) as SkillId | null)}
          className="min-h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs"
          aria-label="特殊能力で絞り込む"
        >
          <option value="">特殊能力：すべて</option>
          {SKILL_CATEGORIES.map((c) => (
            <optgroup key={c} label={SKILL_CATEGORY_NAMES[c]}>
              {skillFilterOptions(c).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-gray-500">
        {list.length}人{filter !== "all" && "（適性○以上を含む）"}
      </p>
      <ul className="flex flex-col divide-y divide-gray-100">
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => selectPlayer(p.id)} className="flex min-h-14 w-full items-center gap-2 py-1.5 text-left">
              <RankBadge rank={overallRank(p)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold">{p.name}</span>
                  {school.captainId === p.id && <span className="rounded bg-pitch-dark px-1 text-[10px] font-bold text-white">C</span>}
                  <span className="text-[11px] text-gray-500">{p.grade}年</span>
                  {p.status === "retired" && <span className="rounded bg-gray-200 px-1 text-[10px]">引退</span>}
                  {p.suspended > 0 && <span className="rounded bg-red-600 px-1 text-[10px] text-white">出場停止</span>}
                  {p.injuryDays > 0 && <span className="rounded bg-red-100 px-1 text-[10px] text-red-700">ケガ{p.injuryDays}日</span>}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <span className="w-9 font-bold text-pitch-dark">{POSITION_NAMES[p.mainPosition]}</span>
                  <span className="truncate text-violet-700">{PLAY_STYLE_SHORT[p.playStyle]}</span>
                  {plusCount(p) > 0 && (
                    <span className="flex items-center gap-0.5 text-emerald-700">
                      ★{plusCount(p)}
                      {goldCount(p) > 0 && <span className="inline-block h-2 w-2 rounded-full bg-amber-400 ring-1 ring-amber-600" aria-label="金色" />}
                    </span>
                  )}
                  <span className={CONDITION_COLOR[p.condition]}>{CONDITION_ICON[p.condition]}</span>
                  <Bar value={p.fitness} color={fitnessColor(p.fitness)} className="!h-1.5 max-w-20" />
                </div>
              </div>
              <span className="w-8 text-right text-sm font-black text-gray-700">{overallValue(p)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
