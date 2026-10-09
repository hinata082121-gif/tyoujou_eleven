/**
 * スタッフ制度（SPEC 9章）：枠・雇用・解任・配置換え・効果・成長・勇退・引き抜き。
 * 関数は GameState を直接書き換える（ゲーム全体の進行と同じ方針）。
 */
import { REPUTATION_TABLE } from "../config/reputation";
import { CPU_STAFF, ROLE_ABILITIES, STAFF_EFFECTS, STAFF_GROWTH, STAFF_LIFE, TEMP_COACH } from "../config/staff";
import { ROLE_NAMES } from "../config/names";
import { randomName } from "../player/generate";
import type { Rng } from "../rng";
import { addLog, playerSchool } from "../season";
import {
  GK_STATS,
  STAFF_ABILITIES,
  type Alumnus,
  type CpuStaff,
  type GameState,
  type Player,
  type PracticeKind,
  type Reputation,
  type StaffAbilities,
  type StaffMember,
  type StaffRole,
  type StaffSeasonStats,
  type StaffState,
} from "../types";
import { alumnusAge } from "./profile";

export { alumnusAge, generateFictionalAlumni, makeStaffProfile, pickSpecialties, staffAptitudes } from "./profile";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const emptySeasonStats = (): StaffSeasonStats => ({
  officialMatches: 0,
  goalsAgainst: 0,
  officialWins: 0,
  pkShootoutWins: 0,
  pkShootouts: 0,
  inMatchPkGood: 0,
  injuryDays: 0,
});

export const emptyStaffState = (): StaffState => ({ members: [], needsReview: false, dismissedThisYear: [], departedIds: [], season: emptySeasonStats() });

/** スタッフ枠（SPEC 6章の表。ヘッドコーチを含む） */
export function staffSlots(rep: Reputation): number {
  return REPUTATION_TABLE[rep.level].staffSlots;
}

export function staffAge(m: Pick<StaffMember, "age18Year">, year: number): number {
  return STAFF_LIFE.graduateAge + year - m.age18Year;
}

export function staffByRole(staff: StaffState, role: StaffRole): StaffMember | undefined {
  return staff.members.find((m) => m.role === role);
}

export function headCoach(staff: StaffState): StaffMember | undefined {
  return staffByRole(staff, "head");
}

/** 臨時コーチを除いたスタッフの数 */
function filledCount(staff: StaffState): number {
  return staff.members.filter((m) => !m.temporary).length;
}

/** 欠員があるか（年度の途中でも補充できる） */
export function hasVacancy(state: GameState): boolean {
  return filledCount(state.staff) < staffSlots(state.reputation);
}

/** 今、雇用や配置換えができる時期か（年度初めの編成中、またはゲーム開始時） */
export function isStaffWindow(state: GameState): boolean {
  return state.pending?.type === "staff";
}

// ================= 臨時コーチ =================

export function makeTemporaryCoach(rng: Rng, year: number): StaffMember {
  const abilities = {} as StaffAbilities;
  const caps = {} as StaffAbilities;
  for (const k of STAFF_ABILITIES) {
    abilities[k] = rng.int(TEMP_COACH.min, TEMP_COACH.max);
    caps[k] = TEMP_COACH.cap;
  }
  const age = rng.int(TEMP_COACH.age[0], TEMP_COACH.age[1]);
  return {
    id: rng.id("st"),
    alumnusId: null,
    name: randomName(rng),
    role: "head",
    abilities,
    caps,
    specialties: [],
    growthMult: 0.5,
    age18Year: year - (age - STAFF_LIFE.graduateAge),
    hiredYear: year,
    temporary: true,
  };
}

/** ヘッドコーチがいなければ臨時コーチを置く（ヘッドコーチは必須） */
export function ensureHeadCoach(state: GameState, rng: Rng) {
  if (headCoach(state.staff)) return;
  state.staff.members.push(makeTemporaryCoach(rng, state.year));
  addLog(state, `ヘッドコーチが不在のため、臨時コーチを置いた。OB からヘッドコーチを選べます。`, "info");
}

