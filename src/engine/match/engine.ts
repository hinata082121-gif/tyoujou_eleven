/**
 * 試合エンジン（SPEC 10章）。
 * 1 区間（5 分）ずつ計算し、「何分に、誰が、何をしたか」のイベントを生成する。
 * 采配の変更は pending に積み、次の区間の頭で反映する。
 * 表示側はここで生成したイベントを再生するだけ。
 */
import { FORMATIONS, type Lane, type Slot } from "../config/formations";
import { MATCH } from "../config/match";
import { CONDITION_MULT } from "../config/player";
import { weightedStats } from "../player/rating";
import { rankIndex } from "../school/strength";
import { Rng } from "../rng";
import { STAFF_EFFECTS } from "../config/staff";
import { positionRating } from "../player/rating";
import { ALL_STATS, type MatchKind, type MatchRules, type Player, type SchoolRank, type Stats, type Tactics, type TeamSetup } from "../types";
import { decideAi } from "./ai";
import { assignToSlots } from "./lineup";
import { evaluateNote } from "./note";
import { activeIds, isOut, pendingOf } from "./orders";
import { autoPkOrder, pkDecided, resolvePkKick } from "./pk";
export { cancelSubstitution, queueFormation, queueSubstitution, queueTactics, subsRemaining, activeIds, isOut } from "./orders";
import type { InjurySeverity, MatchEvent, MatchEventType, MatchPlayer, MatchState, MatchTeamState, NoteMatchState, Side } from "./types";

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const other = (s: Side): Side => (s === 0 ? 1 : 0);

// ================= 試合の作成 =================

export interface TeamInput {
  schoolId: string;
  name: string;
  rank: SchoolRank;
  isUser: boolean;
  players: Player[];
  setup: TeamSetup;
  /** 分析担当のスカウティング（0 は分析担当なし） */
  scouting?: number;
  /** AI の采配の質（0〜1） */
  aiQuality?: number;
  /** ケガの確率の倍率（フィジカルコーチ） */
  injuryMult?: number;
  /** 作戦ノート（自校のみ） */
  note?: Omit<NoteMatchState, "fired" | "stopped">;
}

function toMatchPlayer(p: Player): MatchPlayer {
  return {
    id: p.id,
    name: p.name,
    mainPosition: p.mainPosition,
    stats: { ...p.stats },
    aptitude: { ...p.aptitude },
    heightCm: p.heightCm,
    condition: p.condition,
    stamina: clamp(MATCH.startStaminaBase + MATCH.startStaminaFromFitness * p.fitness, 0, 100),
    goals: 0,
  };
}

function makeTeam(input: TeamInput, benchSize: number, form: number): MatchTeamState {
  const byId = new Map(input.players.map((p) => [p.id, p]));
  const lineup = input.setup.lineup.filter((id) => byId.has(id));
  const bench = input.setup.bench.filter((id) => byId.has(id) && !lineup.includes(id)).slice(0, benchSize);
  const players: Record<string, MatchPlayer> = {};
  for (const id of [...lineup, ...bench]) players[id] = toMatchPlayer(byId.get(id)!);
  return {
    schoolId: input.schoolId,
    name: input.name,
    rank: input.rank,
    isUser: input.isUser,
    players,
    onPitch: lineup,
    bench,
    subbedOff: [],
    formation: input.setup.formation,
    tactics: { ...input.setup.tactics },
    subsUsed: 0,
    subWindowsUsed: 0,
    form,
    pending: null,
    scouting: input.scouting ?? 0,
    aiQuality: input.aiQuality ?? DEFAULT_AI_QUALITY,
    injuryMult: input.injuryMult ?? 1,
    ...(input.note ? { note: { ...input.note, fired: [], stopped: [] } } : {}),
    stats: { shots: 0, onTarget: 0, possessionSum: 0, segments: 0, corners: 0, zones: { attacks: [0, 0, 0], chances: [0, 0, 0] } },
  };
}

/** スタッフの値を持たないチーム（バランス検証など）の AI の質。Phase 1 の CPU の采配と同じ動きになる値 */
export const DEFAULT_AI_QUALITY = MATCH.ai.baseQuality;

export function createMatch(rules: MatchRules, seed: Rng, home: TeamInput, away: TeamInput, kind?: MatchKind): MatchState {
  const rng = seed.fork("match");
  const form = () => clamp(rng.normal(1, MATCH.matchDayFormSd), 0.8, 1.2);
  const state: MatchState = {
    rules,
    rng: rng.state(),
    phase: "H1",
    minute: 0,
    segmentInPhase: 0,
    teams: [makeTeam(home, rules.benchSize, form()), makeTeam(away, rules.benchSize, form())],
    score: [0, 0],
    momentum: 0,
    momentumHistory: [],
    events: [{ minute: 0, side: 0, type: "kickoff" }],
  };
  if (kind) state.kind = kind;
  return state;
}

// ================= フェーズ =================

export function phaseLength(state: MatchState, phase = state.phase): number {
  if (phase === "H1" || phase === "H2") return state.rules.halfMinutes;
  if (phase === "ET1" || phase === "ET2") return state.rules.extraTimeHalfMinutes ?? 0;
  return 0;
}

export function phaseStartMinute(state: MatchState, phase = state.phase): number {
  const h = state.rules.halfMinutes;
  const et = state.rules.extraTimeHalfMinutes ?? 0;
  switch (phase) {
    case "H1":
      return 0;
    case "H2":
      return h;
    case "ET1":
      return 2 * h;
    case "ET2":
      return 2 * h + et;
    default:
      return state.minute;
  }
}

export function totalMinutes(state: MatchState): number {
  return 2 * state.rules.halfMinutes + (state.rules.extraTimeHalfMinutes ?? 0) * 2;
}

export const isPlayingPhase = (state: MatchState) => state.phase === "H1" || state.phase === "H2" || state.phase === "ET1" || state.phase === "ET2";
export const isBreakPhase = (state: MatchState) => state.phase === "HT" || state.phase === "ET_BREAK" || state.phase === "ET_HT";

/** ハーフタイムなどの休憩から再開する */
export function resumeFromBreak(state: MatchState) {
  const next: Record<string, MatchState["phase"]> = { HT: "H2", ET_BREAK: "ET1", ET_HT: "ET2" };
  const to = next[state.phase];
  if (!to) return;
  state.phase = to;
  state.segmentInPhase = 0;
  state.minute = phaseStartMinute(state, to);
  const type: MatchEventType = to === "H2" ? "secondHalf" : to === "ET1" ? "extraTime" : "extraSecondHalf";
  state.events.push({ minute: state.minute, side: 0, type });
}

