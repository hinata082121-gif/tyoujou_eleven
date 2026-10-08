import type { PracticeKind, StatKey } from "../types";

export type PracticeTarget = "all" | "field" | "gk";

export interface PracticeDef {
  target: PracticeTarget;
  /** 1 日あたりの経験点（能力ごと） */
  gains: Partial<Record<StatKey, number>>;
  /** フィールド選手のみに入る能力（「全員」対象の練習の一部） */
  fieldOnly?: StatKey[];
  /** 1 日あたりの体力の増減（マイナスで消耗） */
  fitness: number;
}

/** 練習カード（SPEC 5章。PK 練習は P2） */
export const PRACTICES: Record<PracticeKind, PracticeDef> = {
  shoot: { target: "field", gains: { shooting: 3.2, kickPower: 2.0 }, fitness: -5 },
  pass: { target: "all", gains: { pass: 3.2, vision: 2.0 }, fitness: -4 },
  dribble: { target: "field", gains: { dribble: 3.2, technique: 2.2 }, fitness: -5 },
  defense: { target: "field", gains: { defense: 3.2, decision: 1.8 }, fitness: -5 },
  physical: { target: "all", gains: { physical: 3.0, aerial: 2.0 }, fieldOnly: ["aerial"], fitness: -7 },
  run: { target: "all", gains: { speed: 2.6, stamina: 3.0 }, fitness: -8 },
  tactics: { target: "all", gains: { decision: 2.8, vision: 2.2 }, fieldOnly: ["decision"], fitness: -1 },
  gk: { target: "gk", gains: { saving: 2.8, highBall: 2.2, positioning: 2.4, catching: 2.4 }, fitness: -5 },
  setPiece: { target: "field", gains: { kickPower: 2.6, aerial: 2.4 }, fitness: -4 },
  rest: { target: "all", gains: {}, fitness: 14 },
};

/** 対象外の選手（GK 練習の日のフィールド選手など）の体力の変化 */
export const NON_TARGET_FITNESS = 1;
/** 毎日の自然回復 */
export const DAILY_RECOVERY = 2.5;

/** 体力が低いとケガをしやすい */
export const INJURY = {
  /** 1 日あたりのケガの確率（体力 0 のとき） */
  maxDailyChance: 0.012,
  /** この体力以上ならケガをしない */
  safeFitness: 45,
  minDays: 4,
  maxDays: 21,
};

/** 調子が日ごとに変わる確率 */
export const CONDITION_DRIFT_CHANCE = 0.035;
