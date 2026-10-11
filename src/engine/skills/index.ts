/**
 * 特殊能力の持ち方（SPEC 7.7）。
 * 段階のある系統は今の段階だけを持つ。下の段階がないと上の段階は習得できず、上の段階を習得したら置き換える。
 */
import { SKILL_DEFS, SKILL_LINE_TIERS } from "../config/skills";
import type { Player, SkillDef, SkillId, SkillLine, SkillTier } from "../types";

export const skillDef = (id: SkillId): SkillDef => SKILL_DEFS[id];

export function hasSkill(p: Pick<Player, "skills">, id: SkillId): boolean {
  return p.skills.includes(id);
}

/** その系統で今持っている特殊能力（なければ null） */
export function skillInLine(p: Pick<Player, "skills">, line: SkillLine): SkillId | null {
  return p.skills.find((s) => SKILL_DEFS[s].line === line) ?? null;
}

export const isMinus = (id: SkillId) => SKILL_DEFS[id].tier === "minus";
export const isGold = (id: SkillId) => SKILL_DEFS[id].tier === "gold";
export const isPlus = (id: SkillId) => !isMinus(id);

/** プラスの特殊能力の数（◎・金色も 1 つと数える） */
export const plusCount = (p: Pick<Player, "skills">) => p.skills.filter(isPlus).length;
export const goldCount = (p: Pick<Player, "skills">) => p.skills.filter(isGold).length;

/** その選手の役割（GK／フィールド）に合う特殊能力か */
export function fitsRole(p: Pick<Player, "mainPosition">, id: SkillId): boolean {
  const t = SKILL_DEFS[id].target;
  if (t === "all") return true;
  return t === "gk" ? p.mainPosition === "GK" : p.mainPosition !== "GK";
}

/** 系統の中の 1 つ下の段階（○ の下は無し） */
export function prerequisite(id: SkillId): SkillId | null {
  const def = SKILL_DEFS[id];
  if (!def.line) return null;
  const t = SKILL_LINE_TIERS[def.line];
  if (def.tier === "double") return t.plus;
  if (def.tier === "gold") return t.double;
  return null;
}

/**
 * 習得できる状態か（段階・役割・持っているもの）。
 * - ×：その系統に何も持っていない（段階なしの × は持っていない）
 * - ○：その系統に何も持っていない（× を持っていれば、先に × を消す）
 * - ◎・金色：1 つ下の段階を持っている（利き足の金色＝両利きは、逆足× がないこと）
 * - 段階なし（単独の金色を含む）：まだ持っていない
 */
export function canLearn(p: Pick<Player, "skills" | "mainPosition">, id: SkillId): boolean {
  if (!fitsRole(p, id) || hasSkill(p, id)) return false;
  const def = SKILL_DEFS[id];
  if (!def.line) return true;
  const cur = skillInLine(p, def.line);
  if (def.tier === "minus" || def.tier === "plus") return cur === null;
  const pre = prerequisite(id);
  if (pre === null) return cur === null; // 両利き（下の段階なし）
  return cur === pre;
}

/** 習得する（系統の下の段階と置き換える）。習得できなければ false */
export function learnSkill(p: Pick<Player, "skills" | "mainPosition">, id: SkillId): boolean {
  if (!canLearn(p, id)) return false;
  const line = SKILL_DEFS[id].line;
  if (line) p.skills = p.skills.filter((s) => SKILL_DEFS[s].line !== line);
  p.skills.push(id);
  return true;
}

export function removeSkill(p: Pick<Player, "skills">, id: SkillId): boolean {
  if (!hasSkill(p, id)) return false;
  p.skills = p.skills.filter((s) => s !== id);
  return true;
}

/** その系統の次の段階（○→◎→金色。何もなければ ○）。上がれなければ null */
export function nextInLine(p: Pick<Player, "skills" | "mainPosition">, line: SkillLine): SkillId | null {
  const t = SKILL_LINE_TIERS[line];
  const cur = skillInLine(p, line);
  let next: SkillId | null;
  if (cur === null) next = t.plus;
  else if (cur === t.plus) next = t.double;
  else if (cur === t.double) next = t.gold;
  else next = null;
  return next && fitsRole(p, next) ? next : null;
}

/** 段階の記号（○・◎・金・×・段階なしは空） */
export function tierOf(id: SkillId): SkillTier {
  return SKILL_DEFS[id].tier;
}
