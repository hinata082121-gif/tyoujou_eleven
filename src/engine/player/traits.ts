/**
 * 性格とプレースタイル（SPEC 7.5・7.6）。
 * 新入生の性格・スタイルを決める、スタイルを選べる範囲、スタイルの変更、熟練度の上がり方。
 */
import { CRAFTSMAN_FAVORITES, PERSONALITY_STYLES, PERSONALITY_WEIGHTS } from "../config/personality";
import { PLAY_STYLE_DEFS, PROFICIENCY, STYLE_ASSIGN, STYLE_GROUP_POSITIONS } from "../config/playStyle";
import type { Rng } from "../rng";
import { PERSONALITIES, PLAY_STYLES, type Personality, type Player, type PlayStyle, type Position, type PracticeKind, type Stats } from "../types";
import { weightedStats } from "./rating";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function randomPersonality(rng: Rng): Personality {
  return rng.weighted(PERSONALITIES, (k) => PERSONALITY_WEIGHTS[k]);
}

/** 職人気質の得意な練習（主ポジションに合う練習から） */
export function randomFavoritePractice(rng: Rng, pos: Position): PracticeKind {
  const w = CRAFTSMAN_FAVORITES[pos];
  const keys = Object.keys(w) as PracticeKind[];
  return rng.weighted(keys, (k) => w[k] ?? 0);
}

/** そのポジションで効果を発揮するスタイルか（FW/MF などは両方） */
export function styleFitsPosition(style: PlayStyle, pos: Position): boolean {
  return PLAY_STYLE_DEFS[style].groups.some((g) => STYLE_GROUP_POSITIONS[g].includes(pos));
}

/** その選手が選べるスタイル（主ポジションか、適性 ◎○ のポジションの区分に入るもの） */
export function styleOptions(p: Pick<Player, "mainPosition" | "aptitude">): PlayStyle[] {
  const positions = (Object.keys(p.aptitude) as Position[]).filter((pos) => pos === p.mainPosition || p.aptitude[pos] >= 2);
  return PLAY_STYLES.filter((s) => positions.some((pos) => styleFitsPosition(s, pos)));
}

/** 能力の傾向の点数（keyStats の重みつき平均） */
export function styleScore(stats: Stats, style: PlayStyle): number {
  return weightedStats(stats, PLAY_STYLE_DEFS[style].keyStats);
}

/** 主ポジションと能力の傾向からスタイルを決める（上位から、点数の差に応じた重みで選ぶ） */
export function assignPlayStyle(rng: Rng, p: Pick<Player, "mainPosition" | "stats">): PlayStyle {
  const cands = PLAY_STYLES.filter((s) => styleFitsPosition(s, p.mainPosition))
    .map((s) => ({ s, v: styleScore(p.stats, s) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, STYLE_ASSIGN.topN);
  const top = cands[0].v;
  return rng.weighted(cands, (c) => Math.exp((c.v - top) / STYLE_ASSIGN.temperature)).s;
}

/** スタイルを変える（選べないスタイルなら false）。熟練度は 0 に戻る */
export function changePlayStyle(p: Player, style: PlayStyle): boolean {
  if (style === p.playStyle || !styleOptions(p).includes(style)) return false;
  p.playStyle = style;
  p.styleProficiency = 0;
  return true;
}

/** 性格による熟練度の上がり方の倍率 */
export function proficiencyMult(p: Pick<Player, "personality" | "playStyle">): number {
  let m = PERSONALITY_STYLES[p.personality].includes(p.playStyle) ? PROFICIENCY.styleAffinityMult : 1;
  if (p.personality === "diligent") m *= PROFICIENCY.diligentMult;
  return m;
}

/** 熟練度を上げる（上がるほど上がりにくい）。戻り値は上がった量 */
export function gainProficiency(p: Pick<Player, "personality" | "playStyle" | "styleProficiency">, base: number): number {
  if (base <= 0) return 0;
  const before = p.styleProficiency;
  const add = base * proficiencyMult(p) * Math.max(0, 1 - before / PROFICIENCY.slowdown);
  p.styleProficiency = Math.round(clamp(before + add, 0, PROFICIENCY.max) * 100) / 100;
  return p.styleProficiency - before;
}

/** スタイルに合う練習か */
export function styleUsesPractice(style: PlayStyle, kind: PracticeKind): boolean {
  return PLAY_STYLE_DEFS[style].practices.includes(kind);
}
