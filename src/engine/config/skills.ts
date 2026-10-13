/**
 * 特殊能力（SPEC 7.7、docs/PHASE2B_PLAN.md 4〜5章）。数値は npm run balance で調整する。
 * 名前・説明は names.ts。
 */
import type { PracticeKind, SkillCategory, SkillDef, SkillId, SkillLine, SkillTier } from "../types";

const line = (id: SkillId, l: SkillLine, tier: SkillTier, category: SkillCategory, target: SkillDef["target"] = "field"): SkillDef => ({ id, line: l, tier, category, target });
const single = (id: SkillId, category: SkillCategory, target: SkillDef["target"] = "field", tier: SkillTier = "single"): SkillDef => ({ id, tier, category, target });

export const SKILL_DEFS: Record<SkillId, SkillDef> = {
  oneOnOneX: line("oneOnOneX", "oneOnOne", "minus", "shoot"),
  oneOnOne1: line("oneOnOne1", "oneOnOne", "plus", "shoot"),
  oneOnOne2: line("oneOnOne2", "oneOnOne", "double", "shoot"),
  oneOnOneG: line("oneOnOneG", "oneOnOne", "gold", "shoot"),
  heading1: line("heading1", "heading", "plus", "shoot"),
  heading2: line("heading2", "heading", "double", "shoot"),
  headingG: line("headingG", "heading", "gold", "shoot"),
  duel1: line("duel1", "duel", "plus", "defense"),
  duel2: line("duel2", "duel", "double", "defense"),
  duelG: line("duelG", "duel", "gold", "defense"),
  aerialDef1: line("aerialDef1", "aerialDef", "plus", "defense"),
  aerialDef2: line("aerialDef2", "aerialDef", "double", "defense"),
  aerialDefG: line("aerialDefG", "aerialDef", "gold", "defense"),
  gkOneOnOne1: line("gkOneOnOne1", "gkOneOnOne", "plus", "gk", "gk"),
  gkOneOnOne2: line("gkOneOnOne2", "gkOneOnOne", "double", "gk", "gk"),
  gkOneOnOneG: line("gkOneOnOneG", "gkOneOnOne", "gold", "gk", "gk"),
  feed1: line("feed1", "feed", "plus", "gk", "gk"),
  feed2: line("feed2", "feed", "double", "gk", "gk"),
  feedG: line("feedG", "feed", "gold", "gk", "gk"),
  pkX: line("pkX", "pk", "minus", "setPiece", "all"),
  pk1: line("pk1", "pk", "plus", "setPiece", "all"),
  pk2: line("pk2", "pk", "double", "setPiece", "all"),
  pkG: line("pkG", "pk", "gold", "setPiece", "all"),
  bigStageX: line("bigStageX", "bigStage", "minus", "mental", "all"),
  bigStage1: line("bigStage1", "bigStage", "plus", "mental", "all"),
  bigStage2: line("bigStage2", "bigStage", "double", "mental", "all"),
  adversity1: line("adversity1", "adversity", "plus", "mental", "all"),
  adversity2: line("adversity2", "adversity", "double", "mental", "all"),
  durabilityX: line("durabilityX", "durability", "minus", "body", "all"),
  durability1: line("durability1", "durability", "plus", "body", "all"),
  durability2: line("durability2", "durability", "double", "body", "all"),
  staminaKeepX: line("staminaKeepX", "staminaKeep", "minus", "body", "all"),
  staminaKeep1: line("staminaKeep1", "staminaKeep", "plus", "body", "all"),
  staminaKeep2: line("staminaKeep2", "staminaKeep", "double", "body", "all"),
  captaincy1: line("captaincy1", "captaincy", "plus", "mental", "all"),
  captaincy2: line("captaincy2", "captaincy", "double", "mental", "all"),
  footX: line("footX", "foot", "minus", "body"),
  footG: line("footG", "foot", "gold", "body"),
  fkMaster: single("fkMaster", "setPiece", "field", "gold"),
  ckMaster: single("ckMaster", "setPiece", "field", "gold"),
  crossMaster: single("crossMaster", "pass", "field", "gold"),
  middleShot: single("middleShot", "shoot"),
  curveShot: single("curveShot", "shoot"),
  offBall: single("offBall", "shoot"),
  doubleTouch: single("doubleTouch", "dribble"),
  roulette: single("roulette", "dribble"),
  uraKaido: single("uraKaido", "dribble"),
  chopTouch: single("chopTouch", "dribble"),
  scissors: single("scissors", "dribble"),
  chanceMaker: single("chanceMaker", "pass"),
  throughPass: single("throughPass", "pass"),
  switchPlay: single("switchPlay", "pass", "all"),
  longThrow: single("longThrow", "setPiece"),
  interception: single("interception", "defense"),
  spaceCover: single("spaceCover", "defense"),
  manMark: single("manMark", "defense"),
  coverShadow: single("coverShadow", "defense"),
  slidingTackle: single("slidingTackle", "defense"),
  pkStopper: single("pkStopper", "gk", "gk"),
  gkRush: single("gkRush", "gk", "gk"),
  roughPlay: single("roughPlay", "defense", "field", "minus"),
};

