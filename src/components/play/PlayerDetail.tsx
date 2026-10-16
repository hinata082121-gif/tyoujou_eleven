"use client";

import { academicBand, trustBand } from "@/engine/school/life";
import { LifeBars } from "./LifeBars";

import { useState } from "react";
import {
  APTITUDE_MARKS,
  CONDITION_NAMES,
  FOOT_NAMES,
  MOVEMENT_NAMES,
  PERSONALITY_NAMES,
  PERSONALITY_TEXTS,
  PLAY_STYLE_NAMES,
  POSITION_NAMES,
  PRACTICE_NAMES,
} from "@/engine/config/names";
import { PLAY_STYLE_DEFS } from "@/engine/config/playStyle";
import { SKILL_DEFS } from "@/engine/config/skills";
import { statRank } from "@/engine/player/rank";
import { playerSchool } from "@/engine/season";
import { POSITIONS, type SkillId } from "@/engine/types";
import { bodyScale, generateKits } from "@/engine/look";
import { useGameStore } from "@/store/gameStore";
import { CONDITION_ICONS, CONDITION_TEXT, Icon } from "../icons";
import { KitFigure } from "../look/Figure";
import { Band, Button, IconButton, RANK_BG, fitnessColor, fitnessText } from "../ui";
import { overallRank, overallValue, statLabel, visibleStats } from "./format";
import { ProficiencyBar, SkillChip, SkillSheet, StyleChangeSheet } from "./traits";

/** 金色 → ◎ → ○ → 段階なし → × の順 */
const TIER_ORDER = { gold: 0, double: 1, plus: 2, single: 3, minus: 4 } as const;

/**
 * 選手の詳細（画面いっぱい）。左に全身の立ち絵と名前の札、中に能力、右に性格・スタイル・特殊能力・適性
 */
