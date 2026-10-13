import type { RngState } from "../rng";
import type { CpuStaff, StaffProfile, StaffState } from "./staff";
import type { TacticsNote } from "./note";
import type { Personality, PlayerFeats, PlayStyle, SkillId } from "./traits";

export * from "./staff";
export * from "./note";
export * from "./traits";

// ================= 選手 =================

export type Rank = "SS" | "S" | "A" | "B" | "C" | "D" | "E" | "F" | "G";

export const POSITIONS = ["GK", "CB", "SB", "DMF", "CMF", "OMF", "WG", "CF"] as const;
export type Position = (typeof POSITIONS)[number];

/** ポジション適性 3=◎ 2=○ 1=△ */
export type Aptitude = 1 | 2 | 3;
/** 利き足（右・左。両足は特殊能力「両利き」で表す。P2b） */
export type Foot = "R" | "L";

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
  /** 入部の種類（一般入部・特待生。P2c） */
  admission: "general" | "scholarship";
  /** 出場停止の残り試合数（公式戦のみ数える。レッドカードで 1） */
  suspended: number;
  /** 在学中の成績（OB の記録に引き継ぐ） */
  record: PlayerRecord;
  /** 性格（SPEC 7.5） */
  personality: Personality;
  /** 職人気質の得意な練習（隠し。ほかの性格は持たない） */
  favoritePractice?: PracticeKind;
  /** プレースタイル（SPEC 7.6） */
  playStyle: PlayStyle;
  /** プレースタイル熟練度 0〜100（変更すると 0） */
  styleProficiency: number;
  /** 特殊能力（系統ごとに今の段階だけを持つ。SPEC 7.7） */
  skills: SkillId[];
  /** 試合での成果の通算（自校のみ） */
  feats?: PlayerFeats;
}

export interface PlayerRecord {
  apps: number;
  goals: number;
  officialApps: number;
  officialGoals: number;
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
  /** キャプテン（SPEC 7.8。自校は年度初めに指名、CPU 校は自動） */
  captainId?: string;
  /** CPU 校の簡略化したスタッフの値（自校は GameState.staff を使う） */
  cpuStaff?: CpuStaff;
  /** CPU 校の設備（格に応じた簡略な値。自校は GameState.facilities。P2c） */
  cpuFacilities?: Facilities;
  /** CPU 校の、大会の本戦の間だけ持ち越す体力（選手 ID → 体力）。本戦が終わったら消す（P2c） */
  carryFitness?: { day: number; fit: Record<string, number> };
}

// ================= 設備（SPEC 15章。P2c） =================

export const FACILITY_IDS = ["ground", "trainingRoom", "careRoom", "dorm"] as const;
export type FacilityId = (typeof FACILITY_IDS)[number];
export type FacilityLevel = 0 | 1 | 2 | 3;
export type Facilities = Record<FacilityId, FacilityLevel>;
export interface FacilityLogEntry {
  year: number;
  facility: FacilityId;
  level: FacilityLevel;
  source: "reputation" | "result" | "donation";
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
  /** 夏の全国大会の代表校の数（東京・神奈川・大阪は 2。開催県はその年だけ +1。P2c） */
  summerReps: number;
  schoolIds: string[];
  isPlayerPref: boolean;
}

// ================= カレンダー =================

/** ランダムに並ぶ通常マス */
export type RandomSquareType = "blue" | "red" | "white" | "green" | "yellow" | "training";
/** branch = 分岐マス（P2c。止まると道を選べる） */
export type BaseSquareType = RandomSquareType | "branch";
export type SquareType = BaseSquareType | "major";
/** 大会（トーナメント）の種類（P2c で夏の全国大会・新人戦を追加） */
export const COMPETITION_KINDS = ["prefQualifier", "national", "summerQualifier", "summerNational", "rookiePref", "rookieRegion"] as const;
export type CompetitionKind = (typeof COMPETITION_KINDS)[number];
/** camp：合宿の出発（round 0 = 夏、1 = 冬）。scoutReply：特待生スカウトの返事 */
export type MajorKind = "entrance" | "practiceMatch" | CompetitionKind | "league" | "camp" | "scoutReply" | "graduation" | "yearEnd";