// ================= 候補 =================

export type Availability = { ok: true } | { ok: false; reason: string; fromYear?: number };

/** その OB を今スタッフにできるか */
export function alumnusAvailability(state: GameState, a: Alumnus): Availability {
  const st = state.staff;
  if (st.members.some((m) => m.alumnusId === a.id)) return { ok: false, reason: "スタッフとして在任中" };
  if (st.departedIds.includes(a.id)) return { ok: false, reason: "もう雇えない" };
  if (st.dismissedThisYear.includes(a.id)) return { ok: false, reason: "今年度は雇えない（解任したため）" };
  if (alumnusAge(a, state.year) >= STAFF_LIFE.forceRetireAge) return { ok: false, reason: "高齢のため雇えない" };
  if (a.staffProfile.availableFromYear > state.year) return { ok: false, reason: "まだ雇えない", fromYear: a.staffProfile.availableFromYear };
  return { ok: true };
}

/** 候補の OB 一覧（雇える人を先に、雇えるときの能力の高い順） */
export function staffCandidates(state: GameState): { alumnus: Alumnus; availability: Availability }[] {
  const best = (a: Alumnus) => Math.max(...STAFF_ABILITIES.map((k) => a.staffProfile.base[k]));
  return state.alumni
    .filter((a) => !state.staff.members.some((m) => m.alumnusId === a.id) && !state.staff.departedIds.includes(a.id))
    .map((alumnus) => ({ alumnus, availability: alumnusAvailability(state, alumnus) }))
    .sort((x, y) => Number(y.availability.ok) - Number(x.availability.ok) || best(y.alumnus) - best(x.alumnus));
}

// ================= 雇用・解任・配置換え =================

function memberFromAlumnus(rng: Rng, a: Alumnus, role: StaffRole, year: number): StaffMember {
  const p = a.staffProfile;
  return {
    id: rng.id("st"),
    alumnusId: a.id,
    name: a.name,
    role,
    abilities: { ...p.base },
    caps: { ...p.caps },
    specialties: [...p.specialties],
    growthMult: p.growthMult,
    age18Year: a.graduatedYear,
    hiredYear: year,
  };
}

/**
 * OB を雇う。年度初め（編成中）はいつでも、年度の途中は欠員があるときだけ。
 * ヘッドコーチの枠に雇うと、今のヘッドコーチ（臨時コーチ）と入れ替える。
 * 戻り値はエラーの理由（成功なら null）。
 */
export function hireStaff(state: GameState, rng: Rng, alumnusId: string, role: StaffRole): string | null {
  const st = state.staff;
  const a = state.alumni.find((x) => x.id === alumnusId);
  if (!a) return "その OB はいません";
  const av = alumnusAvailability(state, a);
  if (!av.ok) return av.reason;
  const window = isStaffWindow(state);
  const current = staffByRole(st, role);
  if (current && !current.temporary) {
    if (!window) return "その役割には在任中のスタッフがいます（年度の途中は解任してから補充します）";
  }
  // 新しく 1 人増える場合は、枠に空きが必要（臨時コーチとの入れ替えは増えない）
  const replacesSomeone = !!current;
  if (!replacesSomeone && filledCount(st) >= staffSlots(state.reputation)) return "スタッフの枠が埋まっています";
  if (current) {
    st.members = st.members.filter((m) => m !== current);
    if (!current.temporary) addLog(state, `${current.name}が${ROLE_NAMES[role]}を退いた。`, "info");
  }
  st.members.push(memberFromAlumnus(rng, a, role, state.year));
  addLog(state, `${a.name}を${ROLE_NAMES[role]}に迎えた。`, "good");
  return null;
}

