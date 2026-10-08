import type { RngState } from "../rng";

// ================= 選手 =================

export type Rank = "SS" | "S" | "A" | "B" | "C" | "D" | "E" | "F" | "G";

export const POSITIONS = ["GK", "CB", "SB", "DMF", "CMF", "OMF", "WG", "CF"] as const;
export type Position = (typeof POSITIONS)[number];

/** ポジション適性 3=◎ 2=○ 1=△ */
export type Aptitude = 1 | 2 | 3;
export type Foot = "R" | "L" | "B";

export const COMMON_STATS = ["vision", "kickPower", "speed", "stamina", "pass", "technique", "physical", "pkSkill"] as const;
export const FIELD_STATS = ["shooting", "dribble", "defense", "aerial", "decision"] as const;
export const GK_STATS = ["saving", "highBall", "positioning", "catching"] as const;
export const ALL_STATS = [...COMMON_STATS, ...FIELD_STATS, ...GK_STATS] as const;

export type CommonStat = (typeof COMMON_STATS)[number];
export type FieldStat = (typeof FIELD_STATS)[number];
export type GkStat = (typeof GK_STATS)[number];
export type StatKey = (typeof ALL_STATS)[number];
export type Stats = Record<StatKey, number>;

/** 調子 -2=絶不調 … 2=絶好調 */
export type Condition = -2 | -1 | 0 | 1 | 2;

export interface Player {
  id: string;
  name: string;
  grade: 1 | 2 | 3;
  enrolledYear: number;
  /** retired = 引退済み 3 年生（卒業まで名簿に残る） */
  status: "active" | "retired";
  /** 主ポジション（生成時に決まり、適性 ◎ を持つ） */
  mainPosition: Position;
  heightCm: number;
  /** 卒業までに伸びる身長の残り（cm） */
  heightGrowthLeft: number;
  foot: Foot;
  aptitude: Record<Position, Aptitude>;
  /** 全員が全項目を持つ（表示は役割で切り替え） */
  stats: Stats;
  /** 次の 1 ポイントまでの端数の経験点 */
  exp: Partial<Record<StatKey, number>>;
  /** 隠しパラメーター「伸びしろ」 */
  potential: number;
  /** 体力 0〜100 */
  fitness: number;
  condition: Condition;
  /** ケガの残り日数（0 なら健康） */
  injuryDays: number;
  /** 入部の種類。P2 で特待生を追加する */
  admission: "general";
}

// ================= 学校 =================

export type SchoolRank = "E" | "D" | "C" | "B" | "A" | "S";
export const SCHOOL_RANKS: readonly SchoolRank[] = ["E", "D", "C", "B", "A", "S"];

/** 評判 0=弱小 1=そこそこ 2=中堅 3=強豪 4=名門 */
export type ReputationLevel = 0 | 1 | 2 | 3 | 4;

export interface Reputation {
  level: ReputationLevel;
  /** ゲージ 0〜100。100 で昇格、0 未満で降格 */
  gauge: number;
}

export interface School {
  id: string;
  name: string;
  prefectureId: string;
  isPlayer: boolean;
  players: Player[];
  /** チーム力から計算したランク */
  rank: SchoolRank;
  /** CPU 校の格（新入生の質と人数に使う。プレイヤー校は評判を使う） */
  prestige: number;
  formation: FormationId;
  tactics: Tactics;
}

export interface Prefecture {
  id: string;
  /** 実在の都道府県名（例：東京都） */
  name: string;
  /** 地域区分（P2 の特待生スカウトの範囲に使う） */
  regionId: string;
  /** 県予選の規模と強さの区分 */
  tier: "competitive" | "normal" | "small";
  /** 冬の全国大会の代表校の数（東京のみ 2） */
  reps: number;
  schoolIds: string[];
  isPlayerPref: boolean;
}

// ================= カレンダー =================

export type SquareType = "blue" | "red" | "white" | "green" | "yellow" | "major";
export type MajorKind = "entrance" | "practiceMatch" | "prefQualifier" | "national" | "graduation" | "yearEnd";

export interface Square {
  day: number;
  /** 大マスが無効（大会で敗退済みなど）のときに使う通常マスの種類 */
  baseType: Exclude<SquareType, "major">;
  major?: { kind: MajorKind; round?: number };
}

export const PRACTICE_KINDS = ["shoot", "pass", "dribble", "defense", "physical", "run", "tactics", "gk", "setPiece", "rest"] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];

