/**
 * 3D 観戦のデモ（Phase R1。`?demo3d=1` の開発用の入り口）。
 *
 * 決まったシードで作った世界から、指定したランクに近い CPU 校を 2 校選び、ゲームと同じ試合エンジンで最後まで計算する。
 * 表示用の情報（ホーム・ユニフォーム・会場・選手の見た目と背番号）は look/match.ts の decorateMatch と同じ考え方で付ける。
 * ゲームの状態・セーブには一切関わらない（デモの試合は保存しない）。
 */
import { PRACTICE_RULES, summerRulesForRound, winterRulesForRound } from "../config/competitions";
import { LEAGUE_RULES } from "../config/league";
import type { VenueStage } from "../config/look";
import { COMPETITION_NAMES, roundLabel } from "../config/names";
import { roundsFor, totalRounds } from "../competition/bracket";
import { schoolTeamInput } from "../competition/simulate";
import { competitionName, isRookieKind, nationalSize, newGame, playerLeagueName, rookieRegionSize, summerNationalSize } from "../game";
import { generateKits, generateLook, kitsClash, kitsForMatch, secondKitFor, venueStage, type KitChoice } from "../look";
import { createMatch, simulateToEnd } from "../match/engine";
import type { MatchState, Side } from "../match/types";
import { Rng } from "../rng";
import { SCHOOL_RANKS, type CompetitionKind, type GameState, type MatchRules, type School, type SchoolKits, type SchoolRank } from "../types";

/** デモの世界と試合のシード（同じ入力なら、いつも同じ試合になる） */
export const DEMO = {
  seed: "demo3d",
  schoolName: "デモ高校",
} as const;

/** デモで選べる試合の種類（大会 6 種・県リーグ・練習試合） */
export type DemoKind = CompetitionKind | "league" | "practice";
export const DEMO_KINDS: readonly DemoKind[] = ["national", "prefQualifier", "summerNational", "summerQualifier", "rookiePref", "rookieRegion", "league", "practice"];

/** ユニフォーム：auto = ふつうに決める、clash = アウェーの 1st をホームの 1st と同じ色にする（色かぶりの自動判定を見せる） */
export type DemoKits = "auto" | "clash";

export interface DemoOptions {
  kind: DemoKind;
  /** 決勝から数えて何試合前か（0 = 決勝）。大会のときだけ使う。範囲外は収める */
  fromEnd?: number;
  /** 会場の段階の上書き（"auto" または省略で、大会とラウンドから決める） */
  venue?: VenueStage | "auto";
  /** [ホーム, アウェー] のランク */
  ranks?: [SchoolRank, SchoolRank];
  kits?: DemoKits;
}

export interface DemoMatch {
  /** 最後まで計算した試合（表示用の view・選手の look と num 付き） */
  ms: MatchState;
  labels: {
    /** 大会名（例：冬の全国大会） */
    competition: string;
    /** ラウンド名（例：決勝）。県リーグ・練習試合は空 */
    round: string;
    /** 大会名とラウンド名をつないだもの */
    title: string;
  };
  /** 大舞台（全国大会・県予選の決勝） */
  bigStage: boolean;
  /** 着るユニフォーム（チームの順） */
  kitChoice: [KitChoice, KitChoice];
  /** 両校の 1st がかぶっていたか（自動で避ける前） */
  clashed: boolean;
}

let cachedWorld: GameState | null = null;

/** デモの世界（決まったシードで作る。何度呼んでも同じもの） */
export function demoWorld(): GameState {
  cachedWorld ??= newGame(DEMO.seed, DEMO.schoolName);
  return cachedWorld;
}

const isTournament = (k: DemoKind): k is CompetitionKind => k !== "league" && k !== "practice";

/** その大会のラウンド数と、決勝の勝ち抜け校数（ラウンド名用） */
function tournamentShape(world: GameState, kind: CompetitionKind): { total: number; qualifiers: number } {
  const pref = world.prefectures.find((p) => p.isPlayerPref)!;
  const b = world.competitions[kind];
  if (b) return { total: totalRounds(b), qualifiers: b.qualifiers ?? 1 };
  switch (kind) {
    case "prefQualifier":
      return { total: roundsFor(pref.schoolIds.length) - Math.log2(pref.reps), qualifiers: pref.reps };
    case "summerQualifier":
      return { total: roundsFor(pref.schoolIds.length) - Math.log2(pref.summerReps), qualifiers: pref.summerReps };
    case "national":
      return { total: roundsFor(nationalSize(world)), qualifiers: 1 };
    case "summerNational":
      return { total: roundsFor(summerNationalSize(world)), qualifiers: 1 };
    case "rookiePref":
      return { total: roundsFor(pref.schoolIds.length), qualifiers: 1 };
    case "rookieRegion":
      return { total: roundsFor(rookieRegionSize(world)), qualifiers: 1 };
  }
}

