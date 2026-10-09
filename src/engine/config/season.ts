import type { Career } from "../types";

/** 卒業後の進路の出やすさ（総合値で変わる） */
export function careerWeights(overall: number): Record<Career, number> {
  return {
    pro: overall >= 72 ? 30 + (overall - 72) * 6 : overall >= 65 ? 3 : 0,
    university: 40 + Math.max(0, overall - 50),
    worker: 20,
    coach: 14,
    other: Math.max(5, 40 - overall / 2),
  };
}

/** 試合に出た選手の体力の消耗 = base + (100 - 試合終了時の体力) × fromStamina */
export const MATCH_FATIGUE = { base: 8, fromStamina: 0.25 };

/** 年度替わりの体力の回復 */
export const NEW_YEAR_FITNESS = 100;

/** ログの保存件数（古いものから消す。歴代の記録の要約は P5） */
export const LOG_LIMIT = 300;
