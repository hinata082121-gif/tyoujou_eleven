import type { FormationId, Tactics } from "../types";

/**
 * 戦術の型（CPU 校が使う。バランス検証の相性表もこの 4 つで測る）。
 * 相性は循環型：ハイプレス > ポゼッション > 堅守速攻 > ロングボール > ハイプレス
 * 試合前には、相手の基本フォーメーションと攻撃方針だけが見える（型そのものは見えない）。
 */
export const TACTIC_STYLES = {
  possession: {
    name: "ポゼッション",
    tactics: { attack: "balanced", buildUp: "buildUp", press: "mid", line: "high" },
    formations: ["4-3-3", "4-2-3-1"],
  },
  highPress: {
    name: "ハイプレス",
    tactics: { attack: "attacking", buildUp: "buildUp", press: "high", line: "high" },
    formations: ["4-3-3", "4-4-2", "4-2-3-1"],
  },
  longBall: {
    name: "ロングボール",
    tactics: { attack: "balanced", buildUp: "long", press: "mid", line: "high" },
    formations: ["4-4-2", "3-5-2"],
  },
  lowBlock: {
    name: "堅守速攻",
    tactics: { attack: "defensive", buildUp: "long", press: "low", line: "low" },
    formations: ["5-3-2", "4-4-2"],
  },
} as const satisfies Record<string, { name: string; tactics: Tactics; formations: readonly FormationId[] }>;

export type TacticStyleId = keyof typeof TACTIC_STYLES;
export const TACTIC_STYLE_IDS = Object.keys(TACTIC_STYLES) as TacticStyleId[];

/** 各型が得意な相手（循環） */
export const STYLE_BEATS: Record<TacticStyleId, TacticStyleId> = {
  highPress: "possession",
  possession: "lowBlock",
  lowBlock: "longBall",
  longBall: "highPress",
};

/** CPU 校が型を選ぶ重み */
export const STYLE_WEIGHTS: Record<TacticStyleId, number> = { possession: 30, highPress: 22, longBall: 26, lowBlock: 22 };
