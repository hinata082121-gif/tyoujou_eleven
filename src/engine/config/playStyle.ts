/**
 * プレースタイル（SPEC 7.6、docs/PHASE2B_PLAN.md 3章）。数値は npm run balance で調整する。
 * 試合の補正はすべて熟練度 p（0〜1）に比例して強くなる（選ばれやすさは 1 + (倍率 − 1) × p）。
 */
import type { LaneAffinity, MovementRange, PlayStyle, Position, PracticeKind, SkillId, StatKey, StyleGroup } from "../types";

/** スタイルの区分に入るポジション（WG は FW の列にも MF の列にも置かれるため両方に入れる） */
export const STYLE_GROUP_POSITIONS: Record<StyleGroup, Position[]> = {
  FW: ["CF", "WG"],
  MF: ["DMF", "CMF", "OMF", "WG"],
  DF: ["CB", "SB"],
  GK: ["GK"],
};

/** 試合で選ばれやすくなる役（倍率） */
export type StylePick =
  | "boxShooter" // ボックス内のシューター
  | "aerialTarget" // クロスの的
  | "longTarget" // ロングボールの的（ポストプレー）
  | "aerialMarker" // 守備の空中戦の役
  | "counterRunner" // カウンターの走者
  | "centralPasser" // 中央攻撃の出し手（MF 以外は joinCentralPass で加わる）
  | "receiver" // 中央攻撃の受け手
  | "sideCarrier" // サイド攻撃の運び役
  | "centralDribble" // 中央でドリブルを試みる率
  | "crossChoice" // サイド攻撃でクロスを選ぶ率
  | "marker" // 1 対 1 のマーカー
  | "counterStopper" // カウンターを止める役
  | "longKicker" // ロングボールの蹴り手
  | "defenseWeight" // 守備の質に加わる重み
  | "stealer"; // 奪ってカウンターにつなぐ率

/** 質の補正（実効値に足す点数。クロスの質だけは 0〜1 の値に足す） */
export type StyleBonus =
  | "finishing" // ボックス内のシュート精度
  | "shotAccuracy" // シュート精度（全般）
  | "aerialAtk" // 攻撃側の空中戦
  | "aerialDef" // 守備側の空中戦
  | "runSpeed" // 抜け出し・カウンターのスピード
  | "vision" // パスの候補
  | "pass" // パスの精度
  | "dribble" // ドリブルの突破
  | "duelDef" // 1 対 1 の守備
  | "steal" // 奪取
  | "crossQ" // クロスの質（0〜1 に足す）
  | "longPass" // 長いパスの精度・距離
  | "gkSave"
  | "gkRush"
  | "gkBuild"
  | "gkHighBall"
  | "coverSpeed" // カウンターを受けたときの守備のスピード
  | "defense"; // 守備の質

export interface PlayStyleMatchMod {
  pick?: Partial<Record<StylePick, number>>;
  bonus?: Partial<Record<StyleBonus, number>>;
  /** MF 以外が中央攻撃の出し手に加わるときの重み（0〜1） */
  joinCentralPass?: number;
  /** DF がサイド攻撃の運び役になるときの減点をなくす */
  fullbackCarry?: boolean;
  /** 体力の減り（×(1 − 値 × p)） */
  staminaSave?: number;
  /** ビルドアップのミス（×(1 − 値 × p)） */
  buildUpErrorCut?: number;
  /** 自分のレーンへのカウンターを受けやすさ（×(1 + 値 × p)） */
  counterExposure?: number;
  /** ファウル（×(1 + 値 × p)） */
  foulUp?: number;
  /** サイドからカットインしない */
  noCutInside?: boolean;
}

export interface PlayStyleDef {
  groups: StyleGroup[];
  movement: MovementRange;
  /** 伸びやすい能力（経験点が増える）と、新入生のスタイルを決めるときの重み */
  keyStats: Partial<Record<StatKey, number>>;
  /** 熟練度が上がる練習 */
  practices: PracticeKind[];
  /** 習得しやすい特殊能力 */
  skillAffinity: SkillId[];
  match: PlayStyleMatchMod;
}

const ONE_ON_ONE: SkillId[] = ["oneOnOne1", "oneOnOne2", "oneOnOneG"];
const HEADING: SkillId[] = ["heading1", "heading2", "headingG"];
const DRIBBLES: SkillId[] = ["doubleTouch", "roulette", "uraKaido", "chopTouch", "scissors"];