function endOfPhase(state: MatchState) {
  const [a, b] = state.score;
  const draw = a === b;
  const finish = () => {
    state.phase = "END";
    state.winner = draw ? null : a > b ? 0 : 1;
    state.events.push({ minute: state.minute, side: 0, type: "fullTime", score: [a, b] });
  };
  const toPk = () => {
    state.phase = "PK";
    state.events.push({ minute: state.minute, side: 0, type: "pkShootout", score: [a, b] });
    state.pk = { order: [[], []], kicks: [], score: [0, 0], done: false };
    for (const side of [0, 1] as Side[]) if (!state.teams[side].isUser) state.pk.order[side] = autoPkOrder(state.teams[side]);
  };
  switch (state.phase) {
    case "H1":
      state.phase = "HT";
      state.events.push({ minute: state.minute, side: 0, type: "halfTime", score: [a, b] });
      return;
    case "H2":
      if (draw && state.rules.extraTimeHalfMinutes) {
        state.phase = "ET_BREAK";
        state.events.push({ minute: state.minute, side: 0, type: "fullTime", score: [a, b], note: "extra" });
      } else if (draw && state.rules.pkOnDraw) toPk();
      else finish();
      return;
    case "ET1":
      state.phase = "ET_HT";
      state.events.push({ minute: state.minute, side: 0, type: "halfTime", score: [a, b], note: "extra" });
      return;
    case "ET2":
      if (draw && state.rules.pkOnDraw) toPk();
      else finish();
      return;
  }
}

// ================= 采配 =================

/** 予約していた采配を反映する（区間の頭で呼ぶ） */
function applyPending(state: MatchState, side: Side) {
  const team = state.teams[side];
  // ケガ人の代わりが決まっていなければ、その位置に最も合う控えを入れる
  autoReplaceInjured(state, side);
  const p = team.pending;
  if (!p) return;
  const minute = state.minute;
  if (p.subs.length > 0) {
    team.subWindowsUsed++;
    for (const sub of p.subs) {
      const idx = team.onPitch.indexOf(sub.out);
      if (idx < 0 || team.players[sub.out]?.sentOff || !team.bench.includes(sub.in) || team.subsUsed >= state.rules.maxSubs) continue;
      team.onPitch[idx] = sub.in;
      team.bench = team.bench.filter((id) => id !== sub.in);
      team.subbedOff.push(sub.out);
      team.subsUsed++;
      state.events.push({ minute, side, type: "sub", players: [sub.in, sub.out] });
    }
  }
  if (p.formation && p.formation !== team.formation) {
    team.formation = p.formation;
    reassignSlots(team);
    state.events.push({ minute, side, type: "formation", note: p.formation });
  } else if (p.subs.length > 0 && p.formation === undefined) {
    // 交代で入った選手がスロットに合わなければ、並びを最適化する
    reassignSlots(team);
  }
  for (const pos of p.positions ?? []) {
    const from = team.onPitch.indexOf(pos.id);
    if (from < 0 || pos.slot < 0 || pos.slot >= team.onPitch.length || from === pos.slot || isOut(team.players[pos.id])) continue;
    [team.onPitch[from], team.onPitch[pos.slot]] = [team.onPitch[pos.slot], team.onPitch[from]];
    state.events.push({ minute, side, type: "position", players: [pos.id], note: String(pos.slot) });
  }
  if (p.tactics) {
    const changed = JSON.stringify(p.tactics) !== JSON.stringify(team.tactics);
    team.tactics = { ...p.tactics };
    if (changed) state.events.push({ minute, side, type: "tactics" });
  }
  team.pending = null;
}

/**
 * 出場中の選手を、今のフォーメーションの枠に割り当て直す。
 * 退場・ケガでピッチにいない選手は、空いた枠（最後に埋まる枠）に置く。GK がいなければフィールド選手が GK をする
 */
export function reassignSlots(team: MatchTeamState) {
  const avail = activeIds(team);
  const out = team.onPitch.filter((id) => isOut(team.players[id]));
  const result = assignToSlots(
    avail.map((id) => team.players[id]),
    team.formation,
  );
  for (let i = 0; i < result.length; i++) if (!result[i]) result[i] = out.shift() ?? "";
  team.onPitch = result;
}

/** ケガで交代を待っている選手（交代の予約がまだないもの） */
export function injuredAwaitingSub(team: MatchTeamState): string[] {
  const pendingOut = new Set(team.pending?.subs.map((s) => s.out) ?? []);
  return team.onPitch.filter((id) => team.players[id]?.injury && !pendingOut.has(id));
}

/** その枠に最も合う控え（予約済みの選手を除く） */
export function bestBenchFor(team: MatchTeamState, slotIndex: number): string | null {
  const pos = FORMATIONS[team.formation][slotIndex]?.pos ?? "CMF";
  const pendingIn = new Set(team.pending?.subs.map((s) => s.in) ?? []);
  const cands = team.bench.filter((id) => !pendingIn.has(id));
  if (cands.length === 0) return null;
  return cands.reduce((b, id) => (positionRating(team.players[id], pos) > positionRating(team.players[b], pos) ? id : b), cands[0]);
}

/** ケガ人の代わりを自動で入れる（交代枠が残っていれば）。観戦中に選ばずに再開したときや、AI の采配で使う */
export function autoReplaceInjured(state: MatchState, side: Side) {
  const team = state.teams[side];
  for (const id of injuredAwaitingSub(team)) {
    if (state.rules.maxSubs - team.subsUsed - (team.pending?.subs.length ?? 0) <= 0) return;
    const inId = bestBenchFor(team, team.onPitch.indexOf(id));
    if (!inId) return;
    pendingOf(team).subs.push({ out: id, in: inId });
  }
}

// ================= 判定の部品（7.3。単体テストしやすいよう切り出し） =================

/**
 * 視野の広さ × 判断：見えていても、強い相手には出せない。
 * 1. 視野の広さで候補の数が決まる 2. 判断で出すまでの速さが決まる
 * 3. 相手の守備の質で余裕時間が短くなる 4. 間に合う候補のうち最も価値の高いものを返す（なければ null）
 */
export function bestPassValue(rng: Rng, vision: number, decision: number, defQ: number): number | null {
  const n = Math.min(MATCH.maxCandidates, 1 + Math.floor(Math.max(0, vision) / MATCH.visionPerCandidate));
  const available = MATCH.timeT0 - (MATCH.timeTa * defQ) / 100;
  const need = MATCH.needT0 - (MATCH.needTb * decision) / 100;
  let best: number | null = null;
  for (let i = 0; i < n; i++) {
    const diff = rng.next() * MATCH.difficultyMax;
    if (need + diff <= available) {
      const value = MATCH.valueBase + (diff / MATCH.difficultyMax) * MATCH.valueRange;
      if (best === null || value > best) best = value;
    }
  }
  return best;
}

/** ロングパス = パス（精度）× キック力（届く距離）。キック力が足りないと届かない */
export function longBallOutcome(rng: Rng, kickPower: number, pass: number): "ok" | "short" | "lost" {
  const need = rng.range(MATCH.longDistanceMin, MATCH.longDistanceMax);
  if (!rng.chance(sigmoid((kickPower - need) / 8))) return "short";
  if (!rng.chance(sigmoid((pass - MATCH.longAccBias) / MATCH.longAccScale))) return "lost";
  return "ok";
}

/**
 * 枠内のシュートに対する GK の判定。
 * 1. ポジショニングで「止めにいける範囲」 2. 範囲内ならセービング 3. キャッチングが低いとこぼれ球（parry）
 */
