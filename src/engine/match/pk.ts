import { MATCH } from "../config/match";
import type { Rng } from "../rng";
import type { Stats } from "../types";
import { activeIds } from "./orders";
import type { MatchState, MatchTeamState, PkKick, Side } from "./types";

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export interface PkResult {
  scored: boolean;
  kickerWonRead: boolean;
  result: "goal" | "saved" | "miss";
}

/** 分析担当がいないチームのスカウティングの項（SPEC 10.6） */
export const NO_SCOUTING = 0;

/**
 * PK 1 本の判定（PK 戦・試合中の PK 共通。SPEC 10.6）。
 * kicker / gk は試合中の実効能力（疲労・適性込み）を渡す。
 */
export function resolvePkKick(rng: Rng, kicker: Stats, gk: Stats, kickerScouting = NO_SCOUTING, gkScouting = NO_SCOUTING): PkResult {
  const cfg = MATCH.pk;
  const kickerRead = kicker.pkSkill + kickerScouting;
  const gkRead = gk.pkSkill + gkScouting;
  const kickerWonRead = rng.chance(sigmoid((kickerRead - gkRead) / cfg.readScale + cfg.readBias));
  const missP = cfg.missBase + cfg.missAcc * Math.pow(1 - Math.min(100, kicker.shooting) / 100, 2);
  if (rng.chance(missP)) return { scored: false, kickerWonRead, result: "miss" };
  if (kickerWonRead) return { scored: true, kickerWonRead, result: "goal" };
  const attack = kicker.shooting + kicker.kickPower;
  const defense = gk.saving + gk.positioning;
  const scored = rng.chance(sigmoid((attack - defense) / cfg.duelScale + cfg.duelBias));
  return { scored, kickerWonRead, result: scored ? "goal" : "saved" };
}

/** PK 戦に参加できる選手（試合終了時にピッチにいた選手。退場・ケガを除く） */
export function pkEligible(team: MatchTeamState): string[] {
  return activeIds(team);
}

/** CPU のキッカー順：PK 駆け引きとシュートの高い順。GK は最後 */
export function autoPkOrder(team: MatchTeamState): string[] {
  const eligible = pkEligible(team);
  const gkId = eligible.includes(team.onPitch[0]) ? team.onPitch[0] : eligible[0];
  const score = (id: string) => {
    const s = team.players[id].stats;
    return s.pkSkill * 0.5 + s.shooting * 0.35 + s.kickPower * 0.15;
  };
  const field = eligible.filter((id) => id !== gkId).sort((a, b) => score(b) - score(a));
  return [...field, gkId];
}

/** PK 戦のキッカー順を決める。ピッチにいる選手全員（退場・ケガを除く）を並べたものだけ受け付ける */
export function setPkOrder(state: MatchState, side: Side, order: string[]): string | null {
  if (!state.pk) return "PK戦ではありません";
  const team = state.teams[side];
  const eligible = pkEligible(team);
  const set = new Set(order);
  if (order.length !== eligible.length || set.size !== order.length || !eligible.every((id) => set.has(id))) {
    return `キッカーはピッチにいる${eligible.length}人全員を並べてください`;
  }
  state.pk.order[side] = [...order];
  return null;
}

function kicksTaken(kicks: PkKick[], side: Side) {
  return kicks.filter((k) => k.side === side).length;
}

/** 決着がついたか（5 本ずつ → サドンデス） */
export function pkDecided(pk: { kicks: PkKick[]; score: [number, number] }, rounds = MATCH.pk.kicks): Side | null {
  const t0 = kicksTaken(pk.kicks, 0);
  const t1 = kicksTaken(pk.kicks, 1);
  const [s0, s1] = pk.score;
  if (t0 <= rounds && t1 <= rounds) {
    const left0 = rounds - t0;
    const left1 = rounds - t1;
    if (s0 > s1 + left1) return 0;
    if (s1 > s0 + left0) return 1;
    if (t0 === rounds && t1 === rounds && s0 !== s1) return s0 > s1 ? 0 : 1;
    return null;
  }
  if (t0 === t1 && s0 !== s1) return s0 > s1 ? 0 : 1;
  return null;
}
