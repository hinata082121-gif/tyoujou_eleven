/**
 * 試合での成果（SPEC 7.7、PLAN 5.4）。
 * 試合が終わったら、自校の出場選手の成果（feats）を足し、条件を満たしたものはその場で段階を上げる・判定する。
 */
import { FEAT_TRIGGERS, GOLD_REQUIREMENTS, SKILL_DEFS, SKILL_LEARN } from "../config/skills";
import type { MatchPlayer } from "../match/types";
import type { Rng } from "../rng";
import type { Player, PlayerFeats, SkillId, SkillLine } from "../types";
import { canLearn, isGold, learnSkill, nextInLine, removeSkill, skillInLine } from ".";
import { emptyFeats, goldChance, type LearnEvent } from "./learn";

export interface MatchFeatInfo {
  /** 公式戦か（成果は公式戦だけ数える） */
  official: boolean;
  /** 全国大会の決勝で決勝点を決めたか */
  nationalFinalWinner?: boolean;
}

const ev = (p: Player, skill: SkillId, kind: LearnEvent["kind"] = "learn"): LearnEvent => ({ playerId: p.id, name: p.name, skill, kind });

/**
 * 系統の段階を 1 つ上げる（× なら消す。◎ の次の金色は成果の条件が要るので、ここでは上げない）。
 * 上げた（消した）ら、その特殊能力を返す
 */
export function stepUpLine(p: Player, line: SkillLine): LearnEvent | null {
  const cur = skillInLine(p, line);
  if (cur && SKILL_DEFS[cur].tier === "minus") {
    removeSkill(p, cur);
    return ev(p, cur, "remove");
  }
  const next = nextInLine(p, line);
  if (!next || isGold(next)) return null;
  return learnSkill(p, next) ? ev(p, next) : null;
}

/** 成果の数を足す（feats が無ければ作る） */
function addFeats(p: Player, mp: MatchPlayer): { before: PlayerFeats; after: PlayerFeats } {
  const f = (p.feats ??= emptyFeats());
  const before = { ...f };
  const ms = mp.ms!;
  f.oneOnOneGoals += ms.oneOnOneGoals;
  f.headerGoals += ms.headerGoals;
  f.fkGoals += ms.fkGoals;
  f.cornerAssists += ms.cornerAssists;
  f.crossAssists += ms.crossAssists;
  f.feedAssists += ms.feedAssists;
  f.duelWins += ms.duelWins;
  f.aerialWins += ms.aerialWins;
  f.gkOneOnOneStops += ms.gkOneOnOneStops;
  return { before, after: f };
}

/**
 * 1 人の試合後の処理。戻り値は習得・段階アップ・× が消えたもの
 * - 公式戦の 1 試合で 3 得点 → 1 対 1 系が上がる
 * - PK 戦で 2 本止める（GK）→ PK ストッパー
 * - PK の連続成功 5 本ごと → PK 系が上がる（失敗で 0 に戻る）
 * - 全国大会の決勝で決勝点 → 大舞台系が上がる（× は消える）
 * - 公式戦の 1 試合でヘディング 2 得点 → ヘディング系が上がる
 * - 金色：成果の条件をそろえた試合の直後に判定する
 */
export function applyMatchFeats(rng: Rng, p: Player, mp: MatchPlayer, info: MatchFeatInfo): LearnEvent[] {
  if (!info.official || !mp.ms) return [];
  const out: LearnEvent[] = [];
  const push = (e: LearnEvent | null) => e && out.push(e);
  const { before, after } = addFeats(p, mp);
  const ms = mp.ms;
  if (mp.goals >= FEAT_TRIGGERS.hatTrickGoals) push(stepUpLine(p, "oneOnOne"));
  if (ms.headerGoals >= FEAT_TRIGGERS.headerGoalsInMatch) push(stepUpLine(p, "heading"));
  if (ms.pkShootoutSaves >= FEAT_TRIGGERS.pkShootoutSaves && canLearn(p, "pkStopper") && learnSkill(p, "pkStopper")) out.push(ev(p, "pkStopper"));
  for (const scored of ms.pkKicks) {
    if (!scored) {
      after.pkStreak = 0;
      continue;
    }
    after.pkStreak++;
    if (after.pkStreak % FEAT_TRIGGERS.pkStreakStep === 0) push(stepUpLine(p, "pk"));
  }
  if (info.nationalFinalWinner) push(stepUpLine(p, "bigStage"));
  // 金色：この試合で成果が増えて条件をそろえたものだけ判定する
  for (const [id, req] of Object.entries(GOLD_REQUIREMENTS) as [SkillId, NonNullable<(typeof GOLD_REQUIREMENTS)[SkillId]>][]) {
    if (!req.feat || after[req.feat.key] <= before[req.feat.key]) continue;
    const c = goldChance(p, id, SKILL_LEARN.goldAfterFeat);
    if (c > 0 && rng.chance(c) && learnSkill(p, id)) out.push(ev(p, id));
  }
  return out;
}
