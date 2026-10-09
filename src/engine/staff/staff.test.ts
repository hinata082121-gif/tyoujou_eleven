import { describe, expect, it } from "vitest";
import { STAFF_EFFECTS, STAFF_GEN, STAFF_LIFE } from "../config/staff";
import { finishStaff, hire, newGame, dismiss, changeRole } from "../game";
import { generatePlayer } from "../player/generate";
import { overall } from "../player/rating";
import { Rng } from "../rng";
import { STAFF_ABILITIES, type GameState, type StaffMember } from "../types";
import {
  checkPoaching,
  generateFictionalAlumni,
  growStaffMember,
  hasVacancy,
  headCoach,
  makeStaffProfile,
  poachChance,
  practiceStaffMult,
  staffAptitudes,
  staffSlots,
  staffYearEnd,
} from ".";

function member(over: Partial<StaffMember> = {}): StaffMember {
  const ab = Object.fromEntries(STAFF_ABILITIES.map((k) => [k, 40])) as StaffMember["abilities"];
  const caps = Object.fromEntries(STAFF_ABILITIES.map((k) => [k, 70])) as StaffMember["caps"];
  return { id: "m1", alumnusId: null, name: "テスト", role: "head", abilities: ab, caps, specialties: [], growthMult: 1, age18Year: 1 - 12, hiredYear: 1, ...over };
}

function freshGame(seed = "staff"): GameState {
  return newGame(seed, "スタッフ高校");
}

describe("スタッフの能力の生成", () => {
  it("GK だった人は GK 指導、主将だった人は戦術眼の素地が高い", () => {
    const rng = Rng.fromSeed("apt");
    const gk = generatePlayer(rng, { grade: 3, enrolledYear: 1, base: 60, position: "GK" });
    const cf = generatePlayer(rng, { grade: 3, enrolledYear: 1, base: 60, position: "CF" });
    const a = (p: typeof gk, wasCaptain = false) => staffAptitudes({ stats: p.stats, position: p.mainPosition, overall: overall(p), wasCaptain }, 0.5);
    expect(a(gk).gkCoaching).toBeGreaterThan(a(cf).gkCoaching + 0.3);
    expect(a(cf, true).tactics - a(cf).tactics).toBeCloseTo(STAFF_GEN.captainTactics, 5);
  });

  it("名選手、名監督にあらず：指導力は現役の強さより指導の素質で決まる", () => {
    const rng = Rng.fromSeed("talent");
    const star = generatePlayer(rng, { grade: 3, enrolledYear: 1, base: 85 });
    const weak = generatePlayer(rng, { grade: 3, enrolledYear: 1, base: 35 });
    const coach = (p: typeof star, talent: number) => staffAptitudes({ stats: p.stats, position: p.mainPosition, overall: overall(p), wasCaptain: false }, talent).coaching;
    // 素質が高い控え選手の方が、素質が低いスター選手より指導力の素地が高い
    expect(coach(weak, 0.8)).toBeGreaterThan(coach(star, 0.3));
  });

  it("得意分野は 1〜2 個で、得意分野以外の上限は 80 を超えない。進路で雇える時期が決まる", () => {
    const rng = Rng.fromSeed("profile");
    for (let i = 0; i < 300; i++) {
      const p = generatePlayer(rng, { grade: 3, enrolledYear: 1, base: rng.range(30, 80) });
      const career = rng.pick(["pro", "university", "worker", "coach", "other"] as const);
      const prof = makeStaffProfile(rng, { stats: p.stats, position: p.mainPosition, overall: overall(p), career, graduatedYear: 3, wasCaptain: false });
      expect(prof.specialties.length).toBeGreaterThanOrEqual(1);
      expect(prof.specialties.length).toBeLessThanOrEqual(2);
      for (const k of STAFF_ABILITIES) {
        expect(prof.base[k]).toBeLessThanOrEqual(prof.caps[k]);
        if (!prof.specialties.includes(k)) expect(prof.caps[k]).toBeLessThanOrEqual(STAFF_GEN.otherCapMax);
        else expect(prof.caps[k]).toBeLessThanOrEqual(100);
      }
      if (career === "university" || career === "coach") expect(prof.availableFromYear).toBe(3 + 4);
      if (career === "pro") expect(prof.availableFromYear).toBeGreaterThanOrEqual(3 + 8);
    }
  });

  it("ゲーム開始時の架空の OB は全員すぐ雇え、指導者の道と GK 出身が 1 人ずつはいる", () => {
    const list = generateFictionalAlumni(Rng.fromSeed("fic"), 1);
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list.every((a) => a.staffProfile.availableFromYear <= 1 && a.fictional)).toBe(true);
    expect(list.some((a) => a.career === "coach")).toBe(true);
    expect(list.some((a) => a.position === "GK")).toBe(true);
    for (const a of list) for (const k of STAFF_ABILITIES) expect(a.staffProfile.base[k]).toBeLessThan(50);
  });
});

describe("スタッフの成長", () => {
  it("上限を超えず、上限に近いほど伸びにくい。得意分野以外は 80 を超えない", () => {
    const rng = Rng.fromSeed("grow");
    const far = member({ abilities: { coaching: 30, tactics: 30, gkCoaching: 30, conditioning: 30, scouting: 30 } });
    const near = member({ id: "m2", abilities: { coaching: 66, tactics: 66, gkCoaching: 30, conditioning: 30, scouting: 30 } });
    growStaffMember(rng, far, 1, 0);
    growStaffMember(rng, near, 1, 0);
    expect(far.abilities.coaching - 30).toBeGreaterThan(near.abilities.coaching - 66);
    const m = member({ caps: { coaching: 100, tactics: 75, gkCoaching: 60, conditioning: 60, scouting: 60 }, specialties: ["coaching"] });
    for (let y = 0; y < 60; y++) growStaffMember(rng, m, 1, 0.5);
    expect(m.abilities.tactics).toBeLessThanOrEqual(75);
    expect(m.abilities.gkCoaching).toBeLessThanOrEqual(60);
    expect(m.abilities.coaching).toBeLessThanOrEqual(100);
    expect(m.abilities.coaching).toBeGreaterThan(90);
  });

  it("年齢が上がると伸びが止まる（60 歳で 0）", () => {
    const rng = Rng.fromSeed("old");
    const old = member({ age18Year: 1 - (60 - 18) });
    const before = { ...old.abilities };
    growStaffMember(rng, old, 1, 0.5);
    expect(old.abilities).toEqual(before);
  });
});

