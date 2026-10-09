/**
 * セーブデータの圧縮形式。
 * 部員（CPU 校を含めて数千人）は配列に詰めて保存し、容量を抑える。
 */
import { ALL_STATS, POSITIONS, type Aptitude, type Condition, type Foot, type GameState, type Player, type School, type StatKey } from "@/engine/types";

/** [id, name, grade, enrolledYear, retired, mainPos, height, heightLeft, foot, aptitude, stats, exp, potential, fitness, condition, injuryDays] */
export type PackedPlayer = [string, string, number, number, 0 | 1, number, number, number, Foot, string, number[], number[], number, number, number, number];

const round1 = (v: number) => Math.round(v * 10) / 10;

export function packPlayer(p: Player): PackedPlayer {
  return [
    p.id,
    p.name,
    p.grade,
    p.enrolledYear,
    p.status === "retired" ? 1 : 0,
    POSITIONS.indexOf(p.mainPosition),
    p.heightCm,
    p.heightGrowthLeft,
    p.foot,
    POSITIONS.map((pos) => p.aptitude[pos]).join(""),
    ALL_STATS.map((k) => p.stats[k]),
    ALL_STATS.map((k) => round1(p.exp[k] ?? 0)),
    p.potential,
    round1(p.fitness),
    p.condition,
    p.injuryDays,
  ];
}

export function unpackPlayer(a: PackedPlayer): Player {
  const [id, name, grade, enrolledYear, retired, pos, height, heightLeft, foot, apt, stats, exp, potential, fitness, condition, injuryDays] = a;
  const aptitude = {} as Record<(typeof POSITIONS)[number], Aptitude>;
  POSITIONS.forEach((p, i) => (aptitude[p] = Number(apt[i]) as Aptitude));
  const s = {} as Record<StatKey, number>;
  const e: Partial<Record<StatKey, number>> = {};
  ALL_STATS.forEach((k, i) => {
    s[k] = stats[i];
    if (exp[i]) e[k] = exp[i];
  });
  return {
    id,
    name,
    grade: grade as 1 | 2 | 3,
    enrolledYear,
    status: retired ? "retired" : "active",
    mainPosition: POSITIONS[pos],
    heightCm: height,
    heightGrowthLeft: heightLeft,
    foot,
    aptitude,
    stats: s,
    exp: e,
    potential,
    fitness,
    condition: condition as Condition,
    injuryDays,
    admission: "general",
  };
}

type PackedSchool = Omit<School, "players"> & { players: PackedPlayer[] };
export type PackedGameState = Omit<GameState, "schools"> & { schools: Record<string, PackedSchool> };

export function packGame(state: GameState): PackedGameState {
  const schools: Record<string, PackedSchool> = {};
  for (const [id, s] of Object.entries(state.schools)) schools[id] = { ...s, players: s.players.map(packPlayer) };
  return { ...state, schools };
}

export function unpackGame(packed: PackedGameState): GameState {
  const schools: Record<string, School> = {};
  for (const [id, s] of Object.entries(packed.schools)) schools[id] = { ...s, players: s.players.map(unpackPlayer) };
  return { ...packed, schools };
}
