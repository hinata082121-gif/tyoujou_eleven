import type { MatchRules } from "../types";

/** 冬の全国大会の試合ルール（SPEC 10.2）。県予選も同じ扱い */
export const WINTER_RULES = {
  /** 準々決勝まで */
  early: { halfMinutes: 40, extraTimeHalfMinutes: null, pkOnDraw: true, maxSubs: 5, maxSubWindows: null, benchSize: 9 } satisfies MatchRules,
  semiFinal: { halfMinutes: 45, extraTimeHalfMinutes: null, pkOnDraw: true, maxSubs: 5, maxSubWindows: null, benchSize: 9 } satisfies MatchRules,
  final: { halfMinutes: 45, extraTimeHalfMinutes: 10, pkOnDraw: true, maxSubs: 5, maxSubWindows: null, benchSize: 9 } satisfies MatchRules,
};

/** 練習試合：70 分・同点で終了・交代 5 人 */
export const PRACTICE_RULES: MatchRules = {
  halfMinutes: 35,
  extraTimeHalfMinutes: null,
  pkOnDraw: false,
  maxSubs: 5,
  maxSubWindows: null,
  benchSize: 9,
};

/** ラウンド番号（0 始まり）と総ラウンド数から冬の全国大会のルールを決める */
export function winterRulesForRound(totalRounds: number, round: number): MatchRules {
  const fromEnd = totalRounds - 1 - round;
  if (fromEnd === 0) return WINTER_RULES.final;
  if (fromEnd === 1) return WINTER_RULES.semiFinal;
  return WINTER_RULES.early;
}

/** 県予選の日程（[月, 日]）。ラウンド数が少なければ後ろから使う */
export const PREF_QUALIFIER_DATES: [number, number][] = [
  [9, 14],
  [9, 28],
  [10, 12],
  [10, 26],
  [11, 9],
];

/** 冬の全国大会（48 校 = 6 ラウンド）の日程。ラウンド数が少なければ後ろから使う */
export const NATIONAL_DATES: [number, number][] = [
  [12, 29],
  [12, 31],
  [1, 2],
  [1, 4],
  [1, 11],
  [1, 13],
];

// ================= P2c：夏の全国大会・新人戦 =================

/** 夏の全国大会（県予選・本戦）の試合ルール（SPEC 10.2）：70 分・交代 5 人・決勝だけ 10 分ハーフの延長 */
export const SUMMER_RULES = {
  early: { halfMinutes: 35, extraTimeHalfMinutes: null, pkOnDraw: true, maxSubs: 5, maxSubWindows: null, benchSize: 9 } satisfies MatchRules,
  final: { halfMinutes: 35, extraTimeHalfMinutes: 10, pkOnDraw: true, maxSubs: 5, maxSubWindows: null, benchSize: 9 } satisfies MatchRules,
};
/** 新人戦（県大会・地域大会）の試合ルール：夏と同じ（P2c で決定） */
export const ROOKIE_RULES = SUMMER_RULES;

/** 夏・新人戦のルール（決勝だけ延長） */
export function summerRulesForRound(totalRounds: number, round: number): MatchRules {
  return round === totalRounds - 1 ? SUMMER_RULES.final : SUMMER_RULES.early;
}

/** 夏の全国大会の県予選の日程（毎週日曜。ラウンド数が少なければ後ろから使う） */
export const SUMMER_QUALIFIER_DATES: [number, number][] = [
  [5, 17],
  [5, 24],
  [5, 31],
  [6, 7],
  [6, 14],
];

/** 夏の全国大会・本戦（51 校 = 64 枠の 6 回戦）。7 日で 6 試合（7/30 だけ休み） */
export const SUMMER_NATIONAL_DATES: [number, number][] = [
  [7, 27],
  [7, 28],
  [7, 29],
  [7, 31],
  [8, 1],
  [8, 2],
];

/** 新人戦・県大会（1・2 年生のみ） */
export const ROOKIE_PREF_DATES: [number, number][] = [
  [1, 18],
  [1, 25],
  [2, 1],
  [2, 8],
  [2, 15],
];
/** 新人戦・県大会の組み合わせを作る日（冬の全国大会の決勝の後） */
export const ROOKIE_PREF_SETUP_DATE = [1, 15] as const;

/** 新人戦・地域大会（16 枠以下の 4 回戦。4 日で 4 試合） */
export const ROOKIE_REGION_DATES: [number, number][] = [
  [3, 6],
  [3, 7],
  [3, 8],
  [3, 9],
];

/** 夏の全国大会の 2 校目 */
export const SUMMER = {
  /** もともと 2 校出場する県（開催県の抽選から外す） */
  doubleRepPrefs: ["tokyo", "kanagawa", "osaka"] as string[],
  /** 新人戦の県大会の上位を、夏の県予選の第 1〜N シードにする */
  rookieSeedCount: 8,
};

/** 新人戦・地域大会の出場校 */
export const ROOKIE_REGION = {
  /** 1 県あたりの出場校 */
  repsPerPref: 2,
  /** 1 道だけの地域（北海道）は、県大会の上位この数で行う */
  singlePrefTeams: 8,
};

/** 連戦の疲労を持ち越す大会（本戦。SPEC 10.3）。この期間は、カードを使わずに「次の試合へ」で進む */
export const CARRY_FATIGUE_KINDS = ["national", "summerNational", "rookieRegion"] as const;
