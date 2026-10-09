import { PREFECTURES, REPUTATION_NAMES } from "../src/engine/config/names";
import { newGame } from "../src/engine/game";
import { autoplayYears } from "../src/engine/game/autoplay";
import { statRank } from "../src/engine/player/rank";
import { rankIndex } from "../src/engine/school/strength";
import { SCHOOL_RANKS, type ReputationLevel } from "../src/engine/types";

/**
 * 何年分も自動で遊んで、評判の推移と成長を測る（SPEC 14章）。
 * ある程度うまい采配をする自動プレイ（skilled）を使う。
 */
export function simulateSeasons(games: number, years: number) {
  const t0 = Date.now();
  // levelByYear[y][g] = y 年目の終わりの評判
  const levelByYear: ReputationLevel[][] = Array.from({ length: years }, () => []);
  const firstReach: (number | null)[][] = [1, 2, 3, 4].map(() => []);
  const practice = { w: 0, d: 0, l: 0, n: 0 };
  // 相手とのランク差（相手 − 自校）ごとの成績
  const byDiff: Record<string, { w: number; d: number; l: number }> = {};
  const rankByYear: number[][] = Array.from({ length: years }, () => []);
  const winter: Record<string, number> = {};
  const graduatesOverall: number[] = [];
  let practiceMatchesPerYear = 0;

  for (let g = 0; g < games; g++) {
    // 県の区分がばらけるように、都道府県を順番に使う
    const pref = PREFECTURES[(g * 7) % PREFECTURES.length].id;
    const state = newGame(`season-${g}`, "検証高校", pref);
    const reached: (number | null)[] = [null, null, null, null];
    for (let y = 0; y < years; y++) {
      const stats = autoplayYears(state, 1, "skilled");
      const lv = state.history.at(-1)!.reputationLevel;
      levelByYear[y].push(lv);
      for (let l = 1; l <= 4; l++) if (lv >= l && reached[l - 1] === null) reached[l - 1] = y + 1;
      const pm = stats.matches.filter((m) => m.kind === "practice");
      practiceMatchesPerYear += pm.length;
      rankByYear[y].push(rankIndex(state.history.at(-1)!.rank));
      for (const m of stats.matches) {
        const key = m.rankDiff >= 2 ? "+2以上" : m.rankDiff <= -2 ? "-2以下" : m.rankDiff > 0 ? `+${m.rankDiff}` : `${m.rankDiff}`;
        const r = (byDiff[key] ??= { w: 0, d: 0, l: 0 });
        if (m.result === "win") r.w++;
        else if (m.result === "draw") r.d++;
        else r.l++;
      }
      for (const m of pm) {
        practice.n++;
        if (m.result === "win") practice.w++;
        else if (m.result === "draw") practice.d++;
        else practice.l++;
      }
      const res = state.history.at(-1)!.winterResult.replace(/^.*?(県予選|都予選|府予選|道予選|予選)/, "予選").replace(/冬の全国大会 /, "全国 ");
      winter[res] = (winter[res] ?? 0) + 1;
    }
    for (let l = 0; l < 4; l++) firstReach[l].push(reached[l]);
    // 初期の部員を除いた、一般入部の卒業生（4 年目以降の卒業）
    for (const a of state.alumni) if (a.graduatedYear >= 4) graduatesOverall.push(a.overall);
  }

  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  console.log(`\n=== 評判の推移（うまい采配の自動プレイ ${games}校 × ${years}年） ===`);
  console.log("| 年目の終わり | 弱小 | そこそこ | 中堅 | 強豪 | 名門 | 自校のランク（平均） |");
  console.log("|---|---|---|---|---|---|---|");
  for (let y = 0; y < years; y++) {
    const counts = [0, 0, 0, 0, 0];
    for (const lv of levelByYear[y]) counts[lv]++;
    const avgRank = rankByYear[y].reduce((s, x) => s + x, 0) / rankByYear[y].length;
    console.log(`| ${y + 1}年目 | ${counts.map((c) => pct(c / games)).join(" | ")} | ${SCHOOL_RANKS[Math.round(avgRank)]}（${avgRank.toFixed(1)}） |`);
  }
  console.log("\n| 評判 | 初めて届いた年（中央値） | 届いた割合 | 目標 |");
  console.log("|---|---|---|---|");
  const targets = ["1〜2年", "3〜5年", "—", "10年前後"];
  for (let l = 0; l < 4; l++) {
    const xs = firstReach[l].filter((x): x is number => x !== null).sort((a, b) => a - b);
    const median = xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null;
    const all = firstReach[l].map((x) => x ?? 999).sort((a, b) => a - b);
    const medAll = all[Math.floor((all.length - 1) / 2)];
    console.log(
      `| ${REPUTATION_NAMES[(l + 1) as ReputationLevel]} | ${medAll === 999 ? `${years}年では届かない` : `${medAll}年目`}（届いた学校だけなら ${median ?? "—"}年目） | ${pct(xs.length / games)} | ${targets[l]} |`,
    );
  }
  console.log(`\n練習試合：年平均 ${(practiceMatchesPerYear / (games * years)).toFixed(1)}試合、${practice.w}勝${practice.d}分${practice.l}敗（勝率 ${pct(practice.w / practice.n)}）`);
  console.log("相手とのランク差ごとの成績（全試合。差 = 相手 − 自校）：");
  for (const k of ["-2以下", "-1", "0", "+1", "+2以上"]) {
    const r = byDiff[k];
    if (r) console.log(`  ${k}: ${r.w}勝${r.d}分${r.l}敗（勝率 ${pct(r.w / (r.w + r.d + r.l))}）`);
  }
  console.log("冬の全国大会の成績（全年度）：");
  for (const [k, v] of Object.entries(winter).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

  const share = (f: (x: number) => boolean) => pct(graduatesOverall.filter(f).length / Math.max(1, graduatesOverall.length));
  console.log(`\n=== 成長（一般入部の卒業生 ${graduatesOverall.length}人。卒業時の総合値） ===`);
  console.log("| 項目 | 結果 | 目標 |");
  console.log("|---|---|---|");
  const avg = graduatesOverall.reduce((s, x) => s + x, 0) / Math.max(1, graduatesOverall.length);
  console.log(`| 平均 | ${avg.toFixed(1)}（${statRank(avg)}） | — |`);
  console.log(`| 総合B以上 | ${share((x) => x >= 70)} | 5〜8% |`);
  console.log(`| 総合C以上 | ${share((x) => x >= 60)} | — |`);
  console.log(`| 総合A以上 | ${share((x) => x >= 80)} | — |`);
  console.log(`(計算時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒)`);
}
