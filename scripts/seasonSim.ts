import { FACILITY_NAMES, PREF_TIER_NAMES, PREFECTURES, REPUTATION_NAMES } from "../src/engine/config/names";
import { prefTier, type PrefTier } from "../src/engine/config/school";
import { newGame } from "../src/engine/game";
import { autoStep, newAutoplayStats } from "../src/engine/game/autoplay";
import { POSITION_RATING_WEIGHTS } from "../src/engine/config/player";
import { statRank } from "../src/engine/player/rank";
import { rankIndex } from "../src/engine/school/strength";
import { FACILITY_IDS, SCHOOL_RANKS, type Alumnus, type ReputationLevel } from "../src/engine/types";
import { staffAge } from "../src/engine/staff";
import { STAFF_LIFE } from "../src/engine/config/staff";
import { isGold } from "../src/engine/skills";
import { academicBand, trustBand } from "../src/engine/school/life";

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
  /** P3：全国大会に初めて届いた年（学校ごと。null は届かない）。key = winterBest4 / winterWin / summerBest4 / summerWin / anyBest4 / anyWin */
  firstNational: Record<string, (number | null)[]>;
  /** P3：全国大会の優勝校のランク（CPU 校も含む。冬・夏） */
  championRanks: Record<string, Record<string, number>>;
  /** P3：評判が名門の年の、自校のランク */
  eliteRanks: number[];
  /** P3：県リーグ（年ごと） */
  league: { level: number; divisions: number; promoted: boolean; relegated: boolean; retired: boolean; canRelegate: boolean; year: number }[];
  /** P3：学校ごとの県の区分（firstNational・firstReach と同じ並び） */
  tiers: PrefTier[];
  /** P3：評判が名門の年の、県の区分ごとの全国大会の出場と優勝（[年数, 冬の出場, 冬の優勝, 夏の出場, 夏の優勝]） */
  eliteNational: Record<string, number[]>;
  /** R2：学校生活（練習日・テスト・選択肢のイベント・判断の数・年度末の学力と信頼度の帯） */
  r2: R2Data;
}

export interface R2Data {
  schoolYears: number;
  practiceUnits: number;
  memberDays: number;
  days: number;
  /** 年の何回目のテストか（0〜4）ごとの [回数, 受けた人数, 赤点の人数, 平均点の合計] */
  tests: number[][];
  choices: Record<string, number>;
  decisions: Record<string, number>;
  /** 年度末（卒業の前）の、学力・信頼度の 5 段階の人数 */
  academic: number[];
  trust: number[];
}

const emptyR2 = (): R2Data => ({ schoolYears: 0, practiceUnits: 0, memberDays: 0, days: 0, tests: [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0]), choices: {}, decisions: {}, academic: [0, 0, 0, 0, 0], trust: [0, 0, 0, 0, 0] });

function mergeR2(a: R2Data, b: R2Data) {
  for (const k of ["schoolYears", "practiceUnits", "memberDays", "days"] as const) a[k] += b[k];
  b.tests.forEach((t, i) => t.forEach((x, j) => (a.tests[i][j] += x)));
  for (const [k, v] of Object.entries(b.choices)) a.choices[k] = (a.choices[k] ?? 0) + v;
  for (const [k, v] of Object.entries(b.decisions)) a.decisions[k] = (a.decisions[k] ?? 0) + v;
  b.academic.forEach((x, i) => (a.academic[i] += x));
  b.trust.forEach((x, i) => (a.trust[i] += x));
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
  firstNational: {},
  championRanks: { winter: {}, summer: {} },
  eliteRanks: [],
  league: [],
  tiers: [],
  eliteNational: {},
  r2: emptyR2(),
});

/** 全国大会のベスト4（準決勝・決勝で負けた、または優勝） */
const nationalBest4 = (s: string | undefined) => !!s && /全国大会 ((準決勝|決勝)敗退|優勝)/.test(s);
const nationalWin = (s: string | undefined) => !!s && /全国大会 優勝/.test(s);

/** 成績の文字列を、県の名前を除いた短い形にする */
const shortResult = (s: string | undefined) =>
  (s ?? "—")
    .replace(/^.*?(県予選|都予選|府予選|道予選|予選)/, "予選")
    .replace(/^.*?(県大会|都大会|府大会|道大会)/, "県大会")
    .replace(/^.*?(地域大会|全道大会)/, "地域大会")
    .replace(/(冬|夏)の全国大会 /, "全国 ")
    .replace(/^.*代表$/, "代表");