export function goalkeeperOutcome(
  rng: Rng,
  shot: { acc: number; power: number; q: number },
  gk: Pick<Stats, "positioning" | "saving" | "catching">,
): "goal" | "catch" | "parry" {
  const placement = rng.next() * MATCH.placeSpread + (shot.acc / 100) * MATCH.placeAcc + shot.q * MATCH.placeQ;
  const reach = MATCH.reachBase + (gk.positioning / 100) * MATCH.reachPos;
  if (placement > reach) return "goal";
  const saveP = sigmoid((gk.saving - shot.power * MATCH.savePowerW - shot.q * MATCH.saveQ + MATCH.saveBias) / MATCH.saveScale);
  if (!rng.chance(saveP)) return "goal";
  const catchP = sigmoid((gk.catching - shot.power * MATCH.catchPowerW + MATCH.catchBias) / MATCH.catchScale);
  return rng.chance(catchP) ? "catch" : "parry";
}

/**
 * 戦術の相性によるチャンスの質の補正（循環型。config の matchup を参照）。
 * route = "pass" はつないで崩す攻撃（中央・サイド）、"long" はロングボール。
 * pass は倍率、long は足し引きする値を返す。
 */
export function matchupAdjust(atk: Tactics, def: Tactics, route: "pass" | "long"): number {
  const m = MATCH.matchup;
  if (route === "pass") {
    if (atk.buildUp !== "buildUp") return 1;
    let mult = 1;
    if (def.press === "high") mult *= m.buildUpVsHighPressQ;
    if (def.line === "low") mult *= m.buildUpVsLowLineQ;
    return mult;
  }
  let add = def.line === "high" ? MATCH.longVsHighLineQ : 0;
  if (def.press === "high") add += m.longVsHighPressQ;
  if (def.line === "low") add -= m.longVsLowLineQ;
  return add;
}

/**
 * 堅守速攻（守備的・ライン低）で格上と戦うときの、ランク差（0〜maxRanks）。
 * 0 なら補正なし（格上でない、または堅守速攻でない）
 */
export function underdogLowBlockRanks(me: Pick<MatchTeamState, "tactics" | "rank">, opp: Pick<MatchTeamState, "rank">): number {
  if (me.tactics.attack !== "defensive" || me.tactics.line !== "low") return 0;
  return clamp(rankIndex(opp.rank) - rankIndex(me.rank), 0, MATCH.underdogLowBlock.maxRanks);
}

/** 戦術の相性による、攻撃側の支配率の補正と攻撃回数の倍率 */
export function matchupFlow(atk: Tactics, def: Tactics): { possession: number; rate: number } {
  const m = MATCH.matchup;
  let possession = 0;
  let rate = 1;
  if (atk.buildUp === "buildUp") {
    if (def.press === "high") possession += m.buildUpVsHighPressPossession;
    if (def.line === "low") possession += m.buildUpVsLowLinePossession;
  } else {
    if (def.press === "high") rate *= m.longVsHighPressRate;
    if (def.line === "low") rate *= m.longVsLowLineRate;
  }
  return { possession, rate };
}

// ================= 区間の計算 =================

interface Actor {
  id: string;
  slot: Slot;
  /** 実効能力（適性・疲労・調子込み） */
  e: Stats;
  height: number;
}

function buildActors(team: MatchTeamState): Actor[] {
  const slots = FORMATIONS[team.formation];
  const actors: Actor[] = [];
  team.onPitch.forEach((id, i) => {
    const p = team.players[id];
    if (!p || isOut(p)) return;
    const slot = slots[i];
    const apt = MATCH.aptitudeMult[p.aptitude[slot.pos]];
    const fat = MATCH.fatigueFloor + (1 - MATCH.fatigueFloor) * (p.stamina / 100);
    const m = apt * fat * (CONDITION_MULT[p.condition] ?? 1) * team.form;
    const e = {} as Stats;
    for (const k of ALL_STATS) e[k] = MATCH.skillPivot + (p.stats[k] * m - MATCH.skillPivot) * MATCH.skillCompression;
    actors.push({ id, slot, e, height: p.heightCm });
  });
  return actors;
}

/** ピッチ上の人数が 11 人からいくつ減っているか */
export function playersShort(team: MatchTeamState): number {
  return Math.max(0, team.onPitch.length - activeIds(team).length);
}

interface TeamCtx {
  side: Side;
  team: MatchTeamState;
  actors: Actor[];
  gk: Actor;
  mid: number;
  /** 11 人から減っている人数 */
  short: number;
}

class SegmentSim {
  readonly ctx: [TeamCtx, TeamCtx];
  readonly events: MatchEvent[] = [];
  private momentumDelta = 0;
  /** 今の攻撃のレーン（ゾーン別の集計用） */
  private currentLane: Lane = "C";

  constructor(
    private state: MatchState,
    private rng: Rng,
    private segStart: number,
  ) {
    this.ctx = [this.makeCtx(0), this.makeCtx(1)];
  }

  private makeCtx(side: Side): TeamCtx {
    const team = this.state.teams[side];
    const actors = buildActors(team);
    const gk = actors.find((a) => a.slot.pos === "GK") ?? actors[0];
    let mid = 0;
    for (const a of actors) mid += weightedStats(a.e, MATCH.midWeights) * MATCH.midLineWeights[a.slot.line];
    return { side, team, actors, gk, mid, short: playersShort(team) };
  }

  // ---- ファウル・カード・ケガ（P2a）----

  /** 選手がピッチを離れた（退場・ケガ）。この区間の残りもいない扱いにする */
  private removeActor(side: Side, id: string) {
    const c = this.ctx[side];
    c.actors = c.actors.filter((a) => a.id !== id);
    c.short = playersShort(c.team);
    if (c.gk.id === id) c.gk = c.actors.find((a) => a.slot.pos === "GK") ?? c.actors[0] ?? c.gk;
    reassignSlots(c.team);
  }

  private sendOff(side: Side, id: string, minute: number, type: "red" | "secondYellow") {
    const team = this.ctx[side].team;
    const mp = team.players[id];
    mp.sentOff = true;
    team.stats.reds = (team.stats.reds ?? 0) + 1;
    this.emit(minute, side, type, [id]);
    this.removeActor(side, id);
    // GK が退場したら、控えの GK と交代枠があれば、フィールド選手 1 人を下げて GK を入れる
    if (mp.mainPosition === "GK") {
      const gk = team.bench.find((b) => team.players[b].mainPosition === "GK" && !team.pending?.subs.some((s) => s.in === b));
      const left = this.state.rules.maxSubs - team.subsUsed - (team.pending?.subs.length ?? 0);
      if (gk && left > 0) {
        const field = activeIds(team);
        const slots = FORMATIONS[team.formation];
        const weakest = field.reduce((b, x) =>
          positionRating(team.players[x], slots[team.onPitch.indexOf(x)].pos) < positionRating(team.players[b], slots[team.onPitch.indexOf(b)].pos) ? x : b,
        field[0]);
        if (weakest) pendingOf(team).subs.push({ out: weakest, in: gk });
      }
    }
  }

  /** ファウルをした選手へのカード */
  private card(defSide: Side, fouler: Actor, minute: number, inBox: boolean) {
    const f = MATCH.fouls;
    const team = this.ctx[defSide].team;
    const mp = team.players[fouler.id];
    team.stats.fouls = (team.stats.fouls ?? 0) + 1;
    if (!mp || mp.sentOff) return;
    if (this.rng.chance(inBox ? f.redInBox : f.red)) return this.sendOff(defSide, fouler.id, minute, "red");
    const booked = (mp.yellow ?? 0) > 0;
    if (!this.rng.chance((inBox ? f.yellowInBox : f.yellow) * (booked ? f.bookedYellowMult : 1))) return;
    mp.yellow = (mp.yellow ?? 0) + 1;
    team.stats.yellows = (team.stats.yellows ?? 0) + 1;
    if (mp.yellow >= 2) this.sendOff(defSide, fouler.id, minute, "secondYellow");
    else this.emit(minute, defSide, "yellow", [fouler.id]);
  }

