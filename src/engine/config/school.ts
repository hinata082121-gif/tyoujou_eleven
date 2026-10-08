import type { SchoolRank } from "../types";

/** 自県の学校数（16〜32） */
export const PLAYER_PREF_SCHOOLS = { min: 16, max: 32 };
/** 他県で部員を持つ学校数 */
export const OTHER_PREF_SCHOOLS = 3;
/** 県の数（= 全国大会の出場校数） */
export const PREFECTURE_COUNT = 32;
export const REGION_COUNT = 8;

/**
 * チーム力（ベスト 11 の評価値の平均）からランクを決める下限値。
 * 目安：弱小≈E、そこそこ≈D、中堅≈C、強豪≈B、名門≈A、S は飛び抜けたチームだけ
 */
export const RANK_STRENGTH_MIN: Record<SchoolRank, number> = {
  E: 0,
  D: 50,
  C: 54,
  B: 58,
  A: 62,
  S: 66.5,
};

/**
 * CPU 校の「格」（prestige 0〜5。ほぼランクに対応）ごとの新入生の能力の基準値。
 * 2・3 年生は、新入生として生成してから在学年数分の成長をかけて作る。
 * 格の高い学校ほど良い新入生が集まる（特待生に相当）。
 */
export const PRESTIGE_LEVEL_BASE = [28, 33, 37.3, 42, 47.2, 52];
/** 格ごとの 1 学年の人数 */
export const PRESTIGE_GRADE_SIZE = [9, 10, 11, 12, 13, 14];

/** 自県の学校の格の出やすさ（0=E 〜 5=S） */
export const PLAYER_PREF_PRESTIGE_WEIGHTS = [30, 28, 22, 13, 6, 1];
/** 他県（県内上位 3 校）の格の出やすさ */
export const OTHER_PREF_PRESTIGE_WEIGHTS = [4, 12, 26, 30, 20, 8];

/** プレイヤー校の初期部員（弱小） */
export const PLAYER_START = {
  /** 新入生としての基準値（上の学年は成長をかけて作る） */
  freshmanBase: 29,
};

/** CPU 校の格は年度替わりに少し変動する */
export const PRESTIGE_DRIFT = {
  /** 上下に 1 動く確率 */
  chance: 0.15,
  /** 全国大会で好成績なら上がりやすい */
};
