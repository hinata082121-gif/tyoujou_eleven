import { createMatch, simulateToEnd, type TeamInput } from "../match/engine";
import { autoSetup, fitnessAwareSetup } from "../match/lineup";
import type { MatchState } from "../match/types";
import type { Rng } from "../rng";
import { CPU_MATCH_CONDITION } from "../config/school";
import { ADJUST_DAY_RECOVERY, MATCH_FATIGUE } from "../config/season";
import { totalRecoveryMult } from "../facilities";
import type { MatchRules, Player, School } from "../types";
import type { MatchOutcome } from "./bracket";

/** CPU 校の、その試合での部員の状態（体力・調子・出られない選手）。元のデータは変えない */
export function cpuMatchSquad(rng: Rng, players: Player[], carry?: Record<string, number>): Player[] {
  const c = CPU_MATCH_CONDITION;
  return players.map((p) => ({
    ...p,
    fitness: carry?.[p.id] ?? Math.max(c.fitnessMin, Math.min(100, Math.round(rng.normal(c.fitnessMean, c.fitnessSd)))),
    condition: rng.weighted([-2, -1, 0, 1, 2] as const, (v) => c.conditionWeights[v + 2]),
    injuryDays: rng.chance(c.unavailableChance) ? 1 : 0,
  }));
}

/** CPU 校の回復の倍率（簡略化したフィジカルコーチ＋設備。自校と同じ式） */
export function cpuRecoveryMult(school: School): number {
  return totalRecoveryMult(school.cpuStaff?.conditioning ?? 0, school.cpuFacilities);
}

/** 持ち越した体力を、day の朝の値にする（前の試合の日から 1 日ごとに調整日 1 日分回復する） */
export function carriedFitness(school: School, day: number): Record<string, number> | undefined {
  const c = school.carryFitness;
  if (!c) return undefined;
  const gain = Math.max(0, day - c.day) * ADJUST_DAY_RECOVERY * cpuRecoveryMult(school);
  const out: Record<string, number> = {};
  for (const [id, f] of Object.entries(c.fit)) out[id] = Math.min(100, f + gain);
  return out;
}

export interface TeamInputOptions {
  /** 新人戦：この学年以下だけ出る */
  maxGrade?: number;
  /** 大会の本戦：持ち越した体力を使う日（P2c） */
  carryDay?: number;
}

/**
 * 試合に出す学校のデータ。rng を渡すと、CPU 校は試合ごとの状態の変動（cpuMatchSquad）を付ける。
 * 本戦（carryDay あり）では、前の試合の疲れを持ち越し、体力を見て先発を選ぶ。
 */
export function schoolTeamInput(school: School, rules: MatchRules, isUser: boolean, rng?: Rng, opts: TeamInputOptions = {}): TeamInput {
  let players = opts.maxGrade ? school.players.filter((p) => p.grade <= opts.maxGrade!) : school.players;
  const carry = opts.carryDay !== undefined ? carriedFitness(school, opts.carryDay) : undefined;
  if (rng && !school.isPlayer) players = cpuMatchSquad(rng, players, carry);
  const setup = opts.carryDay !== undefined && !school.isPlayer ? fitnessAwareSetup(players, school.formation, school.tactics, rules.benchSize) : autoSetup(players, school.formation, school.tactics, rules.benchSize);
  return {
    schoolId: school.id,
    name: school.name,
    rank: school.rank,
    isUser,
    players,
    setup,
    captainId: school.captainId,
    ...(school.cpuStaff ? { scouting: school.cpuStaff.scouting, aiQuality: school.cpuStaff.tactics / 100 } : {}),
  };
}

/** 試合での体力の消耗（自校と同じ式） */
export function matchFatigueDrop(endStamina: number): number {
  return MATCH_FATIGUE.base + (100 - endStamina) * MATCH_FATIGUE.fromStamina;
}

/** CPU 校の、試合の後の体力を持ち越す（本戦のみ） */
export function storeCarry(school: School, match: MatchState, side: 0 | 1, squad: Player[], day: number) {
  const team = match.teams[side];
  const played = new Set([...team.onPitch, ...team.subbedOff]);
  const fit: Record<string, number> = {};
  for (const p of squad) {
    const mp = team.players[p.id];
    fit[p.id] = played.has(p.id) && mp ? Math.max(0, p.fitness - matchFatigueDrop(mp.stamina)) : p.fitness;
  }
  school.carryFitness = { day, fit };
}

export interface CpuMatchOptions {
  /** 全国大会・県予選の決勝 */
  bigStage?: boolean;
  maxGrade?: number;
  /** 本戦の日（疲れを持ち越す） */
  carryDay?: number;
}

/** CPU 同士の試合（表示なし。同じ試合エンジンで計算する） */
export function simulateCpuMatch(rng: Rng, a: School, b: School, rules: MatchRules, options: boolean | CpuMatchOptions = false): MatchOutcome {
  const opts: CpuMatchOptions = typeof options === "boolean" ? { bigStage: options } : options;
  const tin = { maxGrade: opts.maxGrade, carryDay: opts.carryDay };
  const ia = schoolTeamInput(a, rules, false, rng, tin);
  const ib = schoolTeamInput(b, rules, false, rng, tin);
  const state = simulateToEnd(createMatch(rules, rng, ia, ib, undefined, opts.bigStage ?? false));
  if (opts.carryDay !== undefined) {
    storeCarry(a, state, 0, ia.players, opts.carryDay);
    storeCarry(b, state, 1, ib.players, opts.carryDay);
  }
  const w = state.winner ?? (rng.chance(0.5) ? 0 : 1);
  return {
    winner: w === 0 ? a.id : b.id,
    score: [state.score[0], state.score[1]],
    pk: state.pk ? [state.pk.score[0], state.pk.score[1]] : undefined,
  };
}
