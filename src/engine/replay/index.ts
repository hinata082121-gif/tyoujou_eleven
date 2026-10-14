/**
 * 演出タイムライン（SPEC 10.4。P3）：試合のイベントの並びから、時刻ごとのボールと選手の位置を作る。
 * 表示（簡易2D・P4 の3D）はこれを再生するだけ。試合の結果には関わらず、乱数も使わない。
 *
 * 座標：x はピッチの左 0 → 右 1、y は上 0 → 下 1。side 0 は上（y = 0）へ攻め、side 1 は下へ攻める。
 */
import { FORMATIONS, type Lane, type Slot } from "../config/formations";
import { REPLAY } from "../config/replay";
import { effectiveMovement } from "../match/lanes";
import type { MatchEvent, MatchEventType, MatchState, MatchTeamState, Side } from "../match/types";

export interface Pt {
  x: number;
  y: number;
}

/** タイムラインの 1 コマ（イベント 1 つ） */
export interface ReplayKey {
  /** 試合時間（分。小数） */
  t: number;
  /** 元のイベントの番号（MatchState.events の添字） */
  index: number;
  type: MatchEventType;
  side: Side;
  /** その時点のボールの位置 */
  ball: Pt;
  /** 関係する選手（ボールの持ち主・相手）。この時刻にボールの近くにいる */
  actors: string[];
  /** ボールが浮いて飛ぶ（クロス・ロングボール。2D では点線） */
  air?: boolean;
}

export interface ReplayTimeline {
  keys: ReplayKey[];
}

export interface ReplayDot {
  id: string;
  side: Side;
  /** 丸に書く番号（並びの枠の番号 + 1。GK は 1） */
  num: number;
  x: number;
  y: number;
  gk: boolean;
}

export interface ReplayFrame {
  ball: Pt;
  dots: ReplayDot[];
  /** 浮いたボールの軌跡（出たところ → 着くところ） */
  flight?: { from: Pt; to: Pt };
  /** 直前のイベント */
  last?: ReplayKey;
}

const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v));
const flipLane = (l: Lane): Lane => (l === "L" ? "R" : l === "R" ? "L" : "C");
export const AIR: Partial<Record<MatchEventType, true>> = { cross: true, longBall: true, longBallShort: true, longBallLost: true, switchPlay: true, corner: true, freeKick: true, longThrow: true };

