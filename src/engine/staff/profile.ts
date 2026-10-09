/**
 * OB のスタッフとしての素質（SPEC 9章「能力の決まり方」、PLAN 2章）。
 * 現役時代の能力で得意分野が決まり、進路で伸び方と雇える時期が決まる。
 * 指導力は現役の強さより「指導の素質」（仮の隠しパラメーター）で決まる割合が大きい。
 */
import { CAREER_STAFF, FICTIONAL_ALUMNI, STAFF_GEN, STAFF_LIFE } from "../config/staff";
import { CAREER_KEYS } from "../season/careers";
import { careerWeights } from "../config/season";
import { generatePlayer, randomName } from "../player/generate";
import { overall } from "../player/rating";
import type { Rng } from "../rng";
import { STAFF_ABILITIES, type Alumnus, type Career, type Position, type StaffAbilities, type StaffAbility, type StaffProfile, type Stats } from "../types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface AlumnusBasics {
  stats: Stats;
  position: Position;
  overall: number;
  career: Career;
  graduatedYear: number;
  wasCaptain: boolean;
}

/** 現役時代の能力から出す「素地」（0〜1） */
export function staffAptitudes(a: Omit<AlumnusBasics, "career" | "graduatedYear">, teachingTalent: number): StaffAbilities {
  const s = a.stats;
  const isGk = a.position === "GK";
  const tactics = isGk ? ((s.vision + s.positioning) / 200) * 0.8 : (s.decision * 0.6 + s.vision * 0.4) / 100;
  return {
    coaching: clamp((a.overall / 100) * STAFF_GEN.coachingFromOverall + teachingTalent * STAFF_GEN.coachingFromTalent, 0, 1),
    tactics: clamp(tactics + (a.wasCaptain ? STAFF_GEN.captainTactics : 0), 0, 1),
    gkCoaching: isGk ? (s.saving + s.highBall + s.positioning + s.catching) / 400 : 0.15,
    conditioning: (s.stamina + s.physical) / 200,
    scouting: (s.vision * 0.4 + s.decision * 0.3 + s.pkSkill * 0.3) / 100,
  };
}

/** 素地の高い順に得意分野を 1〜2 個 */
export function pickSpecialties(apt: StaffAbilities): StaffAbility[] {
  const sorted = [...STAFF_ABILITIES].sort((x, y) => apt[y] - apt[x]);
  return apt[sorted[0]] - apt[sorted[1]] <= STAFF_GEN.secondSpecialtyGap ? [sorted[0], sorted[1]] : [sorted[0]];
}

export function makeStaffProfile(rng: Rng, a: AlumnusBasics): StaffProfile {
  const teachingTalent = clamp(rng.normal(STAFF_GEN.talentMean, STAFF_GEN.talentSd), 0, 1);
  const apt = staffAptitudes(a, teachingTalent);
  const career = CAREER_STAFF[a.career];
  const specialties = pickSpecialties(apt);
  const base = {} as StaffAbilities;
  const caps = {} as StaffAbilities;
  for (const k of STAFF_ABILITIES) {
    const v = STAFF_GEN.base + STAFF_GEN.fromAptitude * apt[k] + (career.bonus[k] ?? 0) + rng.normal(0, STAFF_GEN.sd);
    base[k] = Math.round(clamp(v, STAFF_GEN.min, STAFF_GEN.max));
    if (specialties.includes(k)) {
      const cap = STAFF_GEN.specialtyCapBase + STAFF_GEN.specialtyCapFromAptitude * apt[k] + rng.normal(0, STAFF_GEN.specialtyCapSd);
      caps[k] = Math.round(clamp(cap, STAFF_GEN.specialtyCapMin, 100));
    } else {
      caps[k] = Math.round(rng.range(STAFF_GEN.otherCapMin, STAFF_GEN.otherCapMax));
    }
    caps[k] = Math.max(caps[k], base[k] + STAFF_GEN.otherCapMargin);
    if (!specialties.includes(k)) caps[k] = Math.min(caps[k], STAFF_GEN.otherCapMax);
    base[k] = Math.min(base[k], caps[k]);
  }
  const [lo, hi] = career.availableAfter;
  return {
    availableFromYear: a.graduatedYear + rng.int(lo, hi),
    base,
    caps,
    specialties,
    teachingTalent: Math.round(teachingTalent * 100) / 100,
    growthMult: career.growthMult,
  };
}

/** OB の年齢（卒業時を 18 歳とする） */
export function alumnusAge(a: Pick<Alumnus, "graduatedYear">, year: number): number {
  return STAFF_LIFE.graduateAge + year - a.graduatedYear;
}

/**
 * 架空の OB を生成する（ゲーム開始時と、Phase 1 のセーブのマイグレーション）。
 * 全員がすぐ雇える。少なくとも 1 人は「指導者の道」、1 人は GK 出身にする。
 */
export function generateFictionalAlumni(rng: Rng, year: number): Alumnus[] {
  const n = rng.int(FICTIONAL_ALUMNI.count[0], FICTIONAL_ALUMNI.count[1]);
  const list: Alumnus[] = [];
  for (let i = 0; i < n; i++) {
    const age = rng.int(FICTIONAL_ALUMNI.age[0], FICTIONAL_ALUMNI.age[1]);
    const graduatedYear = year - (age - STAFF_LIFE.graduateAge);
    const p = generatePlayer(rng, { grade: 3, enrolledYear: graduatedYear - 2, base: FICTIONAL_ALUMNI.statBase, position: i === 1 ? "GK" : undefined });
    const ovr = Math.round(overall(p));
    const w = careerWeights(ovr);
    const career: Career = i === 0 ? "coach" : rng.weighted(CAREER_KEYS, (c) => w[c]);
    const wasCaptain = rng.chance(0.2);
    const basics: AlumnusBasics = { stats: p.stats, position: p.mainPosition, overall: ovr, career, graduatedYear, wasCaptain };
    const profile = makeStaffProfile(rng, basics);
    profile.availableFromYear = Math.min(profile.availableFromYear, year);
    for (const k of STAFF_ABILITIES) profile.base[k] = Math.min(profile.base[k], FICTIONAL_ALUMNI.maxStart);
    const apps = rng.int(5, 40);
    list.push({
      id: rng.id("ob"),
      name: randomName(rng),
      graduatedYear,
      position: p.mainPosition,
      overall: ovr,
      career,
      stats: { ...p.stats },
      fictional: true,
      wasCaptain,
      record: { apps, goals: p.mainPosition === "GK" ? 0 : rng.int(0, Math.round(apps / 4)), officialApps: Math.round(apps / 3), officialGoals: 0, winterResults: [] },
      staffProfile: profile,
    });
  }
  return list;
}
