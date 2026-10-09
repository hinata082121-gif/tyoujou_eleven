/**
 * npm run balance:quick … 普段使う軽い版（数十秒）。試合数・年数を減らした参考値
 * npm run balance:full  … すべての検証（4 分ほど）。PR の前に実行する
 * 大量の試合をシミュレーションして、SPEC 14章のバランス目標と比べる。
 * 試合数などは環境変数で上書きできる（BALANCE_N など）。
 */
import { PRESTIGE_LEVEL_BASE } from "../src/engine/config/school";
import { WINTER_RULES } from "../src/engine/config/competitions";
import { createMatch, simulateToEnd } from "../src/engine/match/engine";
import { autoSetup } from "../src/engine/match/lineup";
import { STYLE_WEIGHTS, TACTIC_STYLE_IDS, TACTIC_STYLES } from "../src/engine/config/tactics";
import { Rng } from "../src/engine/rng";
import { generateCpuRoster } from "../src/engine/school/generate";
import { rankFromStrength, rankIndex, teamStrength } from "../src/engine/school/strength";
import { SCHOOL_RANKS, type Player, type SchoolRank } from "../src/engine/types";
import { simulateSeasons } from "./seasonSim";
import { tacticsMatrix } from "./tacticsMatrix";
import { underdogTable } from "./underdog";
import { cardTable, notesTable, pkTable, scenarioTable, staffGrowthTable } from "./phase2a";

const MODE = process.argv[2] === "full" ? "full" : "quick";
const PRESETS = {
  quick: { n: 2000, tactics: 200, combos: false, underdog: 300, seasonGames: 6, seasonYears: 8, cards: 1000, pk: 2000, notes: 500, scenes: 800, growthGames: 3, growthYears: 6 },
  full: { n: 10000, tactics: 600, combos: true, underdog: 1500, seasonGames: 20, seasonYears: 12, cards: 5000, pk: 10000, notes: 3000, scenes: 4000, growthGames: 12, growthYears: 10 },
}[MODE];
const env = (key: string, fallback: number) => Number(process.env[key] ?? fallback);
const N = env("BALANCE_N", PRESETS.n);
console.log(`npm run balance:${MODE}${MODE === "quick" ? "（軽い版。数値は参考。PR の前は balance:full を実行する）" : "（すべての検証）"}`);
const rng = Rng.fromSeed(process.env.BALANCE_SEED ?? "balance");

interface Team {
  players: Player[];
  rank: SchoolRank;
  strength: number;
}

/** ランクごとのチームを用意する（各格のチームを生成し、計算したランクで分類） */
function buildPool(): Map<SchoolRank, Team[]> {
  const pool = new Map<SchoolRank, Team[]>(SCHOOL_RANKS.map((r) => [r, []]));
  for (let prestige = 0; prestige < PRESTIGE_LEVEL_BASE.length; prestige++) {
    for (let i = 0; i < 60; i++) {
      const players = generateCpuRoster(rng, prestige, 1);
      const strength = teamStrength(players);
      const rank = rankFromStrength(strength);
      pool.get(rank)!.push({ players, rank, strength });
    }
  }
  return pool;
}

/** CPU 校と同じく、戦術の型をランダムに選ぶ（型に合うフォーメーションで） */
function randomStyleSetup(players: Player[]) {
  const style = TACTIC_STYLES[rng.weighted(TACTIC_STYLE_IDS, (id) => STYLE_WEIGHTS[id])];
  return autoSetup(players, rng.pick(style.formations), { ...style.tactics });
}

