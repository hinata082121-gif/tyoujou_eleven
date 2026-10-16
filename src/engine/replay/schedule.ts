/**
 * 時刻の割り付け（R3。計画 1.2）：試合のイベントに、表示上の時刻（分の小数）を割り付ける。
 * 速報に出るイベントは、その分の中（m − 1 より後、m まで）に入れ、前のイベントからボールが動く時間をできるだけあける。
 * 区間（5 分）ごとに、その区間までのイベントだけで決める（観戦中は次の区間がまだ計算されていないため）。
 * 試合の結果には関わらず、乱数も使わない。
 */
import { MOVE } from "../config/replay";
import type { MatchEvent, MatchEventType, MatchState } from "../match/types";
import { ballSpot, AIR, type Pt } from ".";

const { length: PL, width: PW } = MOVE.pitch;
/** 等速の換算：現実の m/秒 → m/試合の分 */
export const mps = (v: number) => v * MOVE.secondsPerMinute;

/** 前半・後半・延長の始め（そこで両チームがキックオフの並びに戻る） */
export const PHASE_START = new Set<MatchEventType>(["kickoff", "secondHalf", "extraTime", "extraSecondHalf"]);
/** ボールの動きに関わらないイベント（時刻はその分のまま） */
export const NO_BALL = new Set<MatchEventType>(["sub", "tactics", "formation", "position", "note", "shortHanded", "injury", "halfTime", "fullTime", "pkShootout"]);
/** セットプレー（ボールを置いて、蹴る人を待つ） */
export const SET_PIECES = new Set<MatchEventType>(["corner", "freeKick", "setPiece", "longThrow"]);

/** 区間の番号：区間 k は (5k, 5k + 5]。前半・後半などの始めの合図は、その分から始まる区間 */
export function eventSegment(e: Pick<MatchEvent, "minute" | "type">): number {
  if (PHASE_START.has(e.type)) return Math.floor(e.minute / 5 + 1e-9);
  return e.minute <= 0 ? 0 : Math.ceil(e.minute / 5 - 1e-9) - 1;
}

/** 時刻 t の区間（(5k, 5k + 5] → k。0 は 0） */
export const segmentOfTime = (t: number) => (t <= 0 ? 0 : Math.ceil(t / 5 - 1e-9) - 1);

/** 動きのキー（ボールが関わるイベント 1 つ） */
export interface SimKey {
  /** 元のイベントの番号 */
  index: number;
  type: MatchEventType;
  side: MatchEvent["side"];
  minute: number;
  seg: number;
  /** 表示上の時刻（分） */
  t: number;
  /** ボールが来る場所（m。動きの中で、選手が間に合う所へ寄せることがある） */
  ball: Pt;
  /** 割り付けたときの場所（動きの中では変えない。時刻の割り付けはこれだけを使う。観戦しながら作っても同じ時刻になるように） */
  readonly at: Pt;
  actors: string[];
  air?: boolean;
  /** 前半・後半などの始めの合図 */
  start?: boolean;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 前のキー a から b までに要る時間の目安（分） */
function gapBetween(a: SimKey, b: SimKey): number {
  const G = MOVE.gap;
  if (a.start) return G.afterPhaseStart;
  const d = dist(a.at, b.at);
  let g = G.base + d / mps(G.travel);
  // 同じ選手が運ぶ（カウンター・ドリブル）
  if (a.actors[0] && a.actors[0] === b.actors[0]) g = Math.max(g, 0.08 + d / mps(G.carry));
  if (a.type === "goal" || a.type === "pkGoal") g += G.afterGoal;
  if (a.type === "miss" || a.type === "pkMiss" || a.type === "pkSaved") g += G.afterMiss;
  if (SET_PIECES.has(b.type)) g += G.beforeSetPiece;
  if (a.type === "foul" || a.type === "yellow" || a.type === "red" || a.type === "secondYellow") g += G.afterFoul;
  return g;
}

/**
 * イベントの時刻の表（区間ごとに足していく）。sync を呼ぶと、計算が済んだ区間の分だけ進む。
 * 何度・どこで区切って呼んでも、同じ試合なら同じ時刻になる
 */
export class EventSchedule {
  /** ボールの動きのキー（時刻の順） */
  readonly keys: SimKey[] = [];
  /** イベントの番号 → 表示上の時刻 */
  readonly times: number[] = [];
  /** 割り付けが済んだ最後の区間 */
  prepared = -1;
  private lastBall: Pt = { x: PW / 2, y: PL / 2 };

