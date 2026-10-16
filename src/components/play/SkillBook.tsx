"use client";

/**
 * 特殊能力図鑑（メニュー → 特殊能力図鑑。PLAN 7.2）。
 * 横画面：左に分類のタブ、中央に一覧（1 行に 1 系統。段階を ○→◎→金色 の順に並べ、右に自校で持っている人数）、
 * 右に選んだ特殊能力の説明と持っている部員の顔。人数をタップで部員一覧をその特殊能力で絞り込む。
 */
import { useState } from "react";
import { LEGEND_SKILL_NAME, PLAY_STYLE_NAMES, SKILL_CATEGORY_NAMES, SKILL_LINE_NAMES, SKILL_NAMES } from "@/engine/config/names";
import { SKILL_DEFS, SKILL_LINE_TIERS } from "@/engine/config/skills";
import { playerSchool } from "@/engine/season";
import { SKILL_IDS, SKILL_LINES, type Player, type SkillCategory, type SkillId, type SkillLine } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Icon } from "../icons";
import { PlayerFace } from "../look/Figure";
import { Band, Button, Label, Screen } from "../ui";
import { SkillChip, skillAffinity, skillHint, skillText } from "./traits";
import { shortNames } from "@/lib/names";

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
  const [picked, setPicked] = useState<SkillId | null>(null);
  const school = playerSchool(game);
  const players = school.players.filter((p) => p.status === "active");
  const rows = rowsFor(tab);
  // 選んでいる特殊能力（今の分類に無ければ先頭の行）
  const row = rows.find((r) => picked && r.ids.includes(picked)) ?? rows[0];
  const sel = row ? (picked && row.ids.includes(picked) ? picked : row.ids[0]) : null;
  const def = sel ? SKILL_DEFS[sel] : null;
  const aff = sel ? skillAffinity(sel) : null;
  const short = shortNames(players);
  const holders = sel ? players.filter((p) => p.skills.includes(sel)) : [];
  const rowCount = row ? players.filter((p) => hasSkillForFilter(p, row.ids[0])).length : 0;
  return (
    <Screen title="特殊能力図鑑" onBack={close}>
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 左：分類のタブ */}
        <nav className="scroll-y flex min-h-0 w-[8.75rem] shrink-0 flex-col gap-0.5 bg-panel p-0.5" aria-label="分類">
          {(["legend", ...CATEGORIES, "minus"] as Tab[]).map((t) => {
            const on = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setPicked(null);
                }}
                aria-pressed={on}
                className={`pressable flex min-h-11 shrink-0 items-center gap-1 border-l-4 px-1.5 text-left text-[0.75rem] font-black ${
                  on ? (t === "legend" ? "border-gold-2 bg-gold text-ink" : "border-ink bg-yellow text-ink") : "border-transparent bg-panel-2 text-text-2"
                }`}
              >
                {t === "legend" && <Icon name="star" size={12} className="shrink-0" />}
                <span className="truncate">{TAB_LABELS[t]}</span>
              </button>
            );
          })}
        </nav>

        {/* 中央：一覧 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Band sub={`${rows.length}件`}>{TAB_LABELS[tab]}</Band>
          {tab === "legend" && <p className="mt-1 shrink-0 bg-panel px-2 py-1 text-[0.75rem] text-text-3">金色の特殊能力。下の段階と試合での成果をそろえた選手だけが、ごくまれに身につけます。</p>}
          <ul className="scroll-y mt-1 min-h-0 flex-1 bg-panel px-1.5">
            {rows.map((r) => {
              const count = players.filter((p) => hasSkillForFilter(p, r.ids[0])).length;
              const on = row?.key === r.key;
              return (
                <li key={r.key} className={`flex items-center gap-2 border-b border-l-4 border-b-line py-1 pl-1.5 ${on ? "border-l-yellow bg-panel-3" : "border-l-transparent"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 truncate text-[0.75rem] font-bold text-text-2">{r.name}</div>
                    <div className="flex flex-wrap items-center gap-1">
                      {r.ids.map((id, i) => (
                        <span key={id} className="flex items-center gap-1">
                          {i > 0 && <Icon name="next" size={12} className="text-text-3" />}
                          <span className={sel === id ? "outline-2 outline-offset-1 outline-yellow" : ""}>
                            <SkillChip id={id} onClick={() => setPicked(id)} />
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => count > 0 && openSquadWithSkill(r.ids[0])}
                    className={`pressable font-num min-h-11 min-w-12 shrink-0 text-[0.875rem] font-bold ${count > 0 ? "bg-panel-2 text-good" : "text-text-3"}`}
                    aria-label={`${r.name}を持っている部員`}
                  >
                    {count}人
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 右：説明と持っている部員 */}
        <aside className="flex min-h-0 w-[15rem] shrink-0 flex-col">
          {sel && def && aff ? (
            <div key={sel} className="anim-fade-up scroll-y flex min-h-0 flex-1 flex-col gap-1.5 bg-panel p-2">
              <div className="flex flex-wrap items-center gap-2">
                <SkillChip id={sel} />
                {def.tier === "gold" && <span className="text-[0.75rem] font-bold text-gold-2">{LEGEND_SKILL_NAME}</span>}
              </div>
              <p className="text-[0.8125rem] leading-relaxed">{skillText(sel)}</p>
              <p className="text-[0.75rem] text-text-2">入手：{skillHint(sel) || "—"}</p>
              {aff.styles.length > 0 && <p className="text-[0.75rem] text-text-2">身につけやすいスタイル：{aff.styles.map((s) => PLAY_STYLE_NAMES[s]).join("・")}</p>}
              {aff.personalities.length > 0 && <p className="text-[0.75rem] text-text-2">身につけやすい性格：{aff.personalities.join("・")}</p>}
              <div className="mt-1 border-t border-line pt-1.5">
                <Label>持っている部員（{holders.length}人）</Label>
                {holders.length === 0 ? (
                  <p className="text-[0.75rem] text-text-3">いません</p>
                ) : (
                  <ul className="grid grid-cols-4 gap-1">
                    {holders.map((p) => (
                      <li key={p.id} className="flex min-w-0 flex-col items-center bg-panel-2 py-0.5">
                        <PlayerFace look={p.look} size={36} kit={school.kits?.first} />
                        <span className="w-full truncate px-0.5 text-center text-[0.6875rem] font-bold">{short.get(p.id)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {row && rowCount > 0 && (
                <Button variant="secondary" small icon="squad" className="mt-auto" onClick={() => openSquadWithSkill(row.ids[0])}>
                  部員一覧で見る（{rowCount}人）
                </Button>
              )}
            </div>
          ) : (
            <p className="bg-panel p-2 text-[0.75rem] text-text-3">特殊能力を選んでください。</p>
          )}
        </aside>
      </div>
    </Screen>
  );
}
