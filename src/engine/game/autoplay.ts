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
import { fatigueFactor, simulateToEnd } from "../match/engine";
import { templateNote } from "../note";
import { Rng } from "../rng";
import { ROLE_ABILITIES } from "../config/staff";
import { hasVacancy, isStaffWindow, staffByRole, staffCandidates, staffOverSlots, staffSlots } from "../staff";
import { STAFF_ABILITIES, type StaffMember, type StaffRole } from "../types";
import { autoSetup } from "../match/lineup";
import { playerSchool } from "../season";
import { rankIndex, teamStrength } from "../school/strength";
import {
  canSkipWatching,
  confirmGraduation,
  confirmYearEnd,
  dismiss,
  finishPlayerMatch,
  finishStaff,
  hire,
  release,
  opponentOf,
  pendingMatchRules,
  playCard,
  startPlayerMatch,
  defaultSetup,
  squareDisplay,
  type MatchSummary,
} from ".";

export type AutoPolicy = "simple" | "skilled";

/**
 * スタッフの扱い：none = 雇わない（臨時コーチのまま）、auto = 空き枠に一番合う OB を入れる、
 * best = 最高のスタッフ（全能力 100 の 3 人。バランス検証用）
 */
export interface AutoplayOptions {
  staff?: "none" | "auto" | "best";
  /** 作戦ノート（4 種類のテンプレート）を使う */
  notes?: boolean;
}

/**
 * skilled の初期値はスタッフを雇い、作戦ノートは使わない（ノートの効果は balance で別に測る。
 * ノートを入れると自分の采配と重なり、同じランクへの勝率が少し下がるため）
 */
const defaultOptions = (policy: AutoPolicy): Required<AutoplayOptions> =>
  policy === "skilled" ? { staff: "auto", notes: false } : { staff: "none", notes: false };

/** 役割に合う度合い（主な能力の平均） */
function roleValue(abilities: Record<string, number>, role: StaffRole) {
  const ks = ROLE_ABILITIES[role];
  return ks.reduce((s, k) => s + abilities[k], 0) / ks.length;
}

/** 空き枠に一番合う OB を入れる。ヘッドコーチを最優先にし、残りは GK コーチ → 分析担当 → フィジカルコーチの順で探す */
export function autoManageStaff(state: GameState) {
  const window = isStaffWindow(state);
  // 枠を超えていれば、役割に合わない人から外す
  while (staffOverSlots(state) > 0) {
    const nonHead = state.staff.members.filter((m) => m.role !== "head" && !m.temporary);
    if (nonHead.length === 0) break;
    const worst = nonHead.reduce((b, m) => (roleValue(m.abilities, m.role) < roleValue(b.abilities, b.role) ? m : b), nonHead[0]);
    release(state, worst.id);
  }
  const pick = (role: StaffRole) => {
    const cands = staffCandidates(state).filter((c) => c.availability.ok);
    if (cands.length === 0) return null;
    return cands.reduce((b, c) => (roleValue(c.alumnus.staffProfile.base, role) > roleValue(b.alumnus.staffProfile.base, role) ? c : b), cands[0]).alumnus;
  };
  const head = staffByRole(state.staff, "head");
  const bestHead = pick("head");
  if (bestHead && (!head || head.temporary || (window && roleValue(bestHead.staffProfile.base, "head") > roleValue(head.abilities, "head") + 5))) {
    if (head && !head.temporary) dismiss(state, head.id);
    hire(state, bestHead.id, "head");
  }
  for (const role of ["gk", "analyst", "physical"] as StaffRole[]) {
    if (!hasVacancy(state) && !staffByRole(state.staff, role)) continue;
    if (staffByRole(state.staff, role)) continue;
    if (state.staff.members.filter((m) => !m.temporary).length >= staffSlots(state.reputation)) break;
    const c = pick(role);
    if (c) hire(state, c.id, role);
  }
}

/** 最高のスタッフ（全能力 100 の 3 人。枠を無視する。バランス検証用） */
export function installBestStaff(state: GameState) {
  const rng = Rng.fromSeed(`${state.seed}:best-staff:${state.year}`);
  const make = (role: StaffRole): StaffMember => {
    const full = Object.fromEntries(STAFF_ABILITIES.map((k) => [k, 100])) as StaffMember["abilities"];
    return { id: rng.id("st"), alumnusId: null, name: `検証${role}`, role, abilities: { ...full }, caps: { ...full }, specialties: [], growthMult: 0, age18Year: state.year - 22, hiredYear: state.year };
  };
  state.staff.members = (["head", "gk", "physical"] as StaffRole[]).map(make);
}

export interface AutoplayStats {
  cards: number;
  matches: MatchSummary[];
  graduations: number;
  yearEnds: number;
}

export const newAutoplayStats = (): AutoplayStats => ({ cards: 0, matches: [], graduations: 0, yearEnds: 0 });

/** 練習カードの役に立つ度合い（対象の広さ） */
const PRACTICE_USEFULNESS = { all: 1, field: 0.9, gk: 0.35 } as const;

