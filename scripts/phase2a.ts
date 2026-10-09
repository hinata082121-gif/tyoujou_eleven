/**
 * Phase 2a の項目（docs/PHASE2A_PLAN.md 10.2）：カード・ケガ、PK のスカウティング、作戦ノート、スタッフと成長。
 */
import { WINTER_RULES } from "../src/engine/config/competitions";
import { STAFF_EFFECTS } from "../src/engine/config/staff";
import { STYLE_WEIGHTS, TACTIC_STYLE_IDS, TACTIC_STYLES } from "../src/engine/config/tactics";
import { PREFECTURES } from "../src/engine/config/names";
import { newGame } from "../src/engine/game";
import { autoplayYears, type AutoplayOptions } from "../src/engine/game/autoplay";
import { createMatch, isBreakPhase, isOut, playSegment, resumeFromBreak, simulateToEnd, stepPk, type TeamInput } from "../src/engine/match/engine";
import { evaluateNote } from "../src/engine/match/note";
import { queueSubstitution } from "../src/engine/match/orders";
import { positionRating } from "../src/engine/player/rating";
import { FORMATIONS } from "../src/engine/config/formations";
import { autoSetup } from "../src/engine/match/lineup";
import type { MatchState } from "../src/engine/match/types";
import { templateNote, templateRule, type NoteTemplateId } from "../src/engine/note";
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

// ================= 場面を切り出した比較 =================

/** 指定の分まで進める（休憩は自動で再開） */
function playUntil(s: MatchState, minute: number) {
  while (s.phase !== "END" && s.phase !== "PK" && s.minute < minute) {
    if (isBreakPhase(s)) resumeFromBreak(s);
    else playSegment(s);
  }
}

function finishRegulation(s: MatchState) {
  playUntil(s, Infinity);
}

/** テンプレートのルールをその場で発動させる */
function fireTemplate(s: MatchState, id: NoteTemplateId) {
  s.teams[0].note = { noteName: "比較", rules: [templateRule(id, "r")], kind: "prefQualifier", fired: [], stopped: [] };
  return evaluateNote(s, 0).length > 0;
}

/** 疲れたフィールドプレイヤーを最大 n 人、位置に一番合う控えと代える */
function subTired(s: MatchState, n: number) {
  const team = s.teams[0];
  const slots = FORMATIONS[team.formation];
  const tired = team.onPitch
    .map((id, i) => ({ id, i, st: team.players[id].stamina }))
    .filter((x) => x.i !== 0 && !isOut(team.players[x.id]))
    .sort((a, b) => a.st - b.st)
    .slice(0, n);
  let made = 0;
  for (const t of tired) {
    const pendingIn = new Set(team.pending?.subs.map((x) => x.in) ?? []);
    const cands = team.bench.filter((id) => !pendingIn.has(id) && team.players[id].mainPosition !== "GK");
    if (!cands.length) break;
    const pos = slots[t.i].pos;
    const best = cands.reduce((b, id) => (positionRating(team.players[id], pos) > positionRating(team.players[b], pos) ? id : b), cands[0]);
    if (queueSubstitution(s, 0, t.id, best) === null) made++;
  }
  return made;
}

/**
 * 1. 1 点リードで残り 10 分：逃げ切りあり・なしで、勝ち切る確率
 * 2. 1 点ビハインドで残り 10 分：パワープレイあり・なしで、追いつく確率
 * 3. 残り 20 分：疲れた選手 3 人を代える・代えないで、その後の得失点
 * 自校は観戦中に何もしない監督（それまで交代もしていない）、相手は AI の采配。同じ試合を枝分かれさせて比べる。
 */