/** 段階のある系統の並び（× → ○ → ◎ → 金色）。無い段階は null */
export const SKILL_LINE_TIERS: Record<SkillLine, { minus: SkillId | null; plus: SkillId | null; double: SkillId | null; gold: SkillId | null }> = {
  oneOnOne: { minus: "oneOnOneX", plus: "oneOnOne1", double: "oneOnOne2", gold: "oneOnOneG" },
  heading: { minus: null, plus: "heading1", double: "heading2", gold: "headingG" },
  duel: { minus: null, plus: "duel1", double: "duel2", gold: "duelG" },
  aerialDef: { minus: null, plus: "aerialDef1", double: "aerialDef2", gold: "aerialDefG" },
  gkOneOnOne: { minus: null, plus: "gkOneOnOne1", double: "gkOneOnOne2", gold: "gkOneOnOneG" },
  feed: { minus: null, plus: "feed1", double: "feed2", gold: "feedG" },
  pk: { minus: "pkX", plus: "pk1", double: "pk2", gold: "pkG" },
  bigStage: { minus: "bigStageX", plus: "bigStage1", double: "bigStage2", gold: null },
  adversity: { minus: null, plus: "adversity1", double: "adversity2", gold: null },
  durability: { minus: "durabilityX", plus: "durability1", double: "durability2", gold: null },
  staminaKeep: { minus: "staminaKeepX", plus: "staminaKeep1", double: "staminaKeep2", gold: null },
  captaincy: { minus: null, plus: "captaincy1", double: "captaincy2", gold: null },
  foot: { minus: "footX", plus: null, double: null, gold: "footG" },
};

// ================= 試合での効果（PLAN 4.1） =================

/** 段階ごとの「実効値に足す点数」（判定の尺度はほぼ 10） */
export const TIER_POINTS = { minus: -3, plus: 2.5, double: 5, gold: 12, single: 4 };

/** 金色の存在感が効くプレーの種類 */
export type GoldPlay = "shoot" | "defense" | "pass" | "gk" | "setPiece" | "dribble";

/** 金色ごとに、存在感が効くプレー（それ以外のプレーには効かない） */
export const GOLD_PLAYS: Partial<Record<SkillId, readonly GoldPlay[]>> = {
  duelG: ["defense"],
  aerialDefG: ["defense"],
  oneOnOneG: ["shoot"],
  headingG: ["shoot"],
  crossMaster: ["pass"],
  ckMaster: ["pass"],
  gkOneOnOneG: ["gk"],
  feedG: ["gk"],
  fkMaster: ["setPiece"],
  pkG: ["setPiece"],
  footG: ["shoot", "dribble"],
};