const TIERS: PrefTier[] = ["competitive", "normal", "small"];
/** 学校の番号から都道府県を決める。区分（激戦区・普通・少数）を順に回し、区分ごとの学校の数をそろえる（P3） */
export function seasonPrefecture(g: number): string {
  const list = PREFECTURES.filter((p) => prefTier(p.id) === TIERS[g % 3]);
  return list[(Math.floor(g / 3) * 5) % list.length].id;
}

/** 学校 from〜to-1 を years 年ずつ遊ぶ（学校の番号で都道府県と種が決まる） */
export function collectSeasons(from: number, to: number, years: number): SeasonData {
  const d = emptyData(to - from, years);
  const turnover = d.turnover;
  for (let g = from; g < to; g++) {
    const pref = seasonPrefecture(g);
    const state = newGame(`season-${g}`, "検証高校", pref);
    const reached: (number | null)[] = [null, null, null, null];
    const nat: Record<string, number | null> = { winterBest4: null, winterWin: null, summerBest4: null, summerWin: null, anyBest4: null, anyWin: null };
    for (let y = 0; y < years; y++) {
      const before = new Map(state.staff.members.filter((m) => !m.temporary).map((m) => [m.id, m]));
      // 1 年分進める（年度末の前に、全国大会の優勝校のランクを記録する）
      const stats = newAutoplayStats();
      const target = state.year + 1;
      let captured = false;
      let lifeCounted = false;
      for (let i = 0; i < 4000 && state.year < target; i++) {
        if (!captured && (state.pending?.type === "yearEnd" || state.pending?.type === "graduation")) {
          // 卒業式の前に、学力・信頼度の帯を数える
          if (state.pending.type === "graduation" && !lifeCounted) {
            lifeCounted = true;
            for (const p of state.schools[state.playerSchoolId].players.filter((x) => x.status === "active")) {
              d.r2.academic[academicBand(p)]++;
              d.r2.trust[trustBand(p)]++;
            }
          }
        }
        if (!captured && state.pending?.type === "yearEnd") {
          captured = true;
          for (const [k, key] of [["national", "winter"], ["summerNational", "summer"]] as const) {
            const id = state.competitions[k]?.championId;
            if (id) d.championRanks[key][state.schools[id].rank] = (d.championRanks[key][state.schools[id].rank] ?? 0) + 1;
          }
        }
        autoStep(state, stats, "skilled");
      }
      const r2 = d.r2;
      r2.schoolYears++;
      r2.practiceUnits += stats.practiceUnits;
      r2.memberDays += stats.memberDays;
      r2.days += stats.days;
      stats.tests.forEach((t, i) => {
        const e = r2.tests[Math.min(4, i)];
        e[0]++;
        e[1] += t.members;
        e[2] += t.failed;
        e[3] += t.average;
      });
      for (const [k, v] of Object.entries(stats.choices)) r2.choices[k] = (r2.choices[k] ?? 0) + v;
      for (const [k, v] of Object.entries(stats.decisions)) r2.decisions[k] = (r2.decisions[k] ?? 0) + v;
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
      const hit = { winterBest4: nationalBest4(h.winterResult), winterWin: nationalWin(h.winterResult), summerBest4: nationalBest4(h.summerResult), summerWin: nationalWin(h.summerResult) };
      const flags = { ...hit, anyBest4: hit.winterBest4 || hit.summerBest4, anyWin: hit.winterWin || hit.summerWin };
      for (const [k, v] of Object.entries(flags)) if (v && nat[k] === null) nat[k] = y + 1;
      if (lv === 4) {
        d.eliteRanks.push(rankIndex(h.rank));
        const e = (d.eliteNational[prefTier(pref)] ??= [0, 0, 0, 0, 0]);
        const app = (r: string | undefined) => shortResult(r).startsWith("全国");
        e[0]++;
        e[1] += +app(h.winterResult);
        e[2] += +hit.winterWin;
        e[3] += +app(h.summerResult);
        e[4] += +hit.summerWin;
      }
      if (h.league) {
        const divisions = state.league?.divisions.length ?? 1;
        d.league.push({ level: h.league.level, divisions, promoted: h.league.promoted, relegated: h.league.relegated, retired: h.league.retiredBeforeEnd, canRelegate: h.league.level < divisions, year: y + 1 });
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
    d.tiers.push(prefTier(pref));
    for (const [k, v] of Object.entries(nat)) (d.firstNational[k] ??= []).push(v);
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
    for (const [k, xs] of Object.entries(p.firstNational)) (out.firstNational[k] ??= []).push(...xs);
    for (const key of ["winter", "summer"]) for (const [r, n] of Object.entries(p.championRanks[key])) out.championRanks[key][r] = (out.championRanks[key][r] ?? 0) + n;
    out.eliteRanks.push(...p.eliteRanks);
    mergeR2(out.r2, p.r2);
    out.league.push(...p.league);
    out.tiers.push(...p.tiers);
    for (const [k, xs] of Object.entries(p.eliteNational)) {
      const e = (out.eliteNational[k] ??= [0, 0, 0, 0, 0]);
      xs.forEach((x, i) => (e[i] += x));
    }
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
  reportPhase3(d);
  reportR2(d);
  if (seconds !== undefined) console.log(`(計算時間 ${seconds.toFixed(1)} 秒)`);
  return d.graduates;
}

/** R2：学校生活（練習日・テスト・選択肢のイベント・判断の数・学力と信頼度） */
function reportR2(d: SeasonData) {
  const r = d.r2;
  const sy = Math.max(1, r.schoolYears);
  console.log(`\n=== R2：学校生活（${d.games}校 × ${d.years}年。おまかせの自動プレイ） ===`);
  const avgMembers = r.memberDays / Math.max(1, r.days);
  console.log(`1 人あたりの練習日：1 年 ${(r.practiceUnits / avgMembers / sy).toFixed(1)}日（進んだ日 ${(r.days / sy).toFixed(0)}日。テスト前の短い練習は 0.5 日で数える）`);
  console.log("| テスト | 回数 | 平均点 | 赤点の割合 |");
  console.log("|---|---|---|---|");
  const TEST_NAMES = ["1学期 中間", "1学期 期末", "2学期 中間", "2学期 期末", "学年末"];
  r.tests.forEach((t, i) => t[0] && console.log(`| ${TEST_NAMES[i]} | ${t[0]} | ${(t[3] / t[0]).toFixed(1)} | ${pct(t[2] / Math.max(1, t[1]))} |`));
  const band = (xs: number[]) => xs.map((x) => pct(x / Math.max(1, xs.reduce((s, y) => s + y, 0)))).join("・");
  console.log(`年度末の学力の 5 段階（低い順）：${band(r.academic)}`);
  console.log(`年度末の信頼度の 5 段階（低い順）：${band(r.trust)}`);
  const school = ["testPrep", "sportsDay", "culturalFestival", "campNight"];
  const per = (n: number) => (n / sy).toFixed(2);
  console.log(`\n選択肢のあるイベント（1 年あたり）：人物マス ${per(Object.entries(r.choices).filter(([k]) => !school.includes(k)).reduce((s, [, v]) => s + v, 0))}回`);
  console.log(
    `  ${Object.entries(r.choices)
      .filter(([k]) => !school.includes(k))
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${per(v)}`)
      .join("・")}`,
  );
  console.log(`  行事・合宿の選択：${school.map((k) => `${k} ${per(r.choices[k] ?? 0)}`).join("・")}`);
  const dec = r.decisions;
  const rows: [string, string, string][] = [
    ["card", "どのカードを使うか", "130 前後"],
    ["monthly", "月初の育成指示", "12"],
    ["person", "選択肢のあるイベント（人物マス）", "14 前後"],
    ["school", "学校行事の選択", "7"],
    ["match", "試合の準備", "25 前後"],
    ["other", "そのほか（スタッフ・キャプテン・合宿・分かれ道・スカウト）", "15 前後"],
  ];
  console.log("\n| 判断（1 年あたり） | 回数 | 計画の見込み |");
  console.log("|---|---|---|");
  for (const [k, label, plan] of rows) console.log(`| ${label} | ${per(dec[k] ?? 0)} | ${plan} |`);
  const nonCard = rows.filter(([k]) => k !== "card").reduce((s, [k]) => s + (dec[k] ?? 0), 0);
  console.log(`| **カード以外の判断** | **${per(nonCard)}** | **73 前後** |`);
}

/** R2：月初の指示の 3 通り（重点なし・おまかせ・自分で決める）で、卒業生の総合と能力の偏りを比べる */
export interface FocusData {
  focus: string;
  overall: number[];
  bias: number[];
}

export function collectFocus(from: number, to: number, years: number, focus: "none" | "auto" | "manual"): FocusData {
  const out: FocusData = { focus, overall: [], bias: [] };
  for (let g = from; g < to; g++) {
    const state = newGame(`focus-${g}`, "検証高校", seasonPrefecture(g));
    const stats = newAutoplayStats();
    const target = state.year + years;
    for (let i = 0; i < 4000 * years && state.year < target; i++) autoStep(state, stats, "skilled", { focus });
    for (const a of state.alumni) {
      if (a.graduatedYear < 4 || a.fictional || a.scholarship) continue;
      out.overall.push(a.overall);
      const keys = Object.keys(POSITION_RATING_WEIGHTS[a.position]) as (keyof typeof a.stats)[];
      const vs = keys.map((k) => a.stats[k]);
      out.bias.push(Math.max(...vs) - vs.reduce((s, x) => s + x, 0) / vs.length);
    }
  }
  return out;
}

export function reportFocus(parts: FocusData[], schools: number, years: number) {
  const LABEL: Record<string, string> = { none: "重点なし", auto: "おまかせ（標準）", manual: "自分で決める（ポジションで一番大事な能力 1 つ）" };
  console.log(`\n=== R2：月初の指示の 3 通り（${schools}校 × ${years}年。一般入部の卒業生） ===`);
  console.log("| 指示 | 卒業生 | 総合の平均 | 総合B以上 | 能力の偏り（一番高い能力 − 平均） |");
  console.log("|---|---|---|---|---|");
  for (const f of ["none", "auto", "manual"]) {
    const xs = parts.filter((p) => p.focus === f);
    const ov = xs.flatMap((p) => p.overall);
    const bias = xs.flatMap((p) => p.bias);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
    console.log(`| ${LABEL[f]} | ${ov.length}人 | ${mean(ov).toFixed(1)} | ${pct(ov.filter((x) => x >= 70).length / Math.max(1, ov.length))} | ${mean(bias).toFixed(1)} |`);
  }
}

/** 1 プロセスで全部（以前と同じ使い方） */
export function simulateSeasons(games: number, years: number): Alumnus[] {
  const t0 = Date.now();
  return reportSeasons(collectSeasons(0, games, years), (Date.now() - t0) / 1000);
}

/** P3：全国大会の到達・優勝校のランク・名門のランク・県リーグ */
function reportPhase3(d: SeasonData) {
  const { games, years } = d;
  console.log(`\n=== Phase 3：全国大会に初めて届いた年（${games}校 × ${years}年） ===`);
  console.log("| 項目 | 届いた割合 | 初めて届いた年（届いた学校の中央値） | 目標 |");
  console.log("|---|---|---|---|");
  const labels: [string, string, string][] = [
    ["winterBest4", "冬の全国 ベスト4", "—"],
    ["winterWin", "冬の全国 優勝", "—"],
    ["summerBest4", "夏の全国 ベスト4", "—"],
    ["summerWin", "夏の全国 優勝", "—"],
    ["anyBest4", "全国 ベスト4（夏か冬）", "—"],
    ["anyWin", "全国 優勝（夏か冬）", "—（区分ごと。下の表）"],
  ];
  for (const [k, label, target] of labels) {
    const all = d.firstNational[k] ?? [];
    const xs = all.filter((x): x is number => x !== null).sort((a, b) => a - b);
    const share = xs.length / Math.max(1, games);
    const ok = target === "—" ? "" : share >= 0.45 && share <= 0.55 ? " OK" : " NG";
    console.log(`| ${label} | ${pct(share)} | ${xs.length ? `${xs[Math.floor((xs.length - 1) / 2)]}年目（最短 ${xs[0]}年目）` : "—"} | ${target}${ok} |`);
  }
  reportByTier(d);
  for (const key of ["winter", "summer"]) {
    const rec = d.championRanks[key];
    const total = Object.values(rec).reduce((s, x) => s + x, 0);
    console.log(`${key === "winter" ? "冬" : "夏"}の全国大会の優勝校のランク（全年度 ${total}回）：${SCHOOL_RANKS.filter((r) => rec[r])
      .reverse()
      .map((r) => `${r} ${pct(rec[r] / total)}`)
      .join("・")}`);
  }
  if (d.eliteRanks.length > 0) {
    const avg = d.eliteRanks.reduce((s, x) => s + x, 0) / d.eliteRanks.length;
    const dist = SCHOOL_RANKS.map((r, i) => [r, d.eliteRanks.filter((x) => x === i).length] as const).filter(([, n]) => n > 0);
    console.log(`評判が名門の年の自校のランク：平均 ${SCHOOL_RANKS[Math.round(avg)]}（${avg.toFixed(2)}）・${dist.map(([r, n]) => `${r} ${pct(n / d.eliteRanks.length)}`).join("・")}`);
  }

  const L = d.league;
  if (L.length === 0) return;
  console.log(`\n=== Phase 3：県リーグ（${L.length}年分） ===`);
  const share = (xs: typeof L, f: (x: (typeof L)[number]) => boolean) => (xs.length ? pct(xs.filter(f).length / xs.length) : "—");
  const byYear = [1, 2, 3, 5, 10, 15, 20].filter((y) => y <= years);
  console.log("| 年目 | 1部にいる割合 | 部の平均（1 = 1部） |");
  console.log("|---|---|---|");
  for (const y of byYear) {
    const xs = L.filter((x) => x.year === y);
    if (xs.length === 0) continue;
    console.log(`| ${y}年目 | ${share(xs, (x) => x.level === 1)} | ${(xs.reduce((s, x) => s + x.level, 0) / xs.length).toFixed(2)} |`);
  }
  const canUp = L.filter((x) => x.level > 1);
  const canDown = L.filter((x) => x.canRelegate);
  console.log(`昇格した割合（1部以外の年）：${share(canUp, (x) => x.promoted)}・降格した割合（最下部以外の年）：${share(canDown, (x) => x.relegated)}`);
  const retired = canDown.filter((x) => x.retired);
  const stayed = canDown.filter((x) => !x.retired);
  console.log(
    `冬の県予選で負けて3年生が引退した後にリーグ戦が残っていた年（最下部以外 ${retired.length}年）の降格：${share(retired, (x) => x.relegated)}（引退がリーグの後だった年 ${stayed.length}年：${share(stayed, (x) => x.relegated)}）（目標：極端に高くない）`,
  );
}

/** P3：全国優勝の経験の目標（20 年で一度でも夏か冬に優勝した学校の割合。区分ごと） */
export const NATIONAL_WIN_TARGETS: Record<PrefTier, [number, number]> = { competitive: [0.3, 0.4], normal: [0.45, 0.55], small: [0.55, 0.65] };

/** P3：県の区分ごとの、全国大会と名門に初めて届いた年 */
function reportByTier(d: SeasonData) {
  const median = (xs: number[]) => (xs.length ? xs[Math.floor((xs.length - 1) / 2)] : null);
  console.log(`\n=== Phase 3：県の区分ごと（全国優勝の経験の目標：激戦区 30〜40%・普通 45〜55%・少数 60%前後） ===`);
  console.log("| 区分 | 学校 | 全国優勝の経験 | 目標 | 全国ベスト4の経験 | 初めて優勝した年（中央値） | 名門に初めて届いた年（中央値。届いた割合） |");
  console.log("|---|---|---|---|---|---|---|");
  for (const tier of TIERS) {
    const idx = d.tiers.map((t, i) => (t === tier ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const got = (k: string) => idx.map((i) => d.firstNational[k]?.[i] ?? null).filter((x): x is number => x !== null).sort((a, b) => a - b);
    const win = got("anyWin");
    const best4 = got("anyBest4");
    const elite = idx.map((i) => d.firstReach[3][i]).filter((x): x is number => x !== null).sort((a, b) => a - b);
    const eliteAll = idx.map((i) => d.firstReach[3][i] ?? 999).sort((a, b) => a - b);
    const [lo, hi] = NATIONAL_WIN_TARGETS[tier];
    const share = win.length / idx.length;
    const m = median(eliteAll);
    console.log(
      `| ${PREF_TIER_NAMES[tier]} | ${idx.length} | ${pct(share)} | ${pct(lo)}〜${pct(hi)}${share >= lo && share <= hi ? " OK" : " NG"} | ${pct(best4.length / idx.length)} | ${median(win) ?? "—"}年目 | ${m === 999 ? "届かない" : `${m}年目`}（${pct(elite.length / idx.length)}） |`,
    );
  }
  console.log("評判が名門の年の全国大会（区分ごと。出場した割合・出場したときの優勝の割合）：");
  for (const tier of TIERS) {
    const e = d.eliteNational[tier];
    if (!e || e[0] === 0) continue;
    console.log(`  ${PREF_TIER_NAMES[tier]}（${e[0]}年）：冬 出場 ${pct(e[1] / e[0])}・優勝 ${pct(e[2] / Math.max(1, e[1]))}／夏 出場 ${pct(e[3] / e[0])}・優勝 ${pct(e[4] / Math.max(1, e[3]))}`);
  }
}
