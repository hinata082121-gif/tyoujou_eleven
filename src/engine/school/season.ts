import { CPU_GROWTH } from "../config/growth";
import { autoCaptain } from "../captain";
import { PRESTIGE_DRIFT } from "../config/school";
import { growCpuPlayer, growHeight } from "../player/growth";
import { cpuSeasonTraits } from "../skills/learn";
import type { Rng } from "../rng";
import type { Player, School } from "../types";
import { cpuFreshmen } from "./generate";
import { rankFromStrength, teamStrength } from "./strength";

/**
 * CPU 校の年度替わり：3 年生が卒業し、進級して成長し、新入生が入る。
 * 格は少しだけ変動する。
 */
export function advanceCpuSchool(rng: Rng, school: School, newYear: number, incoming: Player[] = []) {
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
    const base = (school.basePrestige ??= school.prestige);
    // もとの格から離れていれば、戻る方へ動きやすい（P3）
    const upChance = school.prestige < base ? PRESTIGE_DRIFT.returnChance : school.prestige > base ? 1 - PRESTIGE_DRIFT.returnChance : 0.5;
    if (school.prestige !== base || rng.chance(PRESTIGE_DRIFT.leaveBaseChance)) school.prestige = Math.max(0, Math.min(5, school.prestige + (rng.chance(upChance) ? 1 : -1)));
  }
  // スカウトで取り合いに勝った中学生は、新入生の 1 人分として入る（P2c）
  const fresh = cpuFreshmen(rng, school.prestige, newYear).slice(incoming.length);
  school.players.push(...incoming.map((p) => ({ ...p, grade: 1 as const, enrolledYear: newYear })), ...fresh);
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
