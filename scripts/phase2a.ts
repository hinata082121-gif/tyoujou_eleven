/**
 * Phase 2a の項目（docs/PHASE2A_PLAN.md 10.2）：カード・ケガ、PK のスカウティング、作戦ノート、スタッフと成長。
 */
import { WINTER_RULES } from "../src/engine/config/competitions";
import { STAFF_EFFECTS } from "../src/engine/config/staff";
import { STYLE_WEIGHTS, TACTIC_STYLE_IDS, TACTIC_STYLES } from "../src/engine/config/tactics";
import { PREFECTURES } from "../src/engine/config/names";
import { newGame } from "../src/engine/game";
import { autoplayYears, type AutoplayOptions } from "../src/engine/game/autoplay";
import { createMatch, simulateToEnd, stepPk, type TeamInput } from "../src/engine/match/engine";
import { autoSetup } from "../src/engine/match/lineup";
import type { MatchState } from "../src/engine/match/types";
import { templateNote } from "../src/engine/note";
import { Rng } from "../src/engine/rng";
import { generateCpuRoster } from "../src/engine/school/generate";
import { rankFromStrength, teamStrength } from "../src/engine/school/strength";
import { cardStats } from "./cards";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

function makeTeam(rng: Rng, id: string, prestige: number, extra: Partial<TeamInput> = {}): TeamInput {
  const players = generateCpuRoster(rng, prestige, 1);
  const st = TACTIC_STYLES[rng.weighted(TACTIC_STYLE_IDS, (s) => STYLE_WEIGHTS[s])];
  return { schoolId: id, name: id, rank: rankFromStrength(teamStrength(players)), isUser: false, players, setup: autoSetup(players, rng.pick(st.formations), { ...st.tactics }), ...extra };
}

/** PK 戦だけを行う（試合の頭から PK 戦に入る） */
function shootout(state: MatchState): 0 | 1 {
  state.phase = "PK";
  state.pk = { order: [[], []], kicks: [], score: [0, 0], done: false };
  while (!state.pk.done) stepPk(state);
  return state.pk.winner!;
}

/** PK 戦の勝率：分析担当の差が最大（100 対 なし）、PK に強い GK */
export function pkTable(n: number) {
  const rng = Rng.fromSeed("pk-table");
  let scoutWin = 0;
  let gkWin = 0;
  let base = 0;
  for (let i = 0; i < n; i++) {
    const prestige = rng.int(0, 5);
    const a = makeTeam(rng, "a", prestige);
    const b = makeTeam(rng, "b", prestige);
    const seed = `pk${i}`;
    // 左右の有利をなくすため、偶数回は先攻・奇数回は後攻にする
    const swap = i % 2 === 1;
    const run = (ta: TeamInput, tb: TeamInput) => {
      const s = createMatch(WINTER_RULES.early, Rng.fromSeed(seed), swap ? tb : ta, swap ? ta : tb);
      const w = shootout(s);
      return swap ? w === 1 : w === 0;
    };
    if (run(a, b)) base++;
    if (run({ ...a, scouting: 100 }, { ...b, scouting: 0 })) scoutWin++;
    // PK に強い GK：先発の GK の PK 駆け引きを +25
    const gkId = a.setup.lineup[0];
    const players = a.players.map((p) => (p.id === gkId ? { ...p, stats: { ...p.stats, pkSkill: Math.min(99, p.stats.pkSkill + 25) } } : p));
    if (run({ ...a, players }, b)) gkWin++;
  }
  console.log(`\n=== PK 戦（${n}回ずつ） ===`);
  console.log("| 条件 | 勝率 | 目標 |");
  console.log("|---|---|---|");
  console.log(`| 同じ条件（基準） | ${pct(base / n)} | 50% |`);
  const sw = scoutWin / n;
  console.log(`| 分析担当の差が最大（スカウティング 100 対 なし、係数 ${STAFF_EFFECTS.pkScouting}） | ${pct(sw)} | 55〜60% ${sw >= 0.55 && sw <= 0.6 ? "OK" : "NG"} |`);
  console.log(`| PK に強い GK（PK 駆け引き +25） | ${pct(gkWin / n)} | 参考 |`);
}

