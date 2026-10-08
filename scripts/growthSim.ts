import { CARD_PRACTICE_WEIGHTS, CARD_VALUE_WEIGHTS, SQUARE_WEIGHTS } from "../src/engine/config/calendar";
import { YELLOW_BONUS, GREEN_RECOVERY } from "../src/engine/config/events";
import { POSITION_RATING_WEIGHTS } from "../src/engine/config/player";
import { generalFreshmen } from "../src/engine/school/generate";
import { overall } from "../src/engine/player/rating";
import { statRank } from "../src/engine/player/rank";
import { applyBonusGains, runPractice } from "../src/engine/practice";
import type { Rng } from "../src/engine/rng";
import { PRACTICE_KINDS, type PracticeKind, type StatKey } from "../src/engine/types";

/**
 * 一般入部の新入生が 3 年間でどこまで伸びるか（SPEC 14章「能力の推移」）。
 * 手札 4 枚から、体力が低ければ休養、そうでなければ数字の大きい練習カードを選ぶ単純な方針で進める。
 */
export function simulateGrowth(rng: Rng, groups = 40) {
  const finalOveralls: number[] = [];
  const bestStats: number[] = [];
  const startOveralls: number[] = [];
  const kinds = [...PRACTICE_KINDS];
  const drawCard = () => ({
    kind: rng.weighted(kinds, (k) => CARD_PRACTICE_WEIGHTS[k]) as PracticeKind,
    value: rng.weighted([1, 2, 3, 4, 5], (v) => CARD_VALUE_WEIGHTS[v - 1]),
  });
  for (let g = 0; g < groups; g++) {
    const players = generalFreshmen(rng, 10, 1);
    startOveralls.push(...players.map(overall));
    const hand = Array.from({ length: 4 }, drawCard);
    // 1 年で練習に使える日数（試合・行事を除いた目安）
    for (let day = 0; day < 3 * 330; ) {
      const avgFit = players.reduce((s, p) => s + p.fitness, 0) / players.length;
      let idx = hand.findIndex((c) => c.kind === "rest");
      if (!(avgFit < 55 && idx >= 0)) {
        const nonRest = hand.map((c, i) => ({ c, i })).filter((x) => x.c.kind !== "rest");
        idx = nonRest.length ? nonRest.sort((a, b) => b.c.value - a.c.value)[0].i : 0;
      }
      const card = hand[idx];
      hand[idx] = drawCard();
      const { gains } = runPractice(rng, players, card.kind, card.value, 1);
      day += card.value;
      const sq = rng.weighted(Object.keys(SQUARE_WEIGHTS) as (keyof typeof SQUARE_WEIGHTS)[], (k) => SQUARE_WEIGHTS[k]);
      if (sq === "yellow") applyBonusGains(players, gains, YELLOW_BONUS);
      if (sq === "green") for (const p of players) p.fitness = Math.min(100, p.fitness + GREEN_RECOVERY);
    }
    for (const p of players) {
      finalOveralls.push(overall(p));
      const keys = Object.keys(POSITION_RATING_WEIGHTS[p.mainPosition]) as StatKey[];
      bestStats.push(Math.max(...keys.map((k) => p.stats[k])));
    }
  }
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const share = (xs: number[], f: (x: number) => boolean) => `${((xs.filter(f).length / xs.length) * 100).toFixed(1)}%`;
  console.log("\n=== 成長（一般入部の新入生 → 3年間） ===");
  console.log("| 項目 | 結果 |");
  console.log("|---|---|");
  console.log(`| 入学時の総合値（平均） | ${avg(startOveralls).toFixed(1)}（${statRank(avg(startOveralls))}） |`);
  console.log(`| 3年後の総合値（平均） | ${avg(finalOveralls).toFixed(1)}（${statRank(avg(finalOveralls))}） |`);
  console.log(`| 3年後の総合値が B 以上 | ${share(finalOveralls, (x) => x >= 70)} |`);
  console.log(`| 3年後の総合値が C 以上 | ${share(finalOveralls, (x) => x >= 60)} |`);
  console.log(`| 主要能力の最高値が B 以上 | ${share(bestStats, (x) => x >= 70)} |`);
  console.log(`| 主要能力の最高値が A 以上 | ${share(bestStats, (x) => x >= 80)} |`);
}