export interface Square {
  day: number;
  /** 大マスが無効（大会で敗退済みなど）のときに使う通常マスの種類 */
  baseType: BaseSquareType;
  major?: { kind: MajorKind; round?: number };
}

/** 分岐マス（SPEC 5.1。P2c） */
export type BranchTheme = "normal" | "blue" | "training" | "rest" | "yellow";
export interface Branch {
  /** 分岐マスの日 */
  day: number;
  /** 道（paths[0] は「ふつうの道」で、カレンダーのマスと同じ）。どの道も長さは同じ */
  paths: { theme: BranchTheme; squares: RandomSquareType[] }[];
  chosen?: number;
}

export const PRACTICE_KINDS = ["shoot", "pass", "dribble", "defense", "physical", "run", "tactics", "gk", "setPiece", "pk", "rest"] as const;
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
  /** 分岐マス（P2c） */
  branches?: Branch[];
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

/** league：県リーグ（P3。公式戦） */
export type MatchKind = "practice" | CompetitionKind | "league";

// ================= 県リーグ（SPEC 11章。P3） =================

export interface LeagueFixture {
  id: string;
  home: string;
  away: string;
  /** 結果（home, away の順） */
  score?: [number, number];
}

export interface LeagueDivision {
  /** 1 = 1 部 */
  level: number;
  schoolIds: string[];
  /** 2 回総当たりか（最下部が 9 校以上なら 1 回総当たり） */
  doubleRound: boolean;
  /** fixtures[節] */
  fixtures: LeagueFixture[][];
  /** 節ごとの日（day インデックス） */
  days: number[];
}

export interface LeagueStanding {
  schoolId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface LeagueState {
  /** その年の部（年度初めに、前の年の昇格・降格を反映して作る） */
  divisions: LeagueDivision[];
  /** その年のリーグ戦を行うか（P2c までのセーブを途中から読んだ年は行わない） */
  active: boolean;
  /** 全節が終わった後の結果（自校の成績と、翌年度の部） */
  final?: { playerLevel: number; position: number; size: number; promoted: boolean; relegated: boolean; nextDivisions: string[][] };
}

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
  kind: CompetitionKind;
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
  /** 現役最後の能力（スタッフ制度で使う） */
  stats: Stats;
  /** 架空の OB（ゲーム開始時・マイグレーションで生成） */
  fictional?: boolean;
  /** 主将だったか（戦術眼の素地に効く） */
  wasCaptain: boolean;
  /** 在学中の成績。winterResults は在学中の冬の全国大会の成績（古い順） */
  record: PlayerRecord & { winterResults: string[] };
  /** スタッフとしての素質（隠し） */
  staffProfile: StaffProfile;
  /** 性格・スタイル・特殊能力（P2b。OB から教わるイベントとスタッフの能力に使う） */
  personality: Personality;
  playStyle: PlayStyle;
  skills: SkillId[];
  /** 特待生として入部した（P2c） */
  scholarship?: boolean;
}

export interface SeasonRecord {
  year: number;
  reputationLevel: ReputationLevel;
  rank: SchoolRank;
  winterResult: string;
  /** P2c */
  summerResult?: string;
  rookieResult?: string;
  /** P3：県リーグの成績 */
  league?: { level: number; position: number; size: number; promoted: boolean; relegated: boolean; retiredBeforeEnd: boolean };
}

// ================= 特待生スカウト（SPEC 8章。P2c） =================

export type Affiliation = "juniorHigh" | "townClub" | "juniorYouth";
export type Reaction = "good" | "normal" | "bad";
/** 中学時代の実績 0=なし 1=県大会 2=地域大会 3=全国大会 */
export type Achievement = 0 | 1 | 2 | 3;
export const METER_KEYS = ["attack", "pass", "dribble", "defense", "physical", "speed", "saving", "kick", "highBall"] as const;
export type MeterKey = (typeof METER_KEYS)[number];