export function PlayerDetail() {
  const game = useGameStore((s) => s.game)!;
  const id = useGameStore((s) => s.selectedPlayerId);
  const selectPlayer = useGameStore((s) => s.selectPlayer);
  const [skill, setSkill] = useState<SkillId | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const school = playerSchool(game);
  const p = school.players.find((x) => x.id === id);
  if (!p) return null;
  const close = () => selectPlayer(null);
  const kits = school.kits ?? generateKits(game.seed, school.id);
  const body = bodyScale(p.heightCm, p.stats.physical);
  const isCaptain = school.captainId === p.id;
  const skills = [...p.skills].sort((a, b) => TIER_ORDER[SKILL_DEFS[a].tier] - TIER_ORDER[SKILL_DEFS[b].tier]);
  const ovr = overallValue(p);
  const focusSet = new Set(p.focus ?? p.autoFocus ?? []);
  const expr = p.injuryDays > 0 ? "sad" : p.condition >= 1 ? "joy" : p.condition <= -1 ? "frustrated" : "focus";

  return (
    <div className="bg-pitch-stripes anim-fade-up fixed inset-0 z-30 grid grid-cols-[15rem_minmax(0,1fr)_14.5rem] gap-3 pb-[max(0.5rem,var(--safe-b))] pl-[max(0.5rem,var(--safe-l))] pr-[max(0.5rem,var(--safe-r))] pt-[max(0.5rem,var(--safe-t))]">
      {/* 立ち絵と名前の札 */}
      <section className="relative min-h-0 overflow-hidden">
        <div className="font-num pointer-events-none absolute -left-2 top-0 text-[13rem] font-bold leading-none text-yellow/20" aria-hidden>
          {p.shirtNumber ?? ""}
        </div>
        <div className="absolute bottom-[4.25rem] left-4">
          <KitFigure kit={kits.first} number={p.shirtNumber} look={p.look} height={body.height} build={body.build} size={232} expr={expr} />
        </div>
        <div className="anim-pop absolute right-1 top-2 -skew-x-[8deg] bg-yellow px-2.5 py-1 text-center text-ink">
          <b className="font-num block text-[2.25rem] leading-none">{ovr}</b>
          <span className="flex items-center gap-1 text-[0.6875rem] font-black">
            総合
            <span className={`font-num px-1 ${RANK_BG[overallRank(p)]}`}>{overallRank(p)}</span>
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-1">
          <div className="cut-r anim-band-in font-head inline-flex items-center gap-2 bg-telop py-0.5 pl-3 pr-7 text-[1.375rem] text-ink">
            {p.name}
            {isCaptain && (
              <span className="font-body bg-ink px-1.5 text-[0.75rem] font-black text-yellow" title="キャプテン">
                C
              </span>
            )}
          </div>
          <div className="cut-r -mt-px inline-block bg-ink py-0.5 pl-3 pr-6 text-[0.75rem] font-bold text-text-2">
            {p.grade}年{p.admission === "scholarship" && "（特待生）"}　{POSITION_NAMES[p.mainPosition]}　{p.heightCm}cm　利き足 {FOOT_NAMES[p.foot]}
            {p.status === "retired" && "　引退済み"}
          </div>
        </div>
      </section>

      {/* 能力 */}
      <section className="flex min-h-0 flex-col pt-1">
        <Band sub={`背番号 ${p.shirtNumber ?? "-"}`}>能力</Band>
        <div className="mt-1 grid shrink-0 grid-cols-3 gap-1">
          <div className="bg-panel px-2 py-1">
            <div className="text-[0.6875rem] font-bold text-text-3">体力</div>
            <div className={`font-num text-[1.125rem] leading-tight ${fitnessText(p.fitness)}`}>{Math.round(p.fitness)}</div>
            <div className="h-1 -skew-x-[20deg] bg-panel-3">
              <i className={`block h-full ${fitnessColor(p.fitness)}`} style={{ width: `${p.fitness}%` }} />
            </div>
          </div>
          <div className="bg-panel px-2 py-1">
            <div className="text-[0.6875rem] font-bold text-text-3">調子</div>
            <div className={`flex items-center gap-1 text-[0.875rem] font-black ${CONDITION_TEXT[p.condition]}`}>
              <Icon name={CONDITION_ICONS[p.condition]} size={16} />
              {CONDITION_NAMES[p.condition]}
            </div>
          </div>
          <div className="bg-panel px-2 py-1">
            <div className="text-[0.6875rem] font-bold text-text-3">ケガ</div>
            <div className={`flex items-center gap-1 text-[0.875rem] font-black ${p.injuryDays > 0 ? "text-bad" : "text-text-2"}`}>
              {p.injuryDays > 0 && <Icon name="injury" size={14} />}
              {p.injuryDays > 0 ? `残り${p.injuryDays}日` : "なし"}
            </div>
          </div>
        </div>
        {p.academic !== undefined && (
          <div className="mt-1 grid shrink-0 grid-cols-3 gap-1">
            <div className="bg-panel px-2 py-1">
              <div className="flex items-center justify-between whitespace-nowrap text-[0.6875rem] font-bold text-text-3">
                学力
                {(p.remedialDays ?? 0) > 0 ? <span className="bg-red px-1 font-black text-white">補習{p.remedialDays}日</span> : p.lastTestScore !== undefined && <span className="text-text-2">前回{p.lastTestScore}点</span>}
              </div>
              <div className="mt-1">
                <LifeBars value={academicBand(p)} label="学力" tone="telop" />
              </div>
            </div>
            <div className="bg-panel px-2 py-1">
              <div className="whitespace-nowrap text-[0.6875rem] font-bold text-text-3">監督への信頼</div>
              <div className="mt-1">
                <LifeBars value={trustBand(p)} label="信頼度" />
              </div>
            </div>
            <div className="bg-panel px-2 py-1">
              <div className="whitespace-nowrap text-[0.6875rem] font-bold text-text-3">今月の重点</div>
              <div className="mt-0.5 whitespace-nowrap text-[0.8125rem] font-black">{p.focus ? "監督の指示" : "おまかせ"}</div>
            </div>
          </div>
        )}
        <ul className="scroll-y mt-1 min-h-0 flex-1 bg-panel/90 px-2">
          {visibleStats(p).map((k) => {
            const v = p.stats[k];
            const r = statRank(v);
            return (
              <li key={k} className="grid h-7 grid-cols-[6.25rem_1.75rem_2rem_1fr] items-center gap-2 border-b border-line text-[0.8125rem]">
                <span className="flex min-w-0 items-center gap-1 font-bold">
                  <span className="truncate">{statLabel(k)}</span>
                  {focusSet.has(k) && <span className="shrink-0 bg-telop px-0.5 text-[0.5625rem] font-black leading-[0.875rem] text-ink">重点</span>}
                </span>
                <span className={`font-num flex h-[1.125rem] -skew-x-12 items-center justify-center text-[0.8125rem] font-bold text-ink ${RANK_BG[r]}`}>{r}</span>
                <span className="font-num text-right text-[1rem]">{v}</span>
                <span className="h-[0.4375rem] -skew-x-[20deg] bg-panel-3">
                  <i className={`block h-full ${RANK_BG[r]}`} style={{ width: `${v}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 性格・スタイル・特殊能力・適性 */}
      <section className="flex min-h-0 flex-col gap-1.5">
        <div className="flex justify-end">
          <IconButton name="close" label="閉じる" onClick={close} variant="danger" className="!min-h-9 !min-w-11" />
        </div>
        <div className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="bg-panel px-2 py-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[0.6875rem] font-black text-yellow">性格</span>
              <b className="font-head text-[0.9375rem] font-normal">{PERSONALITY_NAMES[p.personality]}</b>
            </div>
            <p className="text-[0.75rem] leading-snug text-text-2">{PERSONALITY_TEXTS[p.personality]}</p>
            {p.personality === "craftsman" && p.favoritePractice && <p className="text-[0.75rem] text-text-2">{PRACTICE_NAMES[p.favoritePractice]}にこだわりがある。</p>}
          </div>
          <div className="bg-panel px-2 py-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[0.6875rem] font-black text-yellow">スタイル</span>
              <b className="font-head text-[0.9375rem] font-normal">{PLAY_STYLE_NAMES[p.playStyle]}</b>
            </div>
            <p className="mb-1 text-[0.75rem] text-text-2">動きの範囲：{MOVEMENT_NAMES[PLAY_STYLE_DEFS[p.playStyle].movement]}</p>
            <ProficiencyBar value={p.styleProficiency} />
            {p.status === "active" && (
              <Button variant="ghost" small className="mt-1.5 w-full" icon="swap" onClick={() => setStyleOpen(true)}>
                スタイルを変える
              </Button>
            )}
          </div>
          <div className="bg-panel px-2 py-1.5">
            <div className="mb-1 text-[0.6875rem] font-black text-yellow">特殊能力</div>
            <div className="flex flex-wrap gap-1">
              {skills.length === 0 && <span className="text-[0.75rem] text-text-3">まだない</span>}
              {skills.map((s) => (
                <SkillChip key={s} id={s} faded={SKILL_DEFS[s].line === "captaincy" && !isCaptain} onClick={() => setSkill(s)} />
              ))}
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-8 gap-px text-center">
            {POSITIONS.map((pos) => {
              const a = p.aptitude[pos];
              return (
                <div key={pos} className={`py-0.5 ${a === 3 ? "bg-yellow text-ink" : a === 2 ? "bg-panel-3 text-text" : "bg-panel text-text-3"}`}>
                  <div className="text-[0.625rem] font-bold leading-tight tracking-tighter">{POSITION_NAMES[pos]}</div>
                  <div className="text-[0.875rem] font-black leading-tight">{APTITUDE_MARKS[a]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {skill && <SkillSheet id={skill} onClose={() => setSkill(null)} note={SKILL_DEFS[skill].line === "captaincy" && !isCaptain ? "キャプテンでないので、今は効果がありません。" : undefined} />}
      {styleOpen && <StyleChangeSheet player={p} onClose={() => setStyleOpen(false)} />}
    </div>
  );
}