/** 決まった散らばり（イベントの番号から作る。乱数は使わない） */
function jitter(i: number, k: number): number {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/** そのチームから見た奥行き（0 = 自陣ゴール）とレーンを、絶対の座標にする */
export function toPitch(side: Side, depth: number, x: number): Pt {
  return side === 0 ? { x, y: 1 - depth } : { x: 1 - x, y: depth };
}

/** あるチームにとってのボールの奥行き（0 = 自陣ゴール） */
const depthFor = (side: Side, p: Pt) => (side === 0 ? 1 - p.y : p.y);

function ballOf(e: MatchEvent, i: number, prev: Pt): Pt {
  if (e.type === "goal" || e.type === "pkGoal") return toPitch(e.side, 1.0, 0.5 + jitter(i, 1) * 0.05);
  if (e.type === "miss") return toPitch(e.side, 1.0, 0.5 + jitter(i, 2) * 0.25);
  if (!e.zone) return prev;
  const lane = e.lane ?? "C";
  const x = REPLAY.laneX[lane] + jitter(i, 3) * REPLAY.jitter.x;
  const d = REPLAY.zoneDepth[e.zone] + jitter(i, 4) * REPLAY.jitter.y;
  return toPitch(e.side, d, clamp01(x));
}

/** 試合のイベントから演出タイムラインを作る（何度呼んでも同じものができる） */
export function buildTimeline(ms: MatchState): ReplayTimeline {
  const keys: ReplayKey[] = [];
  let ball: Pt = { x: 0.5, y: 0.5 };
  // 同じ分のイベントは、その分の終わりに向けて詰めて並べる（テキストの速報と同じ時刻に最後のイベントが来る）
  const byMinute = new Map<number, number[]>();
  ms.events.forEach((e, i) => {
    const list = byMinute.get(e.minute) ?? [];
    list.push(i);
    byMinute.set(e.minute, list);
  });
  ms.events.forEach((e, i) => {
    const list = byMinute.get(e.minute)!;
    const k = list.length;
    const pos = list.indexOf(i);
    const gap = Math.min(REPLAY.maxEventGap, 0.85 / k);
    const t = e.minute - (k - 1 - pos) * gap;
    if (e.type === "kickoff" || e.type === "secondHalf" || e.type === "extraTime" || e.type === "extraSecondHalf") ball = { x: 0.5, y: 0.5 };
    else ball = ballOf(e, i, ball);
    keys.push({ t, index: i, type: e.type, side: e.side, ball, actors: e.players ?? [], air: AIR[e.type] });
  });
  return { keys };
}

/** 時刻 t の並び（記録した並びのうち、t までの最後のもの） */
export function shapeAt(team: MatchTeamState, t: number) {
  const shapes = team.shapes ?? [{ minute: 0, formation: team.formation, onPitch: team.onPitch }];
  let s = shapes[0];
  for (const x of shapes) if (x.minute <= t) s = x;
  return s;
}

/** 列の中での横の位置（左から順に均等に並べる） */
function baseX(slots: Slot[], index: number): number {
  const line = slots[index].line;
  const order = { L: 0, C: 1, R: 2 };
  const same = slots.map((s, i) => ({ s, i })).filter((x) => x.s.line === line);
  same.sort((a, b) => order[a.s.lane] - order[b.s.lane] || a.i - b.i);
  const n = same.length;
  const pos = same.findIndex((x) => x.i === index);
  return n === 1 ? 0.5 : 0.12 + (0.76 * pos) / (n - 1);
}

const ease = (u: number) => u * u * (3 - 2 * u);

/** 時刻 t の 1 コマ（ボールと選手の位置） */
export function frameAt(ms: MatchState, tl: ReplayTimeline, t: number): ReplayFrame {
  const keys = tl.keys;
  // t より前の最後のコマ k と、次のコマ k + 1
  let lo = 0;
  let hi = keys.length - 1;
  let k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) {
      k = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const a = k >= 0 ? keys[k] : undefined;
  const b = keys[k + 1];
  const start: Pt = a?.ball ?? { x: 0.5, y: 0.5 };
  let ball = start;
  let flight: ReplayFrame["flight"];
  /** ボールの近くに寄せる選手と、その強さ */
  const pull = new Map<string, { to: Pt; w: number }>();
  const addPull = (ids: string[], to: Pt, w: number) => {
    ids.forEach((id, j) => {
      const off = j === 0 ? 0 : REPLAY.partnerOffset;
      const p = { x: clamp01(to.x + off), y: clamp01(to.y + (j === 0 ? 0 : off)) };
      const cur = pull.get(id);
      if (!cur || cur.w < w) pull.set(id, { to: p, w });
    });
  };
  let idleHolder: { side: Side; t: number } | undefined;
  if (a && b) {
    const span = b.t - a.t;
    const travel = Math.min(span, b.air ? 0.3 : 0.2);
    const idleEnd = b.t - travel;
    if (t < idleEnd && span > REPLAY.idlePassMinutes) {
      // イベントのない時間：次に攻める側が、後ろでボールを回す
      idleHolder = { side: b.side, t };
      addPull(a.actors, a.ball, Math.max(0, 1 - (t - a.t) / 0.4));
    } else {
      const u = ease(Math.max(0, Math.min(1, (t - Math.max(a.t, idleEnd)) / Math.max(0.01, b.t - Math.max(a.t, idleEnd)))));
      const from = span > REPLAY.idlePassMinutes ? undefined : a.ball;
      const origin = from ?? start;
      ball = { x: origin.x + (b.ball.x - origin.x) * u, y: origin.y + (b.ball.y - origin.y) * u };
      if (b.air) flight = { from: origin, to: b.ball };
      addPull(a.actors, a.ball, 1 - u);
      addPull(b.actors, b.ball, u);
    }
  } else if (a) addPull(a.actors, a.ball, 1);

  // 退場した選手は、そのイベントの後は消す
  const sentOff = new Set(ms.events.filter((e) => (e.type === "red" || e.type === "secondYellow") && e.minute <= t).map((e) => e.players![0]));
  const dots: ReplayDot[] = [];
  const bases: Record<string, Pt> = {};
  for (const side of [0, 1] as Side[]) {
    const team = ms.teams[side];
    const shape = shapeAt(team, t);
    const slots = FORMATIONS[shape.formation];
    const ballDepth = depthFor(side, idleHolder ? { x: 0.5, y: 0.5 } : ball);
    shape.onPitch.forEach((id, i) => {
      if (sentOff.has(id) || !slots[i]) return;
      const slot = slots[i];
      const mp = team.players[id];
      const gk = slot.line === "GK";
      const shift = (ballDepth - 0.5) * REPLAY.teamShift * (gk ? 0.2 : 1);
      const depth = REPLAY.lineDepth[slot.line] + shift + (side === idleHolder?.side ? 0.04 : 0);
      const mob = gk ? 0.15 : REPLAY.movementPull[effectiveMovement(mp?.playStyle, slot)];
      // チームから見た横の位置 → ボールの側へ寄る
      const ballX = side === 0 ? ball.x : 1 - ball.x;
      const x = baseX(slots, i) + (ballX - 0.5) * REPLAY.ballPull * mob;
      const base = toPitch(side, depth, clamp01(x));
      bases[id] = base;
      const p = pull.get(id);
      const pos = p ? { x: base.x + (p.to.x - base.x) * p.w, y: base.y + (p.to.y - base.y) * p.w } : base;
      dots.push({ id, side, num: i + 1, x: pos.x, y: pos.y, gk });
    });
  }
  if (idleHolder) {
    // 後ろの選手（GK 以外の DF・MF）の間でボールを回す
    const side = idleHolder.side;
    const backs = dots.filter((d) => d.side === side && !d.gk && depthFor(side, d) < 0.5);
    if (backs.length > 0) {
      const step = t / REPLAY.idlePassMinutes;
      const n = Math.floor(step);
      const from = backs[Math.abs(Math.floor(jitter(n, 9) * 1000)) % backs.length];
      const to = backs[Math.abs(Math.floor(jitter(n + 1, 9) * 1000)) % backs.length];
      const u = ease(Math.min(1, (step - n) / 0.5));
      ball = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u };
    }
  }
  return { ball, dots, flight, last: a };
}

/** 自校から見た左右（イベントのレーンを、ピッチの左右にする。テスト・表示用） */
export function screenLane(e: Pick<MatchEvent, "side" | "lane">): Lane | undefined {
  if (!e.lane) return undefined;
  return e.side === 0 ? e.lane : flipLane(e.lane);
}
