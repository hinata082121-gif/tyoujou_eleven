import { createMatch, simulateToEnd, type TeamInput } from "../match/engine";
import { autoSetup } from "../match/lineup";
import type { Rng } from "../rng";
import { CPU_MATCH_CONDITION } from "../config/school";
import type { MatchRules, Player, School } from "../types";
import type { MatchOutcome } from "./bracket";

/** CPU 校の、その試合での部員の状態（体力・調子・出られない選手）。元のデータは変えない */
export function cpuMatchSquad(rng: Rng, players: Player[]): Player[] {
  const c = CPU_MATCH_CONDITION;
  return players.map((p) => ({
    ...p,
    fitness: Math.max(c.fitnessMin, Math.min(100, Math.round(rng.normal(c.fitnessMean, c.fitnessSd)))),
    condition: rng.weighted([-2, -1, 0, 1, 2] as const, (v) => c.conditionWeights[v + 2]),
    injuryDays: rng.chance(c.unavailableChance) ? 1 : 0,
  }));
}

/**
 * 試合に出す学校のデータ。rng を渡すと、CPU 校は試合ごとの状態の変動（cpuMatchSquad）を付ける。
 */
export function schoolTeamInput(school: School, rules: MatchRules, isUser: boolean, rng?: Rng): TeamInput {
  const players = rng && !school.isPlayer ? cpuMatchSquad(rng, school.players) : school.players;
  return {
    schoolId: school.id,
    name: school.name,
    rank: school.rank,
    isUser,
    players,
    setup: autoSetup(players, school.formation, school.tactics, rules.benchSize),
    ...(school.cpuStaff ? { scouting: school.cpuStaff.scouting, aiQuality: school.cpuStaff.tactics / 100 } : {}),
  };
}

/** CPU 同士の試合（表示なし。同じ試合エンジンで計算する） */
export function simulateCpuMatch(rng: Rng, a: School, b: School, rules: MatchRules): MatchOutcome {
  const state = simulateToEnd(createMatch(rules, rng, schoolTeamInput(a, rules, false, rng), schoolTeamInput(b, rules, false, rng)));
  const w = state.winner ?? (rng.chance(0.5) ? 0 : 1);
  return {
    winner: w === 0 ? a.id : b.id,
    score: [state.score[0], state.score[1]],
    pk: state.pk ? [state.pk.score[0], state.pk.score[1]] : undefined,
  };
}