/** 解任する（いつでもできる。解任した人はその年度は雇い直せない） */
export function dismissStaff(state: GameState, rng: Rng, memberId: string): string | null {
  const st = state.staff;
  const m = st.members.find((x) => x.id === memberId);
  if (!m) return "そのスタッフはいません";
  if (m.temporary) return "臨時コーチは、OB をヘッドコーチに雇うと入れ替わります";
  st.members = st.members.filter((x) => x !== m);
  if (m.alumnusId) st.dismissedThisYear.push(m.alumnusId);
  addLog(state, `${m.name}（${ROLE_NAMES[m.role]}）を解任した。`, "info");
  ensureHeadCoach(state, rng);
  return null;
}

/** 役割を変える（年度初めの編成中だけ）。その役割に人がいれば入れ替える */
export function changeStaffRole(state: GameState, memberId: string, role: StaffRole): string | null {
  if (!isStaffWindow(state)) return "配置換えは年度初めにできます";
  const st = state.staff;
  const m = st.members.find((x) => x.id === memberId);
  if (!m) return "そのスタッフはいません";
  if (m.temporary) return "臨時コーチはヘッドコーチのままです";
  if (m.role === role) return null;
  const other = staffByRole(st, role);
  if (other?.temporary) st.members = st.members.filter((x) => x !== other);
  else if (other) other.role = m.role;
  m.role = role;
  return null;
}

/** 年度初めの編成で、枠を超えた分の人を残さない（needsReview の解消）。keepIds 以外を解任扱いにせず去らせる */
export function staffOverSlots(state: GameState): number {
  return Math.max(0, filledCount(state.staff) - staffSlots(state.reputation));
}

/** 年度初めの編成を終える。枠を超えていれば終えられない */
export function finishStaffReview(state: GameState, rng: Rng): string | null {
  if (staffOverSlots(state) > 0) return `スタッフが枠を${staffOverSlots(state)}人超えています。誰かを外してください`;
  state.staff.needsReview = false;
  ensureHeadCoach(state, rng);
  if (state.pending?.type === "staff") state.pending = undefined;
  return null;
}

/** 枠を超えたスタッフを外す（年度初めの編成で、残さない人を選ぶ） */
export function releaseStaff(state: GameState, rng: Rng, memberId: string): string | null {
  const st = state.staff;
  const m = st.members.find((x) => x.id === memberId);
  if (!m || m.temporary) return "そのスタッフは外せません";
  st.members = st.members.filter((x) => x !== m);
  addLog(state, `${m.name}（${ROLE_NAMES[m.role]}）との契約を終えた。`, "info");
  ensureHeadCoach(state, rng);
  return null;
}

// ================= 効果（SPEC 9章・PLAN 4章） =================

const effect = (v: number) => clamp((v - STAFF_EFFECTS.effectFrom) / STAFF_EFFECTS.effectRange, 0, 1);

/**
 * 練習効率の補正（倍率）。ヘッドコーチの指導力は全員、GK コーチの GK 指導は GK 練習・PK 練習の GK に効く。
 * 合計は practiceCap で切る（インフレ防止）。
 */
export function practiceStaffMult(staff: StaffState, p: Pick<Player, "mainPosition">, kind: PracticeKind): number {
  let bonus = 0;
  const head = headCoach(staff);
  if (head) bonus += effect(head.abilities.coaching) * STAFF_EFFECTS.headPractice;
  const gk = staffByRole(staff, "gk");
  if (gk && p.mainPosition === "GK") {
    if (kind === "gk") bonus += effect(gk.abilities.gkCoaching) * STAFF_EFFECTS.gkPractice;
    if (kind === "pk") bonus += effect(gk.abilities.gkCoaching) * STAFF_EFFECTS.gkPkPractice;
  }
  return 1 + Math.min(STAFF_EFFECTS.practiceCap, bonus);
}

/** 毎日の自然回復の倍率（フィジカルコーチ） */
export function recoveryMult(staff: StaffState): number {
  const ph = staffByRole(staff, "physical");
  return 1 + (ph ? (ph.abilities.conditioning / 100) * STAFF_EFFECTS.recovery : 0);
}