  /** ケガ（ピッチを離れる。次の区間の頭で交代する） */
  private injure(side: Side, id: string, minute: number) {
    const team = this.ctx[side].team;
    const mp = team.players[id];
    if (!mp || isOut(mp)) return;
    const w = MATCH.injury.severityWeights;
    const severity = this.rng.weighted(["light", "medium", "severe"] as InjurySeverity[], (k) => w[k]);
    mp.injury = { minute, severity };
    team.stats.injuries = (team.stats.injuries ?? 0) + 1;
    this.emit(minute, side, "injury", [id], severity);
    this.removeActor(side, id);
    const left = this.state.rules.maxSubs - team.subsUsed - (team.pending?.subs.length ?? 0);
    if (left <= 0 || team.bench.length === 0) this.emit(minute, side, "shortHanded", [id]);
  }

  private foulInjury(victimSide: Side, victim: Actor, minute: number) {
    if (this.rng.chance(MATCH.injury.onFoul * (this.ctx[victimSide].team.injuryMult ?? 1))) this.injure(victimSide, victim.id, minute);
  }

  private isBooked(side: Side, id: string) {
    return (this.ctx[side].team.players[id]?.yellow ?? 0) > 0;
  }

  /**
   * 1 対 1 で抜かれた守備側が、ファウルで止める（守備の判定のときのファウル）。
   * ファウルなら true（攻撃はそこで止まり、一部は危険なフリーキックになる）
   */
  private duelFoul(atkSide: Side, carrier: Actor, marker: Actor, minute: number): boolean {
    const f = MATCH.fouls;
    const defSide = other(atkSide);
    const def = this.ctx[defSide];
    if (!def.actors.includes(marker)) return false;
    const decisionMult = clamp(1 + (50 - marker.e.decision) * f.duelDecisionSlope, 0.4, 2);
    const p = f.duelFoul * f.pressMult[def.team.tactics.press] * decisionMult * (this.isBooked(defSide, marker.id) ? f.bookedFoulMult : 1);
    if (!this.rng.chance(p)) return false;
    this.emit(minute, defSide, "foul", [marker.id, carrier.id]);
    this.card(defSide, marker, minute, false);
    this.foulInjury(atkSide, carrier, minute);
    if (this.rng.chance(f.freeKickDanger)) this.setPiece(atkSide, minute);
    return true;
  }

  /** 中盤でのファウル（攻撃の判定には現れない。カードとケガだけ） */
  private backgroundFoul(defSide: Side, minute: number) {
    const def = this.ctx[defSide];
    const atk = this.ctx[other(defSide)];
    const field = def.actors.filter((a) => a.slot.line !== "GK");
    const victims = atk.actors.filter((a) => a.slot.line !== "GK");
    if (field.length === 0 || victims.length === 0) return;
    const fouler = this.pickBy(field, (a) => (120 - a.e.decision) * (this.isBooked(defSide, a.id) ? MATCH.fouls.bookedFoulMult : 1));
    const victim = this.pickBy(victims, (a) => a.e.dribble + a.e.speed);
    this.card(defSide, fouler, minute, false);
    this.foulInjury(other(defSide), victim, minute);
  }

  /** 区間の中のケガ（体力が低いほど起きやすい） */
  private segmentInjuries(segMinutes: number) {
    const scale = segMinutes / MATCH.segmentMinutes;
    for (const side of [0, 1] as Side[]) {
      const team = this.ctx[side].team;
      for (const a of [...this.ctx[side].actors]) {
        const st = team.players[a.id].stamina;
        const p = MATCH.injury.perSegment * scale * (1 + MATCH.injury.fatigue * (1 - st / 100)) * (team.injuryMult ?? 1);
        if (this.rng.chance(p)) this.injure(side, a.id, this.segStart + this.rng.int(0, Math.max(0, segMinutes - 1)) + 1);
      }
    }
  }

  private emit(minute: number, side: Side, type: MatchEventType, players?: string[], note?: string) {
    const ev: MatchEvent = { minute, side, type };
    if (players) ev.players = players;
    if (note) ev.note = note;
    this.events.push(ev);
  }

  private bumpMomentum(side: Side, amount: number) {
    this.momentumDelta += side === 0 ? amount : -amount;
  }

  // ---- 補助 ----
  private pickBy(actors: Actor[], weight: (a: Actor) => number): Actor {
    return this.rng.weighted(actors, (a) => Math.max(0.01, weight(a)));
  }

  private defScore(a: Actor) {
    return weightedStats(a.e, MATCH.defWeights);
  }

  private atkScore(a: Actor) {
    return weightedStats(a.e, MATCH.atkWeights);
  }

  /** 守備の質（レーンごと）。プレスの強さで補正する */
  defQuality(def: TeamCtx, lane: Lane): number {
    let sum = 0;
    let w = 0;
    for (const a of def.actors) {
      if (a.slot.line === "GK" || a.slot.line === "FW") continue;
      const laneW = a.slot.lane === lane ? 1 : lane === "C" || a.slot.lane === "C" ? 0.5 : 0.15;
      const lineW = a.slot.line === "DF" ? 1 : 0.6;
      sum += this.defScore(a) * laneW * lineW;
      w += laneW * lineW;
    }
    const base = w > 0 ? sum / w : 30;
    const t = def.team.tactics;
    const gap = t.press === "high" && t.line === "low" ? MATCH.pressLineGapDefense : 0;
    const underdog = underdogLowBlockRanks(def.team, this.ctx[other(def.side)].team) * MATCH.underdogLowBlock.defensePerRank;
    const short = def.short * MATCH.manDown.defense;
    return base + MATCH.pressDefenseBonus[t.press] + MATCH.lineDefenseBonus[t.line] + MATCH.attackStyleDefense[t.attack] + gap + underdog - short;
  }

  private attackers(atk: TeamCtx, lane?: Lane): Actor[] {
    const list = atk.actors.filter(
      (a) => a.slot.line === "FW" || a.slot.pos === "OMF" || a.slot.pos === "WG" || (a.slot.line === "MF" && a.slot.pos !== "DMF"),
    );
    const inLane = lane ? list.filter((a) => a.slot.lane === lane || a.slot.lane === "C") : list;
    return inLane.length > 0 ? inLane : atk.actors.filter((a) => a.slot.line !== "GK");
  }

  private midfielders(atk: TeamCtx, lane?: Lane): Actor[] {
    const list = atk.actors.filter((a) => a.slot.line === "MF" && (!lane || a.slot.lane === lane));
    return list.length > 0 ? list : atk.actors.filter((a) => a.slot.line !== "GK");
  }

  private defenders(def: TeamCtx, lane?: Lane): Actor[] {
    const list = def.actors.filter((a) => a.slot.line === "DF" && (!lane || a.slot.lane === lane));
    if (list.length > 0) return list;
    const any = def.actors.filter((a) => a.slot.line === "DF" || a.slot.pos === "DMF");
    return any.length > 0 ? any : def.actors.filter((a) => a.slot.line !== "GK");
  }

