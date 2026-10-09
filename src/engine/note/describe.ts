/**
 * 作戦ノートのルールを文章にする（編集画面の 1 行表示・一覧の説明）。
 */
import { FORMATIONS } from "../config/formations";
import { AUTO_PICK_NAMES, MATCH_KIND_NAMES, POSITION_NAMES, TACTICS_ITEM_NAMES, TACTICS_LABELS } from "../config/names";
import type { FormationId, NoteAction, NoteCondition, NoteRule, PlayerRef, Tactics } from "../types";

/** 選手の ID から名前を引く関数（いなければ undefined） */
export type NameOf = (id: string) => string | undefined;

export function describeRef(ref: PlayerRef, nameOf: NameOf): string {
  if (ref.kind === "auto") return AUTO_PICK_NAMES[ref.pick];
  return nameOf(ref.id) ?? "（いない選手）";
}

const SCORE_STATE = { lead: "リード", draw: "同点", behind: "ビハインド" } as const;

export function describeCondition(c: NoteCondition, nameOf: NameOf): string {
  switch (c.type) {
    case "minuteFrom":
      return `${c.minute}分以降`;
    case "minutesLeft":
      return `残り${c.minutes}分`;
    case "score":
      return c.state === "draw" ? "同点" : `${c.by}点以上${SCORE_STATE[c.state]}`;
    case "stamina":
      return `${describeRef(c.target, nameOf)}のスタミナが${c.below}%未満`;
    case "booked":
      return c.target.kind === "auto" ? "イエローを受けた選手がいる" : `${describeRef(c.target, nameOf)}がイエローを受けている`;
    case "injured":
      return c.target.kind === "auto" ? "ケガをした選手がいる" : `${describeRef(c.target, nameOf)}がケガ`;
    case "subsLeft":
      return `交代枠が${c.atLeast}人以上残っている`;
    case "competition":
      return c.kinds.map((k) => MATCH_KIND_NAMES[k]).join("・") + "の試合";
  }
}

export function describeTactics(change: Partial<Tactics>): string {
  const parts = (Object.keys(change) as (keyof Tactics)[]).map((k) => {
    const v = change[k]!;
    const label = (TACTICS_LABELS[k] as Record<string, string>)[v];
    return k === "press" || k === "line" ? `${TACTICS_ITEM_NAMES[k]}${label}` : label;
  });
  return parts.length ? parts.join("・") : "（変更なし）";
}

export function slotLabel(formation: FormationId, slot: number): string {
  const s = FORMATIONS[formation][slot];
  return s ? POSITION_NAMES[s.pos] : `${slot + 1}番目`;
}

export function describeAction(a: NoteAction, nameOf: NameOf, formation: FormationId = "4-4-2"): string {
  switch (a.type) {
    case "sub":
      return `${describeRef(a.out, nameOf)}を下げて${describeRef(a.in, nameOf)}を入れる`;
    case "formation":
      return `${a.formation}にする`;
    case "tactics":
      return `${describeTactics(a.change)}にする`;
    case "position":
      return `${describeRef(a.player, nameOf)}を${slotLabel(formation, a.slot)}の位置へ`;
  }
}

/** 1 行の文章（例：「1点以上ビハインド・残り10分なら、…」） */
export function describeRule(rule: NoteRule, nameOf: NameOf, formation?: FormationId): string {
  const cond = rule.conditions.length ? rule.conditions.map((c) => describeCondition(c, nameOf)).join("・") + "なら" : "（条件なし）";
  const act = rule.actions.length ? rule.actions.map((a) => describeAction(a, nameOf, formation)).join("、") : "（行動なし）";
  return `${cond}、${act}`;
}
