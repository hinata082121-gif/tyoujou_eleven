/**
 * 合宿（docs/PHASE2C_PLAN.md 6章）。数値は npm run balance で調整する。
 */
import type { PositionGroup, PracticeKind } from "../types";

export const CAMP = {
  /** 経験点の倍率（練習効率の上限 +15% の外。黄マスと同じ扱い） */
  expMult: 1.6,
  /** 練習の体力の消耗の倍率 */
  fitnessCostMult: 1.5,
  /** 熟練度の伸びの倍率（選んだ練習がスタイルに合うとき） */
  proficiencyMult: 2,
  /** 特殊能力の判定の基本確率（特訓マスの基本確率の何倍か） */
  learnBaseMult: 3,
  /** グラウンドのレベル 1 つ・ヘッドコーチの指導力 100 での判定の倍率の加算。合計は maxLearnMult まで */
  learnPerGround: 0.05,
  learnFromCoaching: 0.15,
  maxLearnMult: 1.3,
};

/** ポジションごとに選べる練習（休養を除く。そのポジションが対象になる練習） */
export const CAMP_CHOICES: Record<PositionGroup, PracticeKind[]> = {
  GK: ["gk", "pk", "pass", "physical", "run", "tactics"],
  DF: ["defense", "physical", "run", "pass", "tactics", "setPiece", "pk", "dribble", "shoot"],
  MF: ["pass", "dribble", "tactics", "run", "defense", "shoot", "physical", "setPiece", "pk"],
  FW: ["shoot", "dribble", "setPiece", "run", "physical", "pass", "tactics", "defense", "pk"],
};

/** 初期値（前回の方針がなければ） */
export const CAMP_DEFAULT_POLICY: Record<PositionGroup, PracticeKind> = { GK: "gk", DF: "defense", MF: "pass", FW: "shoot" };
