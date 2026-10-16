/**
 * Phase 2c の balance 項目（docs/PHASE2C_PLAN.md 13章）。
 * - 特待生の候補の質（CPU の強豪校の新入生と比べる）
 * - 大会の本戦の連戦：体力を見て先発を入れ替える／入れ替えない
 * 特待生の人数・設備の推移・合宿の成長は、評判の推移の自動プレイ（seasonSim）で測る。
 */
import { summerRulesForRound } from "../src/engine/config/competitions";
import { PRESTIGE_LEVEL_BASE } from "../src/engine/config/school";
import { REPUTATION_NAMES } from "../src/engine/config/names";
import { simulateCpuMatch } from "../src/engine/competition/simulate";
import { newGame } from "../src/engine/game";
import { overall } from "../src/engine/player/rating";
import { Rng } from "../src/engine/rng";
import { SCOUT } from "../src/engine/config/scout";
import { scoutCardDays, scoutContext, startScoutSeason } from "../src/engine/scout";
import { cpuFreshmen, makeCpuSchool } from "../src/engine/school/generate";
import type { Player, ReputationLevel } from "../src/engine/types";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
/** 上位の新入生（チームの主力になる上の方）：学年の上位 3 人の平均 */
const top3 = (ps: Player[]) => mean([...ps.map(overall)].sort((a, b) => b - a).slice(0, 3));

export function scholarQualityTable(seasons: number) {
  const t0 = Date.now();
  console.log(`\n=== Phase 2c：特待生の候補の質（評判ごとに ${seasons} 回の候補リスト） ===`);
  const cpu = (prestige: number) => {
    const rng = Rng.fromSeed(`p2c-cpu-${prestige}`);
    const all: number[] = [];
    const tops: number[] = [];
    for (let i = 0; i < seasons * 4; i++) {
      const ps = cpuFreshmen(rng, prestige, 1);
      all.push(...ps.map(overall));
      tops.push(top3(ps));
    }
    return { avg: mean(all), top: mean(tops) };
  };
  const strong = cpu(3);
  const elite = cpu(4);
  const top = cpu(5);
  console.log(`CPU の新入生の総合（平均／学年の上位 3 人）：格 3（強豪校。基準 ${PRESTIGE_LEVEL_BASE[3]}）${strong.avg.toFixed(1)}／${strong.top.toFixed(1)}・格 4（基準 ${PRESTIGE_LEVEL_BASE[4]}）${elite.avg.toFixed(1)}／${elite.top.toFixed(1)}・格 5（基準 ${PRESTIGE_LEVEL_BASE[5]}）${top.avg.toFixed(1)}`);
  console.log("（P3：強豪はふつうの候補が格 4・最上位が格 5、名門はふつうの候補が格 5・最上位はその上の水準）");
  console.log("| 評判 | 候補の数 | 候補の総合（平均） | 最上位の候補（平均） | 最上位の割合 | 取り合いの相手（最上位の平均） | 目標 |");
  console.log("|---|---|---|---|---|---|---|");
  const s = newGame("p2c-scholar", "検証高校");
  for (const level of [0, 1, 2, 3, 4] as ReputationLevel[]) {
    s.reputation.level = level;
    const rng = Rng.fromSeed(`p2c-scholar-${level}`);
    const normal: number[] = [];
    const tops: number[] = [];
    let count = 0;
    let rivals = 0;
    for (let i = 0; i < seasons; i++) {
      const sc = startScoutSeason(rng, scoutContext(s, 0), scoutCardDays(2, 214, 325));
      count += sc.candidates.length;
      for (const c of sc.candidates) {
        (c.tier ? tops : normal).push(overall(c.player));
        if (c.tier) rivals += c.rivals.length;
      }
    }
    const all = mean([...normal, ...tops]);
    const step = SCOUT.levelStep[level];
    const [base, up] = step === 0 ? [strong, elite] : step === 1 ? [elite, top] : [top, { avg: top.avg + SCOUT.beyondTopBase }];
    // 評判ごとの上乗せ（SCOUT.levelBonus。R2 で強豪 +1・名門 +3）も目標に足す
    const bonus = SCOUT.levelBonus[level] ?? 0;
    const okAll = Math.abs(mean(normal) - (base.avg + bonus)) <= 2;
    const okTop = Math.abs(mean(tops) - (up.avg + bonus)) <= 2.5;
    console.log(
      `| ${REPUTATION_NAMES[level]} | ${(count / seasons).toFixed(0)}人 | ${all.toFixed(1)}（ふつうの候補 ${mean(normal).toFixed(1)}） | ${mean(tops).toFixed(1)} | ${pct(tops.length / count)} | ${(rivals / Math.max(1, tops.length)).toFixed(1)} | ${step === 0 ? "強豪の新入生並み・最上位は 1 段上" : step === 1 ? "格 4 並み・最上位は格 5" : "格 5 並み・最上位はその上"}${bonus ? `（+${bonus}）` : ""} ${okAll && okTop ? "OK" : "NG"} |`,
    );
  }
  console.log(`(計算時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒)`);
}

