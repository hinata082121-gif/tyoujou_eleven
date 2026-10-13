import type { MatchRules } from "../types";

/**
 * 県リーグ（SPEC 11章。P3）。数値は npm run balance で調整する。
 */
export const LEAGUE = {
  /** 1 つの部の校数 */
  divisionSize: 8,
  /** 節の日程（[月, 日]）。7〜8 月は中断。最下部が 15 校（1 回総当たりで 15 節）のときだけ最後の日も使う */
  dates: [
    [4, 12],
    [4, 19],
    [4, 26],
    [5, 3],
    [5, 10],
    [6, 21],
    [6, 28],
    [9, 6],
    [9, 21],
    [10, 5],
    [10, 19],
    [11, 2],
    [11, 16],
    [11, 23],
    [11, 30],
  ] as [number, number][],
  /** 年度末に上の部と入れ替わる校数（上位・下位それぞれ） */
  promote: 2,
  /** 年度末の評判のボーナス */
  bonus: { divisionChampion: 15, topDivisionChampion: 25, promoted: 10, relegated: -10 },
};

/** リーグ戦の試合ルール：80 分・交代 5 人・引き分けで終了（P3 で決定） */
export const LEAGUE_RULES: MatchRules = {
  halfMinutes: 40,
  extraTimeHalfMinutes: null,
  pkOnDraw: false,
  maxSubs: 5,
  maxSubWindows: null,
  benchSize: 9,
};