export interface MoveCard {
  id: string;
  value: 1 | 2 | 3 | 4 | 5;
  practice: PracticeKind;
}

export interface Calendar {
  squares: Square[];
  /** 現在いるマス（= 日のインデックス。4/1 が 0） */
  position: number;
  hand: MoveCard[];
  /** 直前の移動で得た経験点（黄マス用） */
  lastGain?: { practice: PracticeKind; perPlayer: Record<string, Partial<Record<StatKey, number>>> };
  /** 次の練習の効率補正（イベントで変わる） */
  nextPracticeMult: number;
}

// ================= 試合 =================

export const FORMATION_IDS = ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "5-3-2"] as const;
export type FormationId = (typeof FORMATION_IDS)[number];

export interface Tactics {
  attack: "attacking" | "balanced" | "defensive";
  buildUp: "buildUp" | "long";
  press: "high" | "mid" | "low";
  line: "high" | "low";
}

export interface TeamSetup {
  formation: FormationId;
  tactics: Tactics;
  /** スロット順（フォーメーション定義の順）の 11 人 */
  lineup: string[];
  /** 控え（最大 9 人） */
  bench: string[];
}

export interface MatchRules {
  /** 前後半それぞれの分数 */
  halfMinutes: number;
  /** 延長（前後半それぞれの分数）。null なら延長なし */
  extraTimeHalfMinutes: number | null;
  /** 同点ならPK戦 */
  pkOnDraw: boolean;
  maxSubs: number;
  /** 交代回数の上限（null なら制限なし）。P1 では使わない */
  maxSubWindows: number | null;
  benchSize: number;
}

export type MatchKind = "practice" | "prefQualifier" | "national";

// ================= 大会 =================

export interface BracketMatch {
  id: string;
  /** null は不戦勝枠 */
  a: string | null;
  b: string | null;
  winner?: string | null;
  score?: [number, number];
  pk?: [number, number];
}

export interface Bracket {
  kind: "prefQualifier" | "national";
  /** rounds[0] が 1 回戦 */
  rounds: BracketMatch[][];
  /** 各ラウンドの日（day インデックス） */
  roundDays: number[];
  /** 何回戦まで終わったか */
  roundsDone: number;
  /** 勝ち抜ける学校の数（東京の予選は 2。省略時 1） */
  qualifiers?: number;
  championId?: string;
  /** 勝ち抜けた学校（qualifiers 校。1 校なら championId と同じ） */
  qualifiedIds?: string[];
}

// ================= OB・記録 =================

export type Career = "pro" | "university" | "worker" | "coach" | "other";

export interface Alumnus {
  id: string;
  name: string;
  graduatedYear: number;
  position: Position;
  overall: number;
  career: Career;
  /** 現役最後の能力（P2 のスタッフ制度で使う） */
  stats: Stats;
}

export interface SeasonRecord {
  year: number;
  reputationLevel: ReputationLevel;
  rank: SchoolRank;
  winterResult: string;
}

export interface LogEntry {
  day: number;
  year: number;
  text: string;
  tone?: "good" | "bad" | "info";
}

// ================= ゲーム全体 =================

export interface GameState {
  version: 1;
  seed: string;
  year: number;
  rng: RngState;
  playerSchoolId: string;
  schools: Record<string, School>;
  prefectures: Prefecture[];
  regions: { id: string; name: string }[];
  reputation: Reputation;
  calendar: Calendar;
  competitions: {
    prefQualifier?: Bracket;
    national?: Bracket;
    /** 冬の全国大会が終わったか（引退済みか） */
    winterDone: boolean;
    /** 今年の冬の全国大会の成績（表示用） */
    winterResult?: string;
    /** 今年の練習試合の回数（格上と組む頻度の調整用） */
    practiceMatchCount: number;
  };
  /** 進行中の試合（区間ごとにセーブされる） */
  activeMatch?: import("../match/types").ActiveMatch;
  /** 次に処理を待っているもの（試合前・年度末など） */
  pending?: PendingAction;
  alumni: Alumnus[];
  history: SeasonRecord[];
  log: LogEntry[];
}

export type PendingAction =
  | { type: "match"; kind: MatchKind; opponentId: string; bracketMatchId?: string; round?: number }
  | { type: "graduation" }
  | { type: "yearEnd" };
