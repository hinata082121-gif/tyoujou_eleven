/**
 * 性格の効果（SPEC 7.5、docs/PHASE2B_PLAN.md 2章）。数値は npm run balance で調整する。
 */
import type { Personality, PlayStyle, Position, PracticeKind, SkillId, StaffAbility } from "../types";

/** 新入生の性格の出やすさ（ひらめき型はまれ） */
export const PERSONALITY_WEIGHTS: Record<Personality, number> = {
  diligent: 97 / 7,
  passionate: 97 / 7,
  calm: 97 / 7,
  craftsman: 97 / 7,
  competitive: 97 / 7,
  moodMaker: 97 / 7,
  cautious: 97 / 7,
  inspired: 3,
};

/** 練習の経験点の倍率（性格 × 練習）。書いていない練習は default */
export const PERSONALITY_PRACTICE: Record<Personality, { default: number } & Partial<Record<PracticeKind, number>>> = {
  diligent: { default: 1.04 },
  passionate: { default: 0.97, physical: 1.2, run: 1.2 },
  calm: { default: 0.97, tactics: 1.2, pass: 1.2 },
  craftsman: { default: 0.97 },
  competitive: { default: 1.0 },
  moodMaker: { default: 1.0 },
  cautious: { default: 1.0, defense: 1.15, tactics: 1.15, shoot: 0.85 },
  inspired: { default: 1.0 },
};

/** 職人気質の得意な練習の倍率 */
export const CRAFTSMAN_FAVORITE_MULT = 1.4;
/** 職人気質の得意な練習の候補（主ポジションごと。重み） */
export const CRAFTSMAN_FAVORITES: Record<Position, Partial<Record<PracticeKind, number>>> = {
  GK: { gk: 5, pass: 1, pk: 1 },
  CB: { defense: 3, physical: 2, setPiece: 1 },
  SB: { run: 2, defense: 2, pass: 1, setPiece: 1 },
  DMF: { defense: 2, pass: 2, tactics: 2 },
  CMF: { pass: 3, tactics: 2, setPiece: 1 },
  OMF: { pass: 2, dribble: 2, setPiece: 2 },
  WG: { dribble: 3, run: 2, setPiece: 1 },
  CF: { shoot: 3, setPiece: 2, physical: 1 },
};

/** ひらめき型：練習 1 回ごとに倍率を引く */
export const INSPIRED_PRACTICE = { mean: 1.08, sd: 0.3, min: 0.5, max: 1.8 };

/** 努力家：調子による練習効率の振れを何割にするか */
export const DILIGENT_CONDITION_SWING = 0.5;

/** 調子の変わりやすさ（練習中の日ごとの変化の確率の倍率）と、変わるときに上向きになる確率（省略時は今までどおり） */
export const PERSONALITY_CONDITION: Record<Personality, { drift: number; upChance?: number }> = {
  diligent: { drift: 0.6 },
  passionate: { drift: 1 },
  calm: { drift: 0.6 },
  craftsman: { drift: 1 },
  competitive: { drift: 1 },
  moodMaker: { drift: 1.5, upChance: 0.65 },
  cautious: { drift: 1 },
  inspired: { drift: 1.6 },
};

/** 試合でのメンタル */
export const PERSONALITY_MATCH = {
  /** 情熱家：試合の最後の 1/4 で実効能力の倍率。ファウルとカードの倍率 */
  passionateLateMult: 1.03,
  passionateFoulMult: 1.25,
  passionateCardMult: 1.2,
  /** 冷静沈着：PK の読みに足す値 */
  calmPkRead: 6,
  /** 職人気質：セットプレー（直接 FK・CK のキッカー、セットプレーからのヘディング）の実効値 */
  craftsmanSetPiece: 2,
  /** 負けず嫌い：ランクが上の相手への実効能力の倍率。負けた試合の後に調子が 1 下がる確率 */
  competitiveUnderdogMult: 1.03,
  competitiveLossSlumpChance: 0.5,
  /** 慎重派：パスの精度に足す実効値、ファウルの倍率、大舞台での実効能力の倍率 */
  cautiousPass: 2,
  cautiousFoulMult: 0.8,
  cautiousBigStageMult: 0.98,
  /** ひらめき型：試合の残り inspiredLateMinutes 分・点差 1 以内で、特殊能力の効果の倍率 */
  inspiredClutchSkillMult: 1.4,
  inspiredLateMinutes: 15,
};

/** 試合経験点（出場した選手のポジションに合う能力に入る。出場時間で按分。1 試合フル出場の合計） */
export const MATCH_EXP = {
  perFullMatch: 9,
  /** 負けず嫌いの倍率 */
  competitiveMult: 1.5,
};

/** 指導の素質（スタッフの能力の決まり方。SPEC 9章）。揺らぎは標準偏差 sd */
export const PERSONALITY_TEACHING: Record<Personality, { talent: number; aptitudeBonus?: Partial<Record<StaffAbility, number>>; specialtyCapBonus?: number }> = {
  diligent: { talent: 0.7 },
  passionate: { talent: 0.5 },
  calm: { talent: 0.7, aptitudeBonus: { tactics: 0.1 } },
  craftsman: { talent: 0.5, specialtyCapBonus: 5 },
  competitive: { talent: 0.5 },
  moodMaker: { talent: 0.38 },
  cautious: { talent: 0.5, aptitudeBonus: { scouting: 0.1 } },
  inspired: { talent: 0.2 },
};
export const TEACHING_SD = 0.08;

/** 伸ばしやすいスタイル（熟練度の上がり方 ×styleAffinityMult。努力家はどのスタイルでも ×diligentMult） */
export const PERSONALITY_STYLES: Record<Personality, PlayStyle[]> = {
  diligent: [],
  passionate: ["boxToBox", "ballHunter", "stopper"],
  calm: ["number10", "linkman", "coverer", "buildUpDefender"],
  craftsman: ["poacher", "crosser", "launcher", "boxKeeper"],
  competitive: ["striker", "insideDribbler", "ballHunter"],
  moodMaker: ["speedster", "wingDribbler", "attackingFullback"],
  cautious: ["anchor", "coverer", "aerialKeeper"],
  inspired: ["wingDribbler", "insideDribbler", "number10"],
};

/** 習得しやすい特殊能力（×SKILL_LEARN.personalityMult） */
export const PERSONALITY_SKILLS: Record<Personality, SkillId[]> = {
  diligent: ["durability1", "durability2", "staminaKeep1", "staminaKeep2"],
  passionate: ["adversity1", "adversity2", "staminaKeep1", "staminaKeep2", "slidingTackle"],
  calm: ["pk1", "pk2", "pkG", "pkStopper", "coverShadow"],
  craftsman: ["fkMaster", "ckMaster", "longThrow", "heading1", "heading2", "headingG", "middleShot"],
  competitive: ["bigStage1", "bigStage2", "adversity1", "adversity2", "oneOnOne1", "oneOnOne2", "oneOnOneG"],
  moodMaker: ["captaincy1", "captaincy2"],
  cautious: ["duel1", "duel2", "duelG", "manMark", "spaceCover", "interception"],
  inspired: ["doubleTouch", "roulette", "uraKaido", "chopTouch", "scissors", "chanceMaker"],
};
/** ひらめき型は金色の判定の確率も上がる */
export const INSPIRED_GOLD_MULT = 2;