  private aerialPower(a: Actor) {
    return a.e.aerial + (a.height - 175) * MATCH.aerialHeightPerCm;
  }

  // ---- 攻撃 ----

  /** 攻撃 1 回 */
  attack(side: Side, minute: number, counter = false) {
    this.currentLane = "C";
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    // ビルドアップ重視：相手のプレスに引っかかると自陣ゴール前で奪われる（7.3）
    if (!counter && atk.team.tactics.buildUp === "buildUp") {
      const pressMult = MATCH.buildUpPressMult[def.team.tactics.press];
      if (pressMult > 0) {
        const gkBuild = (atk.gk.e.pass + atk.gk.e.technique) / 2;
        const pressers = this.attackers(def);
        const pressQ = pressers.reduce((s, a) => s + (a.e.speed + a.e.stamina + a.e.decision) / 3, 0) / pressers.length;
        const p = MATCH.buildUpErrorBase * pressMult * 2 * sigmoid((pressQ - gkBuild) / MATCH.buildUpErrorScale);
        if (this.rng.chance(p)) {
          const thief = this.pickBy(pressers, (a) => a.e.speed + a.e.decision);
          this.emit(minute, def.side, "buildUpError", [thief.id, atk.gk.id]);
          this.chanceInBox(def.side, thief, MATCH.buildUpErrorChanceQ, minute, 0);
          return;
        }
      }
    }
    this.recordZone(side, "attacks");
    if (counter) return this.counterAttack(side, minute);
    const longW = atk.team.tactics.buildUp === "long" ? MATCH.routeLongWithLongTactic : MATCH.routeWeights.long;
    const route = this.rng.weighted(["center", "side", "long", "setPiece"] as const, (r) =>
      r === "long" ? longW : MATCH.routeWeights[r],
    );
    if (route === "center") return this.centerAttack(side, minute);
    if (route === "side") return this.sideAttack(side, minute);
    if (route === "long") return this.longBall(side, minute);
    return this.setPiece(side, minute);
  }

  visionDecision(passer: Actor, defQ: number): number | null {
    return bestPassValue(this.rng, passer.e.vision, passer.e.decision, defQ);
  }

  private turnover(lostSide: Side, minute: number) {
    const lost = this.ctx[lostSide].team;
    const counterer = this.ctx[other(lostSide)].team;
    const p =
      MATCH.counterChance *
      (lost.tactics.line === "high" ? MATCH.counterLineHighMult : 1) *
      MATCH.attackStyleCounterExposure[lost.tactics.attack] *
      MATCH.attackStyleCounterAttack[counterer.tactics.attack] *
      (1 + underdogLowBlockRanks(counterer, lost) * MATCH.underdogLowBlock.counterPerRank);
    if (this.rng.chance(p)) this.attack(other(lostSide), minute, true);
  }

  private centerAttack(side: Side, minute: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const passer = this.pickBy(this.midfielders(atk, "C"), (a) => a.e.pass + a.e.vision);
    const defQ = this.defQuality(def, "C");
    const value = this.visionDecision(passer, defQ);
    if (value === null) {
      // 出せるパスがない → ドリブルで打開を試みる
      if (this.rng.chance(passer.e.dribble / MATCH.dribbleTryDiv)) return this.dribble(side, passer, minute, "C");
      this.emit(minute, side, "noOption", [passer.id]);
      return this.turnover(side, minute);
    }
    const pAcc = sigmoid((passer.e.pass - MATCH.passAccBias - value * MATCH.passAccValue) / MATCH.passAccScale);
    const receiver = this.pickBy(
      this.attackers(atk).filter((a) => a.id !== passer.id),
      (a) => this.atkScore(a),
    );
    if (!this.rng.chance(pAcc)) {
      const cutter = this.pickBy(this.defenders(def, "C"), (a) => this.defScore(a));
      this.emit(minute, side, "passBlocked", [passer.id, cutter.id]);
      return this.turnover(side, minute);
    }
    const marker = this.pickBy(this.defenders(def, receiver.slot.lane), (a) => this.defScore(a));
    const q = this.receiveQuality(receiver, marker, value) * matchupAdjust(atk.team.tactics, def.team.tactics, "pass");
    this.emit(minute, side, "pass", [passer.id, receiver.id]);
    this.chanceInBox(side, receiver, q, minute, 0);
  }

  /** 受け手の動き出し（判断・スピード）と相手のマークの差でチャンスの質を決める */
  private receiveQuality(receiver: Actor, marker: Actor, value: number): number {
    const edge = ((receiver.e.decision + receiver.e.speed) / 2 - (marker.e.defense + marker.e.decision) / 2) / MATCH.receiverEdgeScale;
    const edgeQ = clamp(0.5 + edge * 0.5, 0, 1);
    return clamp(value * (1 - MATCH.receiverEdgeWeight) + edgeQ * MATCH.receiverEdgeWeight, 0.05, 0.95);
  }

  private dribble(side: Side, carrier: Actor, minute: number, lane: Lane) {
    const def = this.ctx[other(side)];
    const marker = this.pickBy(this.defenders(def, lane), (a) => this.defScore(a));
    const atkV = carrier.e.dribble * 0.6 + carrier.e.speed * 0.4;
    const defV = marker.e.defense * 0.6 + marker.e.speed * 0.4;
    if (this.rng.chance(sigmoid((atkV - defV) / MATCH.dribbleScale))) {
      if (this.duelFoul(side, carrier, marker, minute)) return;
      this.emit(minute, side, "dribble", [carrier.id, marker.id]);
      this.chanceInBox(side, carrier, MATCH.dribbleChanceQ * (0.7 + this.rng.next() * 0.6), minute, 0);
    } else {
      this.emit(minute, side, "dribbleFail", [carrier.id, marker.id]);
      this.turnover(side, minute);
    }
  }

  private sideAttack(side: Side, minute: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const lane: Lane = this.rng.chance(0.5) ? "L" : "R";
    this.currentLane = lane;
    this.recordZone(side, "attacks");
    const wide = atk.actors.filter((a) => a.slot.lane === lane && a.slot.line !== "GK");
    const carrier = wide.length > 0 ? this.pickBy(wide, (a) => a.e.speed + a.e.dribble + (a.slot.line === "DF" ? -20 : 0)) : this.pickBy(this.attackers(atk), (a) => a.e.speed);
    const defWide = def.actors.filter((a) => a.slot.lane === lane && a.slot.line !== "GK" && a.slot.line !== "FW");
    const marker = defWide.length > 0 ? this.pickBy(defWide, (a) => this.defScore(a)) : this.pickBy(this.defenders(def), (a) => this.defScore(a));
    // サイドの 1 対 1
    const atkV = carrier.e.dribble * 0.5 + carrier.e.speed * 0.5;
    const defV = marker.e.defense * 0.6 + marker.e.speed * 0.4;
    if (!this.rng.chance(sigmoid((atkV - defV) / MATCH.dribbleScale + 0.4))) {
      this.emit(minute, side, "dribbleFail", [carrier.id, marker.id]);
      return this.turnover(side, minute);
    }
    if (this.duelFoul(side, carrier, marker, minute)) return;
    if (this.rng.chance(MATCH.crossChance)) return this.cross(side, carrier, minute, 0);
    // カットインして中へ
    const value = this.visionDecision(carrier, this.defQuality(def, "C"));
    if (value === null) {
      this.emit(minute, side, "noOption", [carrier.id]);
      return this.turnover(side, minute);
    }
    const receiver = this.pickBy(this.attackers(atk, "C").filter((a) => a.id !== carrier.id), (a) => this.atkScore(a));
    const cb = this.pickBy(this.defenders(def, "C"), (a) => this.defScore(a));
    this.emit(minute, side, "pass", [carrier.id, receiver.id]);
    this.chanceInBox(side, receiver, this.receiveQuality(receiver, cb, value) * matchupAdjust(atk.team.tactics, def.team.tactics, "pass"), minute, 0);
  }

