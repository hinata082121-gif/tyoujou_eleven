import { STAT_NAMES } from "@/engine/config/names";
import { overall } from "@/engine/player/rating";
import { statRank } from "@/engine/player/rank";
import { COMMON_STATS, FIELD_STATS, GK_STATS, type Player, type StatKey } from "@/engine/types";

/** 画面に出す能力（役割に合う項目だけ） */
export function visibleStats(p: Player): StatKey[] {
  return p.mainPosition === "GK" ? [...GK_STATS, ...COMMON_STATS] : [...FIELD_STATS, ...COMMON_STATS];
}

export const statLabel = (k: StatKey) => STAT_NAMES[k];
export const overallValue = (p: Player) => Math.round(overall(p));
export const overallRank = (p: Player) => statRank(overall(p));

export const POSITION_GROUP: Record<string, string> = { GK: "GK", CB: "DF", SB: "DF", DMF: "MF", CMF: "MF", OMF: "MF", WG: "FW", CF: "FW" };
