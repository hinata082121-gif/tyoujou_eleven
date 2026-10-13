/**
 * Phase 2b の balance 項目（docs/PHASE2B_PLAN.md 9.2）。
 * - 卒業生の特殊能力（プラスの数・金色・両利き）と総合値の分布（評判の推移の自動プレイの卒業生）
 * - スタイル別の貢献（出場時の得点・アシスト・奪取・空中戦、80 分あたり）と、1 人のスタイルだけを変えたチームの勝率
 * - 動きの範囲ごとの、担当ゾーン以外への関与の割合
 * - キャプテンの効果量・金色 1 人の効果
 * 同じチームの比較は、どの設定でも同じ種（チーム・相手・試合）を使い、設定の差だけが出るようにする。
 */
import { WINTER_RULES } from "../src/engine/config/competitions";
import { FORMATIONS, type Slot } from "../src/engine/config/formations";
import { MOVEMENT_NAMES, PERSONALITY_NAMES, PLAY_STYLE_NAMES, SKILL_NAMES } from "../src/engine/config/names";
import { PLAY_STYLE_DEFS } from "../src/engine/config/playStyle";
import { SKILL_DEFS } from "../src/engine/config/skills";
import { createMatch, simulateToEnd, type TeamInput } from "../src/engine/match/engine";
import { effectiveMovement, laneAffinity } from "../src/engine/match/lanes";
import { autoSetup, DEFAULT_TACTICS } from "../src/engine/match/lineup";
import type { MatchState } from "../src/engine/match/types";
import { statRank } from "../src/engine/player/rank";
import { Rng } from "../src/engine/rng";
import { generateCpuRoster } from "../src/engine/school/generate";
import { goldCount, plusCount } from "../src/engine/skills";
import { PERSONALITIES, PLAY_STYLES, type Alumnus, type MovementRange, type Personality, type Player, type PlayStyle, type SkillId } from "../src/engine/types";

const FORMATION = "4-4-2";
const SLOTS = FORMATIONS[FORMATION];
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const PRESTIGE = 3;

function teamInput(seed: string, prep?: (players: Player[], lineup: string[]) => string | void): TeamInput {
  const players = generateCpuRoster(Rng.fromSeed(seed), PRESTIGE, 1);
  const setup = autoSetup(players, FORMATION, { ...DEFAULT_TACTICS });
  const captainId = prep?.(players, setup.lineup) ?? undefined;
  return { schoolId: seed, name: seed, rank: "C", isUser: false, players, setup, captainId };
}

/** 同じ種で n 試合して、勝ち点の率（勝ち 1・引き分け 0.5。試合時間内）を返す */
function pointsRate(n: number, tag: string, prep: (players: Player[], lineup: string[]) => string | void): number {
  let pts = 0;
  for (let i = 0; i < n; i++) {
    const s = simulateToEnd(createMatch(WINTER_RULES.early, Rng.fromSeed(`${tag}m${i}`), teamInput(`${tag}h${i}`, prep), teamInput(`${tag}o${i}`)));
    pts += s.score[0] > s.score[1] ? 1 : s.score[0] === s.score[1] ? 0.5 : 0;
  }
  return pts / n;
}

const slotIndex = (pos: Slot["pos"]) => SLOTS.findIndex((s) => s.pos === pos);

// ================= 卒業生 =================

