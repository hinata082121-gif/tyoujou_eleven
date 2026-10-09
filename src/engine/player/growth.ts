import { CPU_GROWTH, GROWTH } from "../config/growth";
import { HEIGHT, STAT_MAX } from "../config/player";
import type { Rng } from "../rng";
import { ALL_STATS, FIELD_STATS, GK_STATS, type Player, type StatKey } from "../types";

/** v → v+1 に必要な経験点 */
export function expToNext(v: number): number {
  return GROWTH.base * Math.exp(v / GROWTH.scale);
}

export function isOffRole(p: Player, stat: StatKey): boolean {
  const isGk = p.mainPosition === "GK";
  return isGk ? (FIELD_STATS as readonly string[]).includes(stat) : (GK_STATS as readonly string[]).includes(stat);
}

/**
 * 経験点を能力に入れる。伸びしろと役割外の補正をかけ、必要経験点に達したら能力が上がる。
 * 戻り値は上がったポイント数。
 */
export function addExp(p: Player, stat: StatKey, rawExp: number): number {
  if (rawExp <= 0) return 0;
  const mult = p.potential * (isOffRole(p, stat) ? GROWTH.offRoleMult : 1);
  let exp = (p.exp[stat] ?? 0) + rawExp * mult;
  let ups = 0;
  while (p.stats[stat] < STAT_MAX && exp >= expToNext(p.stats[stat])) {
    exp -= expToNext(p.stats[stat]);
    p.stats[stat] += 1;
    ups++;
  }
  if (p.stats[stat] >= STAT_MAX) exp = 0;
  p.exp[stat] = Math.round(exp * 100) / 100;
  return ups;
}

/** 練習の効率（体力・調子） */
export function practiceEfficiency(p: Player): number {
  const fit = GROWTH.lowFitnessMult + (1 - GROWTH.lowFitnessMult) * (p.fitness / 100);
  return fit * (GROWTH.conditionMult[p.condition] ?? 1);
}

/** CPU 校の成長（簡略化モデル）。fraction = 1 で 1 年分 */
export function growCpuPlayer(rng: Rng, p: Player, fraction = 1) {
  for (const stat of ALL_STATS) {
    addExp(p, stat, Math.max(0, rng.normal(CPU_GROWTH.yearlyExp, CPU_GROWTH.sd)) * fraction);
  }
}

/** 身長の伸び（進級時に呼ぶ。p.grade は進級後の学年） */
export function growHeight(rng: Rng, p: Player) {
  if (p.heightGrowthLeft <= 0) return;
  const g = p.grade === 3 ? p.heightGrowthLeft : rng.int(0, p.heightGrowthLeft);
  p.heightCm = Math.min(HEIGHT.max, p.heightCm + g);
  p.heightGrowthLeft -= g;
}
