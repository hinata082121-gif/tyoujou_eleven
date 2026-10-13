/**
 * セーブデータの圧縮形式。
 * 部員（CPU 校を含めて数千人）は配列に詰めて保存し、容量を抑える。
 */
import {
  ALL_STATS,
  PERSONALITIES,
  PLAY_STYLES,
  POSITIONS,
  PRACTICE_KINDS,
  SKILL_IDS,
  type Aptitude,
  type Condition,
  type Foot,
  type GameState,
  type Player,
  type PlayerFeats,
  type School,
  type StatKey,
} from "@/engine/types";

/**
 * [id, name, grade, enrolledYear, retired, mainPos, height, heightLeft, foot, aptitude, stats, exp, potential, fitness, condition, injuryDays,
 *  traits, suspended, [apps, goals, officialApps, officialGoals], scholarship]
 * traits はスキーマ v4 で追加（v3 以前は無いので、マイグレーションで差し込む）。
 * suspended と記録はスキーマ v3 で追加（記録が空なら省く）。
 * 最後の scholarship（特待生なら 1）はスキーマ v5 で追加（一般入部なら省く）
 */
export type PackedPlayer = [
  string,
  string,
  number,
  number,
  0 | 1,
  number,
  number,
  number,
  Foot,
  string,
  number[],
  number[],
  number,
  number,
  number,
  number,
  PackedTraits,
  number?,
  number[]?,
  (0 | 1)?,
];

/** [性格, スタイル, 熟練度, 特殊能力, 得意な練習（無ければ -1）, 成果（無ければ省く）]。どれも番号で持つ */
export type PackedTraits = [number, number, number, number[], number, number[]?];

/** 成果の並び（PlayerFeats のキー。goldReady は最後の配列） */
const FEAT_KEYS = ["oneOnOneGoals", "headerGoals", "fkGoals", "cornerAssists", "crossAssists", "feedAssists", "duelWins", "aerialWins", "gkOneOnOneStops", "pkStreak"] as const;

export function packTraits(p: Player): PackedTraits {
  const t: PackedTraits = [
    PERSONALITIES.indexOf(p.personality),
    PLAY_STYLES.indexOf(p.playStyle),
    round1(p.styleProficiency),
    p.skills.map((s) => SKILL_IDS.indexOf(s)),
    p.favoritePractice ? PRACTICE_KINDS.indexOf(p.favoritePractice) : -1,
  ];
  const f = p.feats;
  if (f) t.push([...FEAT_KEYS.map((k) => f[k]), ...(f.goldReady ?? []).map((s) => SKILL_IDS.indexOf(s))]);
  return t;
}

function unpackTraits(t: PackedTraits): Pick<Player, "personality" | "playStyle" | "styleProficiency" | "skills" | "favoritePractice" | "feats"> {
  const [pers, style, prof, skills, fav, feats] = t;
  const out: ReturnType<typeof unpackTraits> = {
    personality: PERSONALITIES[pers],
    playStyle: PLAY_STYLES[style],
    styleProficiency: prof,
    skills: skills.map((i) => SKILL_IDS[i]),
  };
  if (fav >= 0) out.favoritePractice = PRACTICE_KINDS[fav];
  if (feats) {
    const f = {} as PlayerFeats;
    FEAT_KEYS.forEach((k, i) => (f[k] = feats[i] ?? 0));
    const ready = feats.slice(FEAT_KEYS.length).map((i) => SKILL_IDS[i]);
    if (ready.length > 0) f.goldReady = ready;
    out.feats = f;
  }
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function packPlayer(p: Player): PackedPlayer {
  const r = p.record;
  const packed: PackedPlayer = [
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
    packTraits(p),
  ];
  // CPU 校の部員（数千人）は記録が空なので、容量のために省く
  const scholar = p.admission === "scholarship";
  if (scholar || p.suspended || r.apps || r.goals || r.officialApps || r.officialGoals) packed.push(p.suspended, [r.apps, r.goals, r.officialApps, r.officialGoals]);
  if (scholar) packed.push(1);
  return packed;
}

export function unpackPlayer(a: PackedPlayer): Player {
  const [id, name, grade, enrolledYear, retired, pos, height, heightLeft, foot, apt, stats, exp, potential, fitness, condition, injuryDays, traits, suspended, rec, scholarship] = a;
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
    admission: scholarship ? "scholarship" : "general",
    suspended: suspended ?? 0,
    record: { apps: rec?.[0] ?? 0, goals: rec?.[1] ?? 0, officialApps: rec?.[2] ?? 0, officialGoals: rec?.[3] ?? 0 },
    ...unpackTraits(traits),
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