  constructor(private ms: MatchState) {}

  /** 計算が済んだ区間を取り込む。新しいキーがあれば true */
  sync(): boolean {
    const ms = this.ms;
    const done = Math.floor(ms.minute / 5 + 1e-9) - 1;
    let changed = false;
    // 割り付け済みの区間に後から足されたイベント（試合の終わり・PK 戦の結果など）は、その分の時刻
    for (let i = this.times.length; i < ms.events.length; i++) {
      const e = ms.events[i];
      if (eventSegment(e) <= this.prepared || NO_BALL.has(e.type)) this.times[i] = e.minute;
      else break;
    }
    while (this.prepared < done) {
      const k = this.prepared + 1;
      this.prepareSegment(k);
      this.prepared = k;
      changed = true;
    }
    return changed;
  }

  /** 表示上の時刻（まだ割り付けていなければ undefined） */
  timeOf(index: number): number | undefined {
    return this.times[index];
  }

  private prepareSegment(k: number) {
    const ms = this.ms;
    const fresh: SimKey[] = [];
    for (let i = 0; i < ms.events.length; i++) {
      if (this.times[i] !== undefined) continue;
      const e = ms.events[i];
      const seg = eventSegment(e);
      if (seg > k) continue;
      if (NO_BALL.has(e.type) || seg < k) {
        this.times[i] = e.minute;
        continue;
      }
      const start = PHASE_START.has(e.type);
      const ball = start ? { x: PW / 2, y: PL / 2 } : ballSpot(e, i, this.lastBall);
      this.lastBall = ball;
      fresh.push({ index: i, type: e.type, side: e.side, minute: e.minute, seg, t: e.minute, ball: { ...ball }, at: { ...ball }, actors: e.players ?? [], air: AIR[e.type], start: start || undefined });
    }
    // 分ごとにまとめて、窓 (m − 1 + lead, m − tail] の中に置く。前のイベントからの間隔をできるだけ守り、
    // 入りきらなければ、その分の中の間隔を縮めて窓いっぱいに並べる
    let prev = this.keys.at(-1);
    let i = 0;
    while (i < fresh.length) {
      const key = fresh[i];
      if (key.start) {
        key.t = key.minute;
        this.times[key.index] = key.t;
        this.keys.push(key);
        prev = key;
        i++;
        continue;
      }
      let j = i;
      while (j < fresh.length && !fresh[j].start && fresh[j].minute === key.minute) j++;
      const group = fresh.slice(i, j);
      const m = key.minute;
      // 区間の始めの分は、前の区間の終わりからボールが動く時間を少しあける
      const segLead = m - 1 <= k * 5 + 1e-9 ? MOVE.window.segmentLead : MOVE.window.lead;
      const hi = m - MOVE.window.tail;
      const lo = Math.min(hi, Math.max(m - 1 + segLead, prev ? prev.t + 0.01 : -Infinity));
      const gaps = group.map((g, n) => (n === 0 ? (prev ? gapBetween(prev, g) : 0) : gapBetween(group[n - 1], g)));
      const inner = gaps.slice(1).reduce((a, b) => a + b, 0);
      let start = Math.max(lo, prev ? prev.t + gaps[0] : lo);
      let scale = 1;
      if (start + inner > hi) {
        start = Math.max(lo, hi - inner);
        if (start + inner > hi) scale = inner > 0 ? (hi - start) / inner : 1;
      }
      let t = start;
      group.forEach((g, n) => {
        if (n > 0) t += gaps[n] * scale;
        g.t = Math.min(hi, t);
        this.times[g.index] = g.t;
        this.keys.push(g);
      });
      prev = group[group.length - 1];
      i = j;
    }
  }
}
