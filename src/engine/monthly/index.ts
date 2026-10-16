/**
 * 毎月 1 日の個別の育成指示（R2。SPEC 18.1・PHASE_R2_PLAN 2章）。
 * 重点の能力（1〜2 個）は練習の経験点の一部を回すだけで、合計は変えない（practice の focus）。
 */
import { isMonthStart, monthIndex } from "../calendar";
import { FOCUS } from "../config/growth";
import { POSITION_RATING_WEIGHTS, STAT_MAX } from "../config/player";
import { PLAY_STYLE_DEFS } from "../config/playStyle";
import { overall } from "../player/rating";
import type { Rng } from "../rng";
import { trustFocusMult } from "../school/life";
import { playerSchool } from "../season";
import { headCoach } from "../staff";
import { ALL_STATS, COMMON_STATS, FIELD_STATS, GK_STATS, type GameState, type MonthlyState, type Player, type StatKey, type Stats } from "../types";

/** その選手が重点に選べる能力（役割で画面に出している能力。PK 駆け引きも選べる） */
export function focusChoices(p: Player): StatKey[] {
  return p.mainPosition === "GK" ? [...COMMON_STATS, ...GK_STATS] : [...COMMON_STATS, ...FIELD_STATS];
}

/** 練習で使う重点（自分で決めたもの。無ければおまかせで決まったもの） */
export function effectiveFocus(p: Player): StatKey[] {
  return p.focus ?? p.autoFocus ?? [];
}

/** 練習の重点の設定（practice に渡す）。信頼度で効き目が少し変わる */
export function practiceFocus(p: Player): { stats: StatKey[]; share: number } | null {
  const stats = effectiveFocus(p);
  return stats.length > 0 ? { stats, share: FOCUS.share * trustFocusMult(p) } : null;
}

/** おまかせの候補の点（ポジションの重み・スタイルの伸びやすい能力・伸びしろ） */
export function focusScore(p: Player, stat: StatKey): number {
  const pos = POSITION_RATING_WEIGHTS[p.mainPosition][stat] ?? 0;
  const key = PLAY_STYLE_DEFS[p.playStyle].keyStats;
  const keySum = Object.values(key).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const style = ((key[stat] ?? 0) / keySum) * FOCUS.styleWeight * 0.5;
  if (pos === 0 && style === 0) return 0;
  return Math.max(0.01, pos + style + FOCUS.roomWeight * (60 - p.stats[stat]));
}

/** ヘッドコーチの質（指導力と戦術眼の平均。0〜1） */
export function headFocusQuality(state: GameState): number {
  const h = headCoach(state.staff);
  return h ? (h.abilities.coaching + h.abilities.tactics) / 200 : 0;
}

/**
 * おまかせの重点を 2 つ決める。質 q の確率で一番良い 2 つ、そうでなければ候補から重みつきで選ぶ（ずれることがある）
 */
export function chooseAutoFocus(rng: Rng, p: Player, q: number): StatKey[] {
  const cands = focusChoices(p).filter((s) => p.stats[s] < STAT_MAX && focusScore(p, s) > 0);
  if (cands.length === 0) return [];
  const n = Math.min(FOCUS.max, cands.length);
  if (rng.chance(q)) return [...cands].sort((a, b) => focusScore(p, b) - focusScore(p, a)).slice(0, n);
  const picked: StatKey[] = [];
  let pool = [...cands];
  while (picked.length < n && pool.length > 0) {
    const s = rng.weighted(pool, (x) => focusScore(p, x));
    picked.push(s);
    pool = pool.filter((x) => x !== s);
  }
  return picked;
}

/** その日が月初の指示の日で、まだ指示を出していないか */
export function monthlyDue(state: GameState, day: number): boolean {
  if (!isMonthStart(day)) return false;
  return (state.monthly?.doneMonth ?? -1) < monthIndex(day);
}

/** 能力を ALL_STATS の順の配列にする */
export const statsArray = (s: Stats) => ALL_STATS.map((k) => s[k]);
const fromArray = (a: number[]): Stats => Object.fromEntries(ALL_STATS.map((k, i) => [k, a[i] ?? 0])) as Stats;

/** 月初の指示を始める：おまかせの選手の重点を決める（画面に出すため、指示の前に決めておく） */
export function beginMonthly(state: GameState, rng: Rng, day: number) {
  const q = headFocusQuality(state);
  for (const p of playerSchool(state).players) {
    if (p.status !== "active") continue;
    if (p.focus) p.focus = p.focus.filter((s) => focusChoices(p).includes(s)).slice(0, FOCUS.max);
    if (p.focus && p.focus.length === 0) delete p.focus;
    p.autoFocus = p.focus ? undefined : chooseAutoFocus(rng, p, q);
    if (!p.autoFocus) delete p.autoFocus;
  }
  state.pending = { type: "monthly", month: monthIndex(day) };
}

/** 重点を決める（null でおまかせに戻す） */
export function setFocus(p: Player, stats: StatKey[] | null): boolean {
  if (stats === null) {
    delete p.focus;
    return true;
  }
  const ok = [...new Set(stats)].filter((s) => focusChoices(p).includes(s));
  if (ok.length === 0 || ok.length > FOCUS.max || ok.length !== stats.length) return false;
  p.focus = ok;
  delete p.autoFocus;
  return true;
}

