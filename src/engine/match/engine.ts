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
import { CAPTAIN } from "../config/captain";
import { PERSONALITY_MATCH } from "../config/personality";
import { LANE_THRESHOLDS } from "../config/playStyle";
import { SKILL_DEFS, SKILL_EFFECTS, type GoldPlay } from "../config/skills";
import {
  ALL_STATS,
  type DribbleMove,
  type LaneAffinity,
  type MatchKind,
  type MatchRules,
  type Player,
  type SchoolRank,
  type SkillId,
  type SkillLine,
  type Stats,
  type Tactics,
  type TeamSetup,
} from "../types";
import { effectiveMovement, laneAffinity, laneIndex } from "./lanes";
import {
  actorTraits,
  captainEffect,
  linePoints,
  NEUTRAL_ENV,
  pickMult,
  playerTraitMult,
  goldPresence,
  singlePoints,
  staminaDrainMult,
  styleBonus,
  teamTraitMult,
  type ActorEnv,
  type ActorTraits,
  type CaptainEffect,
} from "./traits";
import { decideAi } from "./ai";
import { assignToSlots } from "./lineup";
import { evaluateNote } from "./note";
import { fatigueFactor } from "./fatigue";
export { fatigueFactor };
import { activeIds, isOut, pendingOf } from "./orders";
import { autoPkOrder, pkDecided, resolvePkKick } from "./pk";
export { cancelSubstitution, queueFormation, queueSubstitution, queueTactics, subsRemaining, activeIds, isOut } from "./orders";
import { emptyMatchPlayerStats, type InjurySeverity, type MatchEvent, type MatchEventType, type MatchPlayer, type MatchPlayerStats, type MatchState, type MatchTeamState, type NoteMatchState, type Side } from "./types";

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
  /** キャプテン（P2b） */
  captainId?: string;
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
    personality: p.personality,
    playStyle: p.playStyle,
    styleProficiency: p.styleProficiency,
    skills: [...p.skills],
    foot: p.foot,
    minutes: 0,
    ms: emptyMatchPlayerStats(),
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
    ...(input.captainId && players[input.captainId] ? { captainId: input.captainId } : {}),
    stats: { shots: 0, onTarget: 0, possessionSum: 0, segments: 0, corners: 0, zones: { attacks: [0, 0, 0], chances: [0, 0, 0] } },
  };
}

/** スタッフの値を持たないチーム（バランス検証など）の AI の質。Phase 1 の CPU の采配と同じ動きになる値 */
export const DEFAULT_AI_QUALITY = MATCH.ai.baseQuality;

/** bigStage：全国大会・県予選の決勝（大舞台系・慎重派の効果） */
export function createMatch(rules: MatchRules, seed: Rng, home: TeamInput, away: TeamInput, kind?: MatchKind, bigStage = false): MatchState {
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
  if (bigStage) state.bigStage = true;
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
  /** レーンへの関わりやすさ（動きの範囲。P2b） */
  lanes: LaneAffinity;
  /** スタイル・特殊能力・性格の補正（P2b） */
  t: ActorTraits;
  /** 金色の存在感が効くプレーと、そのプレーでの実効能力（金色がなければ e と同じ） */
  gp: ReadonlySet<GoldPlay>;
  g: Stats;
  mp: MatchPlayer;
}

const NO_GOLD_PLAYS: ReadonlySet<GoldPlay> = new Set();

/** そのプレーでの実効能力（関係する金色を持っていれば存在感の分だけ上がる） */
const st = (a: Actor, play: GoldPlay): Stats => (a.gp.has(play) ? a.g : a.e);

/** 区間の頭の状況（実効能力の倍率の条件） */
export function actorEnv(state: MatchState, side: Side): ActorEnv {
  const me = state.teams[side];
  const opp = state.teams[other(side)];
  return {
    late: state.minute >= state.rules.halfMinutes * 1.5,
    behind: state.score[side] < state.score[other(side)],
    underdog: rankIndex(opp.rank) > rankIndex(me.rank),
    bigStage: !!state.bigStage,
  };
}

