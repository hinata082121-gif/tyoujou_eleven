/**
 * 学力とテスト（R2。SPEC 18.2・PHASE_R2_PLAN 3.2〜3.3）
 */
import type { Personality, TestPrepPolicy } from "../types";

export const ACADEMICS = {
  /** 新入生の学力：平均とばらつき */
  mean: 50,
  sd: 15,
  /** 性格による平均のずれ */
  personalityShift: { diligent: 8, calm: 6, cautious: 4, craftsman: 0, competitive: 0, passionate: -4, moodMaker: -4, inspired: 0 } as Record<Personality, number>,
  /** ひらめき型はばらつきが大きい */
  inspiredSd: 22,
  /** 特待生（スポーツの推薦） */
  scholarshipShift: -5,
  min: 5,
  max: 100,
  /** 表示の 5 段階の区切り（この値以上で 1 段上） */
  bands: [30, 45, 60, 75] as const,
};

/** テスト前の方針（PLAN 3.3） */
export const TEST_PREP: Record<TestPrepPolicy, { expMult: number; fitnessCostMult: number; practice: boolean; scoreBonus: number; academic: number }> = {
  study: { expMult: 0, fitnessCostMult: 0, practice: false, scoreBonus: 6, academic: 1 },
  short: { expMult: 0.5, fitnessCostMult: 0.5, practice: true, scoreBonus: 2, academic: 0 },
  normal: { expMult: 1, fitnessCostMult: 1, practice: true, scoreBonus: 0, academic: 0 },
};

export const TEST = {
  /** テストの点のばらつき（標準偏差） */
  sd: 10,
  /** この点未満が赤点 */
  failBelow: 30,
  /** 補習を受けると学力が上がる */
  remedialAcademic: 3,
};
