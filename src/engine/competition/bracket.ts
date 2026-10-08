import type { Rng } from "../rng";
import type { Bracket, BracketMatch } from "../types";

/** シード順の配置（1 番シードと最下位シードが当たる標準的な並び） */
export function seedOrder(size: number): number[] {
  let order = [0];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) next.push(s, n - 1 - s);
    order = next;
  }
  return order;
}

export function roundsFor(teamCount: number): number {
  return Math.max(1, Math.ceil(Math.log2(teamCount)));
}

/**
 * トーナメント表を作る。
 * teamIds はシード順（強い順）。2 のべき乗に足りない分は不戦勝（null）で、上位シードに割り当てる。
 */
export function createBracket(kind: Bracket["kind"], teamIds: string[], roundDays: number[], rng: Rng, qualifiers = 1): Bracket {
  const rounds = roundsFor(teamIds.length);
  const size = 1 << rounds;
  const order = seedOrder(size);
  const slots: (string | null)[] = order.map((seed) => teamIds[seed] ?? null);
  const first: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    const m: BracketMatch = { id: `${kind}-0-${i / 2}-${rng.int(0, 1e6).toString(36)}`, a: slots[i], b: slots[i + 1] };
    resolveBye(m);
    first.push(m);
  }
  const total = rounds - Math.log2(qualifiers);
  const bracket: Bracket = { kind, rounds: [first], roundDays: roundDays.slice(-total), roundsDone: 0 };
  if (qualifiers > 1) bracket.qualifiers = qualifiers;
  return bracket;
}

function resolveBye(m: BracketMatch) {
  if (m.a && !m.b) m.winner = m.a;
  else if (!m.a && m.b) m.winner = m.b;
  else if (!m.a && !m.b) m.winner = null;
}

/** 行うラウンドの数（勝ち抜けが 2 校なら決勝は行わない） */
export function totalRounds(b: Bracket): number {
  return roundsFor(b.rounds[0].length * 2) - Math.log2(b.qualifiers ?? 1);
}

/** そのラウンドの、その学校の試合（不戦勝でないもの） */
export function findMatch(b: Bracket, round: number, schoolId: string): BracketMatch | undefined {
  return b.rounds[round]?.find((m) => (m.a === schoolId || m.b === schoolId) && m.a !== null && m.b !== null);
}

export function findMatchById(b: Bracket, id: string): { match: BracketMatch; round: number } | undefined {
  for (let r = 0; r < b.rounds.length; r++) {
    const match = b.rounds[r].find((m) => m.id === id);
    if (match) return { match, round: r };
  }
  return undefined;
}

/** まだ負けていないか */
export function isAlive(b: Bracket, schoolId: string): boolean {
  let present = false;
  for (const round of b.rounds) {
    for (const m of round) {
      if (m.a !== schoolId && m.b !== schoolId) continue;
      present = true;
      if (m.winner !== undefined && m.winner !== schoolId) return false;
    }
  }
  return present;
}

/** 予選・大会が終わったか */
export function isFinished(b: Bracket): boolean {
  return !!b.qualifiedIds;
}

export function isRoundComplete(b: Bracket, round: number): boolean {
  return (b.rounds[round] ?? []).every((m) => m.winner !== undefined);
}

export interface MatchOutcome {
  winner: string;
  score: [number, number];
  pk?: [number, number];
}

export function recordResult(m: BracketMatch, o: MatchOutcome) {
  m.winner = o.winner;
  m.score = o.score;
  if (o.pk) m.pk = o.pk;
}

/** 終わったラウンドの勝者で次のラウンドを作る。決勝が終わったら優勝校を記録する */
export function advanceRound(b: Bracket, rng: Rng) {
  const r = b.roundsDone;
  if (!isRoundComplete(b, r)) return;
  b.roundsDone = r + 1;
  const winners = b.rounds[r].map((m) => m.winner ?? null);
  if (winners.length === (b.qualifiers ?? 1)) {
    b.qualifiedIds = winners.filter((w): w is string => !!w);
    b.championId = winners.length === 1 ? (winners[0] ?? undefined) : undefined;
    return;
  }
  const next: BracketMatch[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    const m: BracketMatch = { id: `${b.kind}-${r + 1}-${i / 2}-${rng.int(0, 1e6).toString(36)}`, a: winners[i], b: winners[i + 1] };
    resolveBye(m);
    next.push(m);
  }
  b.rounds.push(next);
}

/** その学校がどこまで勝ち上がったか（表示用。0 = 初戦敗退） */
export function reachedRound(b: Bracket, schoolId: string): number {
  let reached = -1;
  b.rounds.forEach((round, r) => {
    if (round.some((m) => m.a === schoolId || m.b === schoolId)) reached = r;
  });
  return reached;
}
