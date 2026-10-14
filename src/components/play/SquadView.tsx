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
import { CONDITION_ICONS, CONDITION_TEXT, Icon } from "../icons";
import { PlayerFace } from "../look/Figure";
import { fitnessColor, RankBadge, Segmented } from "../ui";
import { StaffList } from "../staff/StaffView";
import { overallRank, overallValue } from "./format";

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

  const tabs = <Segmented options={["players", "staff"] as const} value={tab} onChange={setTab} labels={{ players: "部員", staff: "スタッフ" }} className="w-44 shrink-0" />;

  if (tab === "staff")
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex shrink-0 items-center gap-2">{tabs}</div>
        <div className="scroll-y min-h-0 flex-1">
          <StaffList />
        </div>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-2">
        {tabs}
        <div className="no-scrollbar scroll-x flex min-w-0 flex-1 gap-0.5 bg-panel p-0.5">
          {(["all", ...POSITIONS] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`pressable min-h-9 shrink-0 px-2.5 text-[0.75rem] font-black ${filter === f ? "bg-yellow text-ink" : "bg-panel-2 text-text-2"}`}
            >
              {f === "all" ? "全員" : POSITION_NAMES[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Segmented options={Object.keys(SORT_LABELS) as SortKey[]} value={sort} onChange={setSort} labels={SORT_LABELS} className="min-w-0 flex-1" />
        <SelectBox value={styleFilter} onChange={(v) => setStyleFilter(v as PlayStyle | "")} label="スタイルで絞り込む">
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
        </SelectBox>
        <SelectBox value={skillFilter ?? ""} onChange={(v) => setSkillFilter((v || null) as SkillId | null)} label="特殊能力で絞り込む">
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
        </SelectBox>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-panel">
        <div className="grid shrink-0 grid-cols-[2rem_1.75rem_minmax(0,1fr)_2.25rem_2.5rem_6.5rem_3rem_1.5rem_4.5rem_2.25rem] items-center gap-2 border-b-2 border-line-2 px-2 py-1 text-[0.6875rem] font-black text-text-3">
          <span />
          <span className="whitespace-nowrap">ランク</span>
          <span>
            名前<span className="ml-2 font-bold">{list.length}人{filter !== "all" && "（適性○以上を含む）"}</span>
          </span>
          <span>学年</span>
          <span>ポジ</span>
          <span>スタイル</span>
          <span>特能</span>
          <span>調子</span>
          <span>体力</span>
          <span className="text-right">総合</span>
        </div>
        <ul className="scroll-y min-h-0 flex-1">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => selectPlayer(p.id)}
                className={`pressable grid min-h-11 w-full grid-cols-[2rem_1.75rem_minmax(0,1fr)_2.25rem_2.5rem_6.5rem_3rem_1.5rem_4.5rem_2.25rem] items-center gap-2 border-b border-line px-2 text-left text-[0.8125rem] ${p.status === "retired" ? "opacity-60" : ""}`}
              >
                <PlayerFace look={p.look} size={32} kit={school.kits?.first} expr={p.injuryDays > 0 ? "sad" : "normal"} />
                <RankBadge rank={overallRank(p)} size="sm" />
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate font-bold">{p.name}</span>
                  {school.captainId === p.id && <span className="shrink-0 bg-yellow px-1 text-[0.6875rem] font-black text-ink">C</span>}
                  {p.admission === "scholarship" && <span className="shrink-0 bg-telop px-1 text-[0.6875rem] font-black text-ink">特待</span>}
                  {p.status === "retired" && <span className="shrink-0 bg-panel-3 px-1 text-[0.6875rem] font-bold">引退</span>}
                  {p.suspended > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 bg-red px-1 text-[0.6875rem] font-black text-white">
                      <Icon name="suspend" size={11} />
                      停止
                    </span>
                  )}
                  {p.injuryDays > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[0.6875rem] font-black text-bad">
                      <Icon name="injury" size={11} />
                      {p.injuryDays}日
                    </span>
                  )}
                </span>
                <span className="font-num text-text-2">{p.grade}年</span>
                <span className="font-black text-yellow">{POSITION_NAMES[p.mainPosition]}</span>
                <span className="truncate text-[0.75rem] text-text-2">{PLAY_STYLE_SHORT[p.playStyle]}</span>
                <span className="flex items-center gap-1 text-[0.75rem] font-bold text-good">
                  {plusCount(p) > 0 && (
                    <>
                      <Icon name="star" size={11} />
                      <span className="font-num text-[0.8125rem]">{plusCount(p)}</span>
                      {goldCount(p) > 0 && <i className="h-2.5 w-2.5 -skew-x-12 border border-gold-2 bg-gold" aria-label="金色" />}
                    </>
                  )}
                </span>
                <span className={CONDITION_TEXT[p.condition]} title="調子">
                  <Icon name={CONDITION_ICONS[p.condition]} size={16} />
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 flex-1 -skew-x-[20deg] bg-panel-3">
                    <i className={`block h-full ${fitnessColor(p.fitness)}`} style={{ width: `${p.fitness}%` }} />
                  </span>
                  <span className="font-num w-6 text-right text-[0.75rem]">{Math.round(p.fitness)}</span>
                </span>
                <span className="font-num text-right text-[1rem] font-bold">{overallValue(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 絞り込みの選択（角のない箱と下向きのアイコン） */
function SelectBox({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <label className="relative flex shrink-0 items-center">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="min-h-9 w-36 appearance-none border border-line-2 bg-panel-2 pl-2 pr-6 text-[0.75rem] font-bold text-text">
        {children}
      </select>
      <Icon name="down" size={12} className="pointer-events-none absolute right-1.5 text-text-3" />
    </label>
  );
}
