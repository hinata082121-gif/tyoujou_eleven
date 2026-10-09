import { RANK_THRESHOLDS } from "../config/player";
import type { Rank } from "../types";

/** 能力値 → ランク（SPEC 7.1） */
export function statRank(value: number): Rank {
  const v = Math.round(value);
  for (const [rank, min] of RANK_THRESHOLDS) if (v >= min) return rank;
  return "G";
}
