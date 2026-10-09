/** 采配の予約（次の区間の頭で反映される） */
import type { FormationId, MatchRules, Tactics } from "../types";
import type { MatchState, MatchTeamState, Side } from "./types";

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

