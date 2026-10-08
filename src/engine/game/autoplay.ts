/**
 * 自動で遊ぶ（テスト・バランス検証用）。プレイヤーの操作と同じ関数だけを呼ぶ。
 *
 * - simple：手札の数字が大きい練習を選び、試合は前回の采配のまま（交代もしない）
 * - skilled：ある程度うまい監督。体力を見て練習を選び、チームに合うフォーメーションと
 *   相手に応じた戦術を選び、試合中は疲れた選手を交代させる
 */
import { FORMATION_IDS, type GameState, type Tactics, type TeamSetup } from "../types";
import { PRACTICES } from "../config/practice";
import { simulateToEnd } from "../match/engine";
import { autoSetup } from "../match/lineup";
import { playerSchool } from "../season";
import { rankIndex, teamStrength } from "../school/strength";
import {
  canSkipWatching,
  confirmGraduation,
  confirmYearEnd,
  finishPlayerMatch,
  opponentOf,
  pendingMatchRules,
  playCard,
  startPlayerMatch,
  defaultSetup,
  type MatchSummary,
} from ".";

export type AutoPolicy = "simple" | "skilled";

export interface AutoplayStats {
  cards: number;
  matches: MatchSummary[];
  graduations: number;
  yearEnds: number;
}

export const newAutoplayStats = (): AutoplayStats => ({ cards: 0, matches: [], graduations: 0, yearEnds: 0 });

/** 練習カードの役に立つ度合い（対象の広さ） */
const PRACTICE_USEFULNESS = { all: 1, field: 0.9, gk: 0.35 } as const;

function chooseCard(state: GameState, policy: AutoPolicy) {
  const players = playerSchool(state).players.filter((x) => x.status === "active");
  const avgFit = players.reduce((s, x) => s + x.fitness, 0) / Math.max(1, players.length);
  const hand = state.calendar.hand;
  const rest = hand.find((c) => c.practice === "rest");
  if (policy === "simple") {
    return avgFit < 55 && rest ? rest : ([...hand].filter((c) => c.practice !== "rest").sort((a, b) => b.value - a.value)[0] ?? hand[0]);
  }
  if (avgFit < 62 && rest) return rest;
  const score = (c: (typeof hand)[number]) => (c.practice === "rest" ? 0.1 : c.value * PRACTICE_USEFULNESS[PRACTICES[c.practice].target]);
  return [...hand].sort((a, b) => score(b) - score(a))[0];
}

/** うまい監督の試合前の采配：チームに合うフォーメーションと、相手に応じた戦術 */
export function skilledSetup(state: GameState): TeamSetup {
  const school = playerSchool(state);
  const opp = opponentOf(state);
  const rules = pendingMatchRules(state);
  const formation = [...FORMATION_IDS].sort((a, b) => teamStrength(school.players, b) - teamStrength(school.players, a))[0];
  const diff = opp ? rankIndex(opp.rank) - rankIndex(school.rank) : 0;
  const tactics: Tactics =
    diff >= 1
      ? { attack: "defensive", buildUp: "buildUp", press: "mid", line: "low" }
      : diff <= -1
        ? { attack: "attacking", buildUp: "buildUp", press: "high", line: "high" }
        : { attack: "balanced", buildUp: "buildUp", press: "high", line: "high" };
  return autoSetup(school.players, formation, tactics, rules?.benchSize ?? 9);
}

/** 次の操作を 1 つ行う */
export function autoStep(state: GameState, stats: AutoplayStats, policy: AutoPolicy = "simple") {
  if (state.activeMatch) {
    // skilled は試合中も AI の監督に任せる（疲れた選手の交代など）
    if (policy === "skilled") state.activeMatch.state.teams[state.activeMatch.userSide].isUser = false;
    simulateToEnd(state.activeMatch.state);
    const s = finishPlayerMatch(state);
    if (s) stats.matches.push(s);
    return;
  }
  const p = state.pending;
  if (p?.type === "match") {
    if (policy === "skilled") startPlayerMatch(state, skilledSetup(state), canSkipWatching(state) ? "auto" : "watch");
    else startPlayerMatch(state, defaultSetup(state));
    return;
  }
  if (p?.type === "graduation") {
    confirmGraduation(state);
    stats.graduations++;
    return;
  }
  if (p?.type === "yearEnd") {
    confirmYearEnd(state);
    stats.yearEnds++;
    return;
  }
  playCard(state, chooseCard(state, policy).id);
  stats.cards++;
}

/** 指定した年数ぶん進める */
export function autoplayYears(state: GameState, years: number, policy: AutoPolicy = "simple", maxSteps = 2000 * years + 100): AutoplayStats {
  const stats = newAutoplayStats();
  const target = state.year + years;
  for (let i = 0; i < maxSteps && state.year < target; i++) autoStep(state, stats, policy);
  return stats;
}