export interface ScoutCandidate {
  id: string;
  /** 本当の能力（入部が決まったら、そのまま部員になる） */
  player: Player;
  prefectureId: string;
  affiliation: Affiliation;
  achievement: Achievement;
  /** 1 = 取り合いになる最上位の候補 */
  tier: 0 | 1;
  /** 取り合いの相手（"youth" = ユースチーム、それ以外は CPU 校の ID） */
  rivals: string[];
  /** 表示する推定値の幅 [下限, 上限] */
  meter: Partial<Record<MeterKey, [number, number]>>;
  /** 寸評（訪問すると見える） */
  comments?: string[];
  reaction?: Reaction;
  visits: number;
  status: "open" | "courting" | "joined" | "declined" | "lost";
  /** 取り合いに負けたときの行き先（"youth" か学校 ID） */
  lostTo?: string;
}

export interface ScoutState {
  /** 候補リストを作った年度（11 月の年度） */
  year: number;
  candidates: ScoutCandidate[];
  cardsTotal: number;
  cardDays: number[];
  cardsDelivered: number;
  /** 未使用のスカウトカード */
  cards: number;
  /** 勧誘中の候補の優先順（枠を超えて入部が決まったとき、前から枠まで） */
  priority: string[];
  /** 入部が決まり、4 月に入部する特待生 */
  committed: Player[];
  /** 他校に決まった候補（4 月にその学校の新入生になる） */
  toCpu: { schoolId: string; player: Player }[];
  /** 返事が届いたか */
  replied: boolean;
}

// ================= 合宿（P2c） =================

export const POSITION_GROUPS = ["GK", "DF", "MF", "FW"] as const;
export type PositionGroup = (typeof POSITION_GROUPS)[number];
export type CampSeason = "summer" | "winter";
export type CampPolicy = Record<PositionGroup, PracticeKind>;

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
    /** 夏の全国大会・新人戦（P2c） */
    summerQualifier?: Bracket;
    summerNational?: Bracket;
    rookiePref?: Bracket;
    rookieRegion?: Bracket;
    /** その年の夏の全国大会の開催県 */
    summerHostPrefId?: string;
    summerResult?: string;
    rookieResult?: string;
    /** 新人戦の県大会の成績から決めた、次の夏の県予選のシード順（自県の学校 ID。強い順） */
    rookieSeeds?: string[];
    /** P3：3 年生が引退した日（冬の大会で負けた日。県リーグの成績の記録用） */
    retiredDay?: number;
  };
  /** 県リーグ（P3） */
  league?: LeagueState;
  /** 設備（SPEC 15章。P2c） */
  facilities: Facilities;
  facilityLog: FacilityLogEntry[];
  /** 評判で整備される設備を、どの評判まで受け取ったか */
  facilityGrantedLevel: ReputationLevel;
  /** OB からの寄付が最後にあった年度 */
  lastDonationYear?: number;
  /** 特待生スカウト（P2c） */
  scout?: ScoutState;
  /** 前回の合宿の方針（次の合宿の初期値） */
  campPolicy?: CampPolicy;
  /** 進行中の試合（区間ごとにセーブされる） */
  activeMatch?: import("../match/types").ActiveMatch;
  /** 次に処理を待っているもの（試合前・年度末など） */
  pending?: PendingAction;
  alumni: Alumnus[];
  /** 自校のスタッフ（SPEC 9章） */
  staff: StaffState;
  /** 作戦ノート（最大 3 冊。SPEC 10.5） */
  notes: TacticsNote[];
  /** 前回の試合前に選んだノート */
  selectedNoteId?: string;
  history: SeasonRecord[];
  log: LogEntry[];
}

export type PendingAction =
  | { type: "match"; kind: MatchKind; opponentId: string; bracketMatchId?: string; round?: number }
  | { type: "graduation" }
  /** スタッフの編成（ゲーム開始時と年度初め） */
  | { type: "staff" }
  /** キャプテンの指名（年度初めと、3 年生の引退でいなくなったとき） */
  | { type: "captain" }
  /** 合宿の方針を選ぶ（P2c） */
  | { type: "camp"; season: CampSeason }
  /** 分岐マスで道を選ぶ（P2c） */
  | { type: "branch"; day: number }
  /** 特待生スカウトの返事（P2c） */
  | { type: "scoutReply" }
  | { type: "yearEnd" };
