import { REPUTATION_GAUGE as G, REPUTATION_TABLE } from "../config/reputation";
import { rankIndex } from "../school/strength";
import type { MatchKind, Reputation, ReputationLevel, SchoolRank } from "../types";

export function handSize(rep: Reputation): number {
  return REPUTATION_TABLE[rep.level].handSize;
}

export function gradeSize(rep: Reputation): number {
  return REPUTATION_TABLE[rep.level].gradeSize;
}

export interface GaugeChange {
  delta: number;
  levelChange: -1 | 0 | 1;
}

/** ゲージを動かす。100 以上で昇格、0 未満で降格 */
export function addGauge(rep: Reputation, delta: number): GaugeChange {
  rep.gauge += delta;
  let levelChange: -1 | 0 | 1 = 0;
  if (rep.gauge >= G.max) {
    if (rep.level < 4) {
      rep.level = (rep.level + 1) as ReputationLevel;
      rep.gauge = G.afterPromotion;
      levelChange = 1;
    } else rep.gauge = G.max;
  } else if (rep.gauge < 0) {
    if (rep.level > 0) {
      rep.level = (rep.level - 1) as ReputationLevel;
      rep.gauge = G.afterDemotion;
      levelChange = -1;
    } else rep.gauge = 0;
  }
  rep.gauge = Math.round(rep.gauge * 10) / 10;
  return { delta, levelChange };
}

function tableValue(table: Record<number, number>, key: number): number {
  const keys = Object.keys(table).map(Number);
  const k = Math.max(Math.min(...keys), Math.min(Math.max(...keys), key));
  return table[k];
}

/**
 * 試合結果による評判の変化量（SPEC 6章）。
 * 格上に勝つほど大きく上がり、負けると下がる（評判が高いほど下がり幅が大きいが、極端にはしない）。
 */
export function matchReputationDelta(
  level: ReputationLevel,
  kind: MatchKind,
  ownRank: SchoolRank,
  oppRank: SchoolRank,
  result: "win" | "draw" | "loss",
  viaPk: boolean,
): number {
  const diff = rankIndex(oppRank) - rankIndex(ownRank);
  if (result === "win") return G.winBase[kind] * tableValue(G.winRankMult, diff);
  if (result === "draw") return diff > 0 ? G.drawVsStronger * diff : 0;
  const loss = G.lossBase[kind] * tableValue(G.lossRankMult, diff) * G.lossLevelMult[level] * (viaPk ? G.pkLossMult : 1);
  return -loss;
}