/** ケガの確率の倍率（フィジカルコーチ） */
export function injuryMult(staff: StaffState): number {
  const ph = staffByRole(staff, "physical");
  return 1 - (ph ? (ph.abilities.conditioning / 100) * STAFF_EFFECTS.injuryReduce : 0);
}

/** 分析担当のスカウティング（いなければ 0） */
export function analystScouting(staff: StaffState): number {
  return staffByRole(staff, "analyst")?.abilities.scouting ?? 0;
}

/** 結果のみモードの采配の質（0〜1。ヘッドコーチの戦術眼） */
export function headAiQuality(staff: StaffState): number {
  return (headCoach(staff)?.abilities.tactics ?? 0) / 100;
}

// ================= CPU 校 =================

export function generateCpuStaff(rng: Rng, prestige: number): CpuStaff {
  const i = clamp(Math.round(prestige), 0, CPU_STAFF.tacticsMean.length - 1);
  const tactics = Math.round(clamp(rng.normal(CPU_STAFF.tacticsMean[i], CPU_STAFF.sd), 10, 95));
  const scouting = rng.chance(CPU_STAFF.noAnalystChance[i]) ? 0 : Math.round(clamp(rng.normal(CPU_STAFF.scoutingMean[i], CPU_STAFF.sd), 10, 95));
  return { tactics, scouting };
}

export function driftCpuStaff(rng: Rng, s: CpuStaff) {
  s.tactics = Math.round(clamp(s.tactics + rng.normal(0, CPU_STAFF.yearlySd), 10, 95));
  if (s.scouting > 0) s.scouting = Math.round(clamp(s.scouting + rng.normal(0, CPU_STAFF.yearlySd), 10, 95));
}

// ================= 成長・勇退・引き抜き =================

/** 役割の成果ボーナス（0〜maxBonus） */
export function performanceBonus(role: StaffRole, season: StaffSeasonStats, gkStatNow: number): number {
  let b = 0;
  switch (role) {
    case "head":
      b = season.officialWins * 0.08;
      break;
    case "gk": {
      const ga = season.officialMatches > 0 ? season.goalsAgainst / season.officialMatches : 1.6;
      b = clamp((1.6 - ga) / 1.6, 0, 1) * 0.3 + clamp((gkStatNow - (season.gkStatStart ?? gkStatNow)) / 40, 0, 1) * 0.2;
      break;
    }
    case "physical":
      b = clamp((60 - season.injuryDays) / 60, 0, 1) * 0.5;
      break;
    case "analyst":
      b = season.pkShootoutWins * 0.15 + season.inMatchPkGood * 0.05;
      break;
  }
  return clamp(b, 0, STAFF_GROWTH.maxBonus);
}

/** 1 年分の成長（年度末）。上限に近いほど伸びにくく、年齢が上がると止まる */
export function growStaffMember(rng: Rng, m: StaffMember, year: number, bonus: number) {
  const g = STAFF_GROWTH;
  const age = staffAge(m, year);
  const ageMult = age <= g.peakAge ? 1 : clamp(1 - (age - g.peakAge) / (g.stopAge - g.peakAge), 0, 1);
  const main = ROLE_ABILITIES[m.role];
  for (const k of STAFF_ABILITIES) {
    const w = main.includes(k) ? g.mainWeight : g.otherWeight;
    const headroom = clamp((m.caps[k] - m.abilities[k]) / g.headroomScale, 0, 1);
    const inc = g.base * w * m.growthMult * ageMult * headroom * (1 + bonus) + rng.normal(0, g.sd) * w * headroom * ageMult;
    m.abilities[k] = Math.round(clamp(m.abilities[k] + Math.max(0, inc), 1, m.caps[k]));
  }
}

function gkStatTotal(state: GameState): number {
  return playerSchool(state)
    .players.filter((p) => p.mainPosition === "GK" && p.status === "active")
    .reduce((s, p) => s + GK_STATS.reduce((t, k) => t + p.stats[k], 0), 0);
}

