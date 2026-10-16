/**
 * 学校生活の値（学力・信頼度。R2。SPEC 7.2・18.2・18.4）。自校の部員だけが持つ。
 * 新しく持たせるときは、ゲームの乱数とは別の系統の乱数（シードと選手 ID から作る）を使う。
 * こうすると、同じセーブから何度読み込んでも同じ値になり、ゲームの乱数の並びも変わらない。
 */
import { ACADEMICS } from "../config/academics";
import { TRUST } from "../config/trust";
import { Rng } from "../rng";
import { playerSchool } from "../season";
import type { GameState, Player } from "../types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 新入生の学力（性格でずらす。特待生は少し低い） */
export function initialAcademic(rng: Rng, p: Player): number {
  const sd = p.personality === "inspired" ? ACADEMICS.inspiredSd : ACADEMICS.sd;
  const mean = ACADEMICS.mean + ACADEMICS.personalityShift[p.personality] + (p.admission === "scholarship" ? ACADEMICS.scholarshipShift : 0);
  return Math.round(clamp(rng.normal(mean, sd), ACADEMICS.min, ACADEMICS.max));
}

export function initialTrust(rng: Rng, p: Player): number {
  return Math.round(clamp(rng.normal(p.admission === "scholarship" ? TRUST.scholarshipMean : TRUST.mean, TRUST.sd), 0, 100));
}

/** 自校の部員で、学力・信頼度がまだ無い人に付ける（新入生・古いセーブ） */
export function ensureSchoolLife(state: GameState) {
  const school = playerSchool(state);
  for (const p of school.players) {
    if (p.academic !== undefined && p.trust !== undefined) continue;
    const rng = Rng.fromSeed(`${state.seed}:life:${p.id}`);
    p.academic ??= initialAcademic(rng, p);
    p.trust ??= initialTrust(rng, p);
  }
}

/** 5 段階の帯（0〜4） */
export function band(v: number | undefined, bands: readonly number[]): number {
  if (v === undefined) return 2;
  return bands.filter((b) => v >= b).length;
}
export const academicBand = (p: Player) => band(p.academic, ACADEMICS.bands);
export const trustBand = (p: Player) => band(p.trust, TRUST.bands);

/** 信頼度：調子が下がる確率の倍率（信頼度を持たない選手は 1） */
export function trustDownMult(p: Player): number {
  return p.trust === undefined ? 1 : TRUST.downBase - TRUST.downPer * (p.trust / 100);
}

/** 信頼度：月初の指示の重点の効き目の倍率 */
export function trustFocusMult(p: Player): number {
  return p.trust === undefined ? 1 : TRUST.focusBase + TRUST.focusPer * (p.trust / 100);
}

/** 信頼度：選択肢の「話を聞く・任せる」系がうまくいく確率の上乗せ */
export function trustSuccessBonus(p: Player | undefined): number {
  return p?.trust === undefined ? 0 : (p.trust - 50) / TRUST.successDiv;
}

export function addTrust(p: Player, amount: number) {
  if (p.trust === undefined) return;
  p.trust = Math.round(clamp(p.trust + amount, 0, 100));
}

export function addAcademic(p: Player, amount: number) {
  if (p.academic === undefined) return;
  p.academic = Math.round(clamp(p.academic + amount, 0, 100));
}