/** うまい采配の自動プレイが、試合の前に休ませる目安（何マス先まで見るか・平均の体力） */
const SKILLED_REST = { lookAhead: 7, beforeMatch: 78 };

function chooseCard(state: GameState, policy: AutoPolicy) {
  const players = playerSchool(state).players.filter((x) => x.status === "active");
  const avgFit = players.reduce((s, x) => s + x.fitness, 0) / Math.max(1, players.length);
  const hand = state.calendar.hand;
  const rest = hand.find((c) => c.practice === "rest");
  if (policy === "simple") {
    return avgFit < 55 && rest ? rest : ([...hand].filter((c) => c.practice !== "rest").sort((a, b) => b.value - a.value)[0] ?? hand[0]);
  }
  if (avgFit < 62 && rest) return rest;
  // 試合が近ければ、体力を戻しておく（終盤の疲れが試合を左右するため）
  const pos = state.calendar.position;
  const matchSoon = state.calendar.squares.slice(pos + 1, pos + 1 + SKILLED_REST.lookAhead).some((sq) => {
    const kind = sq.major?.kind;
    return (kind === "practiceMatch" || kind === "prefQualifier" || kind === "national") && squareDisplay(state, sq).type === "major";
  });
  if (matchSoon && avgFit < SKILLED_REST.beforeMatch && rest) return rest;
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
    // 2 段階以上の格上には、堅守速攻で番狂わせを狙う（堅守速攻が苦手なポゼッションの相手は除く）
    const underdog = rankIndex(opp.rank) - rankIndex(school.rank) >= 2 && theirs !== "possession";
    const counter = underdog ? "lowBlock" : (Object.keys(STYLE_BEATS) as TacticStyleId[]).find((s) => STYLE_BEATS[s] === theirs)!;
    tactics = { ...TACTIC_STYLES[counter].tactics };
    // その型に合うフォーメーションのうち、部員に一番合うもの（全体の最善と大差なければ）
    const styled = best(TACTIC_STYLES[counter].formations);
    if (teamStrength(school.players, styled) >= teamStrength(school.players, formation) - 1) formation = styled;
  }
  // 調子と体力も見て選ぶ（画面に出ている情報。CPU は能力だけで選ぶ）
  // 試合の前半（開始時）と終盤（体力が 35 減ったころ）の疲労係数の平均で見積もる
  const fitFactor = (fit: number) => {
    const start = MATCH.startStaminaBase + MATCH.startStaminaFromFitness * fit;
    return (fatigueFactor(start) + fatigueFactor(start - 35)) / 2;
  };
  const judged = school.players.map((p) => {
    const m = (CONDITION_MULT[p.condition] ?? 1) * fitFactor(p.fitness);
    const stats = { ...p.stats };
    for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = stats[k] * m;
    return { ...p, stats };
  });
  return autoSetup(judged, formation, tactics, rules?.benchSize ?? 9);
}

/** 次の操作を 1 つ行う */
export function autoStep(state: GameState, stats: AutoplayStats, policy: AutoPolicy = "simple", options: AutoplayOptions = {}) {
  const opts = { ...defaultOptions(policy), ...options };
  if (state.activeMatch) {
    // skilled は試合中も AI の監督に任せる（疲れた選手の交代など）。
    // 観戦する試合はうまい監督自身の采配なので、ヘッドコーチの戦術眼ではなく Phase 1 と同じ質で動かす
    if (policy === "skilled") {
      const me = state.activeMatch.state.teams[state.activeMatch.userSide];
      me.isUser = false;
      if (state.activeMatch.mode !== "auto") me.aiQuality = MATCH.ai.baseQuality;
    }
    simulateToEnd(state.activeMatch.state);
    const s = finishPlayerMatch(state);
    if (s) stats.matches.push(s);
    return;
  }
  const p = state.pending;
  if (p?.type === "staff") {
    if (opts.staff === "auto") autoManageStaff(state);
    if (opts.staff === "best") {
      installBestStaff(state);
      state.staff.needsReview = false;
      state.pending = undefined;
      return;
    }
    if (finishStaff(state)) {
      // 枠を超えたまま（auto 以外）：役割に合わない人から外す
      autoManageStaff(state);
      finishStaff(state);
    }
    return;
  }
  if (p?.type === "match") {
    let noteId: string | null = null;
    if (opts.notes) {
      if (state.notes.length === 0) state.notes.push(templateNote(Rng.fromSeed(`${state.seed}:note`)));
      noteId = state.notes[0].id;
    }
    if (policy === "skilled") startPlayerMatch(state, skilledSetup(state), canSkipWatching(state) ? "auto" : "watch", noteId);
    else startPlayerMatch(state, defaultSetup(state), "watch", noteId);
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
export function autoplayYears(state: GameState, years: number, policy: AutoPolicy = "simple", options: AutoplayOptions = {}, maxSteps = 2000 * years + 100): AutoplayStats {
  const stats = newAutoplayStats();
  const target = state.year + years;
  for (let i = 0; i < maxSteps && state.year < target; i++) autoStep(state, stats, policy, options);
  return stats;
}
