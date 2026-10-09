/**
 * スタッフ・OB の寸評（能力の数字を言葉にする）。
 */
import { ROLE_ABILITIES } from "../config/staff";
import { STAFF_ABILITIES, type StaffAbilities, type StaffAbility, type StaffRole } from "../types";

const STRONG: Record<StaffAbility, string> = {
  coaching: "教え方がうまい",
  tactics: "試合を読む目がある",
  gkCoaching: "GKの指導に定評がある",
  conditioning: "体づくりに詳しい",
  scouting: "相手の分析が得意",
};

/** 能力の段階（数字の代わりに出す言葉） */
export function abilityGrade(v: number): string {
  return v >= 85 ? "一流" : v >= 70 ? "優秀" : v >= 55 ? "頼れる" : v >= 40 ? "そこそこ" : v >= 25 ? "まだ未熟" : "素人同然";
}

/** 一番高い能力（同じなら STAFF_ABILITIES の順） */
export function bestAbility(ab: StaffAbilities): StaffAbility {
  return STAFF_ABILITIES.reduce((b, k) => (ab[k] > ab[b] ? k : b), STAFF_ABILITIES[0]);
}

/** その役割に効く能力の平均 */
export function roleFit(ab: StaffAbilities, role: StaffRole): number {
  const ks = ROLE_ABILITIES[role];
  return ks.reduce((s, k) => s + ab[k], 0) / ks.length;
}

/** 一番合う役割 */
export function bestRole(ab: StaffAbilities): StaffRole {
  const roles: StaffRole[] = ["head", "gk", "physical", "analyst"];
  return roles.reduce((b, r) => (roleFit(ab, r) > roleFit(ab, b) ? r : b), roles[0]);
}

/** 寸評（例：「頼れる。相手の分析が得意」） */
export function staffComment(ab: StaffAbilities): string {
  const k = bestAbility(ab);
  return `${abilityGrade(ab[k])}。${STRONG[k]}`;
}
