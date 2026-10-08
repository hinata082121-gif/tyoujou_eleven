import { FORMATIONS } from "../config/formations";
import { RANK_STRENGTH_MIN } from "../config/school";
import { pickBestEleven } from "../match/lineup";
import { positionRating } from "../player/rating";
import { SCHOOL_RANKS, type FormationId, type Player, type SchoolRank } from "../types";

/** チーム力 = ベスト 11 の評価値（適性込み）の平均 */
export function teamStrength(players: Player[], formation: FormationId = "4-4-2"): number {
  const lineup = pickBestEleven(players, formation);
  const slots = FORMATIONS[formation];
  const byId = new Map(players.map((p) => [p.id, p]));
  let sum = 0;
  let n = 0;
  lineup.forEach((id, i) => {
    const p = byId.get(id);
    if (!p) return;
    sum += positionRating(p, slots[i].pos);
    n++;
  });
  // 11 人そろわなければ、いない分を 0 として扱う
  return n === 0 ? 0 : sum / Math.max(n, slots.length);
}

export function rankFromStrength(strength: number): SchoolRank {
  let rank: SchoolRank = "E";
  for (const r of SCHOOL_RANKS) if (strength >= RANK_STRENGTH_MIN[r]) rank = r;
  return rank;
}

export function rankIndex(rank: SchoolRank): number {
  return SCHOOL_RANKS.indexOf(rank);
}
