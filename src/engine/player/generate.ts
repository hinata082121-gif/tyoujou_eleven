import {
  FOOT_WEIGHTS,
  HEIGHT,
  OFF_ROLE_PENALTY,
  OTHER_APT_CHANCE,
  POSITION_STAT_BIAS,
  POSITION_WEIGHTS,
  POTENTIAL,
  RELATED_APT_CHANCE,
  RELATED_POSITIONS,
  STAT_MAX,
  STAT_MIN,
  STAT_SD,
} from "../config/player";
import { FAMILY_NAMES, GIVEN_NAMES } from "../config/names";
import type { Rng } from "../rng";
import { ALL_STATS, FIELD_STATS, GK_STATS, POSITIONS, type Aptitude, type Foot, type Player, type Position, type Stats } from "../types";

export const clampStat = (v: number) => Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(v)));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface GenerateOptions {
  grade: 1 | 2 | 3;
  enrolledYear: number;
  /** 能力の基準値（この値を中心にばらつく） */
  base: number;
  position?: Position;
}

export function randomPosition(rng: Rng): Position {
  return rng.weighted(POSITIONS, (p) => POSITION_WEIGHTS[p]);
}

function generateAptitude(rng: Rng, main: Position): Record<Position, Aptitude> {
  const apt = {} as Record<Position, Aptitude>;
  for (const pos of POSITIONS) {
    if (pos === main) apt[pos] = 3;
    else if (pos === "GK" || main === "GK") apt[pos] = 1;
    else if (RELATED_POSITIONS[main].includes(pos)) apt[pos] = rng.chance(RELATED_APT_CHANCE) ? 2 : 1;
    else apt[pos] = rng.chance(OTHER_APT_CHANCE) ? 2 : 1;
  }
  // 関連ポジションに ○ が 1 つもなければ 1 つ付ける（GK 以外）
  if (main !== "GK" && !RELATED_POSITIONS[main].some((p) => apt[p] >= 2)) {
    apt[rng.pick(RELATED_POSITIONS[main])] = 2;
  }
  return apt;
}

function generateStats(rng: Rng, base: number, main: Position): Stats {
  const stats = {} as Stats;
  const isGk = main === "GK";
  const bias = POSITION_STAT_BIAS[main];
  for (const key of ALL_STATS) {
    let v = rng.normal(base, STAT_SD) + (bias[key] ?? 0);
    const offRole = (isGk && (FIELD_STATS as readonly string[]).includes(key)) || (!isGk && (GK_STATS as readonly string[]).includes(key));
    if (offRole) v += OFF_ROLE_PENALTY;
    stats[key] = clampStat(v);
  }
  return stats;
}

export function randomName(rng: Rng): string {
  return `${rng.pick(FAMILY_NAMES)} ${rng.pick(GIVEN_NAMES)}`;
}

export function generatePlayer(rng: Rng, opts: GenerateOptions): Player {
  const main = opts.position ?? randomPosition(rng);
  const isGk = main === "GK";
  const foot = rng.weighted(["R", "L", "B"] as Foot[], (f) => FOOT_WEIGHTS[f]);
  const height = clamp(Math.round(rng.normal(isGk ? HEIGHT.gkMean : HEIGHT.fieldMean, HEIGHT.sd)), HEIGHT.min, HEIGHT.max);
  // 学年が上の選手は、すでに伸びた分を引く
  const growthTotal = rng.int(0, HEIGHT.growthMax);
  const growthLeft = opts.grade === 1 ? growthTotal : opts.grade === 2 ? Math.floor(growthTotal / 2) : 0;
  return {
    id: rng.id("p"),
    name: randomName(rng),
    grade: opts.grade,
    enrolledYear: opts.enrolledYear,
    status: "active",
    mainPosition: main,
    heightCm: height - growthLeft,
    heightGrowthLeft: growthLeft,
    foot,
    aptitude: generateAptitude(rng, main),
    stats: generateStats(rng, opts.base, main),
    exp: {},
    potential: Math.round(clamp(rng.normal(POTENTIAL.mean, POTENTIAL.sd), POTENTIAL.min, POTENTIAL.max) * 100) / 100,
    fitness: 100,
    condition: 0,
    injuryDays: 0,
    admission: "general",
  };
}

/** 1 学年分の部員を生成する。GK が最低 1 人は入るようにする */
export function generateGradeGroup(rng: Rng, count: number, opts: Omit<GenerateOptions, "position">, baseSd = 0): Player[] {
  const players: Player[] = [];
  for (let i = 0; i < count; i++) {
    const position = i === 0 ? "GK" : undefined;
    const base = baseSd > 0 ? rng.normal(opts.base, baseSd) : opts.base;
    players.push(generatePlayer(rng, { ...opts, base, position }));
  }
  return players;
}