  /** クロス：GK のハイボール → キャッチング、届かなければ空中戦（7.3） */
  private cross(side: Side, crosser: Actor, minute: number, depth: number, bonus = 0) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const crossQ = clamp((crosser.e.pass * 0.65 + crosser.e.kickPower * 0.35) / MATCH.crossQualityScale + bonus + this.rng.range(-0.15, 0.15), 0, 1.2);
    this.emit(minute, side, "cross", [crosser.id]);
    const gk = def.gk;
    const gkReach = sigmoid((gk.e.highBall + (gk.height - 180) * MATCH.aerialHeightPerCm - crossQ * 100 + MATCH.gkHighBallBias) / MATCH.gkHighBallScale);
    if (this.rng.chance(gkReach)) {
      if (this.rng.chance(sigmoid((gk.e.catching - MATCH.gkCatchCrossBias) / MATCH.gkCatchCrossScale))) {
        this.emit(minute, other(side), "gkClaim", [gk.id]);
        return;
      }
      // ファンブル → こぼれ球
      this.emit(minute, other(side), "fumble", [gk.id]);
      if (this.rng.chance(MATCH.reboundToAttacker)) {
        const s = this.pickBy(this.attackers(atk, "C"), (a) => a.e.speed + a.e.decision);
        this.emit(minute, side, "rebound", [s.id]);
        this.shoot(side, s, MATCH.reboundChanceQ, minute, "rebound", depth + 1);
      }
      return;
    }
    const targets = this.attackers(atk, "C").filter((a) => a.id !== crosser.id);
    const target = this.pickBy(targets.length ? targets : this.attackers(atk), (a) => Math.max(1, this.aerialPower(a)));
    const marker = this.pickBy(this.defenders(def, "C"), (a) => Math.max(1, this.aerialPower(a)));
    const win = sigmoid((this.aerialPower(target) - this.aerialPower(marker)) / MATCH.aerialScale);
    if (this.rng.chance(win)) {
      this.emit(minute, side, "header", [target.id, marker.id]);
      this.shoot(side, target, MATCH.headerChanceQ * (0.7 + crossQ * 0.5), minute, "header", depth);
    } else {
      this.emit(minute, side, "crossCleared", [marker.id]);
      if (depth === 0 && this.rng.chance(MATCH.clearedCornerChance)) this.corner(side, minute, depth + 1);
    }
  }

  /** ロングボール：パス（精度）× キック力（届く距離）（7.3） */
  private longBall(side: Side, minute: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const fromGk = atk.team.tactics.buildUp === "long" && this.rng.chance(0.5);
    const kicker = fromGk ? atk.gk : this.pickBy(this.defenders(atk), (a) => a.e.kickPower + a.e.pass);
    const target = this.pickBy(this.attackers(atk, "C"), (a) => Math.max(1, this.aerialPower(a)));
    const lb = longBallOutcome(this.rng, kicker.e.kickPower, kicker.e.pass);
    if (lb !== "ok") {
      this.emit(minute, side, lb === "short" ? "longBallShort" : "longBallLost", [kicker.id]);
      return this.turnover(side, minute);
    }
    const marker = this.pickBy(this.defenders(def, "C"), (a) => Math.max(1, this.aerialPower(a)));
    this.emit(minute, side, "longBall", [kicker.id, target.id]);
    const deepBonus = def.team.tactics.line === "low" ? MATCH.matchup.longVsLowLineAerial : 0;
    if (this.rng.chance(sigmoid((this.aerialPower(target) - this.aerialPower(marker) - deepBonus) / MATCH.aerialScale))) {
      const base = MATCH.longChanceQ + matchupAdjust(atk.team.tactics, def.team.tactics, "long");
      const q = this.receiveQuality(target, marker, Math.max(0.05, base + this.rng.range(0, 0.3)));
      this.chanceInBox(side, target, q, minute, 0);
    } else {
      this.emit(minute, side, "crossCleared", [marker.id]);
    }
  }

  private setPiece(side: Side, minute: number) {
    const atk = this.ctx[side];
    const kicker = this.pickBy(atk.actors.filter((a) => a.slot.line !== "GK"), (a) => Math.pow(a.e.kickPower + a.e.pass, 2));
    if (this.rng.chance(0.35)) {
      // 直接 FK：キック力の比重が大きい
      this.emit(minute, side, "freeKick", [kicker.id]);
      this.shoot(side, kicker, 0.3, minute, "freeKick", 1);
      return;
    }
    this.emit(minute, side, "setPiece", [kicker.id]);
    this.cross(side, kicker, minute, 1, 0.08);
  }

  private corner(side: Side, minute: number, depth: number) {
    const atk = this.ctx[side];
    atk.team.stats.corners++;
    const kicker = this.pickBy(atk.actors.filter((a) => a.slot.line !== "GK"), (a) => Math.pow(a.e.kickPower + a.e.pass, 2));
    this.emit(minute, side, "corner", [kicker.id]);
    this.cross(side, kicker, minute, depth, 0.05);
  }

  private counterAttack(side: Side, minute: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const runner = this.pickBy(this.attackers(atk), (a) => Math.pow(a.e.speed, 2));
    const defs = this.defenders(def);
    const defSpeed = defs.reduce((s, a) => s + a.e.speed, 0) / defs.length;
    const lineMult = def.team.tactics.line === "high" ? 0.9 : 1.06;
    this.emit(minute, side, "counter", [runner.id]);
    const atkV = runner.e.speed * 0.6 + runner.e.dribble * 0.4;
    if (!this.rng.chance(sigmoid((atkV - defSpeed * lineMult) / MATCH.counterScale))) {
      const stopper = this.pickBy(defs, (a) => a.e.speed + a.e.defense);
      this.emit(minute, side, "dribbleFail", [runner.id, stopper.id]);
      return;
    }
    if (this.duelFoul(side, runner, this.pickBy(defs, (a) => a.e.speed + a.e.defense), minute)) return;
    // 1 対 1：GK の飛び出し（スピード・スタミナ）とフィジカル
    const gk = def.gk;
    this.emit(minute, side, "oneOnOne", [runner.id, gk.id]);
    const gkV = (gk.e.speed + gk.e.stamina + gk.e.physical) / 3;
    const runV = runner.e.dribble * 0.6 + runner.e.technique * 0.4;
    if (this.rng.chance(sigmoid((gkV - runV + MATCH.oneOnOneBias) / MATCH.oneOnOneScale))) {
      this.emit(minute, other(side), "gkRush", [gk.id, runner.id]);
      return;
    }
    this.shoot(side, runner, MATCH.counterChanceQ, minute, "oneOnOne", 0);
  }

  /** ボックス内のチャンス：ファウルで PK になることもある */
  private recordZone(side: Side, kind: "attacks" | "chances") {
    const stats = this.ctx[side].team.stats;
    if (!stats.zones) stats.zones = { attacks: [0, 0, 0], chances: [0, 0, 0] };
    const lane = this.currentLane;
    const i = lane === "L" ? 0 : lane === "C" ? 1 : 2;
    if (kind === "attacks" && lane !== "C") stats.zones.attacks[1]--; // サイド攻撃は中央から付け替える
    stats.zones[kind][i]++;
  }

  chanceInBox(side: Side, shooter: Actor, q: number, minute: number, depth: number) {
    this.recordZone(side, "chances");
    const defT = this.ctx[other(side)].team.tactics;
    q *= MATCH.attackStyleChanceQ[defT.attack] * (defT.press === "high" && defT.line === "low" ? MATCH.pressLineGapChanceQ : 1);
    q *= 1 - underdogLowBlockRanks(this.ctx[other(side)].team, this.ctx[side].team) * MATCH.underdogLowBlock.chanceQPerRank;
    this.bumpMomentum(side, MATCH.momentum.chance);
    if (this.rng.chance(MATCH.pkFoulChance * (0.5 + q))) {
      const def = this.ctx[other(side)];
      const fouler = this.pickBy(this.defenders(def), (a) => 100 - a.e.decision);
      this.emit(minute, side, "pkAwarded", [shooter.id, fouler.id]);
      this.card(def.side, fouler, minute, true);
      this.foulInjury(side, shooter, minute);
      return this.penalty(side, minute);
    }
    if (!this.rng.chance(sigmoid((q - MATCH.shotQBias) / MATCH.shotQScale))) return;
    const middle = this.rng.chance(MATCH.middleShotBase * (1 - q));
    this.shoot(side, shooter, q, minute, middle ? "middle" : "normal", depth);
  }

  /** 試合中の PK（PK 戦と同じ判定） */
  private penalty(side: Side, minute: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const field = atk.actors.filter((a) => a.slot.line !== "GK");
    if (field.length === 0) return;
    const kicker = field.reduce((b, a) => (a.e.pkSkill * 0.5 + a.e.shooting * 0.5 > b.e.pkSkill * 0.5 + b.e.shooting * 0.5 ? a : b), field[0]);
    atk.team.stats.shots++;
    const r = resolvePkKick(this.rng, kicker.e, def.gk.e, pkScoutingTerm(atk.team), pkScoutingTerm(def.team));
    if (r.result === "goal") {
      atk.team.stats.onTarget++;
      this.goal(side, kicker, minute, "pk");
    } else if (r.result === "saved") {
      atk.team.stats.onTarget++;
      this.emit(minute, other(side), "pkSaved", [def.gk.id, kicker.id]);
      this.bumpMomentum(other(side), MATCH.momentum.onTarget * 2);
    } else {
      this.emit(minute, side, "pkMiss", [kicker.id]);
    }
  }

  private goal(side: Side, scorer: Actor, minute: number, note?: string) {
    const s = this.state;
    s.score[side]++;
    s.teams[side].players[scorer.id].goals++;
    const ev: MatchEvent = { minute, side, type: note === "pk" ? "pkGoal" : "goal", players: [scorer.id], score: [s.score[0], s.score[1]] };
    if (note) ev.note = note;
    this.events.push(ev);
    this.bumpMomentum(side, MATCH.momentum.goal);
  }

  /** シュート：シュート × キック力 → GK のポジショニング → セービング → キャッチング（7.3） */
  shoot(side: Side, shooter: Actor, q: number, minute: number, kind: "normal" | "middle" | "header" | "rebound" | "oneOnOne" | "freeKick", depth: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const e = shooter.e;
    let acc: number;
    let power: number;
    switch (kind) {
      case "header":
        acc = e.aerial * 0.8 + e.shooting * 0.2;
        power = (e.physical + e.aerial) * 0.42;
        break;
      case "middle":
      case "freeKick":
        acc = e.shooting * 0.55 + e.kickPower * 0.45;
        power = e.kickPower * 1.05;
        break;
      default:
        acc = e.shooting * 0.75 + e.technique * 0.25;
        power = e.kickPower * 0.7 + e.shooting * 0.3;
    }
    atk.team.stats.shots++;
    this.emit(minute, side, "shot", [shooter.id], kind);
    this.bumpMomentum(side, MATCH.momentum.shot);
    // ブロック
    if (kind !== "header" && kind !== "oneOnOne" && kind !== "freeKick") {
      const defs = this.defenders(def, "C");
      const defAvg = defs.reduce((s, a) => s + this.defScore(a), 0) / defs.length;
      if (this.rng.chance(MATCH.blockBase * (defAvg / 55) * (1 - q * 0.6))) {
        const blocker = this.pickBy(defs, (a) => this.defScore(a));
        this.emit(minute, other(side), "block", [blocker.id, shooter.id]);
        if (depth < 2 && this.rng.chance(0.35)) this.corner(side, minute, depth + 1);
        return;
      }
    }
    const longPenalty = kind === "middle" || kind === "freeKick" ? MATCH.middlePenalty : 0;
    if (!this.rng.chance(sigmoid((acc - MATCH.onTargetBias + q * MATCH.onTargetQ - longPenalty) / MATCH.onTargetScale))) {
      this.emit(minute, side, "miss", [shooter.id]);
      return;
    }
    atk.team.stats.onTarget++;
    this.bumpMomentum(side, MATCH.momentum.onTarget);
    const gk = def.gk;
    const outcome = goalkeeperOutcome(this.rng, { acc, power, q }, gk.e);
    if (outcome === "goal") return this.goal(side, shooter, minute);
    if (outcome === "catch") {
      this.emit(minute, other(side), "catch", [gk.id, shooter.id]);
      return;
    }
    this.emit(minute, other(side), "parry", [gk.id, shooter.id]);
    if (depth >= 2) return;
    if (this.rng.chance(MATCH.parryCornerChance)) return this.corner(side, minute, depth + 1);
    if (this.rng.chance(MATCH.reboundToAttacker)) {
      const s = this.pickBy(this.attackers(atk, "C"), (a) => a.e.speed + a.e.decision);
      this.emit(minute, side, "rebound", [s.id]);
      this.shoot(side, s, MATCH.reboundChanceQ, minute, "rebound", depth + 1);
    }
  }

  /** 区間を計算する */
  run(segMinutes: number) {
    const [c0, c1] = this.ctx;
    const k = MATCH.possessionExponent;
    let p0 = Math.pow(c0.mid, k) / (Math.pow(c0.mid, k) + Math.pow(c1.mid, k));
    const t = MATCH.possessionTactics;
    const adj = (tc: Tactics) => t.attack[tc.attack] + t.press[tc.press] + t.buildUp[tc.buildUp] + t.line[tc.line];
    p0 += adj(c0.team.tactics) - adj(c1.team.tactics);
    const flow0 = matchupFlow(c0.team.tactics, c1.team.tactics);
    const flow1 = matchupFlow(c1.team.tactics, c0.team.tactics);
    p0 += flow0.possession - flow1.possession;
    const flowRate = [flow0.rate, flow1.rate];
    p0 += this.state.momentum * MATCH.momentumPossession;
    p0 -= (c0.short - c1.short) * MATCH.manDown.possession;
    p0 = clamp(p0, MATCH.possessionMin, MATCH.possessionMax);
    const ps = [p0, 1 - p0];
    const lead = this.state.score[0] - this.state.score[1];
    for (const side of [0, 1] as Side[]) {
      const team = this.ctx[side].team;
      team.stats.possessionSum += ps[side];
      team.stats.segments++;
    }
    const scale = segMinutes / MATCH.segmentMinutes;
    const attacks: { side: Side; minute: number; foul?: boolean }[] = [];
    for (const side of [0, 1] as Side[]) {
      const team = this.ctx[side].team;
      const myLead = side === 0 ? lead : -lead;
      const relax = myLead >= 3 ? MATCH.bigLeadRelax : 1;
      const short = Math.pow(MATCH.manDown.attackRate, this.ctx[side].short);
      const lambda = MATCH.attacksPerSegment * scale * ps[side] * MATCH.attackRateTactics[team.tactics.attack] * relax * flowRate[side] * short;
      const n = this.rng.poisson(lambda);
      for (let i = 0; i < n; i++) attacks.push({ side, minute: this.segStart + this.rng.int(0, Math.max(0, segMinutes - 1)) + 1 });
      // 中盤でのファウル（相手がボールを持つ時間が長いほど多い）
      const fl = MATCH.fouls.backgroundPerSegment * scale * MATCH.fouls.pressMult[team.tactics.press] * ps[other(side)] * 2;
      const nf = this.rng.poisson(fl);
      for (let i = 0; i < nf; i++) attacks.push({ side, minute: this.segStart + this.rng.int(0, Math.max(0, segMinutes - 1)) + 1, foul: true });
    }
    attacks.sort((a, b) => a.minute - b.minute);
    for (const a of attacks) {
      if (a.foul) this.backgroundFoul(a.side, a.minute);
      else this.attack(a.side, a.minute);
    }
    this.segmentInjuries(segMinutes);
    return this.momentumDelta;
  }
}

