/**
 * 自動で遊ぶ（テスト・バランス検証用）。プレイヤーの操作と同じ関数だけを呼ぶ。
 *
 * - simple：手札の数字が大きい練習を選び、試合は前回の采配のまま（交代もしない）
 * - skilled：ある程度うまい監督。体力を見て練習を選び、チームに合うフォーメーションと
 *   相手に応じた戦術を選び、試合中は疲れた選手を交代させる
 */
import { FORMATION_IDS, type FormationId, type GameState, type Tactics, type TeamSetup } from "../types";
import { STYLE_BEATS, TACTIC_STYLES, type TacticStyleId } from "../config/tactics";
import { PRACTICES } from "../config/practice";
import { MATCH } from "../config/match";
import { CONDITION_MULT } from "../config/player";
import { simulateToEnd } from "../match/engine";
import { autoSetup } from "../match/lineup";
import { playerSchool } from "../season";
import { teamStrength } from "../school/strength";
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

/**
 * 相手の型を、試合前に見える情報（基本フォーメーションと攻撃方針）から推測する。
 * 攻撃的 → ハイプレス、守備的 → 堅守速攻、バランス＋2トップ系 → ロングボール、それ以外 → ポゼッション
 */
export function guessStyle(formation: FormationId, attack: Tactics["attack"]): TacticStyleId {
  if (attack === "attacking") return "highPress";
  if (attack === "defensive") return "lowBlock";
  return formation === "4-4-2" || formation === "3-5-2" || formation === "5-3-2" ? "longBall" : "possession";
}

/** うまい監督の試合前の采配：チームに合うフォーメーションと、相手の型に相性の良い戦術 */
export function skilledSetup(state: GameState): TeamSetup {
  const school = playerSchool(state);
  const opp = opponentOf(state);
  const rules = pendingMatchRules(state);
  const best = (list: readonly FormationId[]) => [...list].sort((a, b) => teamStrength(school.players, b) - teamStrength(school.players, a))[0];
  let formation = best(FORMATION_IDS);
  let tactics: Tactics = { attack: "balanced", buildUp: "buildUp", press: "mid", line: "high" };
  if (opp) {
    const theirs = guessStyle(opp.formation, opp.tactics.attack);
    const counter = (Object.keys(STYLE_BEATS) as TacticStyleId[]).find((s) => STYLE_BEATS[s] === theirs)!;
    tactics = { ...TACTIC_STYLES[counter].tactics };
    // その型に合うフォーメーションのうち、部員に一番合うもの（全体の最善と大差なければ）
    const styled = best(TACTIC_STYLES[counter].formations);
    if (teamStrength(school.players, styled) >= teamStrength(school.players, formation) - 1) formation = styled;
  }
  // 調子と体力も見て選ぶ（画面に出ている情報。CPU は能力だけで選ぶ）
  const fitFactor = (fit: number) => MATCH.fatigueFloor + (1 - MATCH.fatigueFloor) * ((MATCH.startStaminaBase + MATCH.startStaminaFromFitness * fit) / 100);
  const judged = school.players.map((p) => {
    const m = (CONDITION_MULT[p.condition] ?? 1) * fitFactor(p.fitness);
    const stats = { ...p.stats };
    for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = stats[k] * m;
    return { ...p, stats };
  });
  return autoSetup(judged, formation, tactics, rules?.benchSize ?? 9);
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
