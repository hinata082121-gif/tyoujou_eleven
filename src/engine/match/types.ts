import type { RngState } from "../rng";
import type { Aptitude, Condition, FormationId, MatchKind, MatchRules, Position, SchoolRank, Stats, Tactics } from "../types";

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
}

export interface Substitution {
  out: string;
  in: string;
}

/** 次の区間の頭で反映する采配 */
export interface PendingOrders {
  subs: Substitution[];
  formation?: FormationId;
  tactics?: Tactics;
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
  stats: { shots: number; onTarget: number; possessionSum: number; segments: number; corners: number };
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
  | "formation";

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
