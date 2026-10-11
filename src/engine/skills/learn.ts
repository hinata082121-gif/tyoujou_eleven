/**
 * 特殊能力の習得（SPEC 7.7「入手方法」、docs/PHASE2B_PLAN.md 5章）。
 * 特訓マス・イベント・試合での成果・合宿（P2c の差し込み口）・CPU 校の判定は、すべてここの関数を使う。
 */
import { INSPIRED_GOLD_MULT, PERSONALITY_SKILLS } from "../config/personality";
import { PLAY_STYLE_DEFS, PROFICIENCY } from "../config/playStyle";
import { GOLD_REQUIREMENTS, SKILL_DEFS, SKILL_LEARN, TRAINING_GOLDS, TRAINING_POOLS, TRAINING_REMOVES } from "../config/skills";
import { isPracticeTarget } from "../practice";
import type { Rng } from "../rng";
import { SKILL_IDS, type Player, type PlayerFeats, type PracticeKind, type SkillId } from "../types";
import { canLearn, fitsRole, hasSkill, isGold, isMinus, learnSkill, nextInLine, removeSkill } from ".";

export interface LearnEvent {
  playerId: string;
  name: string;
  skill: SkillId;
  /** learn = 習得、remove = × が消えた */
  kind: "learn" | "remove";
}

export const emptyFeats = (): PlayerFeats => ({
  oneOnOneGoals: 0,
  headerGoals: 0,
  fkGoals: 0,
  cornerAssists: 0,
  crossAssists: 0,
  feedAssists: 0,
  duelWins: 0,
  aerialWins: 0,
  gkOneOnOneStops: 0,
  pkStreak: 0,
});

/** スタイルとの相性・性格との相性・段階の補正をかけた習得の確率（金色は 0。金色は goldChance） */
export function learnChance(p: Player, id: SkillId, base: number): number {
  if (isGold(id) || !canLearn(p, id)) return 0;
  let c = base;
  if (PLAY_STYLE_DEFS[p.playStyle].skillAffinity.includes(id)) c *= SKILL_LEARN.styleAffinityBase + SKILL_LEARN.styleAffinityPerProficiency * (p.styleProficiency / 100);
  if (PERSONALITY_SKILLS[p.personality].includes(id)) c *= SKILL_LEARN.personalityMult;
  if (SKILL_DEFS[id].tier === "double") c *= SKILL_LEARN.doubleMult;
  return Math.min(0.95, c);
}

/** 金色の前提と成果の条件をそろえているか */
export function goldReady(p: Player, id: SkillId): boolean {
  if (!isGold(id) || !canLearn(p, id)) return false;
  if (id === "footG") return p.styleProficiency >= SKILL_LEARN.footGoldMinProficiency;
  const req = GOLD_REQUIREMENTS[id];
  if (!req) return false;
  if (req.requires && !hasSkill(p, req.requires)) return false;
  if (!req.feat) return true;
  return (p.feats?.[req.feat.key] ?? 0) >= req.feat.count;
}

/** 金色の判定の確率（条件をそろえていなければ 0。ひらめき型は上がる） */
export function goldChance(p: Player, id: SkillId, base: number): number {
  if (!goldReady(p, id)) return 0;
  let c = base;
  if (PERSONALITY_SKILLS[p.personality].includes(id)) c *= SKILL_LEARN.personalityMult;
  if (p.personality === "inspired") c *= INSPIRED_GOLD_MULT;
  return Math.min(0.95, c);
}

/** 候補を順に判定し、最初に当たったものを習得する（1 回に 1 つまで） */
export function tryLearn(rng: Rng, p: Player, pool: readonly SkillId[], base: number): SkillId | null {
  for (const id of rng.shuffle([...pool])) {
    const c = learnChance(p, id, base);
    if (c > 0 && rng.chance(c) && learnSkill(p, id)) return id;
  }
  return null;
}

/** 金色を判定する（候補のうち条件をそろえたものだけ） */
export function tryLearnGold(rng: Rng, p: Player, pool: readonly SkillId[], base: number): SkillId | null {
  for (const id of pool) {
    const c = id === "footG" ? goldChance(p, id, SKILL_LEARN.footGoldTraining) : goldChance(p, id, base);
    if (c > 0 && rng.chance(c) && learnSkill(p, id)) return id;
  }
  return null;
}

const ev = (p: Player, skill: SkillId, kind: LearnEvent["kind"] = "learn"): LearnEvent => ({ playerId: p.id, name: p.name, skill, kind });

/**
 * 特訓マス（PLAN 5.2）：そこまで使ったカードの練習の対象者全員が判定する。
 * 関係する × が消える判定 → 通常の候補 → 金色（条件をそろえた選手だけ）の順。
 */
export function trainingSquare(rng: Rng, players: Player[], practice: PracticeKind): LearnEvent[] {
  const out: LearnEvent[] = [];
  for (const p of players) {
    if (p.status !== "active" || p.injuryDays > 0 || !isPracticeTarget(p, practice)) continue;
    for (const minus of TRAINING_REMOVES[practice]) {
      if (hasSkill(p, minus) && rng.chance(SKILL_LEARN.trainingRemoveMinus) && removeSkill(p, minus)) out.push(ev(p, minus, "remove"));
    }
    const learned = tryLearn(rng, p, TRAINING_POOLS[practice], SKILL_LEARN.trainingBase);
    if (learned) {
      out.push(ev(p, learned));
      continue;
    }
    const gold = tryLearnGold(rng, p, TRAINING_GOLDS[practice], SKILL_LEARN.goldTraining);
    if (gold) out.push(ev(p, gold));
  }
  return out;
}

