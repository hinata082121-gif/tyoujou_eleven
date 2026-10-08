import { createMatch, simulateToEnd, type TeamInput } from "../match/engine";
import { autoSetup } from "../match/lineup";
import type { Rng } from "../rng";
import type { MatchRules, School } from "../types";
import type { MatchOutcome } from "./bracket";

export function schoolTeamInput(school: School, rules: MatchRules, isUser: boolean): TeamInput {
  return {
    schoolId: school.id,
    name: school.name,
    rank: school.rank,
    isUser,
    players: school.players,
    setup: autoSetup(school.players, school.formation, school.tactics, rules.benchSize),
  };
}

/** CPU 同士の試合（表示なし。同じ試合エンジンで計算する） */
export function simulateCpuMatch(rng: Rng, a: School, b: School, rules: MatchRules): MatchOutcome {
  const state = simulateToEnd(createMatch(rules, rng, schoolTeamInput(a, rules, false), schoolTeamInput(b, rules, false)));
  const w = state.winner ?? (rng.chance(0.5) ? 0 : 1);
  return {
    winner: w === 0 ? a.id : b.id,
    score: [state.score[0], state.score[1]],
    pk: state.pk ? [state.pk.score[0], state.pk.score[1]] : undefined,
  };
}