export function scenarioTable(n: number) {
  const rng = Rng.fromSeed("scenario");
  const r = { lead: [0, 0], behind: [0, 0], leadConcede: [0, 0], behindConcede: [0, 0], leadScore: [0, 0], fresh: [0, 0, 0, 0], leadFired: 0, behindFired: 0 };
  const total = WINTER_RULES.early.halfMinutes * 2;
  for (let i = 0; i < n; i++) {
    const prestige = rng.int(0, 5);
    const a = makeTeam(rng, "a", prestige, { isUser: true });
    const b = makeTeam(rng, "b", prestige);
    const base = createMatch(WINTER_RULES.early, Rng.fromSeed(`sc${i}`), a, b, "prefQualifier");
    // ---- 残り 20 分：疲れた選手の交代 ----
    playUntil(base, total - 20);
    for (const sub of [false, true]) {
      const s = structuredClone(base);
      const before = [...s.score];
      if (sub) subTired(s, 3);
      finishRegulation(s);
      const k = sub ? 2 : 0;
      r.fresh[k] += s.score[0] - before[0];
      r.fresh[k + 1] += s.score[1] - before[1];
    }
    // ---- 残り 10 分：1 点リード／1 点ビハインド ----
    playUntil(base, total - 10);
    for (const [kind, score] of [["lead", [1, 0]], ["behind", [0, 1]]] as const) {
      for (const use of [false, true]) {
        const s = structuredClone(base);
        s.score = [score[0], score[1]];
        if (use && fireTemplate(s, kind === "lead" ? "holdLead" : "powerPlay")) r[kind === "lead" ? "leadFired" : "behindFired"]++;
        finishRegulation(s);
        const ok = kind === "lead" ? s.score[0] > s.score[1] : s.score[0] >= s.score[1];
        if (ok) r[kind][use ? 1 : 0]++;
        const conceded = s.score[1] > score[1];
        if (conceded) r[kind === "lead" ? "leadConcede" : "behindConcede"][use ? 1 : 0]++;
        if (kind === "lead" && s.score[0] > score[0]) r.leadScore[use ? 1 : 0]++;
      }
    }
  }
  const p = (x: number) => pct(x / n);
  const d = (xs: number[]) => `${xs[1] - xs[0] >= 0 ? "+" : ""}${(((xs[1] - xs[0]) / n) * 100).toFixed(1)}pt`;
  console.log(`\n=== 場面の比較（同じ格・同じ試合を枝分かれ ${n}組。自校は何もしない監督、相手は AI） ===`);
  console.log("| 場面 | なし | あり | 差 | 目安 |");
  console.log("|---|---|---|---|---|");
  const ok = (xs: number[], sign = 1) => ((xs[1] - xs[0]) * sign) / n >= 0.03 ? "OK" : "NG";
  console.log(`| 1点リード・残り10分：勝ち切る（逃げ切り） | ${p(r.lead[0])} | ${p(r.lead[1])} | ${d(r.lead)} | 数ポイント以上 ${ok(r.lead)} |`);
  console.log(`|  　同：失点する | ${p(r.leadConcede[0])} | ${p(r.leadConcede[1])} | ${d(r.leadConcede)} | 減る |`);
  console.log(`|  　同：追加点を取る | ${p(r.leadScore[0])} | ${p(r.leadScore[1])} | ${d(r.leadScore)} | 減る（代償） |`);
  console.log(`| 1点ビハインド・残り10分：追いつく（パワープレイ） | ${p(r.behind[0])} | ${p(r.behind[1])} | ${d(r.behind)} | 数ポイント以上 ${ok(r.behind)} |`);
  console.log(`|  　同：さらに失点する | ${p(r.behindConcede[0])} | ${p(r.behindConcede[1])} | ${d(r.behindConcede)} | 増える（代償） |`);
  const gd0 = (r.fresh[0] - r.fresh[1]) / n;
  const gd1 = (r.fresh[2] - r.fresh[3]) / n;
  console.log(
    `| 残り20分：疲れた3人を交代（得点−失点／試合） | ${(r.fresh[0] / n).toFixed(3)}−${(r.fresh[1] / n).toFixed(3)} | ${(r.fresh[2] / n).toFixed(3)}−${(r.fresh[3] / n).toFixed(3)} | 得失点差 ${gd1 - gd0 >= 0 ? "+" : ""}${(gd1 - gd0).toFixed(3)} | プラス ${gd1 - gd0 >= 0.05 ? "OK" : "NG"} |`,
  );
  console.log(`ルールが発動した割合：逃げ切り ${p(r.leadFired)}・パワープレイ ${p(r.behindFired)}`);
}