export const SKILL_EFFECTS = {
  /** 金色の存在感：その金色に関係するプレー（GOLD_PLAYS）でだけ、場面の効果に加えて実効能力が上がる（倍率。調子と同じく圧縮の前に掛ける） */
  goldPresence: 1.15,
  /** GK は能力がそのまま失点に効くので、存在感を小さくする */
  goldPresenceGk: 1.04,
  /** 1 対 1 系の金色：決定機の質に足す */
  oneOnOneGoldQ: 0.05,
  /** PK 系：PK の読みは尺度が 22 なので点数を倍にする */
  pkReadMult: 2,
  /** 大舞台系・逆境系の実効能力の倍率 */
  bigStage: { minus: 0.97, plus: 1.02, double: 1.04 },
  adversity: { plus: 1.02, double: 1.04 },
  /** ケガしにくさ系：ケガの確率の倍率 */
  durability: { minus: 1.5, plus: 0.7, double: 0.5 },
  /** スタミナ持続系：試合中の体力の減りの倍率 */
  staminaKeep: { minus: 1.15, plus: 0.9, double: 0.8 },
  /** キャプテンシー系：キャプテンのとき、チーム全体の実効能力の倍率 */
  captaincy: { plus: 1.01, double: 1.015 },
  /** フィード系の金色：GK のロングボールがカウンターの起点になる率 */
  feedGoldCounterMult: 1.1,
  /** 逆足で蹴る場面の割合と、精度の減点（ふつう／逆足×）。両利きは減点なし */
  weakFootChance: 0.25,
  weakFootPenalty: 1.5,
  weakFootPenaltyMinus: 6,
  /** 両利き：サイドのカットインとクロスの質（実効値） */
  footGoldSide: 6,
  /** FK の名手：直接 FK のシュート精度、キッカーに選ばれやすさ */
  fkMasterAcc: 12,
  /** CK の名手・クロスの名手：クロスの質（0〜1 に足す） */
  ckMasterQ: 0.2,
  crossMasterQ: 0.2,
  crossMasterHeaderMult: 1.1,
  /** セットプレーの名手がキッカーに選ばれやすさ */
  setPieceKickerMult: 3,
  /** ミドルシュート：ミドルを選ぶ率 */
  middleShotChooseMult: 1.3,
  /** 消える動き：受け手に選ばれやすさ */
  offBallPickMult: 1.15,
  /** ドリブル技：その場面の突破に足す点数 */
  dribbleMove: 6,
  /** ダブルタッチの場面になる偶然の確率（相手のプレスが高い・ボールハンター以外） */
  doubleTouchRandom: 0.25,
  /** チャンスメイカー：パスの候補 +1、決定的なパスの価値 */
  chanceMakerValue: 0.05,
  /** スルーパス：相手のラインが高いときの、裏へのパスになる価値の下限 */
  throughPassValueMin: 0.6,
  /** サイドチェンジ：ロングボールが逆サイドへのパスになる確率 */
  switchPlayChance: 0.3,
  /** ロングスロー：サイド攻撃が止められたとき、スローインがクロスになる確率と質の補正 */
  longThrowChance: 0.25,
  longThrowQ: -0.03,
  /** インターセプト：カットする役に選ばれやすさ */
  interceptionPickMult: 1.5,
  /** カバーシャドウ：自分のレーンの守備の質に足す */
  coverShadowDef: 3,
  /** スライディングタックル：1 対 1 の守備、ファウルの倍率 */
  slidingTackleDef: 3,
  slidingTackleFoulMult: 0.7,
  /** PK ストッパー：GK の PK の読み */
  pkStopperRead: 8,
  /** ラフプレー×：ファウル、カードの倍率 */
  roughPlayFoulMult: 1.5,
  roughPlayCardMult: 1.3,
};

// ================= 習得（PLAN 5章） =================

export const SKILL_LEARN = {
  /** スタイルとの相性：×(base + perProficiency × p) */
  styleAffinityBase: 1.3,
  styleAffinityPerProficiency: 0.7,
  /** 性格との相性 */
  personalityMult: 1.4,
  /** 段階の補正（◎は ○ を持つ選手だけが候補になるので、○ より高くする） */
  doubleMult: 2.5,
  /** 特訓マス：対象者 1 人あたりの基本確率と、関係する × が消える確率 */
  trainingBase: 0.03,
  trainingRemoveMinus: 0.15,
  /** 新入生：プラス（○か段階なし）とマイナス（×）を持つ確率 */
  freshmanPlus: 0.05,
  freshmanMinus: 0.04,
  /** 金色の判定：成果の条件をそろえた後の、関係する特訓・金色の OB の直伝・条件を満たした試合の直後 */
  goldTraining: 0.08,
  goldObTeach: 0.2,
  /** P3 で 0.4 → 0.28（リーグ戦で公式戦が増え、金色を持つ卒業生が多くなったため） */
  goldAfterFeat: 0.28,
  /** 両利き：熟練度の下限と、シュートかドリブルの特訓での確率 */
  footGoldMinProficiency: 80,
  footGoldTraining: 0.01,
  /** CPU 校：年 2 回の判定の基本確率（候補はスタイルの相性から） */
  cpuBase: 0.1,
  /** CPU 校の ◎ の補正（候補がスタイルの相性に絞られていて ◎ に届きやすいので、自校より低くする） */
  cpuDoubleMult: 0.5,
  /** CPU 校：◎ を持つ 3 年生が金色になる確率（年 1 回） */
  cpuGold: 0.015,
  /** P2a のセーブを読み込んだときの学年ごとの習得の回数の期待値 */
  migrationRollsByGrade: { 1: 0, 2: 0.6, 3: 1.1 } as Record<1 | 2 | 3, number>,
};

