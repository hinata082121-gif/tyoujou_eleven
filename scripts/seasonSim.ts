import { FACILITY_NAMES, PREFECTURES, REPUTATION_NAMES } from "../src/engine/config/names";
import { newGame } from "../src/engine/game";
import { autoplayYears } from "../src/engine/game/autoplay";
import { statRank } from "../src/engine/player/rank";
import { rankIndex } from "../src/engine/school/strength";
import { FACILITY_IDS, SCHOOL_RANKS, type Alumnus, type ReputationLevel } from "../src/engine/types";
import { staffAge } from "../src/engine/staff";
import { STAFF_LIFE } from "../src/engine/config/staff";
import { isGold } from "../src/engine/skills";

/**
 * 何年分も自動で遊んで、評判の推移と成長を測る（SPEC 14章）。
 * ある程度うまい采配をする自動プレイ（skilled）を使う。
 * P2c：学校を分けて並列に集め（collectSeasons）、まとめて表にする（mergeSeasons → reportSeasons）。
 */
export interface SeasonData {
  games: number;
  years: number;
  /** levelByYear[y] = y 年目の終わりの評判（学校ごと） */
  levelByYear: number[][];
  /** firstReach[l] = 評判 l+1 に初めて届いた年（学校ごと。届かなければ null） */
  firstReach: (number | null)[][];
  practice: { w: number; d: number; l: number; n: number };
  /** 相手とのランク差（相手 − 自校）ごとの成績（公式戦・練習試合の全部） */
  byDiff: Record<string, { w: number; d: number; l: number }>;
  rankByYear: number[][];
  winter: Record<string, number>;
  summer: Record<string, number>;
  rookie: Record<string, number>;
  graduates: Alumnus[];
  practiceMatches: number;
  turnover: { hired: number; retired: number; poached: number; other: number; tempYears: number; staffYears: number; maxAbility: number };
  /** P2c：評判ごとの特待生の数（[年数, 人数]） */
  scholarsByLevel: Record<string, [number, number]>;
  /** P2c：facilityByYear[y] = y 年目の終わりの設備の合計レベル（学校ごと）。facilityMax[id] = 12 年目の終わりの各設備 */
  facilityByYear: number[][];
  facilityEnd: Record<string, number[]>;
  /** P2c：合宿ごとの、1 人あたりの総合の伸びと、身につけた特殊能力の数（1 回あたり） */
  camps: Record<string, { n: number; gain: number; players: number; learned: number; gold: number }>;
}

const emptyData = (games: number, years: number): SeasonData => ({
  games,
  years,
  levelByYear: Array.from({ length: years }, () => []),
  firstReach: [1, 2, 3, 4].map(() => []),
  practice: { w: 0, d: 0, l: 0, n: 0 },
  byDiff: {},
  rankByYear: Array.from({ length: years }, () => []),
  winter: {},
  summer: {},
  rookie: {},
  graduates: [],
  practiceMatches: 0,
  turnover: { hired: 0, retired: 0, poached: 0, other: 0, tempYears: 0, staffYears: 0, maxAbility: 0 },
  scholarsByLevel: {},
  facilityByYear: Array.from({ length: years }, () => []),
  facilityEnd: {},
  camps: {},
});

/** 成績の文字列を、県の名前を除いた短い形にする */
const shortResult = (s: string | undefined) =>
  (s ?? "—")
    .replace(/^.*?(県予選|都予選|府予選|道予選|予選)/, "予選")
    .replace(/^.*?(県大会|都大会|府大会|道大会)/, "県大会")
    .replace(/^.*?(地域大会|全道大会)/, "地域大会")
    .replace(/(冬|夏)の全国大会 /, "全国 ")
    .replace(/^.*代表$/, "代表");

