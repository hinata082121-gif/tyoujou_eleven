import type { RngState } from "../rng";
import type { Aptitude, Condition, FormationId, MatchKind, MatchRules, NoteRule, Position, SchoolRank, Stats, Tactics } from "../types";

export type Side = 0 | 1;

export interface MatchPlayer {
  id: string;
  name: string;
  mainPosition: Position;
  stats: Stats;
  aptitude: Record<Position, Aptitude>;
  heightCm: number;
  condition: Condition;
  /** 試合中の体力 0〜100 */
  stamina: number;
  goals: number;
  /** イエローカードの枚数（2 枚目で退場） */
  yellow?: number;
  /** 退場した（その枠は空きになる） */
  sentOff?: boolean;
  /** 試合中のケガ（ピッチを離れる。交代するまで枠は空き） */
  injury?: { minute: number; severity: InjurySeverity };
}

export type InjurySeverity = "light" | "medium" | "severe";

export interface Substitution {
  out: string;
  in: string;
}

/** 次の区間の頭で反映する采配 */
export interface PendingOrders {
  subs: Substitution[];
  formation?: FormationId;
  tactics?: Tactics;
  /** ポジション変更（選手を指定した枠へ。元の枠の選手と入れ替え） */
  positions?: { id: string; slot: number }[];
}

/** 作戦ノートの、その試合での状態 */
export interface NoteMatchState {
  noteName: string;
  rules: NoteRule[];
  /** 発動したルール（1 試合 1 回） */
  fired: string[];
  /** 手動の采配で止まったルール */
  stopped: string[];
  /** 大会の種類（条件「大会の種類」用） */
  kind: MatchKind;
  /** ノートが戦術を変えた（AI はその試合では戦術を変えない） */
  tacticsLocked?: boolean;
}

export interface MatchTeamState {
  schoolId: string;
  name: string;
  rank: SchoolRank;
  /** プレイヤーが采配するチームか（false なら CPU の采配） */
  isUser: boolean;
  players: Record<string, MatchPlayer>;
  /** フォーメーションのスロット順の 11 人 */
  onPitch: string[];
  bench: string[];
  subbedOff: string[];
  formation: FormationId;
  tactics: Tactics;
  subsUsed: number;
  subWindowsUsed: number;
  /** その日の出来（試合開始時に決まる倍率） */
  form: number;
  pending: PendingOrders | null;
  /** 分析担当のスカウティング（PK の読み）。0 は分析担当なし */
  scouting?: number;
  /** AI の采配の質（0〜1。自校はヘッドコーチ、CPU 校は cpuStaff の戦術眼） */
  aiQuality?: number;
  /** ケガの確率の倍率（フィジカルコーチ） */
  injuryMult?: number;
  note?: NoteMatchState;
  stats: {
    shots: number;
    onTarget: number;
    possessionSum: number;
    segments: number;
    corners: number;
    fouls?: number;
    yellows?: number;
    reds?: number;
    injuries?: number;
    /** ゾーン別（自チームから見た 左・中央・右）の攻撃回数とチャンスの数。ハーフタイムの表示用 */
    zones?: { attacks: [number, number, number]; chances: [number, number, number] };
  };
}

export type MatchPhase = "H1" | "HT" | "H2" | "ET_BREAK" | "ET1" | "ET_HT" | "ET2" | "PK" | "END";

export type MatchEventType =
  | "kickoff"
  | "halfTime"
  | "secondHalf"
  | "fullTime"
  | "extraTime"
  | "extraSecondHalf"
  | "pkShootout"
  | "pass"
  | "passBlocked"
  | "noOption"
  | "dribble"
  | "dribbleFail"
  | "cross"
  | "crossCleared"
  | "gkClaim"
  | "fumble"
  | "header"
  | "longBall"
  | "longBallShort"
  | "longBallLost"
  | "counter"
  | "oneOnOne"
  | "gkRush"
  | "buildUpError"
  | "setPiece"
  | "corner"
  | "freeKick"
  | "shot"
  | "block"
  | "miss"
  | "save"
  | "catch"
  | "parry"
  | "rebound"
  | "goal"
  | "pkAwarded"
  | "pkGoal"
  | "pkMiss"
  | "pkSaved"
  | "sub"
  | "tactics"
  | "formation"
  | "foul"
  | "yellow"
  | "secondYellow"
  | "red"
  | "injury"
  | "shortHanded"
  | "note"
  | "position";

export interface MatchEvent {
  minute: number;
  side: Side;
  type: MatchEventType;
  /** 関係する選手（[主役, 相手] の順） */
  players?: string[];
  /** 得点後のスコアなど */
  score?: [number, number];
  /** 付加情報（シュートの種類など） */
  note?: string;
}

export interface PkKick {
  side: Side;
  kickerId: string;
  gkId: string;
  scored: boolean;
  /** キッカーが読み勝ったか */
  kickerWonRead: boolean;
  result: "goal" | "saved" | "miss";
}

export interface PkState {
  order: [string[], string[]];
  kicks: PkKick[];
  score: [number, number];
  done: boolean;
  winner?: Side;
}

export interface MatchState {
  rules: MatchRules;
  rng: RngState;
  phase: MatchPhase;
  /** 計算済みの試合時間（分） */
  minute: number;
  /** 現在のフェーズで計算した区間の数 */
  segmentInPhase: number;
  teams: [MatchTeamState, MatchTeamState];
  score: [number, number];
  /** -100〜100。プラスはチーム 0 に流れがある */
  momentum: number;
  /** 区間ごとのモメンタムの記録（表示用） */
  momentumHistory: number[];
  events: MatchEvent[];
  pk?: PkState;
  winner?: Side | null;
  /** 大会の種類（作戦ノートの条件用） */
  kind?: MatchKind;
}

/** ゲームの中で進行中の試合 */
export interface ActiveMatch {
  kind: MatchKind;
  /** 大会のラウンド（0 始まり） */
  round?: number;
  bracketMatchId?: string;
  /** プレイヤー校がどちらのチームか */
  userSide: Side;
  opponentId: string;
  state: MatchState;
  /** 試合開始前の設定が済んだか */
  started: boolean;
  /** watch = 観戦する、auto = 結果のみ（練習試合だけ選べる。AI の監督が采配する） */
  mode?: "watch" | "auto";
}
