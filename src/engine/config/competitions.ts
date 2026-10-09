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
