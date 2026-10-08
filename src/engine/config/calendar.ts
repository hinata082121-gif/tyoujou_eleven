import type { PracticeKind, SquareType } from "../types";

/** 1 年 = 365 マス（4/1〜3/31） */
export const MONTH_DAYS = [30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31] as const; // 4月始まり
export const MONTH_NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const;
export const DAYS_IN_YEAR = 365;

/** 通常マスの出やすさ */
export const SQUARE_WEIGHTS: Record<Exclude<SquareType, "major">, number> = {
  blue: 28,
  red: 17,
  white: 20,
  green: 18,
  yellow: 17,
};

/** 進行カードの数字の出やすさ（1〜5） */
export const CARD_VALUE_WEIGHTS = [16, 20, 26, 20, 18];

/** 進行カードの種類（練習）の出やすさ */
export const CARD_PRACTICE_WEIGHTS: Record<PracticeKind, number> = {
  shoot: 10,
  pass: 10,
  dribble: 10,
  defense: 10,
  physical: 9,
  run: 9,
  tactics: 9,
  gk: 7,
  setPiece: 8,
  rest: 8,
};

/** 固定日程（[月, 日]） */
export const FIXED_DATES = {
  entrance: [4, 1] as const,
  graduation: [3, 1] as const,
  yearEnd: [3, 31] as const,
};

/** 練習試合：年に 6〜8 回（同じ月に 2 回は入れない） */
export const PRACTICE_MATCH = {
  perYearMin: 6,
  perYearMax: 8,
  /** 練習試合を入れない月（大会期間など）。月の番号 */
  excludeMonths: [12, 1, 3] as number[],
  /** 他の大マスとの最低間隔（日） */
  minGap: 4,
  /** 格上（ランク +1〜+2）と組む確率（2〜3 回に 1 回） */
  strongerChance: 0.4,
};