/** 学校 from〜to-1 を years 年ずつ遊ぶ（学校の番号で都道府県と種が決まる） */
export function collectSeasons(from: number, to: number, years: number): SeasonData {
  const d = emptyData(to - from, years);
  const turnover = d.turnover;
  for (let g = from; g < to; g++) {
    // 県の区分がばらけるように、都道府県を順番に使う
    const pref = PREFECTURES[(g * 7) % PREFECTURES.length].id;
    const state = newGame(`season-${g}`, "検証高校", pref);
    const reached: (number | null)[] = [null, null, null, null];
    for (let y = 0; y < years; y++) {
      const before = new Map(state.staff.members.filter((m) => !m.temporary).map((m) => [m.id, m]));
      const stats = autoplayYears(state, 1, "skilled");
      const after = new Set(state.staff.members.map((m) => m.id));
      // 年度の途中に雇った人も数えるため、在任した人は記録から数える
      for (const m of state.staff.members) if (!m.temporary && m.hiredYear >= state.year - 1 && !before.has(m.id)) turnover.hired++;
      for (const [id, m] of before) {
        if (after.has(id)) continue;
        if (m.poachNotice) turnover.poached++;
        else if (staffAge(m, state.year - 1) >= STAFF_LIFE.retireFromAge) turnover.retired++;
        else turnover.other++;
      }
      turnover.staffYears++;
      if (state.staff.members.some((m) => m.role === "head" && m.temporary)) turnover.tempYears++;
      for (const m of state.staff.members) turnover.maxAbility = Math.max(turnover.maxAbility, ...Object.values(m.abilities));
      const h = state.history.at(-1)!;
      const lv = h.reputationLevel;
      d.levelByYear[y].push(lv);
      for (let l = 1; l <= 4; l++) if (lv >= l && reached[l - 1] === null) reached[l - 1] = y + 1;
      const pm = stats.matches.filter((m) => m.kind === "practice");
      d.practiceMatches += pm.length;
      d.rankByYear[y].push(rankIndex(h.rank));
      for (const m of stats.matches) {
        const key = m.rankDiff >= 2 ? "+2以上" : m.rankDiff <= -2 ? "-2以下" : m.rankDiff > 0 ? `+${m.rankDiff}` : `${m.rankDiff}`;
        const r = (d.byDiff[key] ??= { w: 0, d: 0, l: 0 });
        if (m.result === "win") r.w++;
        else if (m.result === "draw") r.d++;
        else r.l++;
      }
      for (const m of pm) {
        d.practice.n++;
        if (m.result === "win") d.practice.w++;
        else if (m.result === "draw") d.practice.d++;
        else d.practice.l++;
      }
      const bump = (rec: Record<string, number>, k: string) => (rec[k] = (rec[k] ?? 0) + 1);
      bump(d.winter, shortResult(h.winterResult));
      bump(d.summer, shortResult(h.summerResult));
      bump(d.rookie, shortResult(h.rookieResult));
      for (const sc of stats.scholars) {
        const e = (d.scholarsByLevel[sc.level] ??= [0, 0]);
        e[0]++;
        e[1] += sc.count;
      }
      d.facilityByYear[y].push(FACILITY_IDS.reduce((s, id) => s + state.facilities[id], 0));
      for (const c of stats.camps) {
        const e = (d.camps[c.season] ??= { n: 0, gain: 0, players: 0, learned: 0, gold: 0 });
        e.n++;
        e.players += c.growth.length;
        e.gain += c.growth.reduce((s, x) => s + x.overallGain, 0);
        e.learned += c.learned.length;
        e.gold += c.learned.filter((l) => isGold(l.skill)).length;
      }
    }
    for (const id of FACILITY_IDS) (d.facilityEnd[id] ??= []).push(state.facilities[id]);
    for (let l = 0; l < 4; l++) d.firstReach[l].push(reached[l]);
    // 初期の部員を除いた、一般入部の卒業生（4 年目以降の卒業）
    for (const a of state.alumni) if (a.graduatedYear >= 4 && !a.fictional) d.graduates.push(a);
  }
  return d;
}

