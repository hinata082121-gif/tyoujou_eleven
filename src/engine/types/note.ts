/** 作戦ノート（SPEC 10.5） */
import type { FormationId, MatchKind, Tactics } from "./index";

/** 選手の指定。特定の選手か、試合中に条件で選ぶか */
export type PlayerRef = { kind: "player"; id: string } | { kind: "auto"; pick: AutoPick };

export const AUTO_PICKS = [
  "lowestStamina",
  "bestForSlot",
  "tallestForward",
  "pkGoalkeeper",
  "goalkeeperOnPitch",
  "bookedPlayer",
  "injuredPlayer",
] as const;
export type AutoPick = (typeof AUTO_PICKS)[number];

export type NoteCondition =
  | { type: "minuteFrom"; minute: number }
  | { type: "minutesLeft"; minutes: number }
  | { type: "score"; state: "lead" | "draw" | "behind"; by: number }
  | { type: "stamina"; target: PlayerRef; below: number }
  | { type: "booked"; target: PlayerRef }
  | { type: "injured"; target: PlayerRef }
  | { type: "subsLeft"; atLeast: number }
  | { type: "competition"; kinds: MatchKind[] };

export type NoteAction =
  | { type: "sub"; out: PlayerRef; in: PlayerRef }
  | { type: "formation"; formation: FormationId }
  | { type: "tactics"; change: Partial<Tactics> }
  | { type: "position"; player: PlayerRef; slot: number };

export interface NoteRule {
  id: string;
  /** 速報に出す名前（例：パワープレイ） */
  name: string;
  enabled: boolean;
  /** すべて満たしたとき（AND） */
  conditions: NoteCondition[];
  /** 上から順に実行 */
  actions: NoteAction[];
}

export interface TacticsNote {
  id: string;
  name: string;
  /** 並び順が優先順位。最大 NOTE_LIMITS.rules */
  rules: NoteRule[];
}

export const NOTE_LIMITS = { notes: 3, rules: 8 } as const;