function play(a: Team, b: Team, rules = WINTER_RULES.early) {
  const s = createMatch(
    rules,
    rng,
    { schoolId: "a", name: "A", rank: a.rank, isUser: false, players: a.players, setup: randomStyleSetup(a.players) },
    { schoolId: "b", name: "B", rank: b.rank, isUser: false, players: b.players, setup: randomStyleSetup(b.players) },
  );
  return simulateToEnd(s);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pool = buildPool();
const rankCounts = SCHOOL_RANKS.map((r) => `${r}:${pool.get(r)!.length}`).join(" ");
console.log(`\n=== チームの用意（ランク別の数） === ${rankCounts}\n`);

interface Agg {
  n: number;
  goals: number;
  aWin: number;
  draw: number;
  aLoss: number;
  pk: number;
  pkWinA: number;
  shots: number;
  onTarget: number;
  inMatchPk: number;
}
const agg = (): Agg => ({ n: 0, goals: 0, aWin: 0, draw: 0, aLoss: 0, pk: 0, pkWinA: 0, shots: 0, onTarget: 0, inMatchPk: 0 });

function runPairs(diff: number, n: number): Agg {
  const r = agg();
  const pairs: [SchoolRank, SchoolRank][] = [];
  for (const ra of SCHOOL_RANKS) {
    const rb = SCHOOL_RANKS[rankIndex(ra) + diff];
    if (!rb || ra === "S" || rb === undefined) continue;
    if (pool.get(ra)!.length < 2 || pool.get(rb)!.length < 2) continue;
    pairs.push([ra, rb]);
  }
  for (let i = 0; i < n; i++) {
    const [ra, rb] = pairs[i % pairs.length];
    const a = rng.pick(pool.get(ra)!);
    let b = rng.pick(pool.get(rb)!);
    while (b === a) b = rng.pick(pool.get(rb)!);
    const s = play(a, b);
    r.n++;
    r.goals += s.score[0] + s.score[1];
    r.shots += s.teams[0].stats.shots + s.teams[1].stats.shots;
    r.onTarget += s.teams[0].stats.onTarget + s.teams[1].stats.onTarget;
    r.inMatchPk += s.events.filter((e) => e.type === "pkAwarded").length;
    if (s.pk) {
      r.pk++;
      if (s.pk.winner === 0) r.pkWinA++;
    }
    if (s.score[0] > s.score[1]) r.aWin++;
    else if (s.score[0] < s.score[1]) r.aLoss++;
    else r.draw++;
  }
  return r;
}

const t0 = Date.now();
const same = runPairs(0, Math.round(N * 0.5));
const plus1 = runPairs(1, Math.round(N * 0.25));
const plus2 = runPairs(2, Math.round(N * 0.25));
const all = [same, plus1, plus2].reduce((s, x) => {
  for (const k of Object.keys(s) as (keyof Agg)[]) s[k] += x[k];
  return s;
}, agg());

const rows: [string, string, string, boolean][] = [];
const check = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
const avgGoals = all.goals / all.n;
rows.push(["1試合の総得点（平均）", avgGoals.toFixed(2), "2.5〜3.5", check(avgGoals, 2.5, 3.5)]);
const pkRate = all.pk / all.n;
rows.push(["トーナメントでPK戦になる割合（80分）", pct(pkRate), "15〜25%", check(pkRate, 0.15, 0.25)]);
const sameWin = (same.aWin + same.aLoss) / 2 / same.n; // 同格は対称なので両側の平均
rows.push(["同格の相手への勝率（試合時間内）", pct(sameWin), "40〜50%", check(sameWin, 0.4, 0.5)]);
const up2Win = plus2.aWin / plus2.n;
rows.push(["ランクが2段階上の相手への勝率（試合時間内）", pct(up2Win), "15〜25%", check(up2Win, 0.15, 0.25)]);

console.log("| 項目 | 結果 | 目標 | 判定 |");
console.log("|---|---|---|---|");
for (const [k, v, t, ok] of rows) console.log(`| ${k} | ${v} | ${t} | ${ok ? "OK" : "NG"} |`);

console.log("\n=== 参考 ===");
console.log("| 対戦 | 試合数 | 勝 | 分 | 負 | PK戦 | PK戦の勝率 | 平均得点 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [label, r] of [["同格", same], ["1段階上", plus1], ["2段階上", plus2]] as const) {
  console.log(
    `| ${label} | ${r.n} | ${pct(r.aWin / r.n)} | ${pct(r.draw / r.n)} | ${pct(r.aLoss / r.n)} | ${pct(r.pk / r.n)} | ${r.pk ? pct(r.pkWinA / r.pk) : "-"} | ${(r.goals / r.n).toFixed(2)} |`,
  );
}
const upsetsWithPk = (plus2.aWin + plus2.pkWinA) / plus2.n;
console.log(`\n2段階上の相手に「勝ち上がる」割合（PK戦の勝ちを含む）: ${pct(upsetsWithPk)}`);
console.log(`1試合のシュート: ${(all.shots / all.n).toFixed(1)}本 / 枠内: ${(all.onTarget / all.n).toFixed(1)}本 / 決定率: ${pct(all.goals / all.shots)}`);
console.log(`1試合あたりの試合中のPK: ${(all.inMatchPk / all.n).toFixed(3)}本`);
console.log(`(計算時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒)`);

// ---- 戦術の相性表 ----
tacticsMatrix(env("BALANCE_TACTICS_N", PRESETS.tactics), "tactics", PRESETS.combos);

// ---- 格上と戦うときの型ごとの成績（堅守速攻の番狂わせ補正） ----
underdogTable(env("BALANCE_UNDERDOG_N", PRESETS.underdog));

// ---- 評判の推移と成長（うまい采配の自動プレイで何年分も進める） ----
simulateSeasons(env("BALANCE_SEASON_GAMES", PRESETS.seasonGames), env("BALANCE_SEASON_YEARS", PRESETS.seasonYears));

// ---- Phase 2a（docs/PHASE2A_PLAN.md 10.2） ----
cardTable(env("BALANCE_CARDS_N", PRESETS.cards));
pkTable(env("BALANCE_PK_N", PRESETS.pk));
notesTable(env("BALANCE_NOTES_N", PRESETS.notes));
scenarioTable(env("BALANCE_SCENES_N", PRESETS.scenes));
staffGrowthTable(env("BALANCE_GROWTH_GAMES", PRESETS.growthGames), env("BALANCE_GROWTH_YEARS", PRESETS.growthYears));
