/**
 * 合宿（夏・冬。docs/PHASE2C_PLAN.md 6章）。
 * ポジションごとに練習を選び、合宿の日数分を自動で進める。経験点が多い代わりに疲労も大きい。
 * 最終日に、選んだ方針に応じて特殊能力の習得を判定する（campLearning）。
 */
import { CAMP, CAMP_CHOICES, CAMP_DEFAULT_POLICY } from "../config/camp";
import { SKILL_LEARN } from "../config/skills";
import { overall } from "../player/rating";
import { practiceOneDay, type GainMap, type PracticeStaffOptions } from "../practice";
import type { Rng } from "../rng";
import { campLearning, type LearnEvent } from "../skills/learn";
import { POSITION_GROUPS, type CampPolicy, type CampSeason, type Player, type Position, type PositionGroup, type StatKey } from "../types";

export function positionGroup(pos: Position): PositionGroup {
  if (pos === "GK") return "GK";
  if (pos === "CB" || pos === "SB") return "DF";
  if (pos === "WG" || pos === "CF") return "FW";
  return "MF";
}

/** 方針の初期値（前回の方針。選べないものは初期値に戻す） */
export function defaultCampPolicy(prev?: Partial<CampPolicy>): CampPolicy {
  const out = { ...CAMP_DEFAULT_POLICY };
  for (const g of POSITION_GROUPS) {
    const k = prev?.[g];
    if (k && CAMP_CHOICES[g].includes(k)) out[g] = k;
  }
  return out;
}

export function isValidCampPolicy(policy: CampPolicy): boolean {
  return POSITION_GROUPS.every((g) => CAMP_CHOICES[g].includes(policy[g]));
}

export interface CampGrowth {
  playerId: string;
  name: string;
  grade: number;
  group: PositionGroup;
  /** 総合値の伸び */
  overallGain: number;
  /** 能力ごとの伸び（上がった分だけ） */
  stats: Partial<Record<StatKey, number>>;
}

export interface CampResult {
  season: CampSeason;
  days: number;
  policy: CampPolicy;
  growth: CampGrowth[];
  learned: LearnEvent[];
  injured: string[];
}

export interface CampOptions extends PracticeStaffOptions {
  /** 特殊能力の判定の倍率（グラウンド・ヘッドコーチ） */
  learnMult?: number;
  /** 1 日ごとに呼ぶ（世界の進行など） */
  onDay?: (dayIndex: number) => void;
}

/** 合宿を行う（引退した 3 年生は対象外） */
export function runCamp(rng: Rng, players: Player[], season: CampSeason, policy: CampPolicy, days: number, opts: CampOptions = {}): CampResult {
  const active = players.filter((p) => p.status === "active");
  const before = new Map(active.map((p) => [p.id, { ov: overall(p), stats: { ...p.stats } }]));
  const groups = new Map<PositionGroup, Player[]>(POSITION_GROUPS.map((g) => [g, []]));
  for (const p of active) groups.get(positionGroup(p.mainPosition))!.push(p);
  const gains: GainMap = {};
  const injured: Player[] = [];
  const dayOpts: PracticeStaffOptions = { ...opts, fitnessCostMult: CAMP.fitnessCostMult, proficiencyMult: CAMP.proficiencyMult, rolls: opts.rolls ?? {} };
  for (let d = 0; d < days; d++) {
    for (const g of POSITION_GROUPS) injured.push(...practiceOneDay(rng, groups.get(g)!, policy[g], CAMP.expMult, gains, dayOpts));
    opts.onDay?.(d);
  }
  const learnBase = SKILL_LEARN.trainingBase * CAMP.learnBaseMult * (opts.learnMult ?? 1);
  const learned: LearnEvent[] = [];
  for (const g of POSITION_GROUPS) learned.push(...campLearning(rng, groups.get(g)!, [policy[g]], learnBase, SKILL_LEARN.goldTraining));
  const growth: CampGrowth[] = active.map((p) => {
    const b = before.get(p.id)!;
    const stats: Partial<Record<StatKey, number>> = {};
    for (const [k, v] of Object.entries(p.stats) as [StatKey, number][]) if (v > b.stats[k]) stats[k] = v - b.stats[k];
    return { playerId: p.id, name: p.name, grade: p.grade, group: positionGroup(p.mainPosition), overallGain: Math.round((overall(p) - b.ov) * 10) / 10, stats };
  });
  growth.sort((a, b) => b.overallGain - a.overallGain);
  return { season, days, policy: { ...policy }, growth, learned, injured: [...new Set(injured.map((p) => p.name))] };
}

/** 判定の倍率 = 1 + グラウンドのレベル × learnPerGround + 指導力/100 × learnFromCoaching（上限 maxLearnMult） */
export function campLearnMult(groundLevel: number, coaching: number): number {
  return Math.min(CAMP.maxLearnMult, 1 + groundLevel * CAMP.learnPerGround + (coaching / 100) * CAMP.learnFromCoaching);
}
