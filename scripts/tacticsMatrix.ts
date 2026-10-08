import { PRACTICE_RULES } from "../src/engine/config/competitions";
import { TACTIC_STYLE_IDS, TACTIC_STYLES, type TacticStyleId } from "../src/engine/config/tactics";
import { createMatch, simulateToEnd } from "../src/engine/match/engine";
import { autoSetup } from "../src/engine/match/lineup";
import { Rng } from "../src/engine/rng";
import { generateCpuRoster } from "../src/engine/school/generate";
import { TACTICS_LABELS } from "../src/engine/config/names";
import type { Player, Tactics } from "../src/engine/types";

/**
 * 戦術の相性表（同じ強さのチームどうし。行の型が列の型と戦ったときの勝率）。
 * 同じ選手の集団から両チームを選び、フォーメーションは 4-4-2 に固定して戦術の差だけを見る。
 */
export function tacticsMatrix(n: number, seed = "tactics", withCombos = true) {
  const rng = Rng.fromSeed(seed);
  const pool: Player[][] = Array.from({ length: 60 }, () => generateCpuRoster(rng, 2, 1));
  const play = (ta: Tactics, tb: Tactics) => {
    let w = 0, d = 0, l = 0;
    for (let i = 0; i < n; i++) {
      const a = rng.pick(pool);
      const b = rng.pick(pool);
      const s = simulateToEnd(
        createMatch(
          PRACTICE_RULES,
          rng,
          { schoolId: "a", name: "A", rank: "C", isUser: false, players: a, setup: autoSetup(a, "4-4-2", ta) },
          { schoolId: "b", name: "B", rank: "C", isUser: false, players: b, setup: autoSetup(b, "4-4-2", tb) },
        ),
      );
      if (s.score[0] > s.score[1]) w++;
      else if (s.score[0] < s.score[1]) l++;
      else d++;
    }
    return { w: w / n, d: d / n, l: l / n };
  };
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const table: Record<string, Record<string, { w: number; d: number; l: number }>> = {};
  for (const a of TACTIC_STYLE_IDS) {
    table[a] = {};
    for (const b of TACTIC_STYLE_IDS) table[a][b] = play(TACTIC_STYLES[a].tactics, TACTIC_STYLES[b].tactics);
  }
  console.log(`\n=== 戦術の相性表（同じ強さ・各 ${n} 試合。行の型の 勝-分-負） ===`);
  console.log(`| 行＼列 | ${TACTIC_STYLE_IDS.map((b) => TACTIC_STYLES[b].name).join(" | ")} | 平均の勝ち点 |`);
  console.log(`|---|${TACTIC_STYLE_IDS.map(() => "---").join("|")}|---|`);
  for (const a of TACTIC_STYLE_IDS) {
    const cells = TACTIC_STYLE_IDS.map((b) => {
      const r = table[a][b];
      return `${pct(r.w)}-${pct(r.d)}-${pct(r.l)}`;
    });
    const pts = TACTIC_STYLE_IDS.reduce((s, b) => s + 3 * table[a][b].w + table[a][b].d, 0) / TACTIC_STYLE_IDS.length;
    console.log(`| ${TACTIC_STYLES[a].name} | ${cells.join(" | ")} | ${pts.toFixed(2)} |`);
  }
  // どの型にも、勝ち越せない相手がいるか（最強の型がないか）
  const noDominant = TACTIC_STYLE_IDS.every((a) => TACTIC_STYLE_IDS.some((b) => b !== a && table[a][b].w <= table[a][b].l));
  console.log(`どの型にも苦手な相手がいる：${noDominant ? "OK" : "NG"}`);

  if (!withCombos) return { table, noDominant };
  // 型以外の組み合わせ（36 通り）も、4 つの型を相手にした平均で突出していないか
  const combos: Tactics[] = [];
  for (const attack of ["attacking", "balanced", "defensive"] as const)
    for (const buildUp of ["buildUp", "long"] as const)
      for (const press of ["high", "mid", "low"] as const) for (const line of ["high", "low"] as const) combos.push({ attack, buildUp, press, line });
  const m = Math.max(60, Math.floor(n / 4));
  const playN = (ta: Tactics, tb: Tactics, k: number) => {
    let w = 0, d = 0, l = 0;
    for (let i = 0; i < k; i++) {
      const a = rng.pick(pool);
      const b = rng.pick(pool);
      const s = simulateToEnd(
        createMatch(
          PRACTICE_RULES,
          rng,
          { schoolId: "a", name: "A", rank: "C", isUser: false, players: a, setup: autoSetup(a, "4-4-2", ta) },
          { schoolId: "b", name: "B", rank: "C", isUser: false, players: b, setup: autoSetup(b, "4-4-2", tb) },
        ),
      );
      if (s.score[0] > s.score[1]) w++;
      else if (s.score[0] < s.score[1]) l++;
      else d++;
    }
    return { w: w / k, d: d / k, l: l / k };
  };
  const scored = combos
    .map((t) => {
      let pts = 0;
      let losingMatchups = 0;
      for (const b of TACTIC_STYLE_IDS) {
        const r = playN(t, TACTIC_STYLES[b].tactics, m);
        pts += 3 * r.w + r.d;
        if (r.w < r.l) losingMatchups++;
      }
      return { t, pts: pts / TACTIC_STYLE_IDS.length, losingMatchups };
    })
    .sort((x, y) => y.pts - x.pts);
  const label = (t: Tactics) => `${TACTICS_LABELS.attack[t.attack]}・${TACTICS_LABELS.buildUp[t.buildUp]}・プレス${TACTICS_LABELS.press[t.press]}・ライン${TACTICS_LABELS.line[t.line]}`;
  console.log(`\n戦術の全組み合わせ（36 通り）を、4 つの型それぞれと戦わせた結果（各 ${m} 試合）。平均の勝ち点の上位 5：`);
  console.log("| 戦術 | 平均の勝ち点 | 負け越す型の数 |");
  console.log("|---|---|---|");
  for (const { t, pts, losingMatchups } of scored.slice(0, 5)) console.log(`| ${label(t)} | ${pts.toFixed(2)} | ${losingMatchups} |`);
  const unbeatable = scored.filter((x) => x.losingMatchups === 0).length;
  console.log(`どの型にも負け越さない組み合わせ：${unbeatable}通り（最下位の平均の勝ち点 ${scored.at(-1)!.pts.toFixed(2)}、同じ強さどうしの平均は約 1.4）`);
  return { table, noDominant };
}

export type { TacticStyleId };