/**
 * 本戦の連戦（6 試合を 1 日おきなし・ありで続ける）。同じ学校が、体力を見て先発を入れ替える／入れ替えないで戦う。
 * 相手は毎回ちがう同じ格の学校（ふつうの体力）。
 */
export function tournamentFatigueTable(n: number) {
  const t0 = Date.now();
  const ROUNDS = 6;
  // 夏の全国大会の日程（7/27・28・29・31・8/1・8/2）と同じ間隔
  const gaps = [0, 1, 2, 4, 5, 6];
  console.log(`\n=== Phase 2c：大会の本戦の連戦（格 3 の学校 ${n} 校 × ${ROUNDS} 試合。夏の全国大会の日程） ===`);
  const run = (rotate: boolean) => {
    const pts = Array(ROUNDS).fill(0);
    const fit = Array(ROUNDS).fill(0);
    for (let i = 0; i < n; i++) {
      const rng = Rng.fromSeed(`p2c-fat-${i}`);
      const me = makeCpuSchool(Rng.fromSeed(`p2c-fat-team-${i}`), "me", "検証", "x", 3, 1);
      for (let r = 0; r < ROUNDS; r++) {
        const opp = makeCpuSchool(Rng.fromSeed(`p2c-fat-opp-${i}-${r}`), `o${r}`, "相手", "x", 3, 1);
        const day = 100 + gaps[r];
        const carry = me.carryFitness;
        if (carry) {
          const lineup = Object.values(carry.fit);
          fit[r] += mean(lineup);
        } else fit[r] += 100;
        const o = simulateCpuMatch(rng.fork(`m${r}`), me, opp, summerRulesForRound(ROUNDS, r), { bigStage: true, carryDay: day, rotate });
        pts[r] += o.winner === "me" ? 1 : 0;
      }
    }
    return { pts: pts.map((x) => x / n), fit: fit.map((x) => x / n) };
  };
  const yes = run(true);
  const no = run(false);
  console.log(`| 試合 | ${Array.from({ length: ROUNDS }, (_, r) => `${r + 1}試合目`).join(" | ")} |`);
  console.log(`|---|${"---|".repeat(ROUNDS)}`);
  console.log(`| 入れ替える：勝ち上がり率 | ${yes.pts.map(pct).join(" | ")} |`);
  console.log(`| 入れ替えない：勝ち上がり率 | ${no.pts.map(pct).join(" | ")} |`);
  console.log(`| 入れ替える：部員の平均体力（試合前） | ${yes.fit.map((x) => x.toFixed(0)).join(" | ")} |`);
  console.log(`| 入れ替えない：部員の平均体力（試合前） | ${no.fit.map((x) => x.toFixed(0)).join(" | ")} |`);
  const late = (x: number[]) => mean(x.slice(3));
  const diff = late(yes.pts) - late(no.pts);
  console.log(`4〜6試合目の勝ち上がり率の差（入れ替える − 入れ替えない）：${(diff * 100).toFixed(1)}pt（目標：入れ替えに意味がある＝プラス ${diff > 0.02 ? "OK" : "NG"}）`);
  console.log(`(計算時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒)`);
}
