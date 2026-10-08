/**
 * 成長（SPEC 7.4）。
 * 能力値 v から v+1 に上げるのに必要な経験点 = BASE × exp(v / SCALE)。
 * 能力値が高いほど上がりにくい。
 */
export const GROWTH = {
  base: 3.4,
  scale: 38,
  /** 役割外の能力（GK のシュートなど）への経験点の倍率 */
  offRoleMult: 0.12,
  /** 体力が低いと練習の効率が落ちる（体力 0 で この倍率） */
  lowFitnessMult: 0.55,
  /** 調子による練習効率 */
  conditionMult: { [-2]: 0.85, [-1]: 0.93, 0: 1, 1: 1.05, 2: 1.1 } as Record<number, number>,
};

/** CPU 校の年間成長（簡略化モデル）。1 年で各能力に入る経験点 */
export const CPU_GROWTH = {
  /** 学年ごとの年間経験点（1→2 年、2→3 年への進級時） */
  yearlyExp: 105,
  sd: 30,
  /** 年度替わり（4月）と秋（10月1日）に半分ずつ成長させる */
  springShare: 0.5,
  autumnDate: [10, 1] as const,
};