/** PK の読みに足すスカウティングの項（分析担当がいなければ 0。SPEC 10.6） */
export function pkScoutingTerm(team: Pick<MatchTeamState, "scouting">): number {
  return (team.scouting ?? 0) * STAFF_EFFECTS.pkScouting;
}

function drainStamina(state: MatchState, segMinutes: number) {
  const scale = segMinutes / MATCH.segmentMinutes;
  for (const team of state.teams) {
    const pressM = MATCH.drainPress[team.tactics.press] * (1 + playersShort(team) * MATCH.manDown.drain);
    team.onPitch.forEach((id, i) => {
      const p = team.players[id];
      if (!p || isOut(p)) return;
      const gkM = i === 0 ? MATCH.gkDrainMult : 1;
      const drain = MATCH.drainBase * pressM * gkM * (MATCH.drainStamA - (p.stats.stamina / 100) * MATCH.drainStamB) * scale;
      p.stamina = clamp(p.stamina - drain, 0, 100);
    });
  }
}

/**
 * 1 区間（5 分）進める。戻り値はこの区間で発生したイベント。
 * 休憩中・PK 戦・終了後は何もしない。
 */
export function playSegment(state: MatchState): MatchEvent[] {
  if (!isPlayingPhase(state)) return [];
  const before = state.events.length;
  const rng = Rng.fromState(state.rng);
  const len = phaseLength(state);
  const segStart = phaseStartMinute(state) + state.segmentInPhase * MATCH.segmentMinutes;
  const segMinutes = Math.min(MATCH.segmentMinutes, phaseStartMinute(state) + len - segStart);
  state.minute = segStart;
  applyPending(state, 0);
  applyPending(state, 1);
  const sim = new SegmentSim(state, rng, segStart);
  const delta = sim.run(segMinutes);
  state.events.push(...sim.events.sort((a, b) => a.minute - b.minute));
  drainStamina(state, segMinutes);
  state.momentum = clamp(state.momentum * MATCH.momentumDecay + delta, -100, 100);
  state.momentumHistory.push(Math.round(state.momentum));
  state.segmentInPhase++;
  state.minute = segStart + segMinutes;
  state.rng = rng.state();
  if (state.minute >= phaseStartMinute(state) + len) endOfPhase(state);
  // 作戦ノート → CPU（結果のみモードの自校を含む）の采配。どちらも次の区間から反映
  for (const side of [0, 1] as Side[]) if (state.teams[side].note) evaluateNote(state, side);
  for (const side of [0, 1] as Side[]) {
    if (state.teams[side].isUser) continue;
    autoReplaceInjured(state, side);
    decideAi(state, side);
  }
  return state.events.slice(before);
}