/** 並列に集めた結果をまとめる */
export function mergeSeasons(parts: SeasonData[]): SeasonData {
  const out = emptyData(0, parts[0].years);
  const addRec = (a: Record<string, number>, b: Record<string, number>) => {
    for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v;
  };
  for (const p of parts) {
    out.games += p.games;
    p.levelByYear.forEach((xs, y) => out.levelByYear[y].push(...xs));
    p.rankByYear.forEach((xs, y) => out.rankByYear[y].push(...xs));
    p.facilityByYear.forEach((xs, y) => out.facilityByYear[y].push(...xs));
    p.firstReach.forEach((xs, l) => out.firstReach[l].push(...xs));
    for (const k of ["w", "d", "l", "n"] as const) out.practice[k] += p.practice[k];
    for (const [k, v] of Object.entries(p.byDiff)) {
      const r = (out.byDiff[k] ??= { w: 0, d: 0, l: 0 });
      r.w += v.w;
      r.d += v.d;
      r.l += v.l;
    }
    addRec(out.winter, p.winter);
    addRec(out.summer, p.summer);
    addRec(out.rookie, p.rookie);
    out.graduates.push(...p.graduates);
    out.practiceMatches += p.practiceMatches;
    for (const k of ["hired", "retired", "poached", "other", "tempYears", "staffYears"] as const) out.turnover[k] += p.turnover[k];
    out.turnover.maxAbility = Math.max(out.turnover.maxAbility, p.turnover.maxAbility);
    for (const [k, [n, c]] of Object.entries(p.scholarsByLevel)) {
      const e = (out.scholarsByLevel[k] ??= [0, 0]);
      e[0] += n;
      e[1] += c;
    }
    for (const [k, xs] of Object.entries(p.facilityEnd)) (out.facilityEnd[k] ??= []).push(...xs);
    for (const [k, v] of Object.entries(p.camps)) {
      const e = (out.camps[k] ??= { n: 0, gain: 0, players: 0, learned: 0, gold: 0 });
      e.n += v.n;
      e.gain += v.gain;
      e.players += v.players;
      e.learned += v.learned;
      e.gold += v.gold;
    }
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

export function reportSeasons(d: SeasonData, seconds?: number): Alumnus[] {
  const { games, years } = d;
  console.log(`\n=== 評判の推移（うまい采配の自動プレイ ${games}校 × ${years}年） ===`);
  console.log("| 年目の終わり | 弱小 | そこそこ | 中堅 | 強豪 | 名門 | 自校のランク（平均） |");
  console.log("|---|---|---|---|---|---|---|");
  for (let y = 0; y < years; y++) {
    const counts = [0, 0, 0, 0, 0];
    for (const lv of d.levelByYear[y]) counts[lv]++;
    const avgRank = d.rankByYear[y].reduce((s, x) => s + x, 0) / d.rankByYear[y].length;
    console.log(`| ${y + 1}年目 | ${counts.map((c) => pct(c / games)).join(" | ")} | ${SCHOOL_RANKS[Math.round(avgRank)]}（${avgRank.toFixed(1)}） |`);
  }
  console.log("\n| 評判 | 初めて届いた年（中央値） | 届いた割合 | 目標 |");
  console.log("|---|---|---|---|");
  const targets = ["1〜2年", "3〜5年", "—", "10年前後"];
  for (let l = 0; l < 4; l++) {
    const xs = d.firstReach[l].filter((x): x is number => x !== null).sort((a, b) => a - b);
    const median = xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null;
    const all = d.firstReach[l].map((x) => x ?? 999).sort((a, b) => a - b);
    const medAll = all[Math.floor((all.length - 1) / 2)];
    console.log(
      `| ${REPUTATION_NAMES[(l + 1) as ReputationLevel]} | ${medAll === 999 ? `${years}年では届かない` : `${medAll}年目`}（届いた学校だけなら ${median ?? "—"}年目） | ${pct(xs.length / games)} | ${targets[l]} |`,
    );
  }
  const p = d.practice;
  console.log(`\n練習試合：年平均 ${(d.practiceMatches / (games * years)).toFixed(1)}試合、${p.w}勝${p.d}分${p.l}敗（勝率 ${pct(p.w / p.n)}）`);
  console.log("相手とのランク差ごとの成績（全試合。差 = 相手 − 自校）：");
  for (const k of ["-2以下", "-1", "0", "+1", "+2以上"]) {
    const r = d.byDiff[k];
    if (r) console.log(`  ${k}: ${r.w}勝${r.d}分${r.l}敗（勝率 ${pct(r.w / (r.w + r.d + r.l))}）`);
  }
  for (const [label, rec] of [
    ["冬の全国大会", d.winter],
    ["夏の全国大会", d.summer],
    ["新人戦", d.rookie],
  ] as const) {
    console.log(`${label}の成績（全年度）：${Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join("・")}`);
  }

  const t = d.turnover;
  console.log(`\nスタッフの入れ替わり（${games}校 × ${years}年）：雇用 ${t.hired}回・勇退 ${t.retired}回・引き抜き ${t.poached}回・入れ替え/解任 ${t.other}回`);
  console.log(`  年度替わりの時点でヘッドコーチが臨時コーチだった割合 ${pct(t.tempYears / t.staffYears)}（すぐ OB を雇うので、編成前の一瞬だけ）・スタッフの能力の最高 ${t.maxAbility.toFixed(0)}`);

  const general = d.graduates.filter((a) => !a.scholarship);
  const scholars = d.graduates.filter((a) => a.scholarship);
  const ov = general.map((a) => a.overall);
  const share = (f: (x: number) => boolean) => pct(ov.filter(f).length / Math.max(1, ov.length));
  console.log(`\n=== 成長（一般入部の卒業生 ${ov.length}人。卒業時の総合値。特待生 ${scholars.length}人は除く） ===`);
  console.log("| 項目 | 結果 | 目標 |");
  console.log("|---|---|---|");
  const avg = ov.reduce((s, x) => s + x, 0) / Math.max(1, ov.length);
  console.log(`| 平均 | ${avg.toFixed(1)}（${statRank(avg)}） | — |`);
  console.log(`| 総合B以上 | ${share((x) => x >= 70)} | 5〜8% |`);
  console.log(`| 総合C以上 | ${share((x) => x >= 60)} | — |`);
  console.log(`| 総合A以上 | ${share((x) => x >= 80)} | — |`);
  if (scholars.length > 0) {
    const sAvg = scholars.reduce((s, a) => s + a.overall, 0) / scholars.length;
    console.log(`特待生の卒業時の総合（平均）：${sAvg.toFixed(1)}（${statRank(sAvg)}）・総合B以上 ${pct(scholars.filter((a) => a.overall >= 70).length / scholars.length)}`);
  }

  // ---- P2c ----
  console.log(`\n=== Phase 2c：特待生の人数（評判ごと。1 年あたり） ===`);
  console.log("| 評判 | 年数 | 特待生（平均） |");
  console.log("|---|---|---|");
  for (const [k, [n, c]] of Object.entries(d.scholarsByLevel).sort()) console.log(`| ${REPUTATION_NAMES[Number(k) as ReputationLevel]} | ${n} | ${(c / n).toFixed(2)}人 |`);

  console.log(`\n=== Phase 2c：設備の推移（4 つの合計レベル。最大 12） ===`);
  console.log(`${d.facilityByYear.map((xs, y) => `${y + 1}年目 ${(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1)}`).join("・")}`);
  console.log(
    `${years}年目の終わり：${Object.entries(d.facilityEnd)
      .map(([id, xs]) => `${FACILITY_NAMES[id as keyof typeof FACILITY_NAMES]} ${(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1)}`)
      .join("・")}`,
  );

  console.log(`\n=== Phase 2c：合宿ごとの成長と特殊能力（1 回あたり） ===`);
  console.log("| 合宿 | 回数 | 1人あたりの総合の伸び | 身につけた特殊能力 | うち金色 |");
  console.log("|---|---|---|---|---|");
  for (const [k, v] of Object.entries(d.camps)) console.log(`| ${k === "summer" ? "夏合宿" : "冬合宿"} | ${v.n} | ${(v.gain / v.players).toFixed(2)} | ${(v.learned / v.n).toFixed(1)}個 | ${(v.gold / v.n).toFixed(2)}個 |`);
  if (seconds !== undefined) console.log(`(計算時間 ${seconds.toFixed(1)} 秒)`);
  return d.graduates;
}

/** 1 プロセスで全部（以前と同じ使い方） */
export function simulateSeasons(games: number, years: number): Alumnus[] {
  const t0 = Date.now();
  return reportSeasons(collectSeasons(0, games, years), (Date.now() - t0) / 1000);
}