describe("雇用・枠・臨時コーチ", () => {
  it("ゲーム開始時は臨時コーチがいて、OB をヘッドコーチに雇うと入れ替わる", () => {
    const s = freshGame();
    expect(s.pending?.type).toBe("staff");
    expect(headCoach(s.staff)?.temporary).toBe(true);
    const ob = s.alumni.find((a) => a.career === "coach")!;
    expect(hire(s, ob.id, "head")).toBeNull();
    expect(headCoach(s.staff)?.alumnusId).toBe(ob.id);
    expect(s.staff.members).toHaveLength(1);
    // 弱小は枠 1：ほかの役割は雇えない
    expect(staffSlots(s.reputation)).toBe(1);
    const other = s.alumni.find((a) => a.id !== ob.id)!;
    expect(hire(s, other.id, "gk")).not.toBeNull();
    expect(finishStaff(s)).toBeNull();
    expect(s.pending).toBeUndefined();
  });

  it("年度の途中は欠員があるときだけ補充できる。解任した人はその年度は雇い直せない", () => {
    const s = freshGame("midyear");
    const [a, b] = s.alumni;
    hire(s, a.id, "head");
    finishStaff(s);
    // 在任中のヘッドコーチがいるので、年度の途中は入れ替えられない
    expect(hire(s, b.id, "head")).not.toBeNull();
    // 解任すると臨時コーチになり、欠員として補充できる
    expect(dismiss(s, headCoach(s.staff)!.id)).toBeNull();
    expect(headCoach(s.staff)?.temporary).toBe(true);
    expect(hire(s, a.id, "head")).toMatch(/解任/);
    expect(hire(s, b.id, "head")).toBeNull();
    // 配置換えは年度初めだけ
    expect(changeRole(s, headCoach(s.staff)!.id, "analyst")).not.toBeNull();
  });

  it("評判が上がって枠が増えたら、年度の途中でもすぐ補充できる", () => {
    const s = freshGame("slots");
    hire(s, s.alumni[0].id, "head");
    finishStaff(s);
    expect(hasVacancy(s)).toBe(false);
    s.reputation.level = 2;
    expect(hasVacancy(s)).toBe(true);
    const gkOb = s.alumni.find((a) => a.position === "GK" && a.id !== s.alumni[0].id)!;
    expect(hire(s, gkOb.id, "gk")).toBeNull();
  });

  it("練習効率の補正は全部合わせても +15% まで", () => {
    const s = freshGame("cap");
    const full = Object.fromEntries(STAFF_ABILITIES.map((k) => [k, 100])) as StaffMember["abilities"];
    s.staff.members = [member({ abilities: { ...full } }), member({ id: "g", role: "gk", abilities: { ...full } })];
    expect(practiceStaffMult(s.staff, { mainPosition: "GK" }, "pk")).toBeCloseTo(1 + STAFF_EFFECTS.practiceCap, 5);
    expect(practiceStaffMult(s.staff, { mainPosition: "CF" }, "pk")).toBeCloseTo(1 + STAFF_EFFECTS.headPractice, 5);
    s.staff.members = [];
    expect(practiceStaffMult(s.staff, { mainPosition: "CF" }, "shoot")).toBe(1);
  });
});

describe("勇退・引き抜き", () => {
  it("68 歳で必ず勇退し、その OB はもう雇えない", () => {
    const s = freshGame("retire");
    const old = member({ alumnusId: s.alumni[0].id, age18Year: s.year - (STAFF_LIFE.forceRetireAge - 1 - 18) });
    s.staff.members = [old];
    const r = staffYearEnd(s, Rng.fromSeed("r"));
    expect(r.retired).toContain(old.name);
    expect(s.staff.members).toHaveLength(0);
    expect(s.staff.departedIds).toContain(s.alumni[0].id);
  });

  it("優秀なスタッフほど引き抜かれやすく、予告のあと年度末に去ることがある", () => {
    expect(poachChance(member())).toBe(0);
    const star = member({ abilities: { coaching: 95, tactics: 60, gkCoaching: 30, conditioning: 30, scouting: 30 } });
    const good = member({ abilities: { coaching: 80, tactics: 60, gkCoaching: 30, conditioning: 30, scouting: 30 } });
    expect(poachChance(star)).toBeGreaterThan(poachChance(good));
    let noticed = 0;
    let left = 0;
    const s = freshGame("poach");
    for (let i = 0; i < 300; i++) {
      s.staff.departedIds = [];
      const m = member({ abilities: { ...star.abilities }, alumnusId: s.alumni[0].id, age18Year: s.year - 22 });
      s.staff.members = [m];
      checkPoaching(s, Rng.fromSeed(`p${i}`));
      if (!m.poachNotice) continue;
      noticed++;
      expect(s.log.at(-1)?.text).toMatch(/誘い/);
      const r = staffYearEnd(s, Rng.fromSeed(`y${i}`));
      if (r.poached.length) left++;
      if (noticed >= 20) break;
    }
    expect(noticed).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(noticed);
  });
});