/** PK 戦を 1 本進める。戻り値はそのキック（決着済みなら null） */
export function stepPk(state: MatchState) {
  const pk = state.pk;
  if (state.phase !== "PK" || !pk || pk.done) return null;
  for (const side of [0, 1] as Side[]) {
    if (pk.order[side].length === 0) pk.order[side] = autoPkOrder(state.teams[side]);
  }
  const side: Side = pk.kicks.length % 2 === 0 ? 0 : 1;
  const taken = pk.kicks.filter((k) => k.side === side).length;
  const order = pk.order[side];
  const kickerId = order[taken % order.length];
  const defTeam = state.teams[other(side)];
  const rng = Rng.fromState(state.rng);
  const kickerActor = buildActors(state.teams[side]).find((a) => a.id === kickerId)!;
  const defActors = buildActors(defTeam);
  const gkActor = defActors.find((a) => a.slot.pos === "GK") ?? defActors[0];
  const gkId = gkActor.id;
  const r = resolvePkKick(rng, kickerActor.e, gkActor.e, pkScoutingTerm(state.teams[side]), pkScoutingTerm(defTeam));
  state.rng = rng.state();
  const kick = { side, kickerId, gkId, scored: r.scored, kickerWonRead: r.kickerWonRead, result: r.result };
  pk.kicks.push(kick);
  if (r.scored) pk.score[side]++;
  const winner = pkDecided(pk);
  if (winner !== null) {
    pk.done = true;
    pk.winner = winner;
    state.winner = winner;
    state.phase = "END";
    state.events.push({ minute: state.minute, side: winner, type: "fullTime", score: [...state.score] as [number, number], note: `pk:${pk.score[0]}-${pk.score[1]}` });
  }
  return kick;
}

/** 表示なしで最後まで計算する（CPU 同士の試合・バランス検証用） */
export function simulateToEnd(state: MatchState): MatchState {
  let guard = 0;
  while (state.phase !== "END" && guard++ < 1000) {
    if (isBreakPhase(state)) resumeFromBreak(state);
    else if (state.phase === "PK") stepPk(state);
    else playSegment(state);
  }
  return state;
}

/** 試合の勝者の学校 ID（引き分けは null） */
export function winnerSchoolId(state: MatchState): string | null {
  if (state.winner === undefined || state.winner === null) return null;
  return state.teams[state.winner].schoolId;
}
