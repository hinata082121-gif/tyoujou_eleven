/**
 * CPU の采配（交代と戦術）。決めた内容は pending に積み、次の区間から反映される。
 * 計算はプレイヤーの采配と同じ試合エンジンを通る。
 */
import { FORMATIONS } from "../config/formations";
import { MATCH } from "../config/match";
import { positionRating } from "../player/rating";
import type { MatchState, Side } from "./types";
import { queueSubstitution, queueTactics, subsRemaining } from "./orders";

export function decideAi(state: MatchState, side: Side) {
  if (state.phase === "PK" || state.phase === "END") return;
  const team = state.teams[side];
  const ai = MATCH.ai;
  const minute = state.minute;
  const slots = FORMATIONS[team.formation];

  // 交代：体力の落ちた選手から
  if (minute >= ai.subFromMinute) {
    const tired = team.onPitch
      .map((id, i) => ({ id, i, stamina: team.players[id].stamina }))
      .filter((x) => x.i !== 0 && x.stamina < ai.subFitnessBelow)
      .sort((a, b) => a.stamina - b.stamina);
    let made = 0;
    for (const t of tired) {
      if (made >= ai.maxSubsPerSegment || subsRemaining(team, state.rules) <= 0) break;
      const pendingIn = new Set(team.pending?.subs.map((s) => s.in) ?? []);
      const pos = slots[t.i].pos;
      const candidates = team.bench.filter((id) => !pendingIn.has(id));
      if (candidates.length === 0) break;
      const best = candidates.reduce((b, id) => (positionRating(team.players[id], pos) > positionRating(team.players[b], pos) ? id : b), candidates[0]);
      // 控えの方が今の状態より良いときだけ代える
      const current = positionRating(team.players[t.id], pos) * (MATCH.fatigueFloor + (1 - MATCH.fatigueFloor) * (t.stamina / 100));
      if (positionRating(team.players[best], pos) * 0.95 < current) continue;
      if (queueSubstitution(state, side, t.id, best) === null) made++;
    }
  }

  // 戦術：負けていれば攻撃的に、リードしていれば守備的に
  const diff = state.score[side] - state.score[side === 0 ? 1 : 0];
  const tactics = { ...(team.pending?.tactics ?? team.tactics) };
  if (diff < 0 && minute >= ai.chaseFromMinute) tactics.attack = "attacking";
  else if (diff > 0 && minute >= ai.protectFromMinute) tactics.attack = "defensive";
  if (tactics.attack !== team.tactics.attack) queueTactics(state, side, tactics);
}