export function graduateSkillTable(grads: Alumnus[]) {
  const n = grads.length;
  console.log(`\n=== Phase 2b：卒業生の特殊能力と総合値（評判の推移の自動プレイの一般入部の卒業生 ${n}人） ===`);
  if (n === 0) return;
  const plus = grads.map(plusCount);
  const avgPlus = plus.reduce((s, x) => s + x, 0) / n;
  const gold = grads.filter((a) => goldCount(a) > 0).length / n;
  const both = grads.filter((a) => a.skills.includes("footG")).length / n;
  const double = grads.filter((a) => a.skills.some((s) => SKILL_DEFS[s].tier === "double")).length / n;
  const minus = grads.filter((a) => a.skills.some((s) => SKILL_DEFS[s].tier === "minus")).length / n;
  console.log("| 項目 | 結果 | 目標 | 判定 |");
  console.log("|---|---|---|---|");
  console.log(`| プラスの特殊能力の数（平均） | ${avgPlus.toFixed(2)}個 | 1〜3個 | ${avgPlus >= 1 && avgPlus <= 3 ? "OK" : "NG"} |`);
  console.log(`| 金色を1つ以上持って卒業する割合 | ${pct(gold)} | 数%（2〜5%） | ${gold >= 0.01 && gold <= 0.06 ? "OK" : "NG"} |`);
  console.log(`| 両利きを持って卒業する割合 | ${pct(both, 2)} | ごくまれ（1%未満） | ${both < 0.01 ? "OK" : "NG"} |`);
  console.log(`| ◎を1つ以上持って卒業する割合 | ${pct(double)} | — | — |`);
  console.log(`| ×を持ったまま卒業する割合 | ${pct(minus)} | — | — |`);
  const hist: number[] = [];
  for (const c of plus) hist[Math.min(c, 6)] = (hist[Math.min(c, 6)] ?? 0) + 1;
  console.log(`プラスの数の分布：${[0, 1, 2, 3, 4, 5, 6].map((c) => `${c === 6 ? "6以上" : c}個 ${pct((hist[c] ?? 0) / n, 0)}`).join("・")}`);
  const golds: Record<string, number> = {};
  for (const a of grads) for (const s of a.skills) if (SKILL_DEFS[s].tier === "gold") golds[s] = (golds[s] ?? 0) + 1;
  console.log(`金色の内訳：${Object.entries(golds).map(([k, v]) => `${SKILL_NAMES[k as SkillId]} ${v}`).join("・") || "なし"}`);
  const xs = grads.map((a) => a.overall).sort((a, b) => a - b);
  const q = (p: number) => xs[Math.min(n - 1, Math.floor(p * n))];
  console.log(
    `総合値のパーセンタイル：10% ${q(0.1).toFixed(1)}・50% ${q(0.5).toFixed(1)}（${statRank(q(0.5))}）・90% ${q(0.9).toFixed(1)}・99% ${q(0.99).toFixed(1)}・最高 ${xs[n - 1].toFixed(1)}（P2a は総合B以上がスタッフ込みで 9%）`,
  );
}

// ================= スタイル別の貢献（出場時の数字） =================

export function styleContributionTable(n: number) {
  const t0 = Date.now();
  const agg = new Map<PlayStyle, { min: number; goals: number; assists: number; steals: number; aerial: number }>();
  // 動きの範囲ごとの関与（担当 = 関わりやすさ 0.5 以上のレーン）
  const zone = new Map<MovementRange, { all: number; out: number }>();
  for (let i = 0; i < n; i++) {
    const home = teamInput(`sc${i}h`);
    const away = teamInput(`sc${i}o`);
    const s: MatchState = simulateToEnd(createMatch(WINTER_RULES.early, Rng.fromSeed(`sc${i}`), home, away));
    s.teams.forEach((t, side) => {
      for (const mp of Object.values(t.players)) {
        if (!mp.playStyle || !mp.ms || !mp.minutes) continue;
        const a = agg.get(mp.playStyle) ?? { min: 0, goals: 0, assists: 0, steals: 0, aerial: 0 };
        a.min += mp.minutes;
        a.goals += mp.goals;
        a.assists += mp.ms.assists;
        a.steals += mp.ms.steals;
        a.aerial += mp.ms.aerialWins;
        agg.set(mp.playStyle, a);
      }
      // 先発の枠で関与を数える（GK は除く）
      const input = side === 0 ? home : away;
      input.setup.lineup.forEach((id, k) => {
        const slot = SLOTS[k];
        const mp = t.players[id];
        if (!mp?.ms || slot.pos === "GK") return;
        const mv = effectiveMovement(mp.playStyle, slot);
        const aff = laneAffinity(slot.lane, mv, mp.foot ?? "R");
        const [l, c, r] = mp.ms.laneTouches;
        const z = zone.get(mv) ?? { all: 0, out: 0 };
        z.all += l + c + r;
        z.out += (aff.L < 0.5 ? l : 0) + (aff.C < 0.5 ? c : 0) + (aff.R < 0.5 ? r : 0);
        zone.set(mv, z);
      });
    });
  }
  console.log(`\n=== Phase 2b：スタイル別の貢献（同格の試合 ${n}試合の出場時。80分あたり） ===`);
  console.log("| スタイル | 区分 | 出場（80分換算） | 得点 | アシスト | 奪取 | 空中戦の勝ち |");
  console.log("|---|---|---|---|---|---|---|");
  for (const st of PLAY_STYLES) {
    const a = agg.get(st);
    if (!a || a.min === 0) continue;
    const per = (x: number) => ((x / a.min) * 80).toFixed(2);
    console.log(`| ${PLAY_STYLE_NAMES[st]} | ${PLAY_STYLE_DEFS[st].groups.join("・")} | ${(a.min / 80).toFixed(0)} | ${per(a.goals)} | ${per(a.assists)} | ${per(a.steals)} | ${per(a.aerial)} |`);
  }
  console.log("\n動きの範囲ごとの、担当ゾーン以外への関与（先発の枠。担当＝関わりやすさ 0.5 以上のレーン）：");
  console.log("| 動きの範囲 | 関与の数 | 担当外の割合 | 目標 |");
  console.log("|---|---|---|---|");
  for (const mv of ["fixed", "wideOnly", "mostlyWide", "mostlyInside", "free"] as MovementRange[]) {
    const z = zone.get(mv);
    if (!z) continue;
    const strict = mv === "fixed" || mv === "wideOnly";
    const r = z.out / Math.max(1, z.all);
    console.log(`| ${MOVEMENT_NAMES[mv]} | ${z.all} | ${pct(r)} | ${strict ? `1割未満 ${r < 0.1 ? "OK" : "NG"}` : "—"} |`);
  }
  console.log(`(計算時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒)`);
}

