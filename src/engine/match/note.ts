/**
 * 作戦ノートの判定（SPEC 10.5）。
 * 区間の終わりに上のルールから判定し、条件をすべて満たして行動を全部実行できるルールを発動する。
 * 行動は pending に積み、次の区間の頭で反映される。1 つのルールは 1 試合 1 回だけ。
 */
import { FORMATIONS } from "../config/formations";
import { MATCH } from "../config/match";
import { positionRating } from "../player/rating";
import type { NoteAction, NoteCondition, NoteRule, PlayerRef } from "../types";
import { activeIds, isOut, queueFormation, queuePosition, queueSubstitution, queueTactics, subsRemaining } from "./orders";
import type { MatchState, MatchTeamState, Side } from "./types";

/** 今のスコアのまま進んだら、試合が終わる（または PK 戦に入る）までの分数 */
export function minutesLeft(state: MatchState): number {
  const h = state.rules.halfMinutes;
  const et = state.rules.extraTimeHalfMinutes ?? 0;
  const inExtra = state.phase === "ET_BREAK" || state.phase === "ET1" || state.phase === "ET_HT" || state.phase === "ET2";
  const draw = state.score[0] === state.score[1];
  const end = inExtra || (draw && et > 0) ? 2 * h + 2 * et : 2 * h;
  return Math.max(0, end - state.minute);
}

/**
 * 「残り○分」を満たすか。判定は区間の終わりで、行動は次の区間の頭から効くので、
 * 次の区間の中で残りが○分になるなら満たす（例：80 分の試合の「残り 3 分」は 75 分の時点で発動）
 */
export function minutesLeftReached(state: MatchState, minutes: number): boolean {
  return minutesLeft(state) - MATCH.segmentMinutes < minutes;
}

interface Reserved {
  out: Set<string>;
  in: Set<string>;
}

const pendingIns = (team: MatchTeamState) => new Set(team.pending?.subs.map((s) => s.in) ?? []);
const pendingOuts = (team: MatchTeamState) => new Set(team.pending?.subs.map((s) => s.out) ?? []);

/** ピッチ上の選手の指定を解決する（いなければ null） */
export function resolveOnPitch(team: MatchTeamState, ref: PlayerRef, reserved?: Reserved): string | null {
  const taken = (id: string) => pendingOuts(team).has(id) || !!reserved?.out.has(id);
  const active = activeIds(team).filter((id) => !taken(id));
  if (ref.kind === "player") return active.includes(ref.id) || (team.players[ref.id]?.injury && team.onPitch.includes(ref.id) && !taken(ref.id)) ? ref.id : null;
  switch (ref.pick) {
    case "lowestStamina": {
      const field = active.filter((id) => id !== team.onPitch[0]);
      return field.length ? field.reduce((b, id) => (team.players[id].stamina < team.players[b].stamina ? id : b), field[0]) : null;
    }
    case "goalkeeperOnPitch":
      return active.includes(team.onPitch[0]) ? team.onPitch[0] : null;
    case "bookedPlayer": {
      const booked = active.filter((id) => (team.players[id].yellow ?? 0) > 0);
      return booked[0] ?? null;
    }
    case "injuredPlayer":
      return team.onPitch.find((id) => team.players[id]?.injury && !team.players[id].sentOff && !taken(id)) ?? null;
    default:
      return null;
  }
}

/** 控えの選手の指定を解決する。outId は下げる選手（「その位置に最も合う控え」に使う） */
export function resolveBench(team: MatchTeamState, ref: PlayerRef, outId: string | null, reserved?: Reserved): string | null {
  const free = team.bench.filter((id) => !pendingIns(team).has(id) && !reserved?.in.has(id));
  if (ref.kind === "player") return free.includes(ref.id) ? ref.id : null;
  if (free.length === 0) return null;
  const best = (list: string[], score: (id: string) => number) => (list.length ? list.reduce((b, id) => (score(id) > score(b) ? id : b), list[0]) : null);
  switch (ref.pick) {
    case "bestForSlot": {
      const idx = outId ? team.onPitch.indexOf(outId) : -1;
      const pos = idx >= 0 ? FORMATIONS[team.formation][idx].pos : "CMF";
      const out = outId ? team.players[outId] : undefined;
      // ケガ・退場した GK の代わりは控えの GK
      if (out?.mainPosition === "GK") {
        const gks = free.filter((id) => team.players[id].mainPosition === "GK");
        if (gks.length) return best(gks, (id) => positionRating(team.players[id], "GK"));
      }
      return best(free, (id) => positionRating(team.players[id], pos));
    }
    case "tallestForward": {
      const fw = free.filter((id) => team.players[id].aptitude.CF >= 2);
      const field = free.filter((id) => team.players[id].mainPosition !== "GK");
      return best(fw.length ? fw : field, (id) => team.players[id].heightCm);
    }
    case "pkGoalkeeper": {
      // 今の GK より PK 駆け引きが高い控えの GK だけ（いなければ発動しない）
      const current = team.players[team.onPitch[0]];
      const gks = free.filter((id) => team.players[id].mainPosition === "GK" && (!current || isOut(current) || team.players[id].stats.pkSkill > current.stats.pkSkill));
      return best(gks, (id) => team.players[id].stats.pkSkill);
    }
    default:
      return null;
  }
}