export const PLAY_STYLE_DEFS: Record<PlayStyle, PlayStyleDef> = {
  striker: {
    groups: ["FW"],
    movement: "free",
    keyStats: { shooting: 3, kickPower: 1, decision: 1 },
    practices: ["shoot"],
    skillAffinity: [...ONE_ON_ONE, "middleShot", "offBall"],
    match: { pick: { boxShooter: 1.5 }, bonus: { finishing: 3 } },
  },
  postPlayer: {
    groups: ["FW"],
    movement: "fixed",
    keyStats: { aerial: 3, physical: 2, technique: 1 },
    practices: ["physical", "setPiece"],
    skillAffinity: [...HEADING],
    match: { pick: { aerialTarget: 1.6, longTarget: 1.6, counterRunner: 0.7 }, bonus: { aerialAtk: 3 } },
  },
  speedster: {
    groups: ["FW"],
    movement: "free",
    keyStats: { speed: 3, dribble: 1, stamina: 1 },
    practices: ["run"],
    skillAffinity: ["uraKaido", "offBall", ...ONE_ON_ONE],
    match: { pick: { counterRunner: 1.6, aerialTarget: 0.7, longTarget: 0.7 }, bonus: { runSpeed: 3 } },
  },
  linkman: {
    groups: ["FW"],
    movement: "free",
    keyStats: { pass: 2, vision: 2, technique: 1 },
    practices: ["pass", "tactics"],
    skillAffinity: ["chanceMaker", "throughPass", "offBall"],
    match: { pick: { boxShooter: 0.75 }, bonus: { vision: 2, pass: 2 }, joinCentralPass: 0.6 },
  },
  poacher: {
    groups: ["FW"],
    movement: "free",
    keyStats: { shooting: 3, decision: 1, speed: 1 },
    practices: ["shoot"],
    skillAffinity: [...ONE_ON_ONE, ...HEADING, "offBall"],
    match: { pick: { boxShooter: 1.8, longTarget: 0 }, bonus: { finishing: 4 } },
  },
  wingDribbler: {
    groups: ["FW", "MF"],
    movement: "mostlyWide",
    keyStats: { dribble: 3, speed: 2, technique: 1 },
    practices: ["dribble", "run"],
    skillAffinity: [...DRIBBLES, "crossMaster"],
    match: { pick: { sideCarrier: 1.6 }, bonus: { dribble: 3 } },
  },
  insideDribbler: {
    groups: ["FW", "MF"],
    movement: "mostlyInside",
    keyStats: { dribble: 3, technique: 2, decision: 1 },
    practices: ["dribble"],
    skillAffinity: [...DRIBBLES, "curveShot"],
    match: { pick: { centralDribble: 1.6, sideCarrier: 0.7 }, bonus: { dribble: 3 }, joinCentralPass: 0.3 },
  },
  number10: {
    groups: ["MF"],
    movement: "fixed",
    keyStats: { vision: 3, pass: 2, technique: 1 },
    practices: ["pass", "tactics"],
    skillAffinity: ["chanceMaker", "throughPass", "middleShot"],
    match: { pick: { centralPasser: 1.5, defenseWeight: 0.7 }, bonus: { vision: 3 } },
  },
  boxToBox: {
    groups: ["MF"],
    movement: "free",
    keyStats: { stamina: 3, physical: 1, defense: 1, pass: 1 },
    practices: ["run", "physical"],
    skillAffinity: ["staminaKeep1", "staminaKeep2", "middleShot", "interception"],
    match: { staminaSave: 0.1 },
  },
  anchor: {
    groups: ["MF"],
    movement: "fixed",
    keyStats: { defense: 3, decision: 2, physical: 1 },
    practices: ["defense", "tactics"],
    skillAffinity: ["interception", "coverShadow", "spaceCover", "duel1", "duel2"],
    match: { pick: { defenseWeight: 1.4, centralPasser: 0.7 }, bonus: { defense: 2 } },
  },
  ballHunter: {
    groups: ["MF"],
    movement: "free",
    keyStats: { defense: 2, stamina: 2, speed: 1 },
    practices: ["defense", "run"],
    skillAffinity: ["interception", "slidingTackle", "duel1", "duel2"],
    match: { pick: { stealer: 1.3 }, bonus: { steal: 3 }, foulUp: 0.15 },
  },
  crosser: {
    groups: ["MF", "DF"],
    movement: "wideOnly",
    keyStats: { pass: 2, kickPower: 2, stamina: 1 },
    practices: ["pass", "setPiece"],
    skillAffinity: ["crossMaster", "ckMaster", "curveShot", "longThrow"],
    match: { pick: { crossChoice: 1.5 }, bonus: { crossQ: 0.06 }, noCutInside: true },
  },
  stopper: {
    groups: ["DF"],
    movement: "free",
    keyStats: { defense: 3, physical: 2, aerial: 1 },
    practices: ["defense", "physical"],
    skillAffinity: ["duel1", "duel2", "duelG", "manMark", "slidingTackle"],
    match: { pick: { marker: 1.4 }, bonus: { duelDef: 3, coverSpeed: -1 } },
  },
  coverer: {
    groups: ["DF"],
    movement: "free",
    keyStats: { decision: 2, speed: 2, defense: 1 },
    practices: ["tactics", "run"],
    skillAffinity: ["spaceCover", "coverShadow", "interception"],
    match: { pick: { counterStopper: 1.5, marker: 0.8 }, bonus: { coverSpeed: 3 } },
  },
  attackingFullback: {
    groups: ["DF"],
    movement: "wideOnly",
    keyStats: { speed: 2, stamina: 2, pass: 1 },
    practices: ["run", "pass"],
    skillAffinity: ["crossMaster", "staminaKeep1", "staminaKeep2", "uraKaido"],
    match: { bonus: { crossQ: 0.04 }, fullbackCarry: true, counterExposure: 0.15 },
  },
  buildUpDefender: {
    groups: ["DF"],
    movement: "free",
    keyStats: { pass: 2, vision: 2, technique: 1 },
    practices: ["pass", "tactics"],
    skillAffinity: ["switchPlay", "throughPass", "coverShadow"],
    match: { pick: { aerialMarker: 0.8 }, buildUpErrorCut: 0.3, joinCentralPass: 0.5, bonus: { pass: 2 } },
  },
  launcher: {
    groups: ["DF"],
    movement: "fixed",
    keyStats: { kickPower: 3, pass: 2 },
    practices: ["pass", "setPiece"],
    skillAffinity: ["switchPlay", "fkMaster", "longThrow"],
    match: { pick: { longKicker: 1.6 }, bonus: { longPass: 3 } },
  },
  boxKeeper: {
    groups: ["GK"],
    movement: "fixed",
    keyStats: { saving: 3, catching: 1, positioning: 1 },
    practices: ["gk"],
    skillAffinity: ["gkOneOnOne1", "gkOneOnOne2", "gkOneOnOneG", "pkStopper"],
    match: { bonus: { gkSave: 3 } },
  },
  sweeperKeeper: {
    groups: ["GK"],
    movement: "free",
    keyStats: { speed: 2, pass: 2, technique: 1 },
    practices: ["gk", "pass"],
    skillAffinity: ["gkRush", "feed1", "feed2", "feedG"],
    match: { bonus: { gkRush: 3, gkBuild: 3, gkSave: -1 } },
  },
  aerialKeeper: {
    groups: ["GK"],
    movement: "free",
    keyStats: { highBall: 3, catching: 2 },
    practices: ["gk", "physical"],
    skillAffinity: ["feed1", "feed2", "pkStopper"],
    match: { bonus: { gkHighBall: 3, gkRush: -1 } },
  },
};