// ================= 1 人のスタイルだけを変えたチームの勝率 =================

/** 枠ごとに比べるスタイル（その枠のポジションが区分に入るもの） */
const STYLE_SLOTS: { pos: Slot["pos"]; styles: PlayStyle[] }[] = [
  { pos: "CF", styles: ["striker", "postPlayer", "speedster", "linkman", "poacher"] },
  { pos: "WG", styles: ["wingDribbler", "insideDribbler", "crosser", "speedster"] },
  { pos: "CMF", styles: ["number10", "boxToBox", "anchor", "ballHunter", "insideDribbler"] },
  { pos: "CB", styles: ["stopper", "coverer", "buildUpDefender", "launcher"] },
  { pos: "SB", styles: ["attackingFullback", "crosser", "stopper", "coverer"] },
  { pos: "GK", styles: ["boxKeeper", "sweeperKeeper", "aerialKeeper"] },
];

export function styleWinTable(n: number) {
  const t0 = Date.now();
  console.log(`\n=== Phase 2b：1 人のスタイルだけを変えたチームの勝ち点の率（同格 ${n}試合ずつ・熟練度 100。勝ち 1・引き分け 0.5） ===`);
  console.log("| 枠 | スタイル | 勝ち点の率 | 枠の平均との差 | 判定（±3pt 以内） |");
  console.log("|---|---|---|---|---|");
  let ok = true;
  for (const { pos, styles } of STYLE_SLOTS) {
    const k = slotIndex(pos);
    const rates = styles.map((st) =>
      pointsRate(n, `st${pos}`, (players, lineup) => {
        const p = players.find((x) => x.id === lineup[k])!;
        p.playStyle = st;
        p.styleProficiency = 100;
      }),
    );
    const mean = rates.reduce((s, x) => s + x, 0) / rates.length;
    styles.forEach((st, i) => {
      const d = (rates[i] - mean) * 100;
      const good = Math.abs(d) <= 3;
      ok &&= good;
      console.log(`| ${pos} | ${PLAY_STYLE_NAMES[st]} | ${pct(rates[i])} | ${d >= 0 ? "+" : ""}${d.toFixed(1)}pt | ${good ? "OK" : "NG"} |`);
    });
  }
  console.log(`突出したスタイル：${ok ? "なし" : "あり（上の NG）"}`);
  console.log(`(計算時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒)`);
}