/** 条件を満たすか */
export function conditionMet(state: MatchState, side: Side, c: NoteCondition): boolean {
  const team = state.teams[side];
  const diff = state.score[side] - state.score[side === 0 ? 1 : 0];
  switch (c.type) {
    case "minuteFrom":
      return state.minute >= c.minute;
    case "minutesLeft":
      return minutesLeftReached(state, c.minutes);
    case "score":
      return c.state === "draw" ? diff === 0 : c.state === "lead" ? diff >= Math.max(1, c.by) : -diff >= Math.max(1, c.by);
    case "stamina": {
      const id = resolveOnPitch(team, c.target);
      return !!id && !isOut(team.players[id]) && team.players[id].stamina < c.below;
    }
    case "booked": {
      const id = c.target.kind === "auto" ? resolveOnPitch(team, { kind: "auto", pick: "bookedPlayer" }) : resolveOnPitch(team, c.target);
      return !!id && (team.players[id].yellow ?? 0) > 0;
    }
    case "injured": {
      const id = c.target.kind === "auto" ? resolveOnPitch(team, { kind: "auto", pick: "injuredPlayer" }) : resolveOnPitch(team, c.target);
      return !!id && !!team.players[id].injury;
    }
    case "subsLeft":
      return subsRemaining(team, state.rules) >= c.atLeast;
    case "competition":
      return !!state.kind && c.kinds.includes(state.kind);
  }
}

type Plan = { type: "sub"; out: string; in: string } | { type: "formation"; action: Extract<NoteAction, { type: "formation" }> } | { type: "tactics"; action: Extract<NoteAction, { type: "tactics" }> } | { type: "position"; id: string; slot: number };

/** ルールの行動を全部実行できるかを確かめ、実行内容を返す（できなければ null） */
export function planActions(state: MatchState, side: Side, rule: NoteRule): Plan[] | null {
  const team = state.teams[side];
  const reserved: Reserved = { out: new Set(), in: new Set() };
  const plans: Plan[] = [];
  let subs = 0;
  for (const a of rule.actions) {
    if (a.type === "sub") {
      const out = resolveOnPitch(team, a.out, reserved);
      if (!out) return null;
      const inId = resolveBench(team, a.in, out, reserved);
      if (!inId) return null;
      reserved.out.add(out);
      reserved.in.add(inId);
      plans.push({ type: "sub", out, in: inId });
      subs++;
    } else if (a.type === "position") {
      const id = resolveOnPitch(team, a.player, reserved);
      if (!id || a.slot < 0 || a.slot >= FORMATIONS[team.formation].length) return null;
      plans.push({ type: "position", id, slot: a.slot });
    } else if (a.type === "formation") plans.push({ type: "formation", action: a });
    else plans.push({ type: "tactics", action: a });
  }
  if (subs > subsRemaining(team, state.rules)) return null;
  return plans.length ? plans : null;
}

/** 区間の終わりに作戦ノートを判定する（発動したルールの名前を返す） */
export function evaluateNote(state: MatchState, side: Side): string[] {
  const team = state.teams[side];
  const note = team.note;
  if (!note || state.phase === "PK" || state.phase === "END") return [];
  const fired: string[] = [];
  for (const rule of note.rules) {
    if (!rule.enabled || note.fired.includes(rule.id) || note.stopped.includes(rule.id)) continue;
    if (!rule.conditions.every((c) => conditionMet(state, side, c))) continue;
    const plans = planActions(state, side, rule);
    if (!plans) continue;
    for (const p of plans) {
      if (p.type === "sub") queueSubstitution(state, side, p.out, p.in);
      else if (p.type === "formation") queueFormation(state, side, p.action.formation);
      else if (p.type === "position") queuePosition(state, side, p.id, p.slot);
      else {
        queueTactics(state, side, { ...(team.pending?.tactics ?? team.tactics), ...p.action.change });
        note.tacticsLocked = true;
      }
    }
    note.fired.push(rule.id);
    fired.push(rule.name);
    state.events.push({ minute: state.minute, side, type: "note", note: rule.name });
  }
  return fired;
}

/** ルールが今の部員で使えるか（指定した選手が卒業・退部していないか）。使えなければ理由 */
export function ruleProblem(rule: NoteRule, squadIds: Set<string>): string | null {
  const refs: PlayerRef[] = [];
  for (const c of rule.conditions) if ("target" in c) refs.push(c.target);
  for (const a of rule.actions) {
    if (a.type === "sub") refs.push(a.out, a.in);
    if (a.type === "position") refs.push(a.player);
  }
  if (refs.some((r) => r.kind === "player" && !squadIds.has(r.id))) return "選手がいません";
  if (rule.actions.length === 0) return "行動がありません";
  return null;
}
