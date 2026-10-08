/**
 * 自動で遊ぶ（テスト・動作確認用）。プレイヤーの操作と同じ関数だけを呼ぶ。
 */
import { simulateToEnd } from "../match/engine";
import type { GameState } from "../types";
import { confirmGraduation, confirmYearEnd, defaultSetup, finishPlayerMatch, playCard, startPlayerMatch, type MatchSummary } from ".";
import { playerSchool } from "../season";

export interface AutoplayStats {
  cards: number;
  matches: MatchSummary[];
  graduations: number;
  yearEnds: number;
}

/** 次の操作を 1 つ行う */
export function autoStep(state: GameState, stats: AutoplayStats) {
  if (state.activeMatch) {
    simulateToEnd(state.activeMatch.state);
    const s = finishPlayerMatch(state);
    if (s) stats.matches.push(s);
    return;
  }
  const p = state.pending;
  if (p?.type === "match") {
    startPlayerMatch(state, defaultSetup(state));
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
  const players = playerSchool(state).players.filter((x) => x.status === "active");
  const avgFit = players.reduce((s, x) => s + x.fitness, 0) / Math.max(1, players.length);
  const hand = state.calendar.hand;
  const rest = hand.find((c) => c.practice === "rest");
  const card = avgFit < 55 && rest ? rest : ([...hand].filter((c) => c.practice !== "rest").sort((a, b) => b.value - a.value)[0] ?? hand[0]);
  playCard(state, card.id);
  stats.cards++;
}

/** 指定した年数ぶん進める */
export function autoplayYears(state: GameState, years: number, maxSteps = 5000): AutoplayStats {
  const stats: AutoplayStats = { cards: 0, matches: [], graduations: 0, yearEnds: 0 };
  const target = state.year + years;
  for (let i = 0; i < maxSteps && state.year < target; i++) autoStep(state, stats);
  return stats;
}
