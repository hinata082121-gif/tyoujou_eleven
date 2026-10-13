/**
 * 設備（SPEC 15章、docs/PHASE2C_PLAN.md 9章）：効果・獲得・CPU 校の簡略な値。
 * 評判が下がってもレベルは下げない。
 */
import { CPU_FACILITY_RANGE, DONATION, FACILITY_EFFECTS, RECOVERY_CAP, REPUTATION_FACILITIES, RESULT_FACILITIES } from "../config/facilities";
import { FACILITY_NAMES, GROUND_LEVEL_NAMES, REPUTATION_NAMES } from "../config/names";
import { STAFF_EFFECTS } from "../config/staff";
import type { Rng } from "../rng";
import { FACILITY_IDS, type Alumnus, type Facilities, type FacilityId, type FacilityLevel, type FacilityLogEntry, type PracticeKind, type ReputationLevel } from "../types";

export const emptyFacilities = (): Facilities => ({ ground: 0, trainingRoom: 0, careRoom: 0, dorm: 0 });

/** 練習効率への設備の補正（スタッフと合わせて上限で切るのは practiceStaffMult） */
export function facilityPracticeBonus(f: Facilities, kind: PracticeKind): number {
  if (kind === "rest") return 0;
  let b = FACILITY_EFFECTS.groundPractice[f.ground];
  if (kind === "physical" || kind === "run") b += FACILITY_EFFECTS.trainingPractice[f.trainingRoom];
  return b;
}

/** 回復の倍率 = 1 + フィジカルコーチ + ケアルーム + 寮（上限 RECOVERY_CAP） */
export function totalRecoveryMult(conditioning: number, f: Facilities | undefined): number {
  const staff = (conditioning / 100) * STAFF_EFFECTS.recovery;
  const fac = f ? FACILITY_EFFECTS.careRecovery[f.careRoom] + FACILITY_EFFECTS.dormRecovery[f.dorm] : 0;
  return Math.min(RECOVERY_CAP, 1 + staff + fac);
}

/** ケガの確率への設備の倍率（トレーニングルーム） */
export function facilityInjuryMult(f: Facilities): number {
  return 1 - FACILITY_EFFECTS.trainingInjury[f.trainingRoom];
}

/** ケガの離脱日数への倍率（ケアルーム） */
export function injuryDaysMult(f: Facilities | undefined): number {
  return f ? 1 - FACILITY_EFFECTS.careInjuryDays[f.careRoom] : 1;
}

/** スカウトの反応への加算（寮） */
export function dormReactionBonus(f: Facilities): number {
  return FACILITY_EFFECTS.dormReaction[f.dorm];
}

/** 設備のレベルの表示（グラウンドは段階の名前） */
export function facilityLevelName(id: FacilityId, level: FacilityLevel): string {
  if (id === "ground") return GROUND_LEVEL_NAMES[level];
  return level === 0 ? "なし" : `レベル${level}`;
}

export interface FacilityHolder {
  year: number;
  facilities: Facilities;
  facilityLog: FacilityLogEntry[];
  facilityGrantedLevel: ReputationLevel;
}

/** 1 つ上げる（3 まで）。上げたら記録を返す */
export function raiseFacility(h: FacilityHolder, id: FacilityId, source: FacilityLogEntry["source"], toLevel?: FacilityLevel): FacilityLogEntry | null {
  const now = h.facilities[id];
  const next = (toLevel ?? Math.min(3, now + 1)) as FacilityLevel;
  if (next <= now) return null;
  h.facilities[id] = next;
  const e: FacilityLogEntry = { year: h.year, facility: id, level: next, source };
  h.facilityLog.push(e);
  return e;
}

/** 評判に初めて上がったときの整備（今の評判までで、まだ受け取っていない分をまとめて） */
export function grantReputationFacilities(h: FacilityHolder, level: ReputationLevel): FacilityLogEntry[] {
  const out: FacilityLogEntry[] = [];
  for (let l = h.facilityGrantedLevel + 1; l <= level; l++) {
    for (const [id, lv] of Object.entries(REPUTATION_FACILITIES[l as ReputationLevel]) as [FacilityId, FacilityLevel][]) {
      const e = raiseFacility(h, id, "reputation", lv);
      if (e) out.push(e);
    }
    h.facilityGrantedLevel = l as ReputationLevel;
  }
  return out;
}

