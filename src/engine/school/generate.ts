import { FRESHMAN_BASE, FRESHMAN_BASE_SD } from "../config/player";
import { REPUTATION_TABLE } from "../config/reputation";
import { PLAYER_START, PRESTIGE_GRADE_SIZE, PRESTIGE_LEVEL_BASE, prefReps, prefTier, TIER_SETTINGS } from "../config/school";
import { DEFAULT_PREFECTURE_ID, PREFECTURES, REGIONS, SCHOOL_NAME_HEADS, SCHOOL_NAME_TAILS } from "../config/names";
import { DEFAULT_TACTICS } from "../match/lineup";
import { generateGradeGroup } from "../player/generate";
import { growCpuPlayer } from "../player/growth";
import type { Rng } from "../rng";
import { FORMATION_IDS, type FormationId, type Player, type Prefecture, type ReputationLevel, type School, type Tactics } from "../types";
import { rankFromStrength, teamStrength } from "./strength";

export interface World {
  schools: Record<string, School>;
  prefectures: Prefecture[];
  regions: { id: string; name: string }[];
  playerSchoolId: string;
}

const FORMATION_WEIGHTS: Record<FormationId, number> = { "4-4-2": 30, "4-2-3-1": 25, "4-3-3": 20, "3-5-2": 13, "5-3-2": 12 };

function randomTactics(rng: Rng): Tactics {
  return {
    attack: rng.weighted(["attacking", "balanced", "defensive"] as const, (a) => (a === "balanced" ? 3 : 1)),
    buildUp: rng.chance(0.6) ? "buildUp" : "long",
    press: rng.weighted(["high", "mid", "low"] as const, (p) => (p === "mid" ? 3 : 1)),
    line: rng.chance(0.55) ? "high" : "low",
  };
}

/** CPU 校の新入生の人数と基準値 */
export function cpuFreshmen(rng: Rng, prestige: number, year: number): Player[] {
  const size = PRESTIGE_GRADE_SIZE[prestige] + rng.int(-1, 1);
  return generateGradeGroup(rng, size, { grade: 1, enrolledYear: year, base: PRESTIGE_LEVEL_BASE[prestige] }, 2.5);
}

/**
 * 上の学年は「新入生として生成 → 在学年数分だけ CPU の年間成長をかける」で作る。
 * こうすると、生成直後と数年後でチーム力の水準がそろう。
 */
function generateGrownGroup(rng: Rng, size: number, grade: 1 | 2 | 3, year: number, base: number, baseSd: number): Player[] {
  const players = generateGradeGroup(rng, size, { grade, enrolledYear: year - (grade - 1), base }, baseSd);
  for (const p of players) for (let y = 1; y < grade; y++) growCpuPlayer(rng, p);
  return players;
}

/** CPU 校の部員を 3 学年分生成する */
export function generateCpuRoster(rng: Rng, prestige: number, year: number): Player[] {
  const players: Player[] = [];
  for (const grade of [3, 2, 1] as const) {
    const size = PRESTIGE_GRADE_SIZE[prestige] + rng.int(-1, 1);
    players.push(...generateGrownGroup(rng, size, grade, year, PRESTIGE_LEVEL_BASE[prestige], 2.5));
  }
  return players;
}

/** プレイヤー校の初期部員（弱小。1〜3 年生がそろった状態） */
export function generatePlayerRoster(rng: Rng, level: ReputationLevel, year: number): Player[] {
  const size = REPUTATION_TABLE[level].gradeSize;
  const players: Player[] = [];
  for (const grade of [3, 2, 1] as const) {
    players.push(...generateGrownGroup(rng, size, grade, year, PLAYER_START.freshmanBase, FRESHMAN_BASE_SD));
  }
  return players;
}

/** プレイヤー校の新入生（一般入部） */
export function generalFreshmen(rng: Rng, count: number, year: number): Player[] {
  return generateGradeGroup(rng, count, { grade: 1, enrolledYear: year, base: FRESHMAN_BASE }, FRESHMAN_BASE_SD);
}

class NameGen {
  private used = new Set<string>();
  constructor(private rng: Rng) {}
  next(): string {
    for (let i = 0; i < 200; i++) {
      const name = this.rng.pick(SCHOOL_NAME_HEADS) + this.rng.pick(SCHOOL_NAME_TAILS);
      if (!this.used.has(name)) {
        this.used.add(name);
        return name;
      }
    }
    // 組み合わせが尽きたら番号を付ける
    const name = `${this.rng.pick(SCHOOL_NAME_HEADS)}第${this.used.size}高校`;
    this.used.add(name);
    return name;
  }
  reserve(name: string) {
    this.used.add(name);
  }
}

export function makeCpuSchool(rng: Rng, id: string, name: string, prefectureId: string, prestige: number, year: number): School {
  const players = generateCpuRoster(rng, prestige, year);
  const formation = rng.weighted(FORMATION_IDS, (f) => FORMATION_WEIGHTS[f]);
  const school: School = {
    id,
    name,
    prefectureId,
    isPlayer: false,
    players,
    rank: "E",
    prestige,
    formation,
    tactics: randomTactics(rng),
  };
  school.rank = rankFromStrength(teamStrength(players, formation));
  return school;
}

export function generateWorld(rng: Rng, playerSchoolName: string, year = 1, playerPrefId: string = DEFAULT_PREFECTURE_ID): World {
  const regions = REGIONS.map((r) => ({ id: r.id, name: r.name }));
  const prefectures: Prefecture[] = PREFECTURES.map((p) => ({
    id: p.id,
    name: p.name,
    regionId: p.region,
    tier: prefTier(p.id),
    reps: prefReps(p.id),
    schoolIds: [],
    isPlayerPref: p.id === playerPrefId,
  }));
  const playerPref = prefectures.find((p) => p.isPlayerPref) ?? prefectures[0];
  playerPref.isPlayerPref = true;

  const names = new NameGen(rng);
  names.reserve(playerSchoolName);
  const schools: Record<string, School> = {};
  let n = 0;

  const playerSchool: School = {
    id: "s_player",
    name: playerSchoolName,
    prefectureId: playerPref.id,
    isPlayer: true,
    players: generatePlayerRoster(rng, 0, year),
    rank: "E",
    prestige: 0,
    formation: "4-4-2",
    tactics: { ...DEFAULT_TACTICS },
  };
  playerSchool.rank = rankFromStrength(teamStrength(playerSchool.players, playerSchool.formation));
  schools[playerSchool.id] = playerSchool;
  playerPref.schoolIds.push(playerSchool.id);

  for (const pref of prefectures) {
    const tier = TIER_SETTINGS[pref.tier];
    const count = pref.isPlayerPref ? rng.int(tier.playerPrefSchools.min, tier.playerPrefSchools.max) - 1 : Math.max(tier.otherPrefSchools, pref.reps + 1);
    const weights = pref.isPlayerPref ? tier.playerPrefPrestige : tier.otherPrefPrestige;
    for (let i = 0; i < count; i++) {
      const prestige = rng.weighted([0, 1, 2, 3, 4, 5], (p) => weights[p]);
      const id = `s${n++}`;
      schools[id] = makeCpuSchool(rng, id, names.next(), pref.id, prestige, year);
      pref.schoolIds.push(id);
    }
  }
  return { schools, prefectures, regions, playerSchoolId: playerSchool.id };
}