/** 引き抜きの確率（年あたり） */
export function poachChance(m: StaffMember): number {
  if (m.temporary) return 0;
  const best = Math.max(...STAFF_ABILITIES.map((k) => m.abilities[k]));
  const L = STAFF_LIFE;
  return L.poachMax * Math.pow(clamp((best - L.poachFrom) / L.poachRange, 0, 1), L.poachPow);
}

/** 12 月：引き抜きの予告（年度末に去る可能性がある） */
export function checkPoaching(state: GameState, rng: Rng) {
  for (const m of state.staff.members) {
    if (m.poachNotice || !rng.chance(poachChance(m))) continue;
    const best = Math.max(...STAFF_ABILITIES.map((k) => m.abilities[k]));
    const by = best >= STAFF_LIFE.proOfferFrom && rng.chance(0.5) ? "pro" : "school";
    m.poachNotice = { by, year: state.year };
    addLog(state, `${m.name}${m.role === "head" ? "コーチ" : `（${ROLE_NAMES[m.role]}）`}に${by === "pro" ? "プロのクラブ" : "他校"}から誘いが来ているらしい……`, "bad");
  }
}

export interface StaffYearEndResult {
  grown: { name: string; gained: number }[];
  retired: string[];
  poached: string[];
}

/** 年度末（卒業式の後）：成長 → 引き抜き → 勇退。去った人の枠は欠員になり、ヘッドコーチは臨時コーチになる */
export function staffYearEnd(state: GameState, rng: Rng): StaffYearEndResult {
  const st = state.staff;
  const res: StaffYearEndResult = { grown: [], retired: [], poached: [] };
  const gkNow = gkStatTotal(state);
  for (const m of st.members) {
    if (m.temporary) continue;
    const before = STAFF_ABILITIES.reduce((s, k) => s + m.abilities[k], 0);
    growStaffMember(rng, m, state.year, performanceBonus(m.role, st.season, gkNow));
    const gained = STAFF_ABILITIES.reduce((s, k) => s + m.abilities[k], 0) - before;
    if (gained > 0) res.grown.push({ name: m.name, gained });
  }
  const leaving: StaffMember[] = [];
  for (const m of st.members) {
    if (m.temporary) continue;
    if (m.poachNotice && rng.chance(STAFF_LIFE.leaveAfterNotice)) {
      leaving.push(m);
      res.poached.push(m.name);
      addLog(state, `${m.name}が${m.poachNotice.by === "pro" ? "プロのクラブ" : "他校"}に移ることになった。`, "bad");
      continue;
    }
    if (m.poachNotice) {
      addLog(state, `${m.name}は誘いを断り、来年度も残ってくれることになった。`, "good");
      delete m.poachNotice;
    }
    // 年度末に 1 つ年をとった後の年齢で判定する
    const age = staffAge(m, state.year + 1);
    if (age >= STAFF_LIFE.forceRetireAge || (age >= STAFF_LIFE.retireFromAge && rng.chance(STAFF_LIFE.retireChance))) {
      leaving.push(m);
      res.retired.push(m.name);
      addLog(state, `${m.name}（${age}歳）が勇退することになった。長い間ありがとうございました。`, "info");
    }
  }
  st.members = st.members.filter((m) => !leaving.includes(m));
  for (const m of leaving) if (m.alumnusId) st.departedIds.push(m.alumnusId);
  return res;
}

/** 年度の始まり：成果の記録をリセットし、枠を超えていれば編成で選ばせる */
export function startStaffYear(state: GameState, rng: Rng) {
  const st = state.staff;
  st.season = emptySeasonStats();
  st.season.gkStatStart = gkStatTotal(state);
  st.dismissedThisYear = [];
  ensureHeadCoach(state, rng);
  st.needsReview = staffOverSlots(state) > 0;
}
