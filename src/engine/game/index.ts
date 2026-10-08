/**
 * ゲーム全体の進行。UI はここの関数だけを呼ぶ。
 * 関数は GameState を直接書き換える（大きな状態を毎回コピーしないため）。
 */
import { dateToDay, findDestination, formatDay, nationalDays, newCalendar, prefQualifierDays, refillHand } from "../calendar";
import { CPU_GROWTH } from "../config/growth";
import { COMPETITION_NAMES, MAJOR_NAMES, PRACTICE_NAMES, REPUTATION_NAMES, prefectureLabel, roundLabel } from "../config/names";
import { PRACTICE_MATCH } from "../config/calendar";
import { PRACTICE_RULES, winterRulesForRound } from "../config/competitions";
import { REPUTATION_GAUGE } from "../config/reputation";
import { MATCH_FATIGUE } from "../config/season";
import {
  advanceRound,
  createBracket,
  findMatch,
  findMatchById,
  isAlive,
  recordResult,
  roundsFor,
  totalRounds,
} from "../competition/bracket";
import { schoolTeamInput, simulateCpuMatch } from "../competition/simulate";
import { landOnSquare, type EventOutcome } from "../events";
import { createMatch } from "../match/engine";
import { autoSetup } from "../match/lineup";
import type { ActiveMatch } from "../match/types";
import { runPractice } from "../practice";
import { addGauge, handSize, matchReputationDelta } from "../reputation";
import { Rng } from "../rng";
import { generateWorld } from "../school/generate";
import { autumnCpuGrowth } from "../school/season";
import { rankFromStrength, rankIndex, teamStrength } from "../school/strength";
import { addLog, graduate, playerSchool, retireThirdYears, rolloverCpuSchools, rolloverPlayerSchool } from "../season";
import type { Alumnus, Bracket, GameState, MajorKind, MatchKind, MatchRules, Player, School, Square, TeamSetup } from "../types";

export const GAME_STATE_VERSION = 1;

/** 乱数を取り出して使い、最後に状態を書き戻す */
function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = Rng.fromState(state.rng);
  const result = fn(rng);
  state.rng = rng.state();
  return result;
}

// ================= 新しいゲーム =================

export function newGame(seed: string, schoolName: string): GameState {
  const rng = Rng.fromSeed(seed);
  const world = generateWorld(rng, schoolName, 1);
  const state: GameState = {
    version: GAME_STATE_VERSION,
    seed,
    year: 1,
    rng: rng.state(),
    playerSchoolId: world.playerSchoolId,
    schools: world.schools,
    prefectures: world.prefectures,
    regions: world.regions,
    reputation: { level: 0, gauge: 0 },
    calendar: { squares: [], position: 0, hand: [], nextPracticeMult: 1 },
    competitions: { winterDone: false, practiceMatchCount: 0 },
    alumni: [],
    history: [],
    log: [],
  };
  startYear(state, rng);
  state.rng = rng.state();
  addLog(state, `${schoolName}サッカー部の監督に就任した。`, "info");
  return state;
}

function ownPrefecture(state: GameState) {
  return state.prefectures.find((p) => p.isPlayerPref)!;
}