/** 選べるラウンド（決勝から順に。venue は自動で決まる会場の段階）。県リーグ・練習試合は空 */
export function demoRounds(kind: DemoKind): { fromEnd: number; label: string; venue: VenueStage }[] {
  if (!isTournament(kind)) return [];
  const { total, qualifiers } = tournamentShape(demoWorld(), kind);
  return Array.from({ length: total }, (_, fromEnd) => ({ fromEnd, label: roundLabel(total, total - 1 - fromEnd, qualifiers), venue: venueStage(kind, total - 1 - fromEnd, total) }));
}

/** 大会の種類の表示名（設定画面用） */
export function demoKindName(kind: DemoKind): string {
  if (kind === "league") return COMPETITION_NAMES.league;
  if (kind === "practice") return COMPETITION_NAMES.practice;
  return competitionName(demoWorld(), kind);
}

/** ランクの近い CPU 校を選ぶ（いちばん近いランクの学校から、乱数で 1 校） */
function pickSchool(world: GameState, rng: Rng, rank: SchoolRank, exclude: Set<string>): School {
  const target = SCHOOL_RANKS.indexOf(rank);
  const pool = Object.values(world.schools)
    .filter((s) => !s.isPlayer && !exclude.has(s.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const dist = (s: School) => Math.abs(SCHOOL_RANKS.indexOf(s.rank) - target);
  const best = Math.min(...pool.map(dist));
  return rng.pick(pool.filter((s) => dist(s) === best));
}

/** 試合のルール（ゲームと同じ値。デモは PK 戦をせず、同点のまま終える） */
function demoRules(kind: DemoKind, total: number, round: number): MatchRules {
  const base = kind === "practice" ? PRACTICE_RULES : kind === "league" ? LEAGUE_RULES : kind === "prefQualifier" || kind === "national" ? winterRulesForRound(total, round) : summerRulesForRound(total, round);
  return { ...base, pkOnDraw: false };
}

/** 大舞台か（game の isBigStage と同じ考え方：全国大会と、県予選の決勝） */
function demoBigStage(kind: DemoKind, total: number, round: number): boolean {
  if (kind === "national" || kind === "summerNational") return true;
  return (kind === "prefQualifier" || kind === "summerQualifier") && round === total - 1;
}

/** デモの試合を作り、最後まで計算して返す */
export function buildDemoMatch(opts: DemoOptions): DemoMatch {
  const world = demoWorld();
  const kind = opts.kind;
  const ranks = opts.ranks ?? ["B", "B"];
  const shape = isTournament(kind) ? tournamentShape(world, kind) : { total: 1, qualifiers: 1 };
  const fromEnd = Math.max(0, Math.min(shape.total - 1, Math.floor(opts.fromEnd ?? 0)));
  const round = shape.total - 1 - fromEnd;

  // 試合の中身を決める入力だけでシードを作る（会場・ユニフォームを変えても試合は同じ）
  const rng = Rng.fromSeed(`${DEMO.seed}:match:${kind}:${isTournament(kind) ? fromEnd : 0}:${ranks[0]}:${ranks[1]}`);
  const home = pickSchool(world, rng, ranks[0], new Set());
  const away = pickSchool(world, rng, ranks[1], new Set([home.id]));
  const rules = demoRules(kind, shape.total, round);
  const bigStage = demoBigStage(kind, shape.total, round);
  const tin = { maxGrade: isRookieKind(kind) ? 2 : undefined };
  const ia = schoolTeamInput(home, rules, false, rng, tin);
  const ib = schoolTeamInput(away, rules, false, rng, tin);
  const ms = simulateToEnd(createMatch(rules, rng, ia, ib, kind, bigStage));

  // ---- 表示用の情報（decorateMatch と同じ考え方。乱数は使わない） ----
  const homeSide: Side = 0;
  const kitsOf = (s: School): SchoolKits => s.kits ?? generateKits(world.seed, s.id);
  const k: [SchoolKits, SchoolKits] = [kitsOf(home), kitsOf(away)];
  if (opts.kits === "clash") {
    const first = { ...k[1].first, main: k[0].first.main };
    k[1] = { first, second: secondKitFor(first) };
  }
  const clashed = kitsClash(k[0].first, k[1].first);
  const mk = kitsForMatch(k, homeSide);
  ms.view = { home: homeSide, kits: mk.kits, gk: mk.gk };
  const venue = opts.venue !== undefined && opts.venue !== "auto" ? opts.venue : isTournament(kind) ? venueStage(kind, round, shape.total) : undefined;
  if (venue !== undefined) ms.view.venue = venue;
  ms.teams.forEach((team, side) => {
    const roster = new Map([home, away][side].players.map((p) => [p.id, p]));
    for (const mp of Object.values(team.players)) {
      const src = roster.get(mp.id);
      mp.look = src?.look ? { ...src.look } : generateLook(world.seed, mp.id);
      if (src?.shirtNumber !== undefined) mp.num = src.shirtNumber;
    }
  });

  const competition = kind === "league" ? playerLeagueName(world) : demoKindName(kind);
  const roundName = isTournament(kind) ? roundLabel(shape.total, round, shape.qualifiers) : "";
  return {
    ms,
    labels: { competition, round: roundName, title: roundName ? `${competition} ${roundName}` : competition },
    bigStage,
    kitChoice: mk.choice,
    clashed,
  };
}
