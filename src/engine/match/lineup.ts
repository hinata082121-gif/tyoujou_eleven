import { FORMATIONS } from "../config/formations";
import { MATCH } from "../config/match";
import { CONDITION_MULT } from "../config/player";
import { fatigueFactor } from "./fatigue";
import { positionRating, isAvailable } from "../player/rating";
import type { FormationId, Player, Position, TeamSetup, Tactics } from "../types";

export const DEFAULT_TACTICS: Tactics = { attack: "balanced", buildUp: "buildUp", press: "mid", line: "high" };

/** スロットを埋める順番（GK → 層の薄いポジション → その他） */
const FILL_ORDER: Position[] = ["GK", "CF", "CB", "OMF", "DMF", "WG", "SB", "CMF"];

/**
 * ベスト 11 を選ぶ（貪欲法）。戻り値はスロット順の選手 ID。
 * 出場できる選手が 11 人未満なら、足りない分は出場不可の選手で埋める。
 */
export function pickBestEleven(players: Player[], formation: FormationId): string[] {
  const slots = FORMATIONS[formation];
  const pool = players.filter(isAvailable);
  const fallback = players.filter((p) => !isAvailable(p) && p.status === "active");
  const used = new Set<string>();
  const lineup: string[] = new Array(slots.length).fill("");
  const order = slots.map((s, i) => ({ s, i })).sort((x, y) => FILL_ORDER.indexOf(x.s.pos) - FILL_ORDER.indexOf(y.s.pos));
  for (const { s, i } of order) {
    let best: Player | undefined;
    let bestScore = -Infinity;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      const score = positionRating(p, s.pos);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) best = fallback.find((p) => !used.has(p.id));
    if (best) {
      used.add(best.id);
      lineup[i] = best.id;
    }
  }
  return lineup;
}

/** 控えを選ぶ（控え GK を 1 人入れて、残りは評価値の高い順） */
export function pickBench(players: Player[], lineup: string[], size: number): string[] {
  const inLineup = new Set(lineup);
  const rest = players.filter((p) => isAvailable(p) && !inLineup.has(p.id));
  const bench: string[] = [];
  const gk = rest.filter((p) => p.mainPosition === "GK").sort((a, b) => positionRating(b, "GK") - positionRating(a, "GK"))[0];
  if (gk) bench.push(gk.id);
  const others = rest
    .filter((p) => p.id !== gk?.id)
    .sort((a, b) => positionRating(b, b.mainPosition) - positionRating(a, a.mainPosition));
  for (const p of others) {
    if (bench.length >= size) break;
    bench.push(p.id);
  }
  return bench;
}

export function autoSetup(players: Player[], formation: FormationId, tactics: Tactics, benchSize = 9): TeamSetup {
  const lineup = pickBestEleven(players, formation);
  return { formation, tactics, lineup, bench: pickBench(players, lineup, benchSize) };
}

/**
 * 試合の前半（開始時）と終盤（体力が 35 減ったころ）の疲労係数の平均。
 * 体力を見て先発を選ぶとき（うまい監督の自動プレイ・本戦の CPU 校）に使う
 */
export function fitnessFactor(fitness: number): number {
  const start = MATCH.startStaminaBase + MATCH.startStaminaFromFitness * fitness;
  return (fatigueFactor(start) + fatigueFactor(start - 35)) / 2;
}

/** 調子と体力を見た並び（能力に調子・体力の係数をかけて選ぶ。選ばれる選手の能力そのものは変えない） */
export function fitnessAwareSetup(players: Player[], formation: FormationId, tactics: Tactics, benchSize = 9): TeamSetup {
  const judged = players.map((p) => {
    const m = (CONDITION_MULT[p.condition] ?? 1) * fitnessFactor(p.fitness);
    const stats = { ...p.stats };
    for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = stats[k] * m;
    return { ...p, stats };
  });
  return autoSetup(judged, formation, tactics, benchSize);
}

/** 交代・フォーメーション変更時に、出場中の 11 人を新しいスロットに割り当て直す */
export function assignToSlots(players: (Pick<Player, "stats" | "aptitude"> & { id: string })[], formation: FormationId): string[] {
  const slots = FORMATIONS[formation];
  const used = new Set<string>();
  const result: string[] = new Array(slots.length).fill("");
  const order = slots.map((s, i) => ({ s, i })).sort((x, y) => FILL_ORDER.indexOf(x.s.pos) - FILL_ORDER.indexOf(y.s.pos));
  for (const { s, i } of order) {
    let best: (typeof players)[number] | undefined;
    let bestScore = -Infinity;
    for (const p of players) {
      if (used.has(p.id)) continue;
      const score = positionRating(p, s.pos);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) {
      used.add(best.id);
      result[i] = best.id;
    }
  }
  return result;
}
