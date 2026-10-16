/**
 * すごろくの見え方と年間の予定表（R2。SPEC 5章・PHASE_R2_PLAN 1章）。画面はここだけを見る。
 * - マスの中身が見えるのは、今日の次の日から VISIBLE_DAYS 日先まで。その先は「？」
 * - 大会・リーグ戦・練習試合の日は、見える範囲でも、もともとの通常マスの見た目にする（試合の日は予定表で確かめる）
 * - 分岐の先の道は、道が決まるまで「？」
 */
import { dayToDate, isMatchKind, isMonthStart, monthIndex } from "../calendar";
import { VISIBLE_DAYS } from "../config/calendar";
import { CAMP_NAMES, COMPETITION_NAMES, MAJOR_NAMES, roundLabel } from "../config/names";
import { SCHOOL_EVENT_LABELS, SCHOOL_EVENT_NAMES, TESTS } from "../config/schoolEvents";
import { findMatch, isAlive, reachedRound, totalRounds } from "../competition/bracket";
import { fixtureOn } from "../league";
import { playerSchool } from "../season";
import type { CompetitionKind, GameState, Square } from "../types";
import { bracketOf, competitionName, isCompetitionKind, playerLeagueName, squareDisplay } from ".";

export type BoardSquareType = Square["baseType"] | "major" | "hidden";

export interface BoardSquare {
  type: BoardSquareType;
  label?: string;
  /** 月初の指示の日（1 日） */
  monthly?: boolean;
  /** 学校行事のマス */
  school?: boolean;
}

/** 試合のマス（すごろく上では隠す） */
export const isMatchMajor = (sq: Square) => !!sq.major && isMatchKind(sq.major.kind);

/** 分岐の先の道で、まだ道が決まっていないマスか */
function inUndecidedBranch(state: GameState, day: number): boolean {
  const cal = state.calendar;
  return !!cal.branches?.some((b) => b.chosen === undefined && cal.position <= b.day && day > b.day && day <= b.day + b.paths[0].squares.length);
}

/** そのマスの中身が見えるか（今日より後で、VISIBLE_DAYS 日以内） */
export function isVisibleDay(state: GameState, day: number): boolean {
  const pos = state.calendar.position;
  return day <= pos || day - pos <= VISIBLE_DAYS;
}

/** すごろくのマスの見え方 */
export function boardSquare(state: GameState, sq: Square): BoardSquare {
  const monthly = isMonthStart(sq.day) || undefined;
  const pos = state.calendar.position;
  if (sq.day > pos && (!isVisibleDay(state, sq.day) || inUndecidedBranch(state, sq.day))) return { type: "hidden", monthly };
  if (sq.day > pos && isMatchMajor(sq)) {
    // 試合の日は、もともとの通常マスの見た目（大会で負けた後にそのマスが使う種類）
    const t = sq.baseType;
    return { type: t, label: t === "training" ? "特訓" : t === "branch" ? "分岐" : undefined, monthly };
  }
  const d = squareDisplay(state, sq);
  return { ...d, monthly, school: sq.major?.kind === "school" || undefined };
}

// ================= ホームの「次の予定」（試合以外） =================

export interface NextPlan {
  day: number;
  label: string;
}

/** 次の試合以外の予定（学校行事・月初の指示・合宿・スカウトの返事・卒業式・年度末） */
export function nextNonMatchPlan(state: GameState): NextPlan | null {
  const cal = state.calendar;
  for (let d = cal.position + 1; d < cal.squares.length; d++) {
    const sq = cal.squares[d];
    if (isMonthStart(d) && (!sq.major || sq.major.kind !== "graduation")) return { day: d, label: "月初の指示" };
    const m = sq.major;
    if (!m || isMatchMajor(sq) || m.kind === "entrance") continue;
    if (m.kind === "school" && m.event) return { day: d, label: SCHOOL_EVENT_NAMES[m.event] };
    if (m.kind === "scoutReply" && !state.scout) continue;
    return { day: d, label: m.kind === "camp" ? CAMP_NAMES[m.round === 1 ? "winter" : "summer"] : MAJOR_NAMES[m.kind] };
  }
  return null;
}

// ================= 年間の予定表（「大会」の画面の「予定」タブ） =================

export type ScheduleKind = "competition" | "league" | "practice" | "school" | "monthly" | "camp" | "other";
export type ScheduleStatus = "upcoming" | "today" | "done" | "won" | "lost" | "out";

export interface ScheduleItem {
  day: number;
  kind: ScheduleKind;
  label: string;
  /** 補足（相手・方針など） */
  detail?: string;
  status: ScheduleStatus;
}

export interface ScheduleMonth {
  month: number;
  /** 4 月 = 0 */
  index: number;
  items: ScheduleItem[];
}

