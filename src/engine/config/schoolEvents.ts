/**
 * 学校行事（R2。SPEC 18.2・PHASE_R2_PLAN 3章）。日程と効果の数値。
 * 入学式（4/1）・卒業式（3/1）は今までの entrance・graduation の日に場面を足すだけ。
 */
import type { SchoolEventId } from "../types";

export interface TestDef {
  /** テスト前の初日（止まって方針を選ぶ日）と、テストの日 [月, 日] */
  prep: readonly [number, number];
  test: readonly [number, number];
  /** 表示名 */
  label: string;
  /** 赤点の補習の日数 */
  remedialDays: number;
}

/** テスト（年 5 回）。テスト前はテストの前の 3 日 */
export const TESTS: readonly TestDef[] = [
  { prep: [5, 11], test: [5, 14], label: "1学期 中間テスト", remedialDays: 3 },
  { prep: [7, 7], test: [7, 10], label: "1学期 期末テスト", remedialDays: 4 },
  { prep: [10, 13], test: [10, 16], label: "2学期 中間テスト", remedialDays: 3 },
  { prep: [12, 5], test: [12, 8], label: "2学期 期末テスト", remedialDays: 4 },
  { prep: [2, 19], test: [2, 22], label: "学年末テスト", remedialDays: 4 },
];

/** テスト以外の行事の日 */
export const SCHOOL_DATES = {
  sportsDay: [6, 17] as const,
  culturalFestival: [9, 24] as const,
  schoolTrip: [11, 11] as const,
};

/** 修学旅行（2 年生）の日数（出発の日を含む） */
export const SCHOOL_TRIP = { days: 4, grade: 2 as const, returnConditionChance: 0.4 };

/** 行事の短い名前（すごろくのマス・予定表） */
export const SCHOOL_EVENT_LABELS: Record<SchoolEventId, string> = {
  testPrep: "試験前",
  test: "試験",
  sportsDay: "体育祭",
  culturalFestival: "文化祭",
  schoolTrip: "修学旅行",
};

/** 行事の名前（場面の題名など） */
export const SCHOOL_EVENT_NAMES: Record<SchoolEventId, string> = {
  testPrep: "テスト前",
  test: "テスト",
  sportsDay: "体育祭",
  culturalFestival: "文化祭",
  schoolTrip: "修学旅行",
};

/** その日の練習がない行事（テスト・体育祭・文化祭。修学旅行は 2 年生だけ休み） */
export const NO_PRACTICE_EVENTS: readonly SchoolEventId[] = ["test", "sportsDay", "culturalFestival"];

/** 体育祭の部活対抗リレー（PLAN 3.4） */
export const SPORTS_DAY = {
  /** 本気：勝つ確率 = base + (チームのスピードの平均 − 50) × perSpeed（0.15〜0.85） */
  winBase: 0.45,
  winPerSpeed: 0.012,
  winReputation: 1,
  allOutConditionChance: 0.5,
  allOutInjuryChance: 0.08,
  injuryDays: [3, 7] as [number, number],
  enjoyConditionChance: 0.3,
  enjoyInjuryChance: 0.02,
};

/** 文化祭（PLAN 3.5） */
export const CULTURAL_FESTIVAL = {
  baseReputation: 2,
  clinicReputation: 2,
  clinicFitness: -5,
  exhibitTrust: 2,
  /** 展示：学力がこれ未満の部員の学力を上げる */
  exhibitAcademicBelow: 45,
  exhibitAcademic: 2,
  classConditionChance: 0.4,
};
