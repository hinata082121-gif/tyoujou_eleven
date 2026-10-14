/**
 * スタッフの見た目（R1。表示だけ。PHASE_R1_PLAN 3.2）。
 *
 * OB のスタッフは在学中の見た目を引き継ぐ。臨時コーチはスタッフの ID から見た目を作る（ゲームの乱数は使わない）。
 * 年齢による変化（髪の白さ・体の厚み）と服装は、表示のたびに計算する（セーブには入れない）。
 */
import { KIT, STAFF_LOOK } from "../config/look";
import type { GameState, Look, SchoolKits } from "../types";
import type { StaffMember, StaffRole } from "../types/staff";
import { staffAge } from "../staff";
import { colorDistance, farthestFrom, generateLook, normalizeLook } from ".";

export type StaffOutfitKind = "polo" | "jersey";

export interface StaffOutfit {
  kind: StaffOutfitKind;
  /** 上着・襟や線・ズボンの色（パレットの番号） */
  top: number;
  trim: number;
  pants: number;
  /** 分析担当はバインダーを持つ */
  binder: boolean;
}

export interface StaffAppearance {
  look: Look;
  age: number;
  /** 髪の灰色の割合（0〜1） */
  gray: number;
  /** 体の厚みの倍率 */
  build: number;
  outfit: StaffOutfit;
}

/** 年齢から髪の灰色の割合と体の厚みを出す */
export function ageEffects(age: number): { gray: number; build: number } {
  const g = STAFF_LOOK;
  const gray = age <= g.grayFromAge ? 0 : Math.min(g.grayMax, ((age - g.grayFromAge) / (g.grayFullAge - g.grayFromAge)) * g.grayMax);
  const build = age <= g.buildFromAge ? 1 : Math.min(g.buildMax, 1 + (age - g.buildFromAge) * g.buildPerYear);
  return { gray, build };
}

/** 役割ごとの服装。色は学校の 1st のユニフォームから */
export function staffOutfit(role: StaffRole, kits: SchoolKits): StaffOutfit {
  const { main, sub } = kits.first;
  const trim = sub === main ? (main === 0 ? 1 : 0) : sub;
  switch (role) {
    case "physical":
      return { kind: "jersey", top: main, trim, pants: main, binder: false };
    case "gk": {
      const top = farthestFrom(null, KIT.gkColors, [main, sub]);
      return { kind: "jersey", top, trim: top === 1 ? 2 : 1, pants: 1, binder: false };
    }
    default: {
      const pants = STAFF_LOOK.pantsColors.find((c) => colorDistance(c, main) >= KIT.clashDeltaE) ?? farthestFrom(null, STAFF_LOOK.pantsFallback, [main]);
      return { kind: "polo", top: main, trim, pants, binder: role === "analyst" };
    }
  }
}

/** スタッフの見た目（OB の見た目を引き継ぐ。臨時コーチは ID から作る） */
export function staffAppearance(game: Pick<GameState, "seed" | "year" | "alumni">, member: StaffMember, kits: SchoolKits): StaffAppearance {
  const ob = member.alumnusId ? game.alumni.find((a) => a.id === member.alumnusId) : undefined;
  const look = ob?.look ? normalizeLook(ob.look) : generateLook(game.seed, member.alumnusId ?? member.id);
  const age = staffAge(member, game.year);
  return { look, age, ...ageEffects(age), outfit: staffOutfit(member.role, kits) };
}
