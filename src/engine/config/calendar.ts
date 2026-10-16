import type { BranchTheme, PracticeKind, RandomSquareType } from "../types";

/** 1 年 = 365 マス（4/1〜3/31） */
export const MONTH_DAYS = [30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31] as const; // 4月始まり
export const MONTH_NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const;
export const DAYS_IN_YEAR = 365;

/** 通常マスの出やすさ */
export const SQUARE_WEIGHTS: Record<RandomSquareType, number> = {
  blue: 23,
  red: 13,
  white: 11,
  green: 14,
  yellow: 16,
  /** 特訓マス（P2b）。止まると特殊能力の習得を判定する。白マスから回し、成長と体力に効くマスの割合は P2a のままにする */
  training: 7,
  /** 人物マス（R2。PHASE_R2_PLAN 5.1）。止まると選択肢のあるイベント。青・赤・白・緑・黄から少しずつ回した（通常マスの約 16%。止まるのは 1 年に 14 回前後） */
  person: 16,
};

/** すごろくの公開範囲（R2。SPEC 5章）：マスの中身が見えるのは今日の次の日から何日先までか */
export const VISIBLE_DAYS = 10;
/** 練習試合の申し込みが届くのは、試合の何日前か（R2） */
export const PRACTICE_OFFER_DAYS = 10;

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
  pk: 2,
  rest: 8,
};

/** 固定日程（[月, 日]） */
export const FIXED_DATES = {
  entrance: [4, 1] as const,
  graduation: [3, 1] as const,
  yearEnd: [3, 31] as const,
  /** 特待生スカウトの返事（P2c） */
  scoutReply: [2, 28] as const,
};

/** 練習試合：年に 4〜6 回（同じ月に 2 回は入れない）。P3 で 6〜8 回から減らした（週末が県リーグで埋まるため） */
export const PRACTICE_MATCH = {
  perYearMin: 4,
  perYearMax: 6,
  /** 練習試合を入れない月（大会期間など）。月の番号 */
  excludeMonths: [12, 1, 2, 3] as number[],
  /** 他の大マスとの最低間隔（日） */
  minGap: 4,
  /** 格上（ランク +1〜+2）と組む確率（2〜3 回に 1 回） */
  strongerChance: 0.4,
};

/** 合宿（P2c）。出発の日（大マス）の翌日から days 日間 */
export const CAMP_DATES = {
  summer: { depart: [8, 9] as const, days: 5 },
  winter: { depart: [12, 14] as const, days: 4 },
};

/** 分岐マス（SPEC 5.1。P2c） */
export const BRANCH = {
  perYear: 8,
  /** 道の長さ（分岐マスの次の日から） */
  length: 7,
  /** 分岐を置かない月（大会・合宿の月） */
  excludeMonths: [7, 8, 12, 1, 3] as number[],
  /** テーマのある道の数（1〜2 本。ふつうの道と合わせて 2〜3 本） */
  extraPaths: [1, 2] as [number, number],
  /** テーマごとの出やすさの倍率 */
  themes: {
    blue: { blue: 2, red: 1.3 },
    training: { red: 1.3 },
    rest: { green: 2.5 },
    yellow: { yellow: 2 },
  } as Record<Exclude<BranchTheme, "normal">, Partial<Record<RandomSquareType, number>>>,
  /** 特訓の道で必ず入る特訓マスの数 */
  trainingGuaranteed: 2,
  /** 選ぶ画面で正確に見えるマスの数（残りは種類ごとの数。うち 1 つは「？」） */
  revealFirst: 3,
};
