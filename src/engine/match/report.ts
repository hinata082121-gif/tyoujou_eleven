/**
 * ハーフタイムに見せる試合の状況（支配率・シュート・ゾーン別の優劣）。表示用の集計だけ。
 */
import type { MatchState, Side } from "./types";

export type ZoneVerdict = "優勢" | "互角" | "押されている";

export interface ZoneRow {
  /** 自チームから見たゾーン */
  zone: "左サイド" | "中央" | "右サイド";
  /** 自チームがこのゾーンから攻めた回数・チャンス */
  ourAttacks: number;
  ourChances: number;
  /** 相手がこのゾーン（自チームから見た位置）を攻めた回数・チャンス */
  theirAttacks: number;
  theirChances: number;
  verdict: ZoneVerdict;
}

export interface HalfReport {
  possession: number;
  shots: [number, number];
  onTarget: [number, number];
  zones: ZoneRow[];
}

/** 優劣の判定：攻撃回数とチャンスの重み付きで比べ、3 割以上の差があれば優勢／押されている */
function verdict(our: number, their: number): ZoneVerdict {
  if (our + their < 2) return "互角";
  if (our >= their * 1.3 + 0.5) return "優勢";
  if (their >= our * 1.3 + 0.5) return "押されている";
  return "互角";
}

export function halfReport(state: MatchState, side: Side): HalfReport {
  const me = state.teams[side];
  const opp = state.teams[side === 0 ? 1 : 0];
  const possession = me.stats.segments > 0 ? me.stats.possessionSum / me.stats.segments : 0.5;
  const mz = me.stats.zones ?? { attacks: [0, 0, 0], chances: [0, 0, 0] };
  const oz = opp.stats.zones ?? { attacks: [0, 0, 0], chances: [0, 0, 0] };
  // 相手の左サイドは、自チームから見て右サイド
  const mirror = [2, 1, 0];
  const names = ["左サイド", "中央", "右サイド"] as const;
  const zones = names.map((zone, i) => {
    const ourAttacks = mz.attacks[i];
    const ourChances = mz.chances[i];
    const theirAttacks = oz.attacks[mirror[i]];
    const theirChances = oz.chances[mirror[i]];
    return {
      zone,
      ourAttacks,
      ourChances,
      theirAttacks,
      theirChances,
      verdict: verdict(ourAttacks + 2 * ourChances, theirAttacks + 2 * theirChances),
    };
  });
  return {
    possession,
    shots: [me.stats.shots, opp.stats.shots],
    onTarget: [me.stats.onTarget, opp.stats.onTarget],
    zones,
  };
}