/** 熟練度（SPEC 7.6、PLAN 3.2） */
export const PROFICIENCY = {
  max: 100,
  /** 出場 1 試合（フル出場）で上がる量。公式戦は official */
  perMatch: 2.5,
  perOfficialMatch: 3.5,
  /** スタイルに合う練習 1 日で上がる量 */
  perPracticeDay: 0.45,
  /** 上がるほど上がりにくい：×(1 − 熟練度 / slowdown) */
  slowdown: 130,
  /** 性格の「伸ばしやすいスタイル」 */
  styleAffinityMult: 1.5,
  /** 努力家はどのスタイルでも */
  diligentMult: 1.1,
  /** CPU 校：年度替わりに上がる量（年 1 回の簡略化） */
  cpuPerYear: [25, 35] as [number, number],
  /** P2a のセーブを読み込んだときの学年ごとの範囲 */
  migrationByGrade: { 1: [5, 20], 2: [25, 50], 3: [50, 75] } as Record<1 | 2 | 3, [number, number]>,
};

/** スタイルの能力の伸び：keyStats の能力の経験点 ×(1 + growthBonus × p) */
export const STYLE_GROWTH_BONUS = 0.2;

/** 新入生のスタイルを決めるとき：点数の高い上位 topN から、点数の差に応じた重み（exp((点 − 最高) / temperature)）で選ぶ */
export const STYLE_ASSIGN = { topN: 3, temperature: 2.5 };

/**
 * 動きの範囲ごとのレーンへの関わりやすさ（PLAN 3.4）。
 * side = 枠のレーンが L のとき（R は左右反転）、center = 枠のレーンが C のとき。
 * 大外のみ・主に大外の選手が中央の枠に入ったときは、利き足の側（cSide）を大外として扱う。
 */
export const MOVEMENT_AFFINITY: Record<MovementRange, { side: LaneAffinity; center: LaneAffinity; centerUsesFoot?: boolean }> = {
  free: { side: { L: 1, C: 0.45, R: 0.15 }, center: { L: 0.5, C: 1, R: 0.5 } },
  fixed: { side: { L: 1, C: 0.05, R: 0.01 }, center: { L: 0.05, C: 1, R: 0.05 } },
  wideOnly: { side: { L: 1, C: 0, R: 0 }, center: { L: 1, C: 0, R: 0 }, centerUsesFoot: true },
  mostlyWide: { side: { L: 1, C: 0.35, R: 0.1 }, center: { L: 1, C: 0.5, R: 0.1 }, centerUsesFoot: true },
  mostlyInside: { side: { L: 0.5, C: 1, R: 0.2 }, center: { L: 0.3, C: 1, R: 0.3 } },
};
/**
 * レーンで絞り込む場面の下限。
 * - include：攻撃に加わる（中央の枠の選手はサイドにも加わる。サイドの枠の「自由」の選手は中央には加わらない）
 * - primary：そのレーンを持ち場にしている（守備者・中盤の出し手・サイドの運び役）
 * 絞り込まずに選ぶ場面は、選ばれやすさに min(1, 関わりやすさ / pickScale) を掛ける
 */
export const LANE_THRESHOLDS = { include: 0.48, primary: 0.9, pickScale: 0.45 };
