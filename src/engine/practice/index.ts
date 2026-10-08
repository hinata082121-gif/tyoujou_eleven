import { PRACTICES, NON_TARGET_FITNESS, DAILY_RECOVERY, INJURY, CONDITION_DRIFT_CHANCE } from "../config/practice";
import { GROWTH } from "../config/growth";
import { addExp, practiceEfficiency } from "../player/growth";
import type { Rng } from "../rng";
import type { Condition, Player, PracticeKind, StatKey } from "../types";

export type GainMap = Record<string, Partial<Record<StatKey, number>>>;

export function isPracticeTarget(p: Player, kind: PracticeKind): boolean {
  const target = PRACTICES[kind].target;
  if (target === "all") return true;
  if (target === "gk") return p.mainPosition === "GK";
  return p.mainPosition !== "GK";
}

const clampFit = (v: number) => Math.max(0, Math.min(100, v));

export function shiftCondition(p: Player, amount: number) {
  p.condition = Math.max(-2, Math.min(2, p.condition + amount)) as Condition;
}

/**
 * 1 日分の練習。経験点 = 練習 1 日あたりの値 × 効率（体力・調子）× 補正。
 * gains に実際に入れた経験点（伸びしろ補正前）を足し込む。
 */
export function practiceOneDay(rng: Rng, players: Player[], kind: PracticeKind, mult: number, gains: GainMap): Player[] {
  const def = PRACTICES[kind];
  const injured: Player[] = [];
  for (const p of players) {
    if (p.status !== "active") continue;
    if (p.injuryDays > 0) {
      p.injuryDays--;
      p.fitness = clampFit(p.fitness + DAILY_RECOVERY);
      continue;
    }
    if (isPracticeTarget(p, kind)) {
      const eff = practiceEfficiency(p) * mult * GROWTH.practiceMult;
      for (const [stat, value] of Object.entries(def.gains) as [StatKey, number][]) {
        if (def.fieldOnly?.includes(stat) && p.mainPosition === "GK") continue;
        const exp = value * eff;
        addExp(p, stat, exp);
        const g = (gains[p.id] ??= {});
        g[stat] = (g[stat] ?? 0) + exp;
      }
      p.fitness = clampFit(p.fitness + def.fitness + DAILY_RECOVERY);
    } else {
      p.fitness = clampFit(p.fitness + NON_TARGET_FITNESS + DAILY_RECOVERY);
    }
    // 体力が低いとケガをしやすい
    if (p.fitness < INJURY.safeFitness) {
      const risk = INJURY.maxDailyChance * (1 - p.fitness / INJURY.safeFitness);
      if (rng.chance(risk)) {
        p.injuryDays = rng.int(INJURY.minDays, INJURY.maxDays);
        injured.push(p);
      }
    }
    if (rng.chance(CONDITION_DRIFT_CHANCE)) shiftCondition(p, p.condition > 0 ? -1 : p.condition < 0 ? 1 : rng.chance(0.5) ? 1 : -1);
  }
  return injured;
}

/** 複数日の練習 */
export function runPractice(rng: Rng, players: Player[], kind: PracticeKind, days: number, mult: number) {
  const gains: GainMap = {};
  const injured: Player[] = [];
  for (let d = 0; d < days; d++) injured.push(...practiceOneDay(rng, players, kind, mult, gains));
  return { gains, injured };
}

/** 直前の練習で得た経験点に倍率をかけて追加する（黄マス） */
export function applyBonusGains(players: Player[], gains: GainMap, ratio: number) {
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const [id, g] of Object.entries(gains)) {
    const p = byId.get(id);
    if (!p || p.status !== "active") continue;
    for (const [stat, exp] of Object.entries(g) as [StatKey, number][]) addExp(p, stat, exp * ratio);
  }
}