/** 特訓マス：練習カードごとの候補（休養は × を消すだけ） */
export const TRAINING_POOLS: Record<PracticeKind, SkillId[]> = {
  shoot: ["oneOnOne1", "oneOnOne2", "middleShot", "curveShot", "offBall"],
  pass: ["chanceMaker", "throughPass", "switchPlay"],
  dribble: ["doubleTouch", "roulette", "uraKaido", "chopTouch", "scissors"],
  defense: ["duel1", "duel2", "interception", "spaceCover", "manMark", "coverShadow", "slidingTackle"],
  physical: ["aerialDef1", "aerialDef2", "heading1", "heading2", "durability1", "durability2"],
  run: ["staminaKeep1", "staminaKeep2", "durability1", "durability2"],
  tactics: ["adversity1", "adversity2", "captaincy1", "captaincy2", "coverShadow", "spaceCover"],
  gk: ["gkOneOnOne1", "gkOneOnOne2", "feed1", "feed2", "gkRush", "pkStopper"],
  setPiece: ["heading1", "heading2", "longThrow"],
  pk: ["pk1", "pk2", "pkStopper", "bigStage1", "bigStage2"],
  rest: [],
};

/** 特訓で消える ×（練習カードごと） */
export const TRAINING_REMOVES: Record<PracticeKind, SkillId[]> = {
  shoot: ["oneOnOneX", "footX"],
  pass: ["footX"],
  dribble: ["footX"],
  defense: ["roughPlay"],
  physical: ["durabilityX"],
  run: ["staminaKeepX", "durabilityX"],
  tactics: ["roughPlay", "bigStageX"],
  gk: [],
  setPiece: ["footX"],
  pk: ["pkX", "bigStageX"],
  rest: ["roughPlay", "durabilityX"],
};

/** 金色の特訓（成果の条件をそろえた選手だけ。練習カードごと） */
export const TRAINING_GOLDS: Record<PracticeKind, SkillId[]> = {
  shoot: ["oneOnOneG", "footG"],
  pass: ["crossMaster", "feedG"],
  dribble: ["footG"],
  defense: ["duelG"],
  physical: ["aerialDefG", "headingG"],
  run: [],
  tactics: [],
  gk: ["gkOneOnOneG", "feedG"],
  setPiece: ["fkMaster", "ckMaster", "headingG", "crossMaster"],
  pk: ["pkG"],
  rest: [],
};

/** 金色の前提（下の段階）と成果の条件（PLAN 5.4） */
export const GOLD_REQUIREMENTS: Partial<Record<SkillId, { requires?: SkillId; chanceMult?: number; feat?: { key: "oneOnOneGoals" | "headerGoals" | "fkGoals" | "cornerAssists" | "crossAssists" | "feedAssists" | "duelWins" | "aerialWins" | "gkOneOnOneStops" | "pkStreak"; count: number } }>> = {
  // P2c：公式戦が増えた（夏の大会・新人戦）ので回数を上げ、種類ごとの難しさをそろえた。
  // 一般入部の卒業生のうち、成果の条件を満たす人がどれも 3〜5% 前後になる回数（balance で測定）。
  // 守備の 1 対 1・空中戦・GK の 1 対 1 は 1 試合に何度も起きるので回数が大きい。
  // FK・CK・クロスの名手は前提の特殊能力（◎）がなく条件をそろえる人が多いので、判定の確率を下げて（chanceMult）ほかとそろえる
  oneOnOneG: { requires: "oneOnOne2", feat: { key: "oneOnOneGoals", count: 2 } },
  headingG: { requires: "heading2", feat: { key: "headerGoals", count: 2 } },
  duelG: { requires: "duel2", feat: { key: "duelWins", count: 5 } },
  aerialDefG: { requires: "aerialDef2", feat: { key: "aerialWins", count: 4 } },
  gkOneOnOneG: { requires: "gkOneOnOne2", feat: { key: "gkOneOnOneStops", count: 5 } },
  feedG: { requires: "feed2", feat: { key: "feedAssists", count: 1 } },
  pkG: { requires: "pk2", feat: { key: "pkStreak", count: 2 } },
  fkMaster: { chanceMult: 0.6, feat: { key: "fkGoals", count: 1 } },
  ckMaster: { chanceMult: 0.6, feat: { key: "cornerAssists", count: 1 } },
  crossMaster: { chanceMult: 0.6, feat: { key: "crossAssists", count: 2 } },
};

/** 試合での成果で段階が上がる条件 */
export const FEAT_TRIGGERS = {
  /** 公式戦の 1 試合で何得点 → 1 対 1 系 */
  hatTrickGoals: 3,
  /** PK 戦で何本止める（GK）→ PK ストッパー */
  pkShootoutSaves: 2,
  /** 試合中の PK・PK 戦の連続成功が何本ごと → PK 系 */
  pkStreakStep: 5,
  /** 公式戦の 1 試合でヘディング何得点 → ヘディング系 */
  headerGoalsInMatch: 2,
};
