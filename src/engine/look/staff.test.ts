import { describe, expect, it } from "vitest";
import { STAFF_LOOK } from "../config/look";
import { newGame } from "../game";
import type { SchoolKits } from "../types";
import type { StaffMember } from "../types/staff";
import { ageEffects, staffAppearance, staffOutfit } from "./staff";

const kits: SchoolKits = { first: { template: 0, main: 4, sub: 0, shorts: 4, socks: 4 }, second: { template: 0, main: 0, sub: 4, shorts: 0, socks: 0 } };

describe("スタッフの見た目", () => {
  it("35 歳までは髪が黒いまま、それより上は白くなり、上限で止まる", () => {
    expect(ageEffects(30).gray).toBe(0);
    expect(ageEffects(35).gray).toBe(0);
    expect(ageEffects(45).gray).toBeGreaterThan(0);
    expect(ageEffects(55).gray).toBeGreaterThan(ageEffects(45).gray);
    expect(ageEffects(80).gray).toBe(STAFF_LOOK.grayMax);
  });

  it("45 歳から体が厚くなり、1.08 倍で止まる", () => {
    expect(ageEffects(44).build).toBe(1);
    expect(ageEffects(55).build).toBeGreaterThan(1);
    expect(ageEffects(90).build).toBe(STAFF_LOOK.buildMax);
  });

  it("役割で服装が変わる（分析担当はバインダー、GK コーチは学校の色と違う色のジャージ）", () => {
    expect(staffOutfit("head", kits)).toMatchObject({ kind: "polo", top: 4, binder: false });
    expect(staffOutfit("analyst", kits)).toMatchObject({ kind: "polo", binder: true });
    expect(staffOutfit("physical", kits)).toMatchObject({ kind: "jersey", top: 4, pants: 4 });
    const gk = staffOutfit("gk", kits);
    expect(gk.kind).toBe("jersey");
    expect([4, 0]).not.toContain(gk.top);
    // 紺のポロシャツなら、ズボンは紺でない色
    const navy: SchoolKits = { ...kits, first: { ...kits.first, main: 3 } };
    expect(staffOutfit("head", navy).pants).not.toBe(3);
  });

  it("OB のスタッフは在学中の見た目を引き継ぎ、臨時コーチは ID から同じ見た目を毎回作る。ゲームの状態は変えない", () => {
    const g = newGame("staff-look", "テスト");
    const ob = g.alumni.find((a) => a.look)!;
    const base = { name: "x", abilities: {} as StaffMember["abilities"], caps: {} as StaffMember["caps"], specialties: [], growthMult: 1, hiredYear: 1 };
    const member: StaffMember = { ...base, id: "st1", alumnusId: ob.id, role: "head", age18Year: g.year - 40 };
    const before = JSON.stringify(g);
    const a = staffAppearance(g, member, kits);
    expect(a.look).toEqual(ob.look);
    expect(a.age).toBe(58);
    const temp: StaffMember = { ...base, id: "tmp1", alumnusId: null, role: "gk", age18Year: g.year - 10, temporary: true };
    expect(staffAppearance(g, temp, kits).look).toEqual(staffAppearance(g, temp, kits).look);
    expect(JSON.stringify(g)).toBe(before);
  });
});

