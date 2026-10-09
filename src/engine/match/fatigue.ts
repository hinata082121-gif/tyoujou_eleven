import { MATCH } from "../config/match";

/** 疲労係数（体力 → 能力に掛ける倍率）。MATCH.fatigue を参照 */
export function fatigueFactor(stamina: number): number {
  const f = MATCH.fatigue;
  if (stamina >= f.from) return 1;
  return Math.max(f.floor, 1 - f.scale * Math.pow((f.from - stamina) / f.range, f.power));
}
