/**
 * 試合の表示用の情報（P4）：ホーム・ユニフォーム・会場と、選手の見た目・背番号の写し。
 * 試合の計算には使わず、乱数も使わない（試合の結果は変わらない）
 */
import type { ActiveMatch, Side } from "../match/types";
import type { GameState } from "../types";
import { generateKits, generateLook, kitsForMatch, venueStage } from ".";

/** ホーム側のチーム（トーナメントは組み合わせ表の上側、リーグ戦は日程どおり、練習試合は自校） */
export function homeSide(state: GameState, am: ActiveMatch): Side {
  const ids = [am.state.teams[0].schoolId, am.state.teams[1].schoolId];
  const sideOf = (id: string | null | undefined): Side => (id === ids[1] ? 1 : 0);
  if (am.kind === "practice") return am.userSide;
  if (am.kind === "league") {
    for (const d of state.league?.divisions ?? [])
      for (const round of d.fixtures) for (const f of round) if ((f.home === ids[0] && f.away === ids[1]) || (f.home === ids[1] && f.away === ids[0])) return sideOf(f.home);
    return am.userSide;
  }
  const b = state.competitions[am.kind];
  const m = b?.rounds.flat().find((x) => x.id === am.bracketMatchId);
  return m ? sideOf(m.a) : am.userSide;
}

/** 試合に表示用の情報を付ける（試合を始めたとき・マイグレーション） */
export function decorateMatch(state: GameState, am: ActiveMatch) {
  const ms = am.state;
  const home = homeSide(state, am);
  const ids = [ms.teams[0].schoolId, ms.teams[1].schoolId] as const;
  const kits = ids.map((id) => state.schools[id]?.kits ?? generateKits(state.seed, id)) as [NonNullable<(typeof state.schools)[string]["kits"]>, NonNullable<(typeof state.schools)[string]["kits"]>];
  const mk = kitsForMatch(kits, home);
  const b = am.kind === "practice" || am.kind === "league" ? undefined : state.competitions[am.kind];
  ms.view = { home, kits: mk.kits, gk: mk.gk };
  if (b && am.kind !== "practice" && am.kind !== "league") ms.view.venue = venueStage(am.kind, am.round ?? 0, b.rounds.length);
  ms.teams.forEach((team, side) => {
    const roster = new Map((state.schools[ids[side]]?.players ?? []).map((p) => [p.id, p]));
    for (const mp of Object.values(team.players)) {
      const src = roster.get(mp.id);
      mp.look = src?.look ?? generateLook(state.seed, mp.id);
      if (src?.shirtNumber !== undefined) mp.num = src.shirtNumber;
    }
  });
}
