/**
 * 設備（SPEC 15章、docs/PHASE2C_PLAN.md 9章）。数値は npm run balance で調整する。
 */
import type { FacilityId, FacilityLevel, ReputationLevel } from "../types";

/** 段階ごとの効果（index = レベル 0〜3） */
export const FACILITY_EFFECTS = {
  /** グラウンド：全練習の効率 */
  groundPractice: [0, 0.02, 0.04, 0.06],
  /** トレーニングルーム：フィジカル・走り込みの効率と、ケガの確率の減り */
  trainingPractice: [0, 0.03, 0.06, 0.09],
  trainingInjury: [0, 0.08, 0.16, 0.24],
  /** ケアルーム：回復の倍率への加算と、ケガの離脱日数の減り */
  careRecovery: [0, 0.06, 0.12, 0.18],
  careInjuryDays: [0, 0.1, 0.2, 0.3],
  /** 寮：回復の倍率への加算と、スカウトの反応への加算 */
  dormRecovery: [0, 0.03, 0.06, 0.09],
  dormReaction: [0, 0.06, 0.12, 0.18],
};

/** 回復の倍率の上限（フィジカルコーチ＋ケアルーム＋寮。連戦の疲れは完全には抜けない） */
export const RECOVERY_CAP = 1.4;

/** 評判に初めて上がったときに学校から整備される設備（そのレベルまで上げる） */
export const REPUTATION_FACILITIES: Record<ReputationLevel, Partial<Record<FacilityId, FacilityLevel>>> = {
  0: {},
  1: { ground: 1 },
  2: { trainingRoom: 1, dorm: 1 },
  3: { ground: 2, careRoom: 1 },
  4: { trainingRoom: 2, dorm: 2, careRoom: 2 },
};

/** 大会の成績による整備（年度末に、その年の一番良い成績で 1 回判定）。maxLevel までしか上げない */
export const RESULT_FACILITIES = {
  nationalAppearance: { chance: 0.3, maxLevel: 2 },
  nationalTop4: { chance: 0.6, maxLevel: 3 },
  nationalChampion: { chance: 1, maxLevel: 3 },
  rookieRegionChampion: { chance: 0.2, maxLevel: 2 },
  /** P3：県リーグの 1 部で優勝 */
  leagueTopChampion: { chance: 0.3, maxLevel: 2 },
};

/** OB からの寄付（青マスに止まったときに判定。年 1 回まで） */
export const DONATION = {
  /** 1 回の判定の確率 = perPro × プロに進んだ OB の数（総合 75 以上は 1.5 人分）。上限 max */
  perPro: 0.012,
  starOverall: 75,
  starWeight: 1.5,
  max: 0.1,
  maxLevel: 3 as FacilityLevel,
};

/** CPU 校の設備：格（prestige 0〜5）ごとのレベルの範囲 */
export const CPU_FACILITY_RANGE: [FacilityLevel, FacilityLevel][] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 2],
  [2, 2],
  [2, 3],
];
/** CPU 校の体力管理（フィジカルコーチ）の平均。格ごと */
export const CPU_CONDITIONING_MEAN = [30, 36, 42, 50, 58, 66];