/** 年度の始まり：カレンダーと県予選の組み合わせを作る */
function startYear(state: GameState, rng: Rng) {
  const pref = ownPrefecture(state);
  const prefRounds = roundsFor(pref.schoolIds.length);
  const nationalRounds = roundsFor(state.prefectures.length);
  state.calendar = newCalendar(rng, prefRounds, nationalRounds, handSize(state.reputation));
  const seeded = [...pref.schoolIds]
    .map((id) => ({ id, s: teamStrength(state.schools[id].players, state.schools[id].formation) + rng.normal(0, 1.5) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
  state.competitions = {
    prefQualifier: createBracket("prefQualifier", seeded, prefQualifierDays(prefRounds), rng),
    winterDone: false,
    practiceMatchCount: 0,
  };
  updatePlayerRank(state);
  addLog(state, `${MAJOR_NAMES.entrance}。新入生が入部した。`, "info");
}

export function updatePlayerRank(state: GameState) {
  const s = playerSchool(state);
  s.rank = rankFromStrength(teamStrength(s.players, s.formation));
}

// ================= すごろく =================

/** 大マスで止まるか（大会で敗退していれば止まらない） */
export function isStopSquare(state: GameState, sq: Square): boolean {
  if (!sq.major) return false;
  const c = state.competitions;
  switch (sq.major.kind) {
    case "entrance":
      return false;
    case "prefQualifier":
      return !!c.prefQualifier && !!findMatch(c.prefQualifier, sq.major.round ?? 0, state.playerSchoolId) && !matchDecided(c.prefQualifier, sq.major.round ?? 0, state.playerSchoolId);
    case "national":
      return !!c.national && !!findMatch(c.national, sq.major.round ?? 0, state.playerSchoolId) && !matchDecided(c.national, sq.major.round ?? 0, state.playerSchoolId);
    default:
      return true;
  }
}

function matchDecided(b: Bracket, round: number, schoolId: string) {
  const m = findMatch(b, round, schoolId);
  return !m || m.winner !== undefined;
}

/** 表示用のマスの種類（無効な大マスは通常マスとして扱う） */
export function effectiveSquareType(state: GameState, sq: Square) {
  if (sq.major && (isStopSquare(state, sq) || sq.major.kind === "entrance")) return "major" as const;
  if (sq.major && sq.day < state.calendar.position && sq.major.kind !== "prefQualifier" && sq.major.kind !== "national") return "major" as const;
  return sq.baseType;
}

export interface CardResult {
  from: number;
  to: number;
  days: number;
  practice: string;
  outcomes: EventOutcome[];
  stoppedAt?: MajorKind;
  injured: string[];
}

/** 進行カードを 1 枚使う（1 タップ） */
export function playCard(state: GameState, cardId: string): CardResult | null {
  if (state.pending || state.activeMatch) return null;
  const cal = state.calendar;
  const idx = cal.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return null;
  const card = cal.hand[idx];
  return withRng(state, (rng) => {
    const from = cal.position;
    const to = findDestination(cal.squares, from, card.value, (sq) => isStopSquare(state, sq));
    const days = to - from;
    const school = playerSchool(state);
    const mult = cal.nextPracticeMult;
    cal.nextPracticeMult = 1;
    // 1 日ずつ：練習 → 世界の進行（CPU の試合など）
    const gainsAll: NonNullable<GameState["calendar"]["lastGain"]>["perPlayer"] = {};
    const injured: Player[] = [];
    for (let d = from + 1; d <= to; d++) {
      const r = runPractice(rng, school.players, card.practice, 1, mult);
      for (const [id, g] of Object.entries(r.gains)) {
        const acc = (gainsAll[id] ??= {});
        for (const [k, v] of Object.entries(g)) acc[k as keyof typeof acc] = (acc[k as keyof typeof acc] ?? 0) + (v ?? 0);
      }
      injured.push(...r.injured);
      cal.position = d;
      processWorldDay(state, rng, d);
    }
    cal.lastGain = { practice: card.practice, perPlayer: gainsAll };
    for (const p of injured) addLog(state, `${p.name}が練習中にケガをした（全治${p.injuryDays}日）`, "bad");

    // 止まったマスの効果
    const outcomes: EventOutcome[] = [];
    const sq = cal.squares[to];
    let stoppedAt: MajorKind | undefined;
    if (sq.major && isStopSquare(state, sq)) {
      stoppedAt = sq.major.kind;
      setPendingForMajor(state, rng, sq);
    } else {
      const ctx = { rng, players: school.players, reputation: state.reputation, calendar: cal };
      const o = landOnSquare(ctx, sq.baseType);
      outcomes.push(o);
      addLog(state, `${o.title}：${o.text}`, o.tone);
    }

    cal.hand.splice(idx, 1);
    refillHand(rng, cal, handSize(state.reputation));
    updatePlayerRank(state);
    return { from, to, days, practice: PRACTICE_NAMES[card.practice], outcomes, stoppedAt, injured: injured.map((p) => p.name) };
  });
}

function setPendingForMajor(state: GameState, rng: Rng, sq: Square) {
  const kind = sq.major!.kind;
  const c = state.competitions;
  if (kind === "practiceMatch") {
    const opp = pickPracticeOpponent(state, rng);
    state.pending = { type: "match", kind: "practice", opponentId: opp.id };
    addLog(state, `${COMPETITION_NAMES.practice}：${opp.name}（ランク${opp.rank}）と対戦する。`, "info");
  } else if (kind === "prefQualifier" || kind === "national") {
    const b = kind === "prefQualifier" ? c.prefQualifier! : c.national!;
    const round = sq.major!.round ?? 0;
    const m = findMatch(b, round, state.playerSchoolId)!;
    const oppId = m.a === state.playerSchoolId ? m.b! : m.a!;
    state.pending = { type: "match", kind, opponentId: oppId, bracketMatchId: m.id, round };
    addLog(state, `${COMPETITION_NAMES[kind]} ${roundLabel(totalRounds(b), round)}：${state.schools[oppId].name}と対戦する。`, "info");
  } else if (kind === "graduation") {
    state.pending = { type: "graduation" };
  } else if (kind === "yearEnd") {
    state.pending = { type: "yearEnd" };
  }
}

/** 練習試合の相手：基本はランクが近い学校。2〜3 回に 1 回はランクが 1〜2 段階上の学校 */
export function pickPracticeOpponent(state: GameState, rng: Rng): School {
  const me = playerSchool(state);
  const myRank = rankIndex(me.rank);
  const pref = ownPrefecture(state);
  const cpus = pref.schoolIds.filter((id) => id !== me.id).map((id) => state.schools[id]);
  state.competitions.practiceMatchCount++;
  const stronger = rng.chance(PRACTICE_MATCH.strongerChance);
  const fits = (s: School) => {
    const d = rankIndex(s.rank) - myRank;
    return stronger ? d >= 1 && d <= 2 : Math.abs(d) <= 1;
  };
  let pool = cpus.filter(fits);
  if (pool.length === 0) {
    // 条件に合う学校がなければ、ランクが一番近い学校から選ぶ
    const target = stronger ? myRank + 1 : myRank;
    const best = Math.min(...cpus.map((s) => Math.abs(rankIndex(s.rank) - target)));
    pool = cpus.filter((s) => Math.abs(rankIndex(s.rank) - target) === best);
  }
  return rng.pick(pool);
}

// ================= 世界の進行（CPU の試合など） =================

function processWorldDay(state: GameState, rng: Rng, day: number) {
  if (day === dateToDay(...CPU_GROWTH.autumnDate)) {
    for (const s of Object.values(state.schools)) if (!s.isPlayer) autumnCpuGrowth(rng, s);
  }
  const c = state.competitions;
  for (const b of [c.prefQualifier, c.national]) {
    if (!b || b.championId) continue;
    const r = b.roundsDone;
    if (b.roundDays[r] !== day) continue;
    // プレイヤー校の試合が残っているラウンドは、プレイヤーの試合の後でまとめて計算する
    const mine = findMatch(b, r, state.playerSchoolId);
    if (mine && mine.winner === undefined) continue;
    simulateRemainingRound(state, rng, b);
  }
}

function rulesFor(b: Bracket, round: number): MatchRules {
  return winterRulesForRound(totalRounds(b), round);
}

function simulateRemainingRound(state: GameState, rng: Rng, b: Bracket) {
  const r = b.roundsDone;
  for (const m of b.rounds[r]) {
    if (m.winner !== undefined || !m.a || !m.b) continue;
    recordResult(m, simulateCpuMatch(rng.fork(m.id), state.schools[m.a], state.schools[m.b], rulesFor(b, r)));
  }
  advanceRound(b, rng);
  if (b.championId) onBracketFinished(state, rng, b);
}

function onBracketFinished(state: GameState, rng: Rng, b: Bracket) {
  const champ = state.schools[b.championId!];
  if (b.kind === "prefQualifier") {
    addLog(state, `${COMPETITION_NAMES.prefQualifier}は${champ.name}が優勝した。`, champ.isPlayer ? "good" : "info");
    setupNational(state, rng, champ.id);
  } else {
    addLog(state, `${COMPETITION_NAMES.national}は${champ.name}が優勝した。`, champ.isPlayer ? "good" : "info");
  }
}

/** 他県の代表を決めて、全国大会の組み合わせを作る */
function setupNational(state: GameState, rng: Rng, ownChampionId: string) {
  const reps: string[] = [ownChampionId];
  for (const pref of state.prefectures) {
    if (pref.isPlayerPref) continue;
    const ids = [...pref.schoolIds].sort(
      (a, b) => teamStrength(state.schools[b].players) - teamStrength(state.schools[a].players),
    );
    if (ids.length === 1) {
      reps.push(ids[0]);
      continue;
    }
    // 表示しない県予選（同じエンジンで計算）
    const mini = createBracket("prefQualifier", ids, [0, 0], rng);
    while (!mini.championId) {
      const r = mini.roundsDone;
      for (const m of mini.rounds[r]) {
        if (m.winner !== undefined || !m.a || !m.b) continue;
        recordResult(m, simulateCpuMatch(rng.fork(m.id), state.schools[m.a], state.schools[m.b], winterRulesForRound(totalRounds(mini), r)));
      }
      advanceRound(mini, rng);
    }
    reps.push(mini.championId);
  }
  rng.shuffle(reps);
  state.competitions.national = createBracket("national", reps, nationalDays(roundsFor(reps.length)), rng);
  if (ownChampionId === state.playerSchoolId) addLog(state, `${COMPETITION_NAMES.national}への出場が決まった！`, "good");
}

// ================= 試合 =================

export function pendingMatchRules(state: GameState): MatchRules | null {
  const p = state.pending;
  if (!p || p.type !== "match") return null;
  if (p.kind === "practice") return PRACTICE_RULES;
  const b = p.kind === "prefQualifier" ? state.competitions.prefQualifier! : state.competitions.national!;
  return rulesFor(b, p.round ?? 0);
}

export function pendingMatchLabel(state: GameState): string {
  const p = state.pending;
  if (!p || p.type !== "match") return "";
  if (p.kind === "practice") return COMPETITION_NAMES.practice;
  const b = p.kind === "prefQualifier" ? state.competitions.prefQualifier! : state.competitions.national!;
  return `${COMPETITION_NAMES[p.kind]} ${roundLabel(totalRounds(b), p.round ?? 0)}`;
}

/** 試合前の画面の初期値（前回の采配をもとに、出られる選手でベストの並び） */
export function defaultSetup(state: GameState): TeamSetup {
  const school = playerSchool(state);
  const rules = pendingMatchRules(state) ?? PRACTICE_RULES;
  return autoSetup(school.players, school.formation, school.tactics, rules.benchSize);
}

/** 試合を始める（試合前の画面で決めた采配を使う） */
export function startPlayerMatch(state: GameState, setup: TeamSetup): ActiveMatch | null {
  const p = state.pending;
  if (!p || p.type !== "match" || state.activeMatch) return null;
  const rules = pendingMatchRules(state)!;
  const school = playerSchool(state);
  school.formation = setup.formation;
  school.tactics = { ...setup.tactics };
  const opp = state.schools[p.opponentId];
  return withRng(state, (rng) => {
    const home = { ...schoolTeamInput(school, rules, true), setup };
    const away = schoolTeamInput(opp, rules, false);
    const match: ActiveMatch = {
      kind: p.kind,
      round: p.round,
      bracketMatchId: p.bracketMatchId,
      userSide: 0,
      opponentId: opp.id,
      state: createMatch(rules, rng, home, away),
      started: true,
    };
    state.activeMatch = match;
    return match;
  });
}

export interface MatchSummary {
  kind: MatchKind;
  label: string;
  opponentName: string;
  score: [number, number];
  pk?: [number, number];
  result: "win" | "draw" | "loss";
  reputationDelta: number;
  levelChange: -1 | 0 | 1;
  eliminated: boolean;
  champion: boolean;
  qualifiedNational: boolean;
}

/** 試合終了後の処理（評判・トーナメントの進行・引退） */
export function finishPlayerMatch(state: GameState): MatchSummary | null {
  const am = state.activeMatch;
  if (!am || am.state.phase !== "END") return null;
  const ms = am.state;
  const label = pendingMatchLabel(state);
  return withRng(state, (rng) => {
    const school = playerSchool(state);
    const opp = state.schools[am.opponentId];
    const me = ms.teams[am.userSide];
    // 試合に出た選手の体力の消耗
    for (const id of [...me.onPitch, ...me.subbedOff]) {
      const pl = school.players.find((x) => x.id === id);
      const mp = me.players[id];
      if (pl && mp) pl.fitness = Math.max(0, pl.fitness - (MATCH_FATIGUE.base + (100 - mp.stamina) * MATCH_FATIGUE.fromStamina));
    }
    const myScore = ms.score[am.userSide];
    const oppScore = ms.score[am.userSide === 0 ? 1 : 0];
    const won = ms.winner === am.userSide;
    const result: MatchSummary["result"] = ms.winner === null || ms.winner === undefined ? "draw" : won ? "win" : "loss";
    const viaPk = !!ms.pk;
    updatePlayerRank(state);
    const levelBefore = state.reputation.level;
    let delta = matchReputationDelta(state.reputation.level, am.kind, school.rank, opp.rank, result, viaPk);
    let eliminated = false;
    let champion = false;
    let qualifiedNational = false;

    if (am.kind !== "practice") {
      const b = am.kind === "prefQualifier" ? state.competitions.prefQualifier! : state.competitions.national!;
      const found = findMatchById(b, am.bracketMatchId!)!;
      const m = found.match;
      const aIsMe = m.a === state.playerSchoolId;
      recordResult(m, {
        winner: won ? state.playerSchoolId : opp.id,
        score: aIsMe ? [myScore, oppScore] : [oppScore, myScore],
        pk: ms.pk ? (aIsMe ? [ms.pk.score[am.userSide], ms.pk.score[1 - am.userSide]] : [ms.pk.score[1 - am.userSide], ms.pk.score[am.userSide]]) : undefined,
      });
      if (am.kind === "national" && won) delta += REPUTATION_GAUGE.bonus.nationalWinPerRound;
      // 同じラウンドの残りの試合を計算する
      if (b.roundDays[b.roundsDone] <= state.calendar.position) simulateRemainingRound(state, rng, b);
      if (!won) {
        eliminated = true;
        state.competitions.winterResult = `${label}敗退`;
        retireThirdYears(state);
      } else if (b.championId === state.playerSchoolId) {
        champion = true;
        if (am.kind === "prefQualifier") {
          qualifiedNational = true;
          delta += REPUTATION_GAUGE.bonus.prefChampion;
          state.competitions.winterResult = `${prefectureLabel(ownPrefecture(state).name)}代表`;
        } else {
          delta += REPUTATION_GAUGE.bonus.nationalChampion;
          state.competitions.winterResult = `${COMPETITION_NAMES.national} 優勝`;
          retireThirdYears(state);
        }
      }
    }
    const change = addGauge(state.reputation, delta);
    const resultText = result === "win" ? "勝利" : result === "draw" ? "引き分け" : "敗戦";
    const pkText = ms.pk ? `（PK ${ms.pk.score[am.userSide]}-${ms.pk.score[1 - am.userSide]}）` : "";
    addLog(state, `${label} vs ${opp.name}：${myScore}-${oppScore}${pkText} ${resultText}`, result === "win" ? "good" : result === "loss" ? "bad" : "info");
    if (change.levelChange !== 0) {
      addLog(
        state,
        `評判が「${REPUTATION_NAMES[levelBefore]}」から「${REPUTATION_NAMES[state.reputation.level]}」に${change.levelChange > 0 ? "上がった" : "下がった"}。`,
        change.levelChange > 0 ? "good" : "bad",
      );
      refillHand(rng, state.calendar, handSize(state.reputation));
    }
    state.activeMatch = undefined;
    state.pending = undefined;
    return {
      kind: am.kind,
      label,
      opponentName: opp.name,
      score: [myScore, oppScore],
      pk: ms.pk ? [ms.pk.score[am.userSide], ms.pk.score[1 - am.userSide]] : undefined,
      result,
      reputationDelta: Math.round(delta * 10) / 10,
      levelChange: change.levelChange,
      eliminated,
      champion,
      qualifiedNational,
    };
  });
}

// ================= 卒業・年度替わり =================

export function confirmGraduation(state: GameState): Alumnus[] {
  if (state.pending?.type !== "graduation") return [];
  const alumni = withRng(state, (rng) => graduate(state, rng));
  addLog(state, `${MAJOR_NAMES.graduation}。${alumni.length}人の3年生が巣立っていった。`, "info");
  state.pending = undefined;
  updatePlayerRank(state);
  return alumni;
}

export function confirmYearEnd(state: GameState): Player[] {
  if (state.pending?.type !== "yearEnd") return [];
  return withRng(state, (rng) => {
    updatePlayerRank(state);
    state.history.push({
      year: state.year,
      reputationLevel: state.reputation.level,
      rank: playerSchool(state).rank,
      winterResult: state.competitions.winterResult ?? "—",
    });
    state.year++;
    const freshmen = rolloverPlayerSchool(state, rng);
    rolloverCpuSchools(state, rng);
    state.pending = undefined;
    startYear(state, rng);
    addLog(state, `${freshmen.length}人の新入生が入部した。`, "good");
    return freshmen;
  });
}

// ================= 表示用 =================

export function dateLabel(state: GameState): string {
  return formatDay(state.calendar.position);
}

export function opponentOf(state: GameState): School | undefined {
  const p = state.pending;
  return p && p.type === "match" ? state.schools[p.opponentId] : undefined;
}

export function isPlayerAlive(state: GameState, b: Bracket | undefined): boolean {
  return !!b && isAlive(b, state.playerSchoolId);
}