function matchItem(state: GameState, sq: Square): ScheduleItem | null {
  const m = sq.major!;
  const me = state.playerSchoolId;
  const pos = state.calendar.position;
  const base = (status: ScheduleStatus): ScheduleStatus => (status === "upcoming" && sq.day === pos ? "today" : status);
  if (m.kind === "practiceMatch") {
    const offer = state.school?.offers?.[sq.day];
    if (sq.day > pos && !offer) return null; // 申し込みが届くまで載らない
    const opp = offer ? state.schools[offer]?.name : undefined;
    return { day: sq.day, kind: "practice", label: COMPETITION_NAMES.practice, detail: opp ? `vs ${opp}` : undefined, status: base(sq.day < pos ? "done" : "upcoming") };
  }
  if (m.kind === "league") {
    const lg = state.league;
    if (!lg?.active) return null;
    const f = fixtureOn(lg, me, sq.day);
    if (!f) return null;
    const oppId = f.fixture.home === me ? f.fixture.away : f.fixture.home;
    const sc = f.fixture.score;
    const status: ScheduleStatus = sc ? (sc[f.fixture.home === me ? 0 : 1] > sc[f.fixture.home === me ? 1 : 0] ? "won" : sc[0] === sc[1] ? "done" : "lost") : "upcoming";
    return { day: sq.day, kind: "league", label: `${playerLeagueName(state)} 第${f.round + 1}節`, detail: `vs ${state.schools[oppId]?.name ?? ""}`, status: base(status) };
  }
  if (!isCompetitionKind(m.kind)) return null;
  const kind = m.kind as CompetitionKind;
  const b = bracketOf(state, kind);
  const round = m.round ?? 0;
  const name = competitionName(state, kind);
  if (!b) return { day: sq.day, kind: "competition", label: name, detail: "組み合わせは未定", status: base("upcoming") };
  const rl = roundLabel(totalRounds(b), round, b.qualifiers);
  const mine = findMatch(b, round, me);
  if (!isAlive(b, me) && reachedRound(b, me) < round) return { day: sq.day, kind: "competition", label: `${name} ${rl}`, status: "out" };
  if (mine && mine.winner !== undefined) return { day: sq.day, kind: "competition", label: `${name} ${rl}`, status: mine.winner === me ? "won" : "lost" };
  const oppId = mine ? (mine.a === me ? mine.b : mine.a) : null;
  const opp = oppId ? state.schools[oppId]?.name : undefined;
  return { day: sq.day, kind: "competition", label: `${name} ${rl}`, detail: opp ? `vs ${opp}` : "相手は未定", status: base("upcoming") };
}

/** 1 年分の予定（月ごと） */
export function yearSchedule(state: GameState): ScheduleMonth[] {
  const months: ScheduleMonth[] = [];
  const cal = state.calendar;
  const pos = cal.position;
  for (let i = 0; i < 12; i++) months.push({ month: ((i + 3) % 12) + 1, index: i, items: [] });
  const push = (it: ScheduleItem) => months[monthIndex(it.day)].items.push(it);
  const simple = (day: number): ScheduleStatus => (day < pos ? "done" : day === pos ? "today" : "upcoming");
  for (const sq of cal.squares) {
    if (isMonthStart(sq.day)) push({ day: sq.day, kind: "monthly", label: "月初の指示", status: simple(sq.day) });
    const m = sq.major;
    if (!m) continue;
    if (isMatchMajor(sq)) {
      const it = matchItem(state, sq);
      if (it) push(it);
      continue;
    }
    if (m.kind === "school" && m.event) {
      const test = m.event === "testPrep" || m.event === "test" ? TESTS[m.round ?? 0] : undefined;
      const label = m.event === "test" && test ? test.label : m.event === "testPrep" && test ? `テスト前（${test.label}）` : SCHOOL_EVENT_NAMES[m.event];
      push({ day: sq.day, kind: "school", label, status: simple(sq.day) });
    } else if (m.kind === "camp") push({ day: sq.day, kind: "camp", label: CAMP_NAMES[m.round === 1 ? "winter" : "summer"], status: simple(sq.day) });
    else if (m.kind === "entrance" || m.kind === "graduation" || m.kind === "yearEnd" || m.kind === "scoutReply") push({ day: sq.day, kind: "other", label: MAJOR_NAMES[m.kind], status: simple(sq.day) });
  }
  for (const mo of months) mo.items.sort((a, b) => a.day - b.day);
  return months;
}

/** 行事の短い名前（すごろくのマス） */
export const schoolLabel = (sq: Square) => (sq.major?.kind === "school" && sq.major.event ? SCHOOL_EVENT_LABELS[sq.major.event] : undefined);

/** 今月（予定表で最初に開く月） */
export const currentMonthIndex = (state: GameState) => monthIndex(state.calendar.position);

export { dayToDate, playerSchool };