/** 評判 level までの「評判で整備される設備」を全部付けた状態（マイグレーション用） */
export function facilitiesForReputation(level: ReputationLevel): Facilities {
  const h: FacilityHolder = { year: 0, facilities: emptyFacilities(), facilityLog: [], facilityGrantedLevel: 0 };
  grantReputationFacilities(h, level);
  return h.facilities;
}

/** レベルの一番低い設備（同じなら並び順で前）のうち、maxLevel 未満のもの */
export function lowestFacility(f: Facilities, maxLevel: FacilityLevel, rng?: Rng): FacilityId | null {
  const cands = FACILITY_IDS.filter((id) => f[id] < maxLevel);
  if (cands.length === 0) return null;
  const min = Math.min(...cands.map((id) => f[id]));
  const lows = cands.filter((id) => f[id] === min);
  return rng ? rng.pick(lows) : lows[0];
}

export interface YearResults {
  /** 夏か冬の全国大会に出たか・ベスト 4・優勝 */
  nationalAppearance: boolean;
  nationalTop4: boolean;
  nationalChampion: boolean;
  rookieRegionChampion: boolean;
  /** P3：県リーグの 1 部で優勝 */
  leagueTopChampion?: boolean;
}

/** 年度末の、大会の成績による整備（一番良い成績で 1 回だけ判定） */
export function resultFacilities(h: FacilityHolder, rng: Rng, r: YearResults): FacilityLogEntry | null {
  const key = r.nationalChampion ? "nationalChampion" : r.nationalTop4 ? "nationalTop4" : r.nationalAppearance ? "nationalAppearance" : r.leagueTopChampion ? "leagueTopChampion" : r.rookieRegionChampion ? "rookieRegionChampion" : null;
  if (!key) return null;
  const rule = RESULT_FACILITIES[key];
  if (!rng.chance(rule.chance)) return null;
  const id = lowestFacility(h.facilities, rule.maxLevel as FacilityLevel, rng);
  return id ? raiseFacility(h, id, "result") : null;
}

/** OB からの寄付の確率（プロに進んだ OB が多いほど起きやすい） */
export function donationChance(alumni: Alumnus[]): number {
  const pros = alumni.filter((a) => a.career === "pro" && !a.fictional);
  const weight = pros.reduce((s, a) => s + (a.overall >= DONATION.starOverall ? DONATION.starWeight : 1), 0);
  return Math.min(DONATION.max, weight * DONATION.perPro);
}

/** 設備の記録の文章 */
export function facilityLogText(e: FacilityLogEntry, reputation?: ReputationLevel): string {
  const name = FACILITY_NAMES[e.facility];
  const lv = facilityLevelName(e.facility, e.level);
  const why = e.source === "reputation" ? `評判が「${REPUTATION_NAMES[reputation ?? 0]}」になり、学校が整備してくれた` : e.source === "result" ? "大会での活躍が認められ、学校が整備してくれた" : "OBからの寄付で整備された";
  return `${why}。${name}が「${lv}」になった。`;
}

/** 次のレベルの手に入れ方のヒント（画面用） */
export function nextLevelHint(id: FacilityId, now: FacilityLevel, granted: ReputationLevel): string {
  if (now >= 3) return "最高のレベルです";
  const next = (now + 1) as FacilityLevel;
  for (let l = granted + 1; l <= 4; l++) {
    const lv = REPUTATION_FACILITIES[l as ReputationLevel][id];
    if (lv !== undefined && lv >= next) return `評判が「${REPUTATION_NAMES[l as ReputationLevel]}」になると整備される`;
  }
  if (next <= 2) return "全国大会への出場や新人戦の地域大会の優勝で、整備されることがある。OBからの寄付でも";
  return "全国大会で上位に入ると整備されることがある。OBからの寄付でも";
}

// ================= CPU 校 =================

export function cpuFacilities(rng: Rng, prestige: number): Facilities {
  const [lo, hi] = CPU_FACILITY_RANGE[Math.max(0, Math.min(5, Math.round(prestige)))];
  const f = emptyFacilities();
  for (const id of FACILITY_IDS) f[id] = rng.int(lo, hi) as FacilityLevel;
  return f;
}

/** 格が上がったら、その格の下限まで上げる（下げない） */
export function raiseCpuFacilities(f: Facilities, prestige: number) {
  const [lo] = CPU_FACILITY_RANGE[Math.max(0, Math.min(5, Math.round(prestige)))];
  for (const id of FACILITY_IDS) if (f[id] < lo) f[id] = lo;
}
