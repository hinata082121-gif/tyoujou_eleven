import type { Position, Rank, StatKey } from "../types";

/** 能力ランクの下限（SPEC 7.1） */
export const RANK_THRESHOLDS: [Rank, number][] = [
  ["SS", 100],
  ["S", 90],
  ["A", 80],
  ["B", 70],
  ["C", 60],
  ["D", 50],
  ["E", 40],
  ["F", 20],
  ["G", 1],
];

export const STAT_MIN = 1;
export const STAT_MAX = 100;

/** 主ポジションの出やすさ */
export const POSITION_WEIGHTS: Record<Position, number> = {
  GK: 10,
  CB: 17,
  SB: 14,
  DMF: 10,
  CMF: 13,
  OMF: 8,
  WG: 13,
  CF: 15,
};

/** 主ポジション以外で ○ になりやすいポジション */
export const RELATED_POSITIONS: Record<Position, Position[]> = {
  GK: [],
  CB: ["SB", "DMF"],
  SB: ["CB", "WG"],
  DMF: ["CMF", "CB"],
  CMF: ["DMF", "OMF"],
  OMF: ["CMF", "WG", "CF"],
  WG: ["SB", "OMF", "CF"],
  CF: ["WG", "OMF"],
};
/** 関連ポジションが ○ になる確率 */
export const RELATED_APT_CHANCE = 0.55;
/** 関係ないポジションが ○ になる確率 */
export const OTHER_APT_CHANCE = 0.06;

/** ポジションごとの能力の傾向（基準値への加算） */
export const POSITION_STAT_BIAS: Record<Position, Partial<Record<StatKey, number>>> = {
  GK: { saving: 10, highBall: 8, positioning: 8, catching: 8, kickPower: 3, physical: 3 },
  CB: { defense: 10, aerial: 8, physical: 8, decision: 3, speed: -3, dribble: -6, shooting: -6 },
  SB: { speed: 8, stamina: 8, defense: 5, pass: 2, dribble: 2, aerial: -3 },
  DMF: { defense: 7, decision: 6, pass: 4, stamina: 5, physical: 3, shooting: -3 },
  CMF: { pass: 8, vision: 7, decision: 5, technique: 4, stamina: 4 },
  OMF: { vision: 8, pass: 6, technique: 8, dribble: 5, shooting: 3, defense: -6 },
  WG: { speed: 10, dribble: 9, technique: 4, defense: -5, aerial: -4 },
  CF: { shooting: 10, kickPower: 6, aerial: 4, physical: 4, defense: -8 },
};

/** フィールド選手の GK 能力、GK のフィールド能力に加える値（役割外は低め） */
export const OFF_ROLE_PENALTY = -22;

/** 生成時の能力のばらつき（標準偏差） */
export const STAT_SD = 7;

/**
 * 新入生（一般入部）の基準値。ほとんどが G〜E、たまに D〜C（SPEC 7.1）。
 * 学校の格によって少し変わる（CPU 校用）
 */
export const FRESHMAN_BASE = 31;
export const FRESHMAN_BASE_SD = 5;

/** 身長（cm） */
export const HEIGHT = {
  fieldMean: 171,
  gkMean: 179,
  sd: 5.5,
  min: 155,
  max: 196,
  /** 在学中の伸び（入学時に 0〜max を決める） */
  growthMax: 5,
};

/** 伸びしろ（隠しパラメーター） */
export const POTENTIAL = { mean: 1.0, sd: 0.2, min: 0.6, max: 1.6 };

/** 利き足の確率 */
export const FOOT_WEIGHTS = { R: 74, L: 22, B: 4 };

/** 調子の係数（試合の実効能力） */
export const CONDITION_MULT: Record<number, number> = { [-2]: 0.93, [-1]: 0.97, 0: 1.0, 1: 1.03, 2: 1.06 };

/** 選手の総合値の重み（並べ替え・ランク計算用） */
export const OVERALL_WEIGHTS: Record<"GK" | "field", Partial<Record<StatKey, number>>> = {
  GK: { saving: 0.3, positioning: 0.22, catching: 0.18, highBall: 0.15, pass: 0.05, kickPower: 0.05, physical: 0.05 },
  field: {},
};

/** ポジションごとの総合値の重み（試合のゾーン評価でも使う） */
export const POSITION_RATING_WEIGHTS: Record<Position, Partial<Record<StatKey, number>>> = {
  GK: OVERALL_WEIGHTS.GK,
  CB: { defense: 0.3, aerial: 0.18, physical: 0.15, decision: 0.15, speed: 0.12, pass: 0.05, stamina: 0.05 },
  SB: { defense: 0.22, speed: 0.2, stamina: 0.15, pass: 0.13, decision: 0.1, dribble: 0.1, physical: 0.1 },
  DMF: { defense: 0.22, decision: 0.2, pass: 0.18, stamina: 0.12, physical: 0.12, vision: 0.1, technique: 0.06 },
  CMF: { pass: 0.22, vision: 0.18, decision: 0.18, technique: 0.14, stamina: 0.12, physical: 0.08, defense: 0.08 },
  OMF: { vision: 0.2, pass: 0.2, technique: 0.18, dribble: 0.14, decision: 0.12, shooting: 0.1, kickPower: 0.06 },
  WG: { speed: 0.22, dribble: 0.22, technique: 0.14, pass: 0.12, shooting: 0.12, decision: 0.1, stamina: 0.08 },
  CF: { shooting: 0.3, kickPower: 0.14, decision: 0.14, aerial: 0.12, physical: 0.12, speed: 0.1, technique: 0.08 },
};
