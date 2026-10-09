/**
 * 作戦ノートの作成・編集（SPEC 10.5）。判定は match/note.ts。
 */
import { NOTE_TEMPLATE_NAMES } from "../config/names";
import type { Rng } from "../rng";
import { NOTE_LIMITS, type GameState, type NoteRule, type TacticsNote } from "../types";

export type NoteTemplateId = keyof typeof NOTE_TEMPLATE_NAMES;
export const NOTE_TEMPLATE_IDS = Object.keys(NOTE_TEMPLATE_NAMES) as NoteTemplateId[];

/** 疲労交代のしきい値の初期値（SPEC 10.5。今の試合エンジンでは 5% まで下がらないため 60%） */
export const FATIGUE_SUB_DEFAULT = 60;

/** テンプレート（SPEC 10.5 の表のとおり） */
export function templateRule(id: NoteTemplateId, ruleId: string): NoteRule {
  const name = NOTE_TEMPLATE_NAMES[id];
  switch (id) {
    case "powerPlay":
      return {
        id: ruleId,
        name,
        enabled: true,
        conditions: [
          { type: "score", state: "behind", by: 1 },
          { type: "minutesLeft", minutes: 10 },
        ],
        actions: [
          { type: "sub", out: { kind: "auto", pick: "lowestStamina" }, in: { kind: "auto", pick: "tallestForward" } },
          { type: "tactics", change: { buildUp: "long", attack: "attacking" } },
        ],
      };
    case "holdLead":
      return {
        id: ruleId,
        name,
        enabled: true,
        conditions: [
          { type: "score", state: "lead", by: 1 },
          { type: "minutesLeft", minutes: 5 },
        ],
        actions: [
          { type: "sub", out: { kind: "auto", pick: "lowestStamina" }, in: { kind: "auto", pick: "bestForSlot" } },
          { type: "formation", formation: "5-3-2" },
        ],
      };
    case "fatigueSub":
      return {
        id: ruleId,
        name,
        enabled: true,
        conditions: [{ type: "stamina", target: { kind: "auto", pick: "lowestStamina" }, below: FATIGUE_SUB_DEFAULT }],
        actions: [{ type: "sub", out: { kind: "auto", pick: "lowestStamina" }, in: { kind: "auto", pick: "bestForSlot" } }],
      };
    case "pkPrep":
      return {
        id: ruleId,
        name,
        enabled: true,
        conditions: [
          { type: "competition", kinds: ["prefQualifier", "national"] },
          { type: "score", state: "draw", by: 0 },
          { type: "minutesLeft", minutes: 3 },
        ],
        actions: [{ type: "sub", out: { kind: "auto", pick: "goalkeeperOnPitch" }, in: { kind: "auto", pick: "pkGoalkeeper" } }],
      };
  }
}

/** 4 つのテンプレートを並べたノート（優先順位：PK準備 → パワープレイ → 逃げ切り → 疲労交代） */
export function templateNote(rng: Rng, name = "基本"): TacticsNote {
  const order: NoteTemplateId[] = ["pkPrep", "powerPlay", "holdLead", "fatigueSub"];
  return { id: rng.id("nt"), name, rules: order.map((t) => templateRule(t, rng.id("nr"))) };
}

export function canAddNote(state: GameState): boolean {
  return state.notes.length < NOTE_LIMITS.notes;
}

export function createNote(state: GameState, rng: Rng, name: string, fromTemplates = false): TacticsNote | null {
  if (!canAddNote(state)) return null;
  const note = fromTemplates ? templateNote(rng, name) : { id: rng.id("nt"), name, rules: [] };
  state.notes.push(note);
  return note;
}

export function deleteNote(state: GameState, noteId: string) {
  state.notes = state.notes.filter((n) => n.id !== noteId);
  if (state.selectedNoteId === noteId) state.selectedNoteId = undefined;
}

/** ノートを丸ごと置き換える（編集画面で保存したとき）。ルールは上限までに切る */
export function saveNote(state: GameState, note: TacticsNote) {
  const fixed = { ...note, rules: note.rules.slice(0, NOTE_LIMITS.rules) };
  const i = state.notes.findIndex((n) => n.id === note.id);
  if (i >= 0) state.notes[i] = fixed;
  else if (canAddNote(state)) state.notes.push(fixed);
}

/** ルールの並べ替え（優先順位）。dir = -1 で上へ、1 で下へ */
export function moveRule(note: TacticsNote, ruleId: string, dir: -1 | 1): TacticsNote {
  const rules = [...note.rules];
  const i = rules.findIndex((r) => r.id === ruleId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rules.length) return note;
  [rules[i], rules[j]] = [rules[j], rules[i]];
  return { ...note, rules };
}

export function canAddRule(note: TacticsNote): boolean {
  return note.rules.length < NOTE_LIMITS.rules;
}
