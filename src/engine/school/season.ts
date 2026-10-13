import { CPU_GROWTH } from "../config/growth";
import { autoCaptain } from "../captain";
import { PRESTIGE_DRIFT } from "../config/school";
import { growCpuPlayer, growHeight } from "../player/growth";
import { cpuSeasonTraits } from "../skills/learn";
import type { Rng } from "../rng";
import type { School } from "../types";
import { cpuFreshmen } from "./generate";
import { rankFromStrength, teamStrength } from "./strength";

/**
 * CPU 校の年度替わり：3 年生が卒業し、進級して成長し、新入生が入る。
 * 格は少しだけ変動する。
 */
export function advanceCpuSchool(rng: Rng, school: School, newYear: number) {
  school.players = school.players.filter((p) => p.grade < 3);
  for (const p of school.players) {
    growCpuPlayer(rng, p, CPU_GROWTH.springShare);
    p.grade = (p.grade + 1) as 2 | 3;
    growHeight(rng, p);
    p.fitness = 100;
    p.condition = 0;
    p.injuryDays = 0;
    p.exp = {};
    cpuSeasonTraits(rng, p, true);
  }
  if (rng.chance(PRESTIGE_DRIFT.chance)) {
    school.prestige = Math.max(0, Math.min(5, school.prestige + (rng.chance(0.5) ? 1 : -1)));
  }
  school.players.push(...cpuFreshmen(rng, school.prestige, newYear));
  school.rank = rankFromStrength(teamStrength(school.players, school.formation));
  // キャプテン（3 年生が卒業した後に、自動で選び直す）
  autoCaptain(school);
}

/** 秋の成長（10 月 1 日）。年度替わりと合わせて 1 年分になる */
export function autumnCpuGrowth(rng: Rng, school: School) {
  for (const p of school.players) {
    growCpuPlayer(rng, p, 1 - CPU_GROWTH.springShare);
    cpuSeasonTraits(rng, p, false);
  }
  school.rank = rankFromStrength(teamStrength(school.players, school.formation));
}