/** 作戦ノート（4 テンプレート）あり・なしの勝ち点の差。同じ試合（同じシード）を、ノートだけ変えて比べる */
export function notesTable(n: number) {
  const rng = Rng.fromSeed("notes-table");
  const res = { user: { on: 0, off: 0, advOn: 0, advOff: 0 }, ai: { on: 0, off: 0, advOn: 0, advOff: 0 } };
  let fired = 0;
  const points = (s: MatchState) => (s.score[0] > s.score[1] ? 3 : s.score[0] === s.score[1] ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const prestige = rng.int(0, 5);
    const a = makeTeam(rng, "a", prestige);
    const b = makeTeam(rng, "b", prestige);
    const note = templateNote(Rng.fromSeed(`n${i}`));
    const withNote = { noteName: note.name, rules: note.rules, kind: "prefQualifier" as const };
    for (const mode of ["user", "ai"] as const) {
      const isUser = mode === "user";
      const play = (useNote: boolean) =>
        simulateToEnd(createMatch(WINTER_RULES.early, Rng.fromSeed(`nm${i}`), { ...a, isUser, note: useNote ? withNote : undefined }, b, "prefQualifier"));
      const on = play(true);
      const off = play(false);
      res[mode].on += points(on);
      res[mode].off += points(off);
      res[mode].advOn += on.winner === 0 ? 1 : 0;
      res[mode].advOff += off.winner === 0 ? 1 : 0;
      if (isUser) fired += on.events.filter((e) => e.type === "note").length;
    }
  }
  console.log(`\n=== 作戦ノート（テンプレート 4 つ）あり・なし（同じ格の相手と同じ試合 ${n}組。トーナメント 80 分） ===`);
  console.log("| 采配 | 勝ち点/試合（なし→あり） | 勝ち上がり率（PK 戦を含む。なし→あり） | 目標 |");
  console.log("|---|---|---|---|");
  for (const [label, k] of [["観戦中に何もしない監督", "user"], ["AI の采配（質 0.6）", "ai"]] as const) {
    const r = res[k];
    const d = (r.advOn - r.advOff) / n;
    console.log(
      `| ${label} | ${(r.off / n).toFixed(3)} → ${(r.on / n).toFixed(3)} | ${pct(r.advOff / n)} → ${pct(r.advOn / n)}（${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}pt） | 参考（プラス） ${d > 0 ? "OK" : "NG"} |`,
    );
  }
  console.log(`ノートが発動したルールの数：1 試合 ${(fired / n).toFixed(2)}`);
}

/** 1 試合あたりのカード・ケガ */
export function cardTable(n: number) {
  const r = cardStats(n);
  const y = r.yellows / r.n;
  const redEvery = r.n / Math.max(1, r.reds);
  console.log(`\n=== カード・ケガ（${r.n}試合。両チーム合計） ===`);
  console.log("| 項目 | 結果 | 目標 |");
  console.log("|---|---|---|");
  console.log(`| ファウル | ${(r.fouls / r.n).toFixed(1)} | 参考 |`);
  console.log(`| イエロー | ${y.toFixed(2)}枚 | 2〜3枚 ${y >= 2 && y <= 3 ? "OK" : "NG"} |`);
  console.log(`| レッド（2枚目のイエローを含む） | ${redEvery.toFixed(0)}試合に1枚 | 数十試合に1枚 ${redEvery >= 15 && redEvery <= 80 ? "OK" : "NG"} |`);
  console.log(`| 試合中のケガ | ${(r.n / Math.max(1, r.injuries)).toFixed(1)}試合に1件 | 参考 |`);
  console.log(`| 交代できず人数が減った | ${(r.n / Math.max(1, r.shortHanded)).toFixed(0)}試合に1回 | 参考 |`);
}

/** スタッフなし／最高のスタッフ 3 人での、一般入部の卒業生の総合 B 以上の割合 */
export function staffGrowthTable(games: number, years: number) {
  const t0 = Date.now();
  const run = (opt: AutoplayOptions) => {
    const xs: number[] = [];
    for (let g = 0; g < games; g++) {
      const state = newGame(`growth-${g}`, "検証高校", PREFECTURES[(g * 7) % PREFECTURES.length].id);
      autoplayYears(state, years, "skilled", opt);
      for (const a of state.alumni) if (!a.fictional && a.graduatedYear >= 4) xs.push(a.overall);
    }
    return xs;
  };
  const none = run({ staff: "none", notes: true });
  const best = run({ staff: "best", notes: true });
  const share = (xs: number[], v: number) => xs.filter((x) => x >= v).length / Math.max(1, xs.length);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  console.log(`\n=== スタッフと成長（${games}校 × ${years}年。一般入部の卒業生の卒業時の総合値） ===`);
  console.log("| スタッフ | 人数 | 平均 | 総合B以上 | 目標 |");
  console.log("|---|---|---|---|---|");
  const bn = share(none, 70);
  const bb = share(best, 70);
  console.log(`| なし（臨時コーチ） | ${none.length} | ${avg(none).toFixed(1)} | ${pct(bn)} | 5〜8% ${bn >= 0.05 && bn <= 0.08 ? "OK" : "NG"} |`);
  console.log(`| 最高（全能力100の3人） | ${best.length} | ${avg(best).toFixed(1)} | ${pct(bb)} | 12%程度まで ${bb <= 0.13 ? "OK" : "NG"} |`);
  console.log(`(計算時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒)`);
}
