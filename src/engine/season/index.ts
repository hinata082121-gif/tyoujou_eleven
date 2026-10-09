import { careerWeights, LOG_LIMIT, NEW_YEAR_FITNESS } from "../config/season";
import { CAREER_NAMES } from "../config/names";
import { growHeight } from "../player/growth";
import { overall } from "../player/rating";
import { gradeSize } from "../reputation";
import type { Rng } from "../rng";
import { generalFreshmen } from "../school/generate";
import { advanceCpuSchool } from "../school/season";
import type { Alumnus, Career, GameState, LogEntry, Player } from "../types";
import { CAREER_KEYS } from "./careers";
import { makeStaffProfile } from "../staff/profile";

export function addLog(state: GameState, text: string, tone: LogEntry["tone"] = "info") {
  state.log.push({ day: state.calendar.position, year: state.year, text, tone });
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

export function playerSchool(state: GameState) {
  return state.schools[state.playerSchoolId];
}

/** 3 年生の引退（冬の全国大会で敗退した時点。優勝なら全国大会の後） */
export function retireThirdYears(state: GameState) {
  if (state.competitions.winterDone) return;
  state.competitions.winterDone = true;
  const retired = playerSchool(state).players.filter((p) => p.grade === 3 && p.status === "active");
  for (const p of retired) p.status = "retired";
  if (retired.length > 0) addLog(state, `3年生${retired.length}人が引退した。これからは1・2年生で戦う。`, "info");
}

export function decideCareer(rng: Rng, p: Player): Career {
  const w = careerWeights(overall(p));
  return rng.weighted(CAREER_KEYS, (c) => w[c]);
}

/** 卒業式（3 月）：3 年生を OB として記録する */
export function graduate(state: GameState, rng: Rng): Alumnus[] {
  const school = playerSchool(state);
  const grads = school.players.filter((p) => p.grade === 3);
  const alumni: Alumnus[] = grads.map((p) => {
    const winterResults = state.history.filter((h) => h.year >= p.enrolledYear).map((h) => h.winterResult);
    winterResults.push(state.competitions.winterResult ?? "—");
    const basics = {
      stats: { ...p.stats },
      position: p.mainPosition,
      overall: Math.round(overall(p)),
      career: decideCareer(rng, p),
      graduatedYear: state.year,
      wasCaptain: school.captainId === p.id,
    };
    return {
      id: p.id,
      name: p.name,
      ...basics,
      record: { ...p.record, winterResults },
      staffProfile: makeStaffProfile(rng, basics),
    };
  });
  school.players = school.players.filter((p) => p.grade !== 3);
  state.alumni.push(...alumni);
  for (const a of alumni) addLog(state, `${a.name}が卒業（${CAREER_NAMES[a.career]}）`, "info");
  return alumni;
}

/** 年度替わり：進級・新入生・CPU 校の入れ替え・新しいカレンダー */
export function rolloverPlayerSchool(state: GameState, rng: Rng): Player[] {
  const school = playerSchool(state);
  // 卒業式を経ていない 3 年生がいれば、ここで卒業扱いにする
  if (school.players.some((p) => p.grade === 3)) graduate(state, rng);
  for (const p of school.players) {
    p.grade = (p.grade + 1) as 2 | 3;
    growHeight(rng, p);
    p.fitness = NEW_YEAR_FITNESS;
    p.status = "active";
  }
  const freshmen = generalFreshmen(rng, gradeSize(state.reputation), state.year);
  school.players.push(...freshmen);
  return freshmen;
}

/** 主将を決める（毎年 4 月。3 年生から総合と判断が最も高い選手。いなければ 2 年生から） */
export function chooseCaptain(state: GameState) {
  const school = playerSchool(state);
  const score = (p: Player) => overall(p) + p.stats.decision * 0.5;
  for (const grade of [3, 2, 1] as const) {
    const cands = school.players.filter((p) => p.grade === grade && p.status === "active");
    if (cands.length === 0) continue;
    school.captainId = cands.reduce((b, p) => (score(p) > score(b) ? p : b), cands[0]).id;
    return;
  }
  school.captainId = undefined;
}

export function rolloverCpuSchools(state: GameState, rng: Rng) {
  for (const s of Object.values(state.schools)) if (!s.isPlayer) advanceCpuSchool(rng, s, state.year);
}

