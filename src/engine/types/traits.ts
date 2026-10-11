/**
 * 性格・プレースタイル・特殊能力（SPEC 7.5〜7.7）の型。
 * 定義データ（効果量・相性など）は config/personality.ts・playStyle.ts・skills.ts に置く。
 */

// ================= 性格 =================

export const PERSONALITIES = ["diligent", "passionate", "calm", "craftsman", "competitive", "moodMaker", "cautious", "inspired"] as const;
//                             努力家      情熱家        冷静沈着  職人気質      負けず嫌い     ムードメーカー  慎重派      ひらめき型
export type Personality = (typeof PERSONALITIES)[number];

// ================= プレースタイル =================

export const PLAY_STYLES = [
  // FW
  "striker",
  "postPlayer",
  "speedster",
  "linkman",
  "poacher",
  // FW/MF
  "wingDribbler",
  "insideDribbler",
  // MF
  "number10",
  "boxToBox",
  "anchor",
  "ballHunter",
  // MF/DF
  "crosser",
  // DF
  "stopper",
  "coverer",
  "attackingFullback",
  "buildUpDefender",
  "launcher",
  // GK
  "boxKeeper",
  "sweeperKeeper",
  "aerialKeeper",
] as const;
export type PlayStyle = (typeof PLAY_STYLES)[number];

/** スタイルの区分（FW＝CF・WG、MF＝DMF・CMF・OMF・WG、DF＝CB・SB、GK） */
export type StyleGroup = "FW" | "MF" | "DF" | "GK";

/** 動きの範囲（SPEC 7.6）。2D・3D 表示の立ち位置でも使う */
export type MovementRange = "free" | "fixed" | "wideOnly" | "mostlyWide" | "mostlyInside";

/** 左・中央・右への関わりやすさ（0〜1）。試合エンジンの選手選びと、P3・P4 の立ち位置の計算で共通に使う */
export interface LaneAffinity {
  L: number;
  C: number;
  R: number;
}

// ================= 特殊能力 =================

/** 段階のある系統 */
export const SKILL_LINES = [
  "oneOnOne",
  "heading",
  "duel",
  "aerialDef",
  "gkOneOnOne",
  "feed",
  "pk",
  "bigStage",
  "adversity",
  "durability",
  "staminaKeep",
  "captaincy",
  "foot",
] as const;
export type SkillLine = (typeof SKILL_LINES)[number];

/** 段階：× / ○ / ◎ / 金色 / 段階なし */
export type SkillTier = "minus" | "plus" | "double" | "gold" | "single";

export const SKILL_IDS = [
  // 段階のある系統（X=×、1=○、2=◎、G=金色）
  "oneOnOneX",
  "oneOnOne1",
  "oneOnOne2",
  "oneOnOneG",
  "heading1",
  "heading2",
  "headingG",
  "duel1",
  "duel2",
  "duelG",
  "aerialDef1",
  "aerialDef2",
  "aerialDefG",
  "gkOneOnOne1",
  "gkOneOnOne2",
  "gkOneOnOneG",
  "feed1",
  "feed2",
  "feedG",
  "pkX",
  "pk1",
  "pk2",
  "pkG",
  "bigStageX",
  "bigStage1",
  "bigStage2",
  "adversity1",
  "adversity2",
  "durabilityX",
  "durability1",
  "durability2",
  "staminaKeepX",
  "staminaKeep1",
  "staminaKeep2",
  "captaincy1",
  "captaincy2",
  "footX",
  "footG",
  // 単独で金色
  "fkMaster",
  "ckMaster",
  "crossMaster",
  // 段階なし
  "middleShot",
  "curveShot",
  "offBall",
  "doubleTouch",
  "roulette",
  "uraKaido",
  "chopTouch",
  "scissors",
  "chanceMaker",
  "throughPass",
  "switchPlay",
  "longThrow",
  "interception",
  "spaceCover",
  "manMark",
  "coverShadow",
  "slidingTackle",
  "pkStopper",
  "gkRush",
  "roughPlay",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export type SkillCategory = "shoot" | "dribble" | "pass" | "setPiece" | "defense" | "gk" | "mental" | "body";

export interface SkillDef {
  id: SkillId;
  line?: SkillLine;
  tier: SkillTier;
  category: SkillCategory;
  /** 誰に効くか */
  target: "field" | "gk" | "all";
}

/** ドリブルの技（突破の場面ごとに 1 つ。P4 のモーション用） */
export const DRIBBLE_MOVES = ["doubleTouch", "roulette", "uraKaido", "chopTouch", "scissors"] as const;
export type DribbleMove = (typeof DRIBBLE_MOVES)[number];

/** 試合での成果の通算（特殊能力の習得条件に使う。自校のみ） */
export interface PlayerFeats {
  /** 1 対 1（カウンターで GK と 1 対 1）からの得点 */
  oneOnOneGoals: number;
  headerGoals: number;
  /** 直接 FK の得点 */
  fkGoals: number;
  cornerAssists: number;
  crossAssists: number;
  /** GK のロングボールからの得点 */
  feedAssists: number;
  /** 1 対 1 の守備の勝ち */
  duelWins: number;
  /** 守備の空中戦の勝ち */
  aerialWins: number;
  /** GK の 1 対 1 を止めた */
  gkOneOnOneStops: number;
  /** 試合中の PK・PK 戦の連続成功 */
  pkStreak: number;
  /** 金色の成果の条件を満たしたもの */
  goldReady?: SkillId[];
}