/** 合宿（P2c の差し込み口）：練習方針の候補で、複数の選手が判定する。カレンダーからはまだ呼ばない */
export function campLearning(rng: Rng, players: Player[], policy: PracticeKind[], base = SKILL_LEARN.trainingBase): LearnEvent[] {
  const pool = [...new Set(policy.flatMap((k) => TRAINING_POOLS[k]))];
  const out: LearnEvent[] = [];
  for (const p of players) {
    if (p.status !== "active" || p.injuryDays > 0) continue;
    const learned = tryLearn(rng, p, pool, base);
    if (learned) out.push(ev(p, learned));
  }
  return out;
}

/** プラスの候補（金色を除く。スタイルの相性を優先した重みで 1 つ選ぶ用） */
function plusPool(p: Player): SkillId[] {
  return SKILL_IDS.filter((id) => !isGold(id) && !isMinus(id) && canLearn(p, id));
}

/** 重みつきで 1 つ選んで習得する（スタイルの相性は重み ×4、性格は ×1.5） */
function learnWeighted(rng: Rng, p: Player, pool: SkillId[]): SkillId | null {
  if (pool.length === 0) return null;
  const aff = PLAY_STYLE_DEFS[p.playStyle].skillAffinity;
  const pers = PERSONALITY_SKILLS[p.personality];
  const id = rng.weighted(pool, (s) => (aff.includes(s) ? 4 : 1) * (pers.includes(s) ? 1.5 : 1) * (SKILL_DEFS[s].tier === "double" ? 0.5 : 1));
  return learnSkill(p, id) ? id : null;
}

/** 新入生（PLAN 5.5）：数%の確率でプラス（○か段階なし）とマイナス（×）を持つ。金色は持たない */
export function initialSkills(rng: Rng, p: Player) {
  if (rng.chance(SKILL_LEARN.freshmanPlus)) learnWeighted(rng, p, plusPool(p).filter((id) => SKILL_DEFS[id].tier !== "double"));
  if (rng.chance(SKILL_LEARN.freshmanMinus)) {
    const minus = SKILL_IDS.filter((id) => isMinus(id) && canLearn(p, id));
    if (minus.length > 0) learnSkill(p, rng.pick(minus));
  }
}

/**
 * 学年ぶんの習得を足す（P2a のセーブの既存選手）。回数はポアソン分布で、候補はスタイルの相性を重くする。
 * 金色は付けない
 */
export function catchUpSkills(rng: Rng, p: Player, expectedRolls: number) {
  const n = rng.poisson(expectedRolls);
  for (let i = 0; i < n; i++) learnWeighted(rng, p, plusPool(p));
}

/**
 * CPU 校の習得（年 2 回の簡略な判定。PLAN 5.7）。
 * 候補はスタイルの相性と、スタイルに合う練習の特訓の候補。◎ を持つ 3 年生はまれに金色になる（年度替わりのみ）
 */
export function cpuLearn(rng: Rng, p: Player, withGold: boolean) {
  const def = PLAY_STYLE_DEFS[p.playStyle];
  const pool = [...new Set([...def.skillAffinity, ...def.practices.flatMap((k) => TRAINING_POOLS[k])])].filter((id) => !isGold(id));
  tryLearn(rng, p, pool, SKILL_LEARN.cpuBase);
  if (withGold && p.grade === 3) {
    const golds = def.skillAffinity.filter((id) => isGold(id) && id !== "footG" && canLearn(p, id) && (!GOLD_REQUIREMENTS[id]?.requires || hasSkill(p, GOLD_REQUIREMENTS[id]!.requires!)));
    for (const id of golds) if (rng.chance(SKILL_LEARN.cpuGold) && learnSkill(p, id)) break;
  }
}

/** OB・先輩などから教わる：相手の持つ特殊能力の中から（金色は条件をそろえていれば goldBase で） */
export function learnFromMentor(rng: Rng, p: Player, mentorSkills: readonly SkillId[], base: number, goldBase: number): SkillId | null {
  // 段階のある系統は、相手の段階までなら 1 つ上の段階を教われる
  const rank = { minus: 0, plus: 1, double: 2, gold: 3, single: 0 } as const;
  const pool = [
    ...new Set(
      mentorSkills
        .filter((id) => !isMinus(id))
        .map((id) => {
          const line = SKILL_DEFS[id].line;
          if (!line) return id;
          const next = nextInLine(p, line);
          return next && rank[SKILL_DEFS[next].tier] <= rank[SKILL_DEFS[id].tier] ? next : id;
        })
        .filter((id) => fitsRole(p, id)),
    ),
  ];
  const gold = tryLearnGold(rng, p, pool.filter(isGold), goldBase);
  if (gold) return gold;
  return tryLearn(rng, p, pool.filter((id) => !isGold(id)), base);
}

/**
 * CPU 校の選手の、半年ごとの性格・スタイルまわりの変化（年度替わり＝spring と秋）。
 * 熟練度は年度替わりに 1 年分を足し、特殊能力は両方で判定する
 */
export function cpuSeasonTraits(rng: Rng, p: Player, spring: boolean) {
  if (spring) {
    const [lo, hi] = PROFICIENCY.cpuPerYear;
    p.styleProficiency = Math.min(PROFICIENCY.max, Math.round(p.styleProficiency + rng.range(lo, hi)));
  }
  cpuLearn(rng, p, spring);
}