/** 振り返りの 1 人分 */
export interface MonthlyReviewRow {
  playerId: string;
  /** 総合の伸び */
  overall: number;
  /** 能力ごとの伸び（上がった分だけ） */
  stats: Partial<Record<StatKey, number>>;
  /** 伸びた能力の合計 */
  total: number;
}

export interface MonthlyReview {
  /** 振り返る期間（"4月" や "昨年度"）。記録がなければ null */
  label: string | null;
  rows: MonthlyReviewRow[];
  /** 総合の伸びの合計と、伸びた部員の数 */
  teamOverall: number;
  grew: number;
  members: number;
}

const MONTH_LABEL = ["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月"];

/** 先月の振り返り（4 月は昨年度 1 年分。前の記録が無ければ label = null） */
export function monthlyReview(state: GameState): MonthlyReview {
  const m = state.monthly;
  const month = state.pending?.type === "monthly" ? state.pending.month : monthIndex(state.calendar.position);
  const april = month === 0;
  const snap = april ? m?.yearSnap : m?.snap;
  const label = !snap ? null : april ? "昨年度" : m?.snapMonth !== undefined && m.snapMonth >= 0 ? MONTH_LABEL[m.snapMonth] : null;
  const rows: MonthlyReviewRow[] = [];
  const active = playerSchool(state).players.filter((p) => p.status === "active");
  if (snap && label) {
    for (const p of active) {
      const before = snap[p.id];
      if (!before) continue;
      const b = fromArray(before);
      const stats: Partial<Record<StatKey, number>> = {};
      let total = 0;
      for (const k of ALL_STATS) {
        const d = p.stats[k] - b[k];
        if (d > 0) {
          stats[k] = d;
          total += d;
        }
      }
      const ov = overall(p) - overall({ ...p, stats: b });
      rows.push({ playerId: p.id, overall: Math.round(ov * 10) / 10, stats, total });
    }
  }
  rows.sort((a, b) => b.overall - a.overall || b.total - a.total);
  return {
    label: rows.length > 0 ? label : null,
    rows,
    teamOverall: Math.round(rows.reduce((s, r) => s + Math.max(0, r.overall), 0) * 10) / 10,
    grew: rows.filter((r) => r.overall > 0).length,
    members: active.length,
  };
}

/** 通しの月（1 年目の 4 月 = 0） */
export const serialMonth = (year: number, month: number) => (year - 1) * 12 + month;

/**
 * 重点にしてからの累計の伸びの記録を、今月の重点に合わせる（R3。計画 4.2）。
 * 「指示」でも「おまかせ」でも、同じ能力が重点のままなら数え続ける。重点から外した能力・いなくなった選手の記録は消す
 */
export function updateFocusLog(log: NonNullable<MonthlyState["focusLog"]>, players: readonly Player[], now: number) {
  const ids = new Set(players.map((p) => p.id));
  for (const id of Object.keys(log)) if (!ids.has(id)) delete log[id];
  for (const p of players) {
    const focus = effectiveFocus(p);
    const rec = log[p.id] ?? {};
    for (const k of Object.keys(rec) as StatKey[]) if (!focus.includes(k)) delete rec[k];
    for (const k of focus) rec[k] ??= [now, p.stats[k]];
    if (Object.keys(rec).length > 0) log[p.id] = rec;
    else delete log[p.id];
  }
}

/** 重点の能力ごとの、重点にしてからの月数と伸び（months 0 は今月から） */
export interface FocusStreak {
  stat: StatKey;
  months: number;
  gain: number;
}

/** 今の重点の能力ごとに、重点にしてから何か月・どれだけ伸びたか（月初の指示の画面に出す） */
export function focusStreaks(state: GameState, p: Player): FocusStreak[] {
  const month = state.pending?.type === "monthly" ? state.pending.month : monthIndex(state.calendar.position);
  const now = serialMonth(state.year, month);
  const rec = state.monthly?.focusLog?.[p.id] ?? {};
  return effectiveFocus(p).map((stat) => {
    const r = rec[stat];
    return r ? { stat, months: Math.max(0, now - r[0]), gain: Math.max(0, p.stats[stat] - r[1]) } : { stat, months: 0, gain: 0 };
  });
}

/** 指示を決めて閉じる。能力の記録を取り直す */
export function finishMonthly(state: GameState): boolean {
  const p = state.pending;
  if (p?.type !== "monthly") return false;
  const players = playerSchool(state).players.filter((x) => x.status === "active");
  const snap = Object.fromEntries(players.map((x) => [x.id, statsArray(x.stats)]));
  const prev: MonthlyState = state.monthly ?? { doneMonth: -1 };
  const focusLog = { ...(prev.focusLog ?? {}) };
  updateFocusLog(focusLog, players, serialMonth(state.year, p.month));
  state.monthly = { ...prev, doneMonth: p.month, snap, snapMonth: p.month, ...(p.month === 0 ? { yearSnap: snap } : {}), focusLog };
  state.pending = undefined;
  return true;
}

/** 年度の初めに、月初の指示の記録を新しい年度に合わせる */
export function resetMonthlyForYear(state: GameState) {
  const m = state.monthly;
  if (!m) {
    state.monthly = { doneMonth: -1 };
    return;
  }
  m.doneMonth = -1;
  delete m.after;
}
