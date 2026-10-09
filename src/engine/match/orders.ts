/** 采配の予約（次の区間の頭で反映される） */
import type { FormationId, MatchRules, NoteRule, Tactics } from "../types";
import type { MatchPlayer, MatchState, MatchTeamState, Side } from "./types";

/** 退場・ケガでピッチにいない（枠は空き） */
export function isOut(p: Pick<MatchPlayer, "sentOff" | "injury"> | undefined): boolean {
  return !!p && (!!p.sentOff || !!p.injury);
}

/** ピッチでプレーしている選手（退場・ケガを除く） */
export function activeIds(team: Pick<MatchTeamState, "onPitch" | "players">): string[] {
  return team.onPitch.filter((id) => id && !isOut(team.players[id]));
}

export function pendingOf(team: MatchTeamState) {
  if (!team.pending) team.pending = { subs: [] };
  return team.pending;
}

/** 残りの交代枠（予約分を含む） */
export function subsRemaining(team: MatchTeamState, rules: MatchRules): number {
  return rules.maxSubs - team.subsUsed - (team.pending?.subs.length ?? 0);
}

/** 交代を予約する（次の区間から反映）。エラーなら理由を返す */
export function queueSubstitution(state: MatchState, side: Side, outId: string, inId: string): string | null {
  const team = state.teams[side];
  const pending = pendingOf(team);
  if (state.phase === "PK" || state.phase === "END") return "試合中ではありません";
  if (subsRemaining(team, state.rules) <= 0) return "交代枠が残っていません";
  if (state.rules.maxSubWindows !== null && team.subWindowsUsed >= state.rules.maxSubWindows && pending.subs.length === 0) {
    return "交代回数の上限です";
  }
  const pendingOut = new Set(pending.subs.map((s) => s.out));
  const pendingIn = new Set(pending.subs.map((s) => s.in));
  if (!team.onPitch.includes(outId) || pendingOut.has(outId)) return "交代できない選手です";
  if (team.players[outId]?.sentOff) return "退場した選手は交代できません";
  if (!team.bench.includes(inId) || pendingIn.has(inId)) return "控えにいない選手です";
  pending.subs.push({ out: outId, in: inId });
  return null;
}

export function cancelSubstitution(state: MatchState, side: Side, inId: string) {
  const team = state.teams[side];
  if (!team.pending) return;
  team.pending.subs = team.pending.subs.filter((s) => s.in !== inId);
}

export function queueTactics(state: MatchState, side: Side, tactics: Tactics) {
  pendingOf(state.teams[side]).tactics = { ...tactics };
}

export function queueFormation(state: MatchState, side: Side, formation: FormationId) {
  pendingOf(state.teams[side]).formation = formation;
}


// ================= 手動の采配と作戦ノート（SPEC 10.5「手動操作が優先」） =================

export type ManualOrder = { type: "sub"; ids: string[] } | { type: "formation" } | { type: "tactics" } | { type: "position" };

function ruleMentions(rule: NoteRule, ids: string[]): boolean {
  const refs: { kind: string; id?: string }[] = [];
  for (const c of rule.conditions) if ("target" in c) refs.push(c.target);
  for (const a of rule.actions) {
    if (a.type === "sub") refs.push(a.out, a.in);
    if (a.type === "position") refs.push(a.player);
  }
  return refs.some((r) => r.kind === "player" && !!r.id && ids.includes(r.id));
}

/** 手動の采配に関係するルールを、その試合では止める */
export function stopRulesForManual(team: MatchTeamState, order: ManualOrder) {
  const note = team.note;
  if (!note) return;
  for (const rule of note.rules) {
    if (note.stopped.includes(rule.id) || note.fired.includes(rule.id)) continue;
    const kinds = rule.actions.map((a) => a.type);
    let hit = false;
    if (order.type === "sub") hit = ruleMentions(rule, order.ids);
    else if (order.type === "formation") hit = kinds.includes("formation") || kinds.includes("position");
    else if (order.type === "tactics") hit = kinds.includes("tactics");
    else hit = kinds.includes("position");
    if (hit) note.stopped.push(rule.id);
  }
}

/** 観戦中の手動の交代（関係するルールは止まる） */
export function manualSubstitution(state: MatchState, side: Side, outId: string, inId: string): string | null {
  const err = queueSubstitution(state, side, outId, inId);
  if (!err) stopRulesForManual(state.teams[side], { type: "sub", ids: [outId, inId] });
  return err;
}

export function manualTactics(state: MatchState, side: Side, tactics: Tactics) {
  queueTactics(state, side, tactics);
  stopRulesForManual(state.teams[side], { type: "tactics" });
}

export function manualFormation(state: MatchState, side: Side, formation: FormationId) {
  queueFormation(state, side, formation);
  stopRulesForManual(state.teams[side], { type: "formation" });
}

/** ポジション変更の予約（作戦ノート用。手動はフォーメーション変更の画面で並びを変える） */
export function queuePosition(state: MatchState, side: Side, id: string, slot: number) {
  const p = pendingOf(state.teams[side]);
  p.positions = [...(p.positions ?? []).filter((x) => x.id !== id), { id, slot }];
}