// ================= キャプテン・金色 =================

const stripLine = (p: Player, line: string) => (p.skills = p.skills.filter((s) => SKILL_DEFS[s].line !== line));

export function captainTable(n: number) {
  const t0 = Date.now();
  const k = slotIndex("CMF");
  const base = pointsRate(n, "cap", () => undefined);
  const row = (label: string, personality: Personality, captaincy: SkillId | null) => {
    const r = pointsRate(n, "cap", (players, lineup) => {
      const p = players.find((x) => x.id === lineup[k])!;
      p.personality = personality;
      stripLine(p, "captaincy");
      if (captaincy) p.skills.push(captaincy);
      return p.id;
    });
    const d = (r - base) * 100;
    console.log(`| ${label} | ${pct(r)} | ${d >= 0 ? "+" : ""}${d.toFixed(1)}pt |`);
  };
  console.log(`\n=== Phase 2b：キャプテンの効果量（同じチーム・同格 ${n}試合ずつ。キャプテンは CMF。参考：+1〜3pt 程度） ===`);
  console.log("| キャプテン | 勝ち点の率 | キャプテンなしとの差 |");
  console.log("|---|---|---|");
  console.log(`| なし | ${pct(base)} | — |`);
  for (const pers of PERSONALITIES) row(PERSONALITY_NAMES[pers], pers, null);
  row(`${PERSONALITY_NAMES.diligent}＋${SKILL_NAMES.captaincy1}`, "diligent", "captaincy1");
  row(`${PERSONALITY_NAMES.diligent}＋${SKILL_NAMES.captaincy2}`, "diligent", "captaincy2");
  console.log(`(計算時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒)`);
}

/** 金色 1 人：枠と、その枠に合う金色 */
const GOLD_CASES: { pos: Slot["pos"]; id: SkillId }[] = [
  { pos: "CF", id: "oneOnOneG" },
  { pos: "CF", id: "headingG" },
  { pos: "CB", id: "duelG" },
  { pos: "CB", id: "aerialDefG" },
  { pos: "GK", id: "gkOneOnOneG" },
  { pos: "GK", id: "feedG" },
  { pos: "CMF", id: "fkMaster" },
  { pos: "CMF", id: "ckMaster" },
  { pos: "WG", id: "crossMaster" },
  { pos: "CF", id: "pkG" },
  { pos: "WG", id: "footG" },
];

export function goldTable(n: number) {
  const t0 = Date.now();
  const base = pointsRate(n, "gold", () => undefined);
  console.log(`\n=== Phase 2b：金色 1 人の効果（同じチーム・同格 ${n}試合ずつ。目標：平均 +2pt 前後） ===`);
  console.log("| 枠 | 金色 | 勝ち点の率 | 持たないチームとの差 |");
  console.log("|---|---|---|---|");
  console.log(`| — | なし | ${pct(base)} | — |`);
  const diffs: number[] = [];
  for (const { pos, id } of GOLD_CASES) {
    const k = slotIndex(pos);
    const r = pointsRate(n, "gold", (players, lineup) => {
      const p = players.find((x) => x.id === lineup[k])!;
      const line = SKILL_DEFS[id].line;
      if (line) stripLine(p, line);
      if (id === "footG") p.skills = p.skills.filter((s) => s !== "footX");
      p.skills.push(id);
    });
    const d = (r - base) * 100;
    diffs.push(d);
    console.log(`| ${pos} | ${SKILL_NAMES[id]} | ${pct(r)} | ${d >= 0 ? "+" : ""}${d.toFixed(1)}pt |`);
  }
  const avg = diffs.reduce((s, x) => s + x, 0) / diffs.length;
  console.log(`金色 1 人の効果（平均）：${avg >= 0 ? "+" : ""}${avg.toFixed(1)}pt（目標 +2pt 前後。${avg >= 1.5 && avg <= 2.5 ? "OK" : avg >= 1 && avg <= 3 ? "ほぼ" : "NG"}）・最大 +${Math.max(...diffs).toFixed(1)}pt`);
  console.log(`(計算時間 ${((Date.now() - t0) / 1000).toFixed(1)} 秒)`);
}
