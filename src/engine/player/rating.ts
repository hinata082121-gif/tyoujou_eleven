import { CONDITION_MULT, POSITION_RATING_WEIGHTS } from "../config/player";
import { MATCH } from "../config/match";
import type { Player, Position, StatKey, Stats } from "../types";

export function weightedStats(stats: Stats, weights: Partial<Record<StatKey, number>>): number {
  let sum = 0;
  let w = 0;
  for (const key of Object.keys(weights) as StatKey[]) {
    const wt = weights[key] ?? 0;
    sum += stats[key] * wt;
    w += wt;
  }
  return w > 0 ? sum / w : 0;
}

/** そのポジションでの評価値（適性込み） */
export function positionRating(p: Pick<Player, "stats" | "aptitude">, pos: Position): number {
  return weightedStats(p.stats, POSITION_RATING_WEIGHTS[pos]) * MATCH.aptitudeMult[p.aptitude[pos]];
}

/** 総合値（主ポジションでの評価値） */
export function overall(p: Player): number {
  return weightedStats(p.stats, POSITION_RATING_WEIGHTS[p.mainPosition]);
}

/** 最も適性の高いポジションでの評価値 */
export function bestRating(p: Player): number {
  return positionRating(p, p.mainPosition);
}

export function isGoalkeeper(p: Player): boolean {
  return p.mainPosition === "GK";
}

export function conditionMult(p: Pick<Player, "condition">): number {
  return CONDITION_MULT[p.condition] ?? 1;
}

/** 試合に出られるか */
export function isAvailable(p: Player): boolean {
  return p.status === "active" && p.injuryDays <= 0;
}