function buildActors(team: MatchTeamState, env: ActorEnv = NEUTRAL_ENV): Actor[] {
  const slots = FORMATIONS[team.formation];
  const cap = captainEffect(team);
  const tm = teamTraitMult(cap, env);
  const actors: Actor[] = [];
  team.onPitch.forEach((id, i) => {
    const p = team.players[id];
    if (!p || isOut(p)) return;
    const slot = slots[i];
    const apt = MATCH.aptitudeMult[p.aptitude[slot.pos]];
    // 疲労は能力差の圧縮の後に掛ける（疲れの影響を圧縮で薄めない）
    const fat = fatigueFactor(p.stamina);
    // 性格・大舞台系・逆境系・キャプテンの倍率は、調子と同じく圧縮の前に掛ける
    const m = apt * (CONDITION_MULT[p.condition] ?? 1) * team.form * tm * playerTraitMult(p, env);
    const toEff = (mult: number) => {
      const e = {} as Stats;
      for (const k of ALL_STATS) e[k] = (MATCH.skillPivot + (p.stats[k] * mult - MATCH.skillPivot) * MATCH.skillCompression) * fat;
      if (cap?.personality === "calm" && env.late) e.decision += CAPTAIN.calmLateDecision * cap.share;
      return e;
    };
    const e = toEff(m);
    // 金色の存在感：関係するプレーで使う実効能力を別に持つ
    const gold = goldPresence(p);
    const g = gold ? toEff(m * gold.mult) : e;
    const t = actorTraits(p, slot, cap?.id === id && cap.personality === "inspired");
    const foot = t.skills.has("footG") ? "both" : (p.foot ?? "R");
    actors.push({ id, slot, e, height: p.heightCm, lanes: laneAffinity(slot.lane, effectiveMovement(p.playStyle, slot), foot), t, gp: gold?.plays ?? NO_GOLD_PLAYS, g, mp: p });
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
  /** キャプテンの試合中の効果 */
  cap: CaptainEffect | null;
}

/** 今の攻撃のアシストの候補（得点したら記録する） */
interface AssistCand {
  id: string;
  kind: "pass" | "cross" | "corner" | "feed" | "setPiece";
}

type ShotKind = "normal" | "middle" | "header" | "rebound" | "oneOnOne" | "freeKick";

const isAttackerSlot = (a: Actor) => a.slot.line === "FW" || a.slot.pos === "OMF" || a.slot.pos === "WG" || (a.slot.line === "MF" && a.slot.pos !== "DMF");

class SegmentSim {
  readonly ctx: [TeamCtx, TeamCtx];
  readonly events: MatchEvent[] = [];
  private momentumDelta = 0;
  /** 今の攻撃のレーン（ゾーン別の集計用） */
  private currentLane: Lane = "C";
  private assist: AssistCand | undefined;
  /** 今の攻撃がサイドから生まれた（カーブシュート用） */
  private fromSide = false;
  /** 今の攻撃がセットプレー（職人気質用） */
  private setPieceKick = false;
  /** 試合の残りが少なく点差 1 以内（ひらめき型） */
  private readonly clutch: boolean;

  constructor(
    private state: MatchState,
    private rng: Rng,
    private segStart: number,
  ) {
    this.ctx = [this.makeCtx(0), this.makeCtx(1)];
    this.clutch = totalMinutes(state) - segStart <= PERSONALITY_MATCH.inspiredLateMinutes && Math.abs(state.score[0] - state.score[1]) <= 1;
  }

  private makeCtx(side: Side): TeamCtx {
    const team = this.state.teams[side];
    const actors = buildActors(team, actorEnv(this.state, side));
    const gk = actors.find((a) => a.slot.pos === "GK") ?? actors[0];
    let mid = 0;
    for (const a of actors) mid += weightedStats(a.e, MATCH.midWeights) * MATCH.midLineWeights[a.slot.line];
    return { side, team, actors, gk, mid, short: playersShort(team), cap: captainEffect(team) };
  }

  // ---- 特殊能力・スタイルの補正（P2b）----

  /** 特殊能力の効果の倍率（ひらめき型は終盤の接戦で上がる） */
  private scale(a: Actor): number {
    return this.clutch && a.t.personality === "inspired" ? PERSONALITY_MATCH.inspiredClutchSkillMult : 1;
  }

  private line(a: Actor, l: SkillLine): number {
    return linePoints(a.t, l, this.scale(a));
  }

  private single(a: Actor, id: SkillId, points?: number): number {
    return singlePoints(a.t, id, this.scale(a), points);
  }

  /** 効いた（プラスの）特殊能力の ID（速報用） */
  private lineSkill(a: Actor, l: SkillLine): SkillId | undefined {
    const id = a.t.lines[l];
    return id && SKILL_DEFS[id].tier !== "minus" ? id : undefined;
  }

  /** そのレーンへの関わりやすさで選ばれやすさを下げる（絞り込まずに選ぶ場面） */
  private laneW(a: Actor, lane: Lane): number {
    return Math.min(1, a.lanes[lane] / LANE_THRESHOLDS.pickScale);
  }

  private touch(a: Actor, lane: Lane) {
    if (a.mp.ms) a.mp.ms.laneTouches[laneIndex(lane)]++;
  }

  private ms(a: Actor): MatchPlayerStats | undefined {
    return a.mp.ms;
  }

  /** 逆足で蹴る場面の減点（両利きは 0、逆足× は大きい） */
  private weakFoot(a: Actor): number {
    if (a.t.skills.has("footG") || !this.rng.chance(SKILL_EFFECTS.weakFootChance)) return 0;
    return a.t.skills.has("footX") ? SKILL_EFFECTS.weakFootPenaltyMinus : SKILL_EFFECTS.weakFootPenalty;
  }

  /** 職人気質のキッカーと、職人気質のキャプテンの補正（セットプレー） */
  private setPieceBonus(side: Side, a: Actor): number {
    const cap = this.ctx[side].cap;
    return (a.t.personality === "craftsman" ? PERSONALITY_MATCH.craftsmanSetPiece : 0) + (cap?.personality === "craftsman" ? CAPTAIN.craftsmanSetPiece * cap.share : 0);
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
    const cm = fouler.t.cardMult;
    if (this.rng.chance((inBox ? f.redInBox : f.red) * cm)) return this.sendOff(defSide, fouler.id, minute, "red");
    const booked = (mp.yellow ?? 0) > 0;
    if (!this.rng.chance((inBox ? f.yellowInBox : f.yellow) * (booked ? f.bookedYellowMult : 1) * cm)) return;
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
    if (this.rng.chance(MATCH.injury.onFoul * (this.ctx[victimSide].team.injuryMult ?? 1) * victim.t.injuryMult)) this.injure(victimSide, victim.id, minute);
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
    const p = f.duelFoul * f.pressMult[def.team.tactics.press] * decisionMult * (this.isBooked(defSide, marker.id) ? f.bookedFoulMult : 1) * marker.t.foulMult;
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
    const fouler = this.pickBy(field, (a) => (120 - a.e.decision) * (this.isBooked(defSide, a.id) ? MATCH.fouls.bookedFoulMult : 1) * a.t.foulMult);
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
        const p = MATCH.injury.perSegment * scale * (1 + MATCH.injury.fatigue * (1 - st / 100)) * (team.injuryMult ?? 1) * a.t.injuryMult;
        if (this.rng.chance(p)) this.injure(side, a.id, this.segStart + this.rng.int(0, Math.max(0, segMinutes - 1)) + 1);
      }
    }
  }

  private emit(minute: number, side: Side, type: MatchEventType, players?: string[], note?: string, extra?: Pick<MatchEvent, "skill" | "move" | "assist">) {
    const ev: MatchEvent = { minute, side, type };
    if (players) ev.players = players;
    if (note) ev.note = note;
    if (extra?.skill) ev.skill = extra.skill;
    if (extra?.move) ev.move = extra.move;
    if (extra?.assist) ev.assist = extra.assist;
    this.events.push(ev);
  }

  private bumpMomentum(side: Side, amount: number) {
    // 慎重派のキャプテン：失点した後しばらく、相手に流れが行く量を減らす
    const opp = this.ctx[other(side)];
    if (opp.cap && opp.team.momentumGuardUntil !== undefined && this.segStart < opp.team.momentumGuardUntil) {
      amount *= 1 - (1 - CAPTAIN.cautiousMomentum) * opp.cap.share;
    }
    this.momentumDelta += side === 0 ? amount : -amount;
  }

  // ---- 補助 ----
  private pickBy(actors: Actor[], weight: (a: Actor) => number): Actor {
    return this.rng.weighted(actors, (a) => Math.max(0.01, weight(a)));
  }

  private defScore(a: Actor) {
    return weightedStats(st(a, "defense"), MATCH.defWeights);
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
      // 動きの範囲：そのレーンへの関わりやすさで重みを決める（自由なら P2a までの重みとほぼ同じ）
      const laneW = a.lanes[lane] * pickMult(a.t, "defenseWeight");
      const lineW = a.slot.line === "DF" ? 1 : 0.6;
      const shadow = a.lanes[lane] >= LANE_THRESHOLDS.primary ? this.single(a, "coverShadow", SKILL_EFFECTS.coverShadowDef) : 0;
      sum += (this.defScore(a) + styleBonus(a.t, "defense") + shadow) * laneW * lineW;
      w += laneW * lineW;
    }
    const base = w > 0 ? sum / w : 30;
    const t = def.team.tactics;
    const gap = t.press === "high" && t.line === "low" ? MATCH.pressLineGapDefense : 0;
    const underdog = underdogLowBlockRanks(def.team, this.ctx[other(def.side)].team) * MATCH.underdogLowBlock.defensePerRank;
    const short = def.short * MATCH.manDown.defense;
    return base + MATCH.pressDefenseBonus[t.press] + MATCH.lineDefenseBonus[t.line] + MATCH.attackStyleDefense[t.attack] + gap + underdog - short;
  }

  /** 攻撃に加わる選手（レーンを指定すると、そのレーンに関わる選手だけ） */
  private attackers(atk: TeamCtx, lane?: Lane): Actor[] {
    const list = atk.actors.filter(isAttackerSlot);
    const inLane = lane ? list.filter((a) => a.lanes[lane] >= LANE_THRESHOLDS.include) : list;
    return inLane.length > 0 ? inLane : atk.actors.filter((a) => a.slot.line !== "GK");
  }

  /** 中央攻撃の出し手（MF。リンクマン・ビルドアップ型などは MF 以外でも加わる） */
  private centralPassers(atk: TeamCtx): Actor[] {
    const mids = atk.actors.filter((a) => a.slot.line === "MF" && a.lanes.C >= LANE_THRESHOLDS.primary);
    const join = atk.actors.filter((a) => a.slot.line !== "MF" && a.slot.line !== "GK" && a.t.joinCentralPass > 0);
    const list = [...mids, ...join];
    return list.length > 0 ? list : atk.actors.filter((a) => a.slot.line !== "GK");
  }

  private defenders(def: TeamCtx, lane?: Lane): Actor[] {
    const list = def.actors.filter((a) => a.slot.line === "DF" && (!lane || a.lanes[lane] >= LANE_THRESHOLDS.primary));
    if (list.length > 0) return list;
    const any = def.actors.filter((a) => a.slot.line === "DF" || a.slot.pos === "DMF");
    return any.length > 0 ? any : def.actors.filter((a) => a.slot.line !== "GK");
  }

  private aerialPower(a: Actor, s: Stats = a.e) {
    return s.aerial + (a.height - 175) * MATCH.aerialHeightPerCm;
  }

  /** 攻撃側の空中戦（スタイル・ヘディング系・セットプレーの職人気質） */
  private aerialAtk(side: Side, a: Actor) {
    return this.aerialPower(a, st(a, "shoot")) + styleBonus(a.t, "aerialAtk") + this.line(a, "heading") + (this.setPieceKick ? this.setPieceBonus(side, a) : 0);
  }

  /** 守備側の空中戦 */
  private aerialDef(a: Actor) {
    return this.aerialPower(a, st(a, "defense")) + styleBonus(a.t, "aerialDef") + this.line(a, "aerialDef");
  }

  /** 1 対 1 の守備の値への足し算（スタイル・対人系・スライディングタックル） */
  private duelDefBonus(a: Actor) {
    return styleBonus(a.t, "duelDef") + styleBonus(a.t, "steal") + this.line(a, "duel") + this.single(a, "slidingTackle", SKILL_EFFECTS.slidingTackleDef);
  }

  /** 1 対 1 の守備で効いた特殊能力 */
  private duelSkill(a: Actor): SkillId | undefined {
    return this.lineSkill(a, "duel") ?? (a.t.skills.has("slidingTackle") ? "slidingTackle" : undefined);
  }

  // ---- 攻撃 ----

  /** 攻撃 1 回 */
  attack(side: Side, minute: number, counter = false) {
    this.currentLane = "C";
    this.assist = undefined;
    this.fromSide = false;
    this.setPieceKick = false;
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    // ビルドアップ重視：相手のプレスに引っかかると自陣ゴール前で奪われる（7.3）
    if (!counter && atk.team.tactics.buildUp === "buildUp") {
      const pressMult = MATCH.buildUpPressMult[def.team.tactics.press];
      if (pressMult > 0) {
        const gs = st(atk.gk, "gk");
        const gkBuild = (gs.pass + gs.technique) / 2 + styleBonus(atk.gk.t, "gkBuild") + this.line(atk.gk, "feed");
        const pressers = this.attackers(def);
        const pressQ = pressers.reduce((s, a) => s + (a.e.speed + a.e.stamina + a.e.decision) / 3, 0) / pressers.length;
        const cut = atk.actors.reduce((m, a) => m * (1 - a.t.buildUpErrorCut), 1);
        const p = MATCH.buildUpErrorBase * pressMult * 2 * sigmoid((pressQ - gkBuild) / MATCH.buildUpErrorScale) * cut;
        if (this.rng.chance(p)) {
          const thief = this.pickBy(pressers, (a) => a.e.speed + a.e.decision);
          const ms = this.ms(thief);
          if (ms) ms.steals++;
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

  /** パスの候補の価値（視野・判断。スタイルの視野・チャンスメイカーを足す） */
  private passValue(passer: Actor, defQ: number): number | null {
    const cm = passer.t.skills.has("chanceMaker");
    const ps = st(passer, "pass");
    const vision = ps.vision + styleBonus(passer.t, "vision") + (cm ? MATCH.visionPerCandidate : 0);
    const v = bestPassValue(this.rng, vision, ps.decision, defQ);
    if (v === null) return null;
    return cm ? Math.min(1, v + SKILL_EFFECTS.chanceMakerValue * this.scale(passer)) : v;
  }

  visionDecision(passer: Actor, defQ: number): number | null {
    return this.passValue(passer, defQ);
  }

  /** ボールを失った（winner は奪った選手。奪ってカウンターにつなぐ率に効く） */
  private turnover(lostSide: Side, minute: number, winner?: Actor) {
    const lostCtx = this.ctx[lostSide];
    const lost = lostCtx.team;
    const countererCtx = this.ctx[other(lostSide)];
    const counterer = countererCtx.team;
    if (winner) {
      const ms = this.ms(winner);
      if (ms) ms.steals++;
    }
    const exposure = lostCtx.actors.reduce((m, a) => m * (1 + a.t.counterExposure), 1);
    const feed = countererCtx.gk.t.skills.has("feedG") ? SKILL_EFFECTS.feedGoldCounterMult : 1;
    const p =
      MATCH.counterChance *
      (lost.tactics.line === "high" ? MATCH.counterLineHighMult : 1) *
      MATCH.attackStyleCounterExposure[lost.tactics.attack] *
      MATCH.attackStyleCounterAttack[counterer.tactics.attack] *
      (1 + underdogLowBlockRanks(counterer, lost) * MATCH.underdogLowBlock.counterPerRank) *
      (winner ? pickMult(winner.t, "stealer") : 1) *
      exposure *
      feed;
    if (this.rng.chance(p)) this.attack(other(lostSide), minute, true);
  }

  private centerAttack(side: Side, minute: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const passer = this.pickBy(
      this.centralPassers(atk),
      (a) => (a.e.pass + a.e.vision) * pickMult(a.t, "centralPasser") * (a.slot.line === "MF" ? 1 : a.t.joinCentralPass),
    );
    this.touch(passer, "C");
    const defQ = this.defQuality(def, "C");
    let value = this.passValue(passer, defQ);
    if (value === null) {
      // 出せるパスがない → ドリブルで打開を試みる（プレスを受けている：ルーレットの場面）
      if (this.rng.chance((passer.e.dribble / MATCH.dribbleTryDiv) * pickMult(passer.t, "centralDribble"))) return this.dribble(side, passer, minute, "C", "roulette");
      this.emit(minute, side, "noOption", [passer.id]);
      return this.turnover(side, minute);
    }
    // スルーパス：相手のラインが高いとき、裏へのパスになる
    const through = def.team.tactics.line === "high" && passer.t.skills.has("throughPass");
    if (through) value = Math.max(value, SKILL_EFFECTS.throughPassValueMin);
    const cutters = this.defenders(def, "C");
    const intercept = cutters.reduce((m, a) => Math.max(m, this.single(a, "interception")), 0);
    const passAcc =
      st(passer, "pass").pass +
      styleBonus(passer.t, "pass") +
      (passer.t.personality === "cautious" ? PERSONALITY_MATCH.cautiousPass : 0) +
      (through ? this.single(passer, "throughPass") : 0) -
      intercept;
    const pAcc = sigmoid((passAcc - MATCH.passAccBias - value * MATCH.passAccValue) / MATCH.passAccScale);
    const receivers = this.receivers(atk, passer);
    if (receivers.length === 0) {
      this.emit(minute, side, "noOption", [passer.id]);
      return this.turnover(side, minute);
    }
    const receiver = this.pickBy(receivers, (a) => this.atkScore(a) * this.laneW(a, "C") * this.receiverMult(a));
    if (!this.rng.chance(pAcc)) {
      const cutter = this.pickBy(cutters, (a) => this.defScore(a) * (a.t.skills.has("interception") ? SKILL_EFFECTS.interceptionPickMult : 1));
      this.touch(cutter, "C");
      this.emit(minute, side, "passBlocked", [passer.id, cutter.id], undefined, { skill: cutter.t.skills.has("interception") ? "interception" : undefined });
      return this.turnover(side, minute, cutter);
    }
    const marker = this.pickBy(this.defenders(def, receiver.slot.lane), (a) => this.defScore(a) * pickMult(a.t, "marker"));
    const q = this.receiveQuality(receiver, marker, value) * matchupAdjust(atk.team.tactics, def.team.tactics, "pass");
    this.touch(receiver, "C");
    if (through) this.emit(minute, side, "throughBall", [passer.id, receiver.id], undefined, { skill: "throughPass" });
    else this.emit(minute, side, "pass", [passer.id, receiver.id], undefined, { skill: passer.t.skills.has("chanceMaker") && value > 0.8 ? "chanceMaker" : undefined });
    this.assist = { id: passer.id, kind: "pass" };
    this.chanceInBox(side, receiver, q, minute, 0);
  }

  /** パスの受け手の候補（出し手を除く。いなければフィールド選手から） */
  private receivers(atk: TeamCtx, passer: Actor, lane?: Lane): Actor[] {
    const list = this.attackers(atk, lane).filter((a) => a.id !== passer.id);
    return list.length > 0 ? list : atk.actors.filter((a) => a.slot.line !== "GK" && a.id !== passer.id);
  }

  /** 受け手に選ばれやすさ（シューターのスタイル・消える動き） */
  private receiverMult(a: Actor) {
    return pickMult(a.t, "boxShooter") * pickMult(a.t, "receiver") * (a.t.skills.has("offBall") ? SKILL_EFFECTS.offBallPickMult : 1);
  }

  /** 受け手の動き出し（判断・スピード）と相手のマークの差でチャンスの質を決める */
  private receiveQuality(receiver: Actor, marker: Actor, value: number): number {
    const atkV = (receiver.e.decision + receiver.e.speed) / 2 + this.single(receiver, "offBall");
    const md = st(marker, "defense");
    const defV = (md.defense + md.decision) / 2 + this.single(marker, "manMark");
    const edge = (atkV - defV) / MATCH.receiverEdgeScale;
    const edgeQ = clamp(0.5 + edge * 0.5, 0, 1);
    return clamp(value * (1 - MATCH.receiverEdgeWeight) + edgeQ * MATCH.receiverEdgeWeight, 0.05, 0.95);
  }

  /**
   * ドリブルの場面（PLAN 4.1）：プレスを受けている → ルーレット、相手が飛び込んでくる（プレスが高い・ボールハンター・偶然）→ ダブルタッチ、
   * それ以外は呼び出し側の場面（裏街道・チョップタッチ・シザース）
   */
  private dribbleMove(base: DribbleMove, def: TeamCtx, marker: Actor): DribbleMove {
    if (base === "roulette") return base;
    if (def.team.tactics.press === "high" || marker.mp.playStyle === "ballHunter" || this.rng.chance(SKILL_EFFECTS.doubleTouchRandom)) return "doubleTouch";
    return base;
  }

  private movePoints(a: Actor, move: DribbleMove): number {
    return this.single(a, move, SKILL_EFFECTS.dribbleMove);
  }

  private dribble(side: Side, carrier: Actor, minute: number, lane: Lane, base: DribbleMove) {
    const def = this.ctx[other(side)];
    const marker = this.pickBy(this.defenders(def, lane), (a) => this.defScore(a) * pickMult(a.t, "marker"));
    this.touch(marker, lane);
    const move = this.dribbleMove(base, def, marker);
    const mv = this.movePoints(carrier, move);
    const atkV = st(carrier, "dribble").dribble * 0.6 + st(carrier, "dribble").speed * 0.4 + styleBonus(carrier.t, "dribble") + mv;
    const defV = st(marker, "defense").defense * 0.6 + st(marker, "defense").speed * 0.4 + this.duelDefBonus(marker);
    if (this.rng.chance(sigmoid((atkV - defV) / MATCH.dribbleScale))) {
      if (this.duelFoul(side, carrier, marker, minute)) return;
      this.emit(minute, side, "dribble", [carrier.id, marker.id], undefined, { move, skill: mv > 0 ? move : undefined });
      this.chanceInBox(side, carrier, MATCH.dribbleChanceQ * (0.7 + this.rng.next() * 0.6), minute, 0);
    } else {
      const ms = this.ms(marker);
      if (ms) ms.duelWins++;
      this.emit(minute, side, "dribbleFail", [carrier.id, marker.id], undefined, { move, skill: this.duelSkill(marker) });
      this.turnover(side, minute, marker);
    }
  }

  /** サイド攻撃。switchBonus はサイドチェンジから受けたときの 1 対 1 の補正 */
  private sideAttack(side: Side, minute: number, forcedLane?: Lane, switchBonus = 0) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const lane: Lane = forcedLane ?? (this.rng.chance(0.5) ? "L" : "R");
    this.currentLane = lane;
    this.recordZone(side, "attacks");
    this.fromSide = true;
    const wide = atk.actors.filter((a) => a.lanes[lane] >= LANE_THRESHOLDS.primary && a.slot.line !== "GK");
    const carrier =
      wide.length > 0
        ? this.pickBy(wide, (a) => (a.e.speed + a.e.dribble + (a.slot.line === "DF" && !a.t.fullbackCarry ? -20 : 0)) * pickMult(a.t, "sideCarrier"))
        : this.pickBy(this.attackers(atk), (a) => a.e.speed);
    this.touch(carrier, lane);
    const defWide = def.actors.filter((a) => a.lanes[lane] >= LANE_THRESHOLDS.primary && a.slot.line !== "GK" && a.slot.line !== "FW");
    const markW = (a: Actor) => this.defScore(a) * pickMult(a.t, "marker");
    const marker = defWide.length > 0 ? this.pickBy(defWide, markW) : this.pickBy(this.defenders(def), markW);
    this.touch(marker, lane);
    // クロスかカットインかを先に決める（カットインはチョップタッチの場面）
    const wantsCross = carrier.t.noCutInside || this.rng.chance(Math.min(0.95, MATCH.crossChance * pickMult(carrier.t, "crossChoice")));
    const base: DribbleMove = !wantsCross ? "chopTouch" : def.team.tactics.line === "high" ? "uraKaido" : "scissors";
    const move = this.dribbleMove(base, def, marker);
    const mv = this.movePoints(carrier, move);
    // サイドの 1 対 1
    const footSide = carrier.t.skills.has("footG") ? SKILL_EFFECTS.footGoldSide * this.scale(carrier) : 0;
    const atkV = st(carrier, "dribble").dribble * 0.5 + st(carrier, "dribble").speed * 0.5 + styleBonus(carrier.t, "dribble") + mv + switchBonus + (wantsCross ? 0 : footSide);
    const defV = st(marker, "defense").defense * 0.6 + st(marker, "defense").speed * 0.4 + this.duelDefBonus(marker);
    if (!this.rng.chance(sigmoid((atkV - defV) / MATCH.dribbleScale + 0.4))) {
      const ms = this.ms(marker);
      if (ms) ms.duelWins++;
      this.emit(minute, side, "dribbleFail", [carrier.id, marker.id], undefined, { move, skill: this.duelSkill(marker) });
      // ロングスロー：外に出たボールを、ゴール前へのクロスにする
      const throwers = atk.actors.filter((a) => a.slot.line !== "GK" && a.t.skills.has("longThrow"));
      if (throwers.length > 0 && this.rng.chance(SKILL_EFFECTS.longThrowChance)) {
        const thrower = this.pickBy(throwers, (a) => a.e.kickPower + a.e.physical);
        this.emit(minute, side, "longThrow", [thrower.id], undefined, { skill: "longThrow" });
        this.setPieceKick = true;
        return this.cross(side, thrower, minute, 1, SKILL_EFFECTS.longThrowQ, "setPiece");
      }
      return this.turnover(side, minute, marker);
    }
    if (this.duelFoul(side, carrier, marker, minute)) return;
    const dribbleSkill = mv > 0 ? move : undefined;
    if (wantsCross) {
      if (dribbleSkill) this.emit(minute, side, "dribble", [carrier.id, marker.id], undefined, { move, skill: dribbleSkill });
      return this.cross(side, carrier, minute, 0, 0, "cross");
    }
    // カットインして中へ
    if (dribbleSkill || footSide > 0) this.emit(minute, side, "dribble", [carrier.id, marker.id], undefined, { move, skill: dribbleSkill ?? "footG" });
    const value = this.passValue(carrier, this.defQuality(def, "C"));
    if (value === null) {
      this.emit(minute, side, "noOption", [carrier.id]);
      return this.turnover(side, minute);
    }
    const receivers = this.receivers(atk, carrier, "C");
    if (receivers.length === 0) {
      this.emit(minute, side, "noOption", [carrier.id]);
      return this.turnover(side, minute);
    }
    const receiver = this.pickBy(receivers, (a) => this.atkScore(a) * this.receiverMult(a));
    this.touch(receiver, "C");
    const cb = this.pickBy(this.defenders(def, "C"), (a) => this.defScore(a) * pickMult(a.t, "marker"));
    this.emit(minute, side, "pass", [carrier.id, receiver.id]);
    this.assist = { id: carrier.id, kind: "pass" };
    this.chanceInBox(side, receiver, this.receiveQuality(receiver, cb, value) * matchupAdjust(atk.team.tactics, def.team.tactics, "pass"), minute, 0);
  }

  /** クロス：GK のハイボール → キャッチング、届かなければ空中戦（7.3） */
  private cross(side: Side, crosser: Actor, minute: number, depth: number, bonus = 0, kind: "cross" | "corner" | "setPiece" = "cross") {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const sc = this.scale(crosser);
    let extra = styleBonus(crosser.t, "crossQ") - this.weakFoot(crosser) / 100;
    let skill: SkillId | undefined;
    if (kind === "cross" && crosser.t.skills.has("crossMaster")) {
      extra += SKILL_EFFECTS.crossMasterQ * sc;
      skill = "crossMaster";
    }
    if (kind === "corner" && crosser.t.skills.has("ckMaster")) {
      extra += SKILL_EFFECTS.ckMasterQ * sc;
      skill = "ckMaster";
    }
    if (kind === "cross" && crosser.t.skills.has("footG")) extra += (SKILL_EFFECTS.footGoldSide * sc) / 100;
    if (kind !== "cross") extra += this.setPieceBonus(side, crosser) / 100;
    const cs = st(crosser, kind === "setPiece" ? "setPiece" : "pass");
    const crossQ = clamp((cs.pass * 0.65 + cs.kickPower * 0.35) / MATCH.crossQualityScale + bonus + extra + this.rng.range(-0.15, 0.15), 0, 1.2);
    this.emit(minute, side, "cross", [crosser.id], undefined, { skill });
    const gk = def.gk;
    const gs = st(gk, "gk");
    const gkReach = sigmoid((gs.highBall + styleBonus(gk.t, "gkHighBall") + (gk.height - 180) * MATCH.aerialHeightPerCm - crossQ * 100 + MATCH.gkHighBallBias) / MATCH.gkHighBallScale);
    if (this.rng.chance(gkReach)) {
      if (this.rng.chance(sigmoid((gs.catching - MATCH.gkCatchCrossBias) / MATCH.gkCatchCrossScale))) {
        this.emit(minute, other(side), "gkClaim", [gk.id]);
        return;
      }
      // ファンブル → こぼれ球
      this.emit(minute, other(side), "fumble", [gk.id]);
      if (this.rng.chance(MATCH.reboundToAttacker)) {
        const s = this.pickBy(this.attackers(atk, "C"), (a) => a.e.speed + a.e.decision);
        this.emit(minute, side, "rebound", [s.id]);
        this.assist = undefined;
        this.shoot(side, s, MATCH.reboundChanceQ, minute, "rebound", depth + 1);
      }
      return;
    }
    const targets = this.attackers(atk, "C").filter((a) => a.id !== crosser.id);
    const target = this.pickBy(targets.length ? targets : this.attackers(atk), (a) => Math.max(1, this.aerialPower(a)) * pickMult(a.t, "aerialTarget"));
    const marker = this.pickBy(this.defenders(def, "C"), (a) => Math.max(1, this.aerialPower(a)) * pickMult(a.t, "aerialMarker"));
    this.touch(target, "C");
    this.touch(marker, "C");
    const win = sigmoid((this.aerialAtk(side, target) - this.aerialDef(marker)) / MATCH.aerialScale);
    if (this.rng.chance(win)) {
      this.emit(minute, side, "header", [target.id, marker.id], undefined, { skill: this.lineSkill(target, "heading") });
      this.assist = { id: crosser.id, kind: kind === "corner" ? "corner" : kind === "cross" ? "cross" : "setPiece" };
      const masterQ = skill === "crossMaster" ? SKILL_EFFECTS.crossMasterHeaderMult : 1;
      this.shoot(side, target, MATCH.headerChanceQ * (0.7 + crossQ * 0.5) * masterQ, minute, "header", depth);
    } else {
      const ms = this.ms(marker);
      if (ms) ms.aerialWins++;
      this.emit(minute, side, "crossCleared", [marker.id], undefined, { skill: this.lineSkill(marker, "aerialDef") });
      if (depth === 0 && this.rng.chance(MATCH.clearedCornerChance)) this.corner(side, minute, depth + 1);
    }
  }

  /** ロングボール：パス（精度）× キック力（届く距離）（7.3） */
  private longBall(side: Side, minute: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const fromGk = atk.team.tactics.buildUp === "long" && this.rng.chance(0.5);
    const kicker = fromGk ? atk.gk : this.pickBy(this.defenders(atk), (a) => (a.e.kickPower + a.e.pass) * pickMult(a.t, "longKicker"));
    // サイドチェンジ：逆サイドの大外へ大きく展開し、そのサイドの 1 対 1 を有利にする
    if (!fromGk && kicker.t.skills.has("switchPlay") && this.rng.chance(SKILL_EFFECTS.switchPlayChance)) {
      const lane: Lane = this.rng.chance(0.5) ? "L" : "R";
      this.emit(minute, side, "switchPlay", [kicker.id], undefined, { skill: "switchPlay" });
      return this.sideAttack(side, minute, lane, this.single(kicker, "switchPlay"));
    }
    const target = this.pickBy(this.attackers(atk, "C"), (a) => Math.max(1, this.aerialPower(a)) * pickMult(a.t, "longTarget"));
    const feed = fromGk ? this.line(kicker, "feed") : 0;
    const lp = styleBonus(kicker.t, "longPass") + feed;
    const ks = st(kicker, fromGk ? "gk" : "pass");
    const lb = longBallOutcome(this.rng, ks.kickPower + lp, ks.pass + lp);
    if (lb !== "ok") {
      this.emit(minute, side, lb === "short" ? "longBallShort" : "longBallLost", [kicker.id]);
      return this.turnover(side, minute);
    }
    const marker = this.pickBy(this.defenders(def, "C"), (a) => Math.max(1, this.aerialPower(a)) * pickMult(a.t, "aerialMarker"));
    this.touch(target, "C");
    this.touch(marker, "C");
    this.emit(minute, side, "longBall", [kicker.id, target.id], undefined, { skill: fromGk ? this.lineSkill(kicker, "feed") : undefined });
    const deepBonus = def.team.tactics.line === "low" ? MATCH.matchup.longVsLowLineAerial : 0;
    if (this.rng.chance(sigmoid((this.aerialAtk(side, target) - this.aerialDef(marker) - deepBonus) / MATCH.aerialScale))) {
      const base = MATCH.longChanceQ + matchupAdjust(atk.team.tactics, def.team.tactics, "long");
      const q = this.receiveQuality(target, marker, Math.max(0.05, base + this.rng.range(0, 0.3)));
      this.assist = { id: kicker.id, kind: fromGk ? "feed" : "pass" };
      this.chanceInBox(side, target, q, minute, 0);
    } else {
      const ms = this.ms(marker);
      if (ms) ms.aerialWins++;
      this.emit(minute, side, "crossCleared", [marker.id], undefined, { skill: this.lineSkill(marker, "aerialDef") });
    }
  }

  private setPiece(side: Side, minute: number) {
    const atk = this.ctx[side];
    const field = atk.actors.filter((a) => a.slot.line !== "GK");
    this.setPieceKick = true;
    if (this.rng.chance(0.35)) {
      // 直接 FK：キック力の比重が大きい。FK の名手は選ばれやすい
      const kicker = this.pickBy(field, (a) => Math.pow(a.e.kickPower + a.e.pass, 2) * (a.t.skills.has("fkMaster") ? SKILL_EFFECTS.setPieceKickerMult : 1));
      this.emit(minute, side, "freeKick", [kicker.id]);
      this.assist = undefined;
      this.shoot(side, kicker, 0.3, minute, "freeKick", 1);
      return;
    }
    const kicker = this.pickBy(field, (a) => Math.pow(a.e.kickPower + a.e.pass, 2));
    this.emit(minute, side, "setPiece", [kicker.id]);
    this.cross(side, kicker, minute, 1, 0.08, "setPiece");
  }

  private corner(side: Side, minute: number, depth: number) {
    const atk = this.ctx[side];
    atk.team.stats.corners++;
    this.setPieceKick = true;
    const kicker = this.pickBy(
      atk.actors.filter((a) => a.slot.line !== "GK"),
      (a) => Math.pow(a.e.kickPower + a.e.pass, 2) * (a.t.skills.has("ckMaster") ? SKILL_EFFECTS.setPieceKickerMult : 1),
    );
    this.emit(minute, side, "corner", [kicker.id]);
    this.cross(side, kicker, minute, depth, 0.05, "corner");
  }

  private counterAttack(side: Side, minute: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    // 走る先のレーン（大外のみ・定位置の選手は自分のレーンのカウンターにだけ加わる）
    const lane = this.rng.weighted(["L", "C", "R"] as Lane[], (l) => (l === "C" ? 0.4 : 0.3));
    const runner = this.pickBy(this.attackers(atk), (a) => Math.pow(a.e.speed, 2) * this.laneW(a, lane) * pickMult(a.t, "counterRunner"));
    this.touch(runner, lane);
    const defs = this.defenders(def);
    const defSpeed = defs.reduce((s, a) => s + a.e.speed + styleBonus(a.t, "coverSpeed") + this.single(a, "spaceCover"), 0) / defs.length;
    const lineMult = def.team.tactics.line === "high" ? 0.9 : 1.06;
    const move: DribbleMove = "uraKaido";
    const mv = this.movePoints(runner, move);
    this.emit(minute, side, "counter", [runner.id], undefined, { move, skill: mv > 0 ? move : undefined });
    const atkV = runner.e.speed * 0.6 + runner.e.dribble * 0.4 + styleBonus(runner.t, "runSpeed") + mv;
    const stopW = (a: Actor) => (a.e.speed + a.e.defense) * pickMult(a.t, "counterStopper");
    if (!this.rng.chance(sigmoid((atkV - defSpeed * lineMult) / MATCH.counterScale))) {
      const stopper = this.pickBy(defs, stopW);
      const ms = this.ms(stopper);
      if (ms) ms.steals++;
      this.emit(minute, side, "dribbleFail", [runner.id, stopper.id], undefined, { skill: stopper.t.skills.has("spaceCover") ? "spaceCover" : undefined });
      return;
    }
    if (this.duelFoul(side, runner, this.pickBy(defs, stopW), minute)) return;
    // 1 対 1：GK の飛び出し（スピード・スタミナ）とフィジカル
    const gk = def.gk;
    this.emit(minute, side, "oneOnOne", [runner.id, gk.id]);
    const gs = st(gk, "gk");
    const gkV = (gs.speed + gs.stamina + gs.physical) / 3 + styleBonus(gk.t, "gkRush") + this.line(gk, "gkOneOnOne") + this.single(gk, "gkRush");
    const rs = st(runner, "shoot");
    const runV = rs.dribble * 0.6 + rs.technique * 0.4 + this.line(runner, "oneOnOne");
    if (this.rng.chance(sigmoid((gkV - runV + MATCH.oneOnOneBias) / MATCH.oneOnOneScale))) {
      const ms = this.ms(gk);
      if (ms) ms.gkOneOnOneStops++;
      this.emit(minute, other(side), "gkRush", [gk.id, runner.id], undefined, { skill: this.lineSkill(gk, "gkOneOnOne") ?? (gk.t.skills.has("gkRush") ? "gkRush" : undefined) });
      return;
    }
    const gold = runner.t.lines.oneOnOne === "oneOnOneG" ? SKILL_EFFECTS.oneOnOneGoldQ : 0;
    this.assist = undefined;
    this.shoot(side, runner, MATCH.counterChanceQ + gold, minute, "oneOnOne", 0);
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
      const fouler = this.pickBy(this.defenders(def), (a) => (100 - a.e.decision) * a.t.foulMult);
      this.emit(minute, side, "pkAwarded", [shooter.id, fouler.id]);
      this.card(def.side, fouler, minute, true);
      this.foulInjury(side, shooter, minute);
      return this.penalty(side, minute);
    }
    if (!this.rng.chance(sigmoid((q - MATCH.shotQBias) / MATCH.shotQScale))) return;
    const middle = this.rng.chance(MATCH.middleShotBase * (1 - q) * (shooter.t.skills.has("middleShot") ? SKILL_EFFECTS.middleShotChooseMult : 1));
    this.shoot(side, shooter, q, minute, middle ? "middle" : "normal", depth);
  }

  /** PK の読みに足す値（PK 系・冷静沈着。GK は PK ストッパー） */
  private pkKickerRead(a: Actor) {
    return this.line(a, "pk") * SKILL_EFFECTS.pkReadMult + (a.t.personality === "calm" ? PERSONALITY_MATCH.calmPkRead : 0);
  }

  private pkGkRead(a: Actor) {
    return this.single(a, "pkStopper", SKILL_EFFECTS.pkStopperRead) + (a.t.personality === "calm" ? PERSONALITY_MATCH.calmPkRead : 0);
  }

  /** 試合中の PK（PK 戦と同じ判定） */
  private penalty(side: Side, minute: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const field = atk.actors.filter((a) => a.slot.line !== "GK");
    if (field.length === 0) return;
    const kicker = field.reduce((b, a) => (a.e.pkSkill * 0.5 + a.e.shooting * 0.5 > b.e.pkSkill * 0.5 + b.e.shooting * 0.5 ? a : b), field[0]);
    atk.team.stats.shots++;
    const r = resolvePkKick(this.rng, st(kicker, "setPiece"), st(def.gk, "gk"), pkScoutingTerm(atk.team) + this.pkKickerRead(kicker), pkScoutingTerm(def.team) + this.pkGkRead(def.gk));
    this.ms(kicker)?.pkKicks.push(r.scored);
    this.assist = undefined;
    if (r.result === "goal") {
      atk.team.stats.onTarget++;
      this.goal(side, kicker, minute, "pk", this.lineSkill(kicker, "pk"));
    } else if (r.result === "saved") {
      atk.team.stats.onTarget++;
      this.emit(minute, other(side), "pkSaved", [def.gk.id, kicker.id], undefined, { skill: def.gk.t.skills.has("pkStopper") ? "pkStopper" : undefined });
      this.bumpMomentum(other(side), MATCH.momentum.onTarget * 2);
    } else {
      this.emit(minute, side, "pkMiss", [kicker.id]);
    }
  }

  private goal(side: Side, scorer: Actor, minute: number, note?: string, skill?: SkillId) {
    const s = this.state;
    s.score[side]++;
    s.teams[side].players[scorer.id].goals++;
    const ev: MatchEvent = { minute, side, type: note === "pk" ? "pkGoal" : "goal", players: [scorer.id], score: [s.score[0], s.score[1]] };
    if (note) ev.note = note;
    if (skill) ev.skill = skill;
    // 試合での成果（P2b）
    const ms = this.ms(scorer);
    if (ms && note === "oneOnOne") ms.oneOnOneGoals++;
    if (ms && note === "header") ms.headerGoals++;
    if (ms && note === "freeKick") ms.fkGoals++;
    const a = this.assist;
    if (a && a.id !== scorer.id && s.teams[side].players[a.id]) {
      ev.assist = a.id;
      const ams = s.teams[side].players[a.id].ms;
      if (ams) {
        ams.assists++;
        if (a.kind === "corner") ams.cornerAssists++;
        if (a.kind === "cross") ams.crossAssists++;
        if (a.kind === "feed") ams.feedAssists++;
      }
    }
    this.events.push(ev);
    this.bumpMomentum(side, MATCH.momentum.goal);
    // 慎重派のキャプテン：失点した後しばらく、相手に流れが行く量を減らす
    const conceded = this.ctx[other(side)];
    if (conceded.cap?.personality === "cautious") conceded.team.momentumGuardUntil = this.segStart + MATCH.segmentMinutes * (CAPTAIN.cautiousSegments + 1);
  }

  /** シュート：シュート × キック力 → GK のポジショニング → セービング → キャッチング（7.3） */
  shoot(side: Side, shooter: Actor, q: number, minute: number, kind: ShotKind, depth: number) {
    const atk = this.ctx[side];
    const def = this.ctx[other(side)];
    const e = st(shooter, kind === "freeKick" ? "setPiece" : "shoot");
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
    // スタイル・特殊能力・性格の補正（P2b）
    let skill: SkillId | undefined;
    acc += styleBonus(shooter.t, "shotAccuracy");
    if (kind === "normal" || kind === "rebound" || kind === "oneOnOne") acc += styleBonus(shooter.t, "finishing");
    if (kind === "header") {
      acc += this.line(shooter, "heading") + (this.setPieceKick ? this.setPieceBonus(side, shooter) : 0);
      skill = this.lineSkill(shooter, "heading");
    } else {
      acc -= this.weakFoot(shooter);
    }
    if (kind === "oneOnOne") {
      acc += this.line(shooter, "oneOnOne");
      skill = this.lineSkill(shooter, "oneOnOne");
    }
    if (kind === "middle" && shooter.t.skills.has("middleShot")) {
      acc += this.single(shooter, "middleShot");
      skill = "middleShot";
    }
    if (kind === "freeKick") {
      acc += this.setPieceBonus(side, shooter);
      if (shooter.t.skills.has("fkMaster")) {
        acc += this.single(shooter, "fkMaster", SKILL_EFFECTS.fkMasterAcc);
        skill = "fkMaster";
      }
    }
    if (kind === "normal" && this.fromSide && shooter.t.skills.has("curveShot")) {
      acc += this.single(shooter, "curveShot");
      skill = "curveShot";
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
    const gs = st(gk, "gk");
    const gkStats = { positioning: gs.positioning, saving: gs.saving + styleBonus(gk.t, "gkSave"), catching: gs.catching };
    const outcome = goalkeeperOutcome(this.rng, { acc, power, q }, gkStats);
    if (outcome === "goal") return this.goal(side, shooter, minute, kind === "normal" ? undefined : kind, skill);
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
      this.assist = undefined;
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

/** PK 戦の読みに足す値（PK 系・冷静沈着。区間の外なので、ひらめき型の終盤の補正は無し） */
function pkKickerRead(a: Actor) {
  return linePoints(a.t, "pk") * SKILL_EFFECTS.pkReadMult + (a.t.personality === "calm" ? PERSONALITY_MATCH.calmPkRead : 0);
}

function pkGkRead(a: Actor) {
  return singlePoints(a.t, "pkStopper", 1, SKILL_EFFECTS.pkStopperRead) + (a.t.personality === "calm" ? PERSONALITY_MATCH.calmPkRead : 0);
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
      const slot = FORMATIONS[team.formation][i] ?? { pos: p.mainPosition };
      const drain = MATCH.drainBase * pressM * gkM * (MATCH.drainStamA - (p.stats.stamina / 100) * MATCH.drainStamB) * scale * staminaDrainMult(p, slot);
      p.stamina = clamp(p.stamina - drain, 0, 100);
      if (p.minutes !== undefined) p.minutes += segMinutes;
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
  const kickerActor = buildActors(state.teams[side], actorEnv(state, side)).find((a) => a.id === kickerId)!;
  const defActors = buildActors(defTeam, actorEnv(state, other(side)));
  const gkActor = defActors.find((a) => a.slot.pos === "GK") ?? defActors[0];
  const gkId = gkActor.id;
  const r = resolvePkKick(rng, kickerActor.e, gkActor.e, pkScoutingTerm(state.teams[side]) + pkKickerRead(kickerActor), pkScoutingTerm(defTeam) + pkGkRead(gkActor));
  state.rng = rng.state();
  // PK 系の成果（連続成功・PK 戦で止めた本数）
  kickerActor.mp.ms?.pkKicks.push(r.scored);
  if (r.result === "saved" && gkActor.mp.ms) gkActor.mp.ms.pkShootoutSaves++;
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
