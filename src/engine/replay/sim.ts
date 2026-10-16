/**
 * 選手とボールが常に動く演出（R3。SPEC 19章・計画 1 章）。
 *
 * 1. 時刻の割り付け（schedule.ts）で、ボールが関わるイベント（キー）に表示上の時刻を決める。
 * 2. ボールの道筋：キーとキーのあいだを、表示だけのつなぎのプレー（パス・ドリブル・止まるプレー）で埋める。
 *    つなぎのプレーは記録せず、速報にも出さない。キーの時刻には、ボールがその場所に、キーの選手がボールのそばにいる。
 * 3. 選手：0.025 分（等速で 0.1 秒）ごとに、全員を「行きたい場所」へ、速さと加速の上限つきで動かす。
 *    行きたい場所は、陣形・戦術・スタイル・守備（マーク・プレス）・切り替え・セットプレー・約束（次のキーに間に合う）で決まる。
 *    味方どうしは必ず決めた間隔より離れる（2D の丸が重ならない）。
 *
 * 区間（5 分）ごとに、その区間までのイベントだけを使って進める。乱数は試合の乱数を使わず、
 * 試合と区間の番号から作る演出専用のもの。だから、観戦しながら少しずつ作っても、最後まで計算した試合を通して作っても、
 * 同じ試合なら同じ動きになる。試合の結果には関わらない。
 *
 * 座標は m：x はピッチの幅（0〜68）、y は長さ（0〜105）。side 0 は y = 0 の方へ攻める（イベントの場所と同じ）。
 */
import { FORMATIONS, type Slot } from "../config/formations";
import { MOVE } from "../config/replay";
import { effectiveMovement } from "../match/lanes";
import type { MatchEventType, MatchState, Side } from "../match/types";
import { Rng } from "../rng";
import type { PlayStyle, Tactics } from "../types";
import { shapeBefore, type Pt } from ".";
import { EVENT_MOTIONS } from "./motion";
import { EventSchedule, mps, PHASE_START, segmentOfTime, SET_PIECES, type SimKey } from "./schedule";

export const PL = MOVE.pitch.length;
export const PW = MOVE.pitch.width;
export const STEP = MOVE.step;
/** 1 区間の歩数 */
const SEG_STEPS = Math.round(5 / STEP);

type V = Pt;
export type LegKind = "pass" | "air" | "lofted" | "shot" | "dribble" | "hold" | "dead" | "throw";

/** ボールの 1 区間の動き */
export interface Leg {
  t0: number;
  t1: number;
  from: V;
  to: V;
  kind: LegKind;
  /** 蹴る・運ぶ人（players の添字。-1 はなし） */
  carrier: number;
  /** 受ける人（-1 はなし） */
  receiver: number;
  /** 頂点の高さ（m） */
  peak: number;
  /** 出たときの高さ（m。スローインは手の高さ） */
  h0: number;
  /** 着いたときの高さ（m。ヘディング・GK が高い所で取る・シュートが枠へ向かう） */
  h1: number;
}

export interface SimPlayer {
  id: string;
  side: Side;
  idx: number;
  name: string;
  num: number;
  style?: PlayStyle;
  speedStat: number;
  height: number;
}

interface Pl extends SimPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** ピッチの上に見えている（出ていく途中を含む） */
  on: boolean;
  /** プレーしている（出ていく途中・退場・ケガは false） */
  active: boolean;
  slot: number;
  gk: boolean;
}

/** イベントが起きた記録（テスト・3D の台本・2D の演出用） */
export interface Fired {
  t: number;
  key: SimKey;
  /** イベントの選手とボールの距離（m。選手のいないイベントは -1） */
  d: number;
  /** 予定の時刻からの遅れ（分） */
  late: number;
  /** 前半・後半などの終わりまでに間に合わず、動きなしで起きたことにした */
  skipped?: true;
}

/** 蹴る・投げるの記録（3D の台本用） */
export interface Kick {
  t: number;
  id: string;
  kind: LegKind;
  /** セットプレー・ゴールキック・キックオフ */
  set?: "setKick" | "gkKick" | "throwIn";
  /** 頭で触れて出した（3D の動きは受けたときのヘディング） */
  head?: true;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
const clampV = (v: V, m = 0.5): V => ({ x: Math.max(m, Math.min(PW - m, v.x)), y: Math.max(m, Math.min(PL - m, v.y)) });
/** そのチームにとっての奥行き（0 = 自陣のゴールライン、1 = 相手のゴールライン） */
const depthOf = (s: Side, y: number) => (s === 0 ? 1 - y / PL : y / PL);
const yOf = (s: Side, d: number) => (s === 0 ? (1 - d) * PL : d * PL);
/** そのチームから見た横（0 = 左） */
const latOf = (s: Side, x: number) => (s === 0 ? x / PW : 1 - x / PW);
const xOf = (s: Side, l: number) => (s === 0 ? l * PW : (1 - l) * PW);
const ownGoal = (side: Side): V => ({ x: PW / 2, y: side === 0 ? PL : 0 });

const GOALLINE = new Set<MatchEventType>(["goal", "miss", "pkGoal", "pkMiss", "pkSaved"]);
const DELIVER_BY_MAIN = new Set<MatchEventType>(["longBall", "switchPlay", "longBallShort", "longBallLost"]);
const CARDS = new Set<MatchEventType>(["yellow", "red", "secondYellow"]);
const DUELS = new Set<MatchEventType>(["dribbleFail", "passBlocked", "dribble", "foul", "block", "oneOnOne"]);

/** ボールが来たときに、だれがボールの所にいるか（main / other / なし） */
function atActor(type: MatchEventType): "main" | "other" | null {
  if (GOALLINE.has(type) || type === "longBallShort" || type === "longBallLost") return null;
  if (DELIVER_BY_MAIN.has(type) || type === "foul") return "other";
  if (PHASE_START.has(type) || CARDS.has(type)) return null;
  return "main";
}
const ARRIVE_KIND: Partial<Record<MatchEventType, LegKind>> = {
  save: "shot",
  catch: "shot",
  parry: "shot",
  block: "shot",
  goal: "shot",
  miss: "shot",
  pkGoal: "shot",
  pkMiss: "shot",
  pkSaved: "shot",
  gkClaim: "lofted",
  fumble: "lofted",
  header: "lofted",
  crossCleared: "lofted",
  longBall: "air",
  switchPlay: "air",
  longBallShort: "air",
  longBallLost: "air",
};

/** 列の中での横の位置（左から順に均等に並べる） */
function baseLat(slots: readonly Slot[], index: number, onIdx: number[]): number {
  const line = slots[index].line;
  const order = { L: 0, C: 1, R: 2 };
  const same = onIdx.map((i) => ({ s: slots[i], i })).filter((x) => x.s.line === line);
  same.sort((a, b) => order[a.s.lane] - order[b.s.lane] || a.i - b.i);
  const n = same.length;
  const pos = same.findIndex((x) => x.i === index);
  if (n === 1) return slots[index].lane === "L" ? 0.25 : slots[index].lane === "R" ? 0.75 : 0.5;
  if (n === 2) return pos === 0 ? 0.32 : 0.68;
  return 0.1 + (0.8 * pos) / (n - 1);
}

interface Roster {
  slots: readonly Slot[];
  /** プレーしている選手（players の添字）と、その枠 */
  ids: { idx: number; slot: number }[];
  /** 枠ごとの列の中の横の位置（baseLat） */
  lat: number[];
  /** 作り直すかどうかの目印 */
  sig?: unknown;
  outs?: number;
}

/** 止まったボールからの再開（ゴール・ゴールキック・キックオフ・スローインなど） */
interface Restart {
  type: string;
  side: Side;
  at: V;
  by?: number;
}

interface Transition {
  /** ボールを奪った側 */
  side: Side;
  t0: number;
  t1: number;
  runners: number[];
  recover: Set<number>;
  counter: boolean;
}

/** 1 コマ（再生用） */
export interface SimFrame {
  t: number;
  ball: { x: number; y: number; h: number };
  /** 見えている選手（players の添字・位置・速さ m/分・GK か） */
  dots: { idx: number; x: number; y: number; vx: number; vy: number; gk: boolean }[];
  /** ボールを持っている選手（players の添字。-1 はなし） */
  owner: number;
  /** 今のボールの動き（つなぎのプレーを含む） */
  leg?: Leg;
}

/**
 * 演出の動き（1 試合分）。sync で計算が済んだ区間を取り込み、advance で時刻 t まで動かす。
 * frame(t) で 1 コマを取り出す（記録した歩のあいだは直線でつなぐ）
 */
export class ReplaySim {
  readonly ms: MatchState;
  readonly schedule: EventSchedule;
  readonly players: Pl[] = [];
  readonly legs: Leg[] = [];
  readonly fired: Fired[] = [];
  readonly kicks: Kick[] = [];
  /** 速さの上限に対する、いちばん速かった割合（テスト用） */
  maxSpeedRatio = 0;
  /** 並び直し（前半・後半などの始め・セットプレーの場面の切り替え）で位置を置き直した歩（テストでは速さを見ない） */
  readonly resets = new Set<number>();
  /** セットプレーの場面の切り替えの時刻（分。2D・3D は短く暗くして切り替える） */
  readonly cuts: number[] = [];
  /** 歩数（0 から steps - 1 まで記録済み） */
  steps = 0;
  /** 1 歩の長さ（分） */
  readonly stepMinutes = STEP;

  private byId = new Map<string, Pl>();
  /** イベントの番号 → 動きの中で起きた時刻（ボールが関わるイベントだけ） */
  private firedAt: number[] = [];
  private keyOf = new Set<number>();
  private chunks: Float32Array[] = [];
  private onChunks: Uint8Array[] = [];
  private ballChunks: Float32Array[] = [];
  private ownerChunks: Int16Array[] = [];
  private seed: string;
  private rng: Rng;
  private rngSeg = -1;
  private benchX: number;

  // ---- 動きの状態 ----
  private ball: V = { x: PW / 2, y: PL / 2 };
  private ballH: number = MOVE.height.ground;
  private owner = -1;
  private lastSide: Side = 0;
  private leg: Leg = { t0: 0, t1: 0, from: { x: PW / 2, y: PL / 2 }, to: { x: PW / 2, y: PL / 2 }, kind: "dead", carrier: -1, receiver: -1, peak: 0, h0: 0.11, h1: 0.11 };
  /** 次に起こすキー（keys の添字） */
  private ki = 0;
  /** 最後の 1 本を出して、着いたら起こすキー（-1 はなし） */
  private pending = -1;
  private restart: Restart | null = null;
  /** この歩で場面を切り替えた */
  private cutNow = false;
  /** 頭で触れた直後（次のボールは頭から出る。足もとへ落とさない） */
  private headed = false;
  /** 約束：選手 → 場所と時刻 */
  private appts = new Map<number, { t: number; at: V; set?: boolean }>();
  private trans: Transition | null = null;
  /** 場面を切り替えて並べ直したセットプレー（keys の添字。2 度は切り替えない） */
  private cutFor = -1;
  /** セットプレーを蹴った直後（ボールが飛んでいる間も、ゴール前の並びを保つ） */
  private setHold: { k: SimKey; kicker: string; t1: number } | null = null;
  /** 喜び：得点者と、終わりの時刻 */
  private joy: { idx: number; side: Side; t1: number } | null = null;
  /** 退場・ケガ（時刻と選手）。予定表から足していく */
  private outs: { t: number; id: string; seg: number }[] = [];
  private outScan = 0;
  /** 前半・後半などが終わる区間（そこではセットプレーを長く待たない） */
  private phaseEnds = new Set<number>();
  private keyLimit = 0;
  /** 体力の記録（区間の記録 → 選手の id → 体力） */
  private stIdx = new WeakMap<object, Map<string, number>>();
  /** この歩の体力（選手ごと。同じ歩で何度も使う） */
  private stStep = -1;
  private stCache: Float64Array = new Float64Array(0);
  /** その歩のプレーしている選手（側ごと） */
  private rosters: [Roster, Roster] = [
    { slots: [], ids: [], lat: [] },
    { slots: [], ids: [], lat: [] },
  ];

  constructor(ms: MatchState) {
    this.ms = ms;
    this.schedule = new EventSchedule(ms);
    this.seed = `replay:${ms.teams[0].schoolId}:${ms.teams[1].schoolId}:${ms.kind ?? ""}`;
    this.rng = Rng.fromSeed(this.seed);
    // ベンチ（交代で出入りするところ）は、自校から見て手前のタッチライン
    this.benchX = ms.teams[1].isUser && !ms.teams[0].isUser ? MOVE.bench.x : PW - MOVE.bench.x;
    for (const side of [0, 1] as Side[]) {
      const team = ms.teams[side];
      for (const mp of Object.values(team.players)) {
        const p: Pl = {
          id: mp.id,
          side,
          idx: this.players.length,
          name: mp.name,
          num: mp.num ?? 0,
          style: mp.playStyle,
          speedStat: mp.stats.speed,
          height: mp.heightCm,
          x: PW / 2,
          y: PL / 2,
          vx: 0,
          vy: 0,
          on: false,
          active: false,
          slot: -1,
          gk: false,
        };
        this.players.push(p);
        this.byId.set(mp.id, p);
      }
    }
  }

  get keys(): SimKey[] {
    return this.schedule.keys;
  }

  /** いま動かせる最後の時刻（計算が済んだ区間の終わり） */
  get limit(): number {
    return Math.min(this.ms.minute, (this.schedule.prepared + 1) * 5);
  }

  /** 計算が済んだ区間を取り込む */
  sync() {
    this.schedule.sync();
    for (let i = this.keyOf.size; i < this.schedule.keys.length; i++) this.keyOf.add(this.schedule.keys[i].index);
    const ms = this.ms;
    const times = this.schedule.times;
    for (; this.outScan < times.length; this.outScan++) {
      const e = ms.events[this.outScan];
      if (e.type === "halfTime" || e.type === "fullTime" || e.type === "pkShootout") this.phaseEnds.add(Math.max(0, Math.ceil(e.minute / 5 - 1e-9) - 1));
      if (e.type === "injury" || e.type === "red" || e.type === "secondYellow") this.outs.push({ t: times[this.outScan], id: e.players![0], seg: Math.max(0, Math.ceil(e.minute / 5 - 1e-9) - 1) });
    }
  }

  /**
   * イベント（ms.events の番号）を、速報・スコア・人数の表示に出す時刻（計画 1.2）。
   * ボールが関わるイベントは動きの中で起きた時刻（ボールがゴールに入ってから点が入る）。ほかは予定の時刻。
   * まだ起きていなければ undefined。ハーフタイム・試合終了などで時計が追いついたときは、起きていないキーも予定の時刻で出す
   */
  shownAt(index: number, display: number): number | undefined {
    this.advance(display);
    const f = this.firedAt[index];
    if (f !== undefined) return f;
    const st = this.schedule.times[index];
    if (st === undefined) return undefined;
    if (!this.keyOf.has(index)) return st;
    const ms = this.ms;
    const settled = display >= ms.minute - 1e-9 && ms.phase !== "H1" && ms.phase !== "H2" && ms.phase !== "ET1" && ms.phase !== "ET2";
    return settled ? st : undefined;
  }

  /** 時刻 display までに出すイベントか */
  isShown(index: number, display: number): boolean {
    const t = this.shownAt(index, display);
    return t !== undefined && t <= display + 1e-9;
  }

  private markFired(f: Fired) {
    this.fired.push(f);
    this.firedAt[f.key.index] = f.t;
  }

  /** 時刻 t まで動かす（計算が済んだ区間の中で） */
  advance(t: number) {
    this.sync();
    const last = Math.floor(Math.min(t, this.limit) / STEP + 1e-6);
    while (this.steps <= last) this.stepOnce(this.steps++);
  }

  /** 時刻 t の 1 コマ */
  frame(t: number, ahead = 0.6): SimFrame {
    this.advance(t + ahead);
    const N = this.players.length;
    const maxS = this.steps - 1;
    const f = Math.max(0, Math.min(maxS, t / STEP));
    const s = Math.min(Math.floor(f), Math.max(0, maxS - 1));
    const s1 = Math.min(maxS, s + 1);
    // 並び直しの歩へは、つながずに切り替える
    const u = this.resets.has(s1) && s1 > s ? 0 : Math.max(0, Math.min(1, f - s));
    const pa = this.posChunk(s),
      pb = this.posChunk(s1);
    const oa = this.onChunk(s),
      ob = this.onChunk(s1);
    const ia = (s % SEG_STEPS) * N,
      ib = (s1 % SEG_STEPS) * N;
    const dots: SimFrame["dots"] = [];
    for (let i = 0; i < N; i++) {
      const onA = oa[ia + i],
        onB = ob[ib + i];
      if (!onA && !onB) continue;
      let ax = pa[(ia + i) * 2],
        ay = pa[(ia + i) * 2 + 1];
      let bx = pb[(ib + i) * 2],
        by = pb[(ib + i) * 2 + 1];
      if (!onA) {
        ax = bx;
        ay = by;
      }
      if (!onB) {
        bx = ax;
        by = ay;
      }
      if ((u < 0.5 ? onA : onB) === 0) continue;
      const dt = s1 > s ? STEP : 1;
      dots.push({ idx: i, x: ax + (bx - ax) * u, y: ay + (by - ay) * u, vx: (bx - ax) / dt, vy: (by - ay) / dt, gk: this.players[i].gk });
    }
    const ba = this.ballChunk(s),
      bb = this.ballChunk(s1);
    const ja = (s % SEG_STEPS) * 3,
      jb = (s1 % SEG_STEPS) * 3;
    const ball = { x: ba[ja] + (bb[jb] - ba[ja]) * u, y: ba[ja + 1] + (bb[jb + 1] - ba[ja + 1]) * u, h: ba[ja + 2] + (bb[jb + 2] - ba[ja + 2]) * u };
    const owner = this.ownerChunk(s)[s % SEG_STEPS];
    return { t, ball, dots, owner, leg: this.legAt(t) };
  }

  /** 時刻 t のボールの動き（直前に終わったものも少しのあいだ返す。2D の軌跡用） */
  legAt(t: number, linger = 0.12): Leg | undefined {
    const legs = this.legs;
    let lo = 0,
      hi = legs.length - 1,
      k = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (legs[mid].t0 <= t) {
        k = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const l = k >= 0 ? legs[k] : undefined;
    return l && t <= l.t1 + linger ? l : undefined;
  }

  // ================= 記録 =================

  private posChunk(s: number) {
    const c = Math.floor(s / SEG_STEPS);
    return (this.chunks[c] ??= new Float32Array(SEG_STEPS * this.players.length * 2));
  }
  private onChunk(s: number) {
    const c = Math.floor(s / SEG_STEPS);
    return (this.onChunks[c] ??= new Uint8Array(SEG_STEPS * this.players.length));
  }
  private ballChunk(s: number) {
    const c = Math.floor(s / SEG_STEPS);
    return (this.ballChunks[c] ??= new Float32Array(SEG_STEPS * 3));
  }
  private ownerChunk(s: number) {
    const c = Math.floor(s / SEG_STEPS);
    return (this.ownerChunks[c] ??= new Int16Array(SEG_STEPS).fill(-1));
  }

  private record(s: number, owner: number) {
    const N = this.players.length;
    const pc = this.posChunk(s),
      oc = this.onChunk(s);
    const base = (s % SEG_STEPS) * N;
    for (const p of this.players) {
      pc[(base + p.idx) * 2] = p.x;
      pc[(base + p.idx) * 2 + 1] = p.y;
      oc[base + p.idx] = p.on ? 1 : 0;
    }
    const bc = this.ballChunk(s);
    const j = (s % SEG_STEPS) * 3;
    bc[j] = this.ball.x;
    bc[j + 1] = this.ball.y;
    bc[j + 2] = this.ballH;
    this.ownerChunk(s)[s % SEG_STEPS] = owner;
  }

  // ================= 選手の情報 =================

  /** その時刻の戦術（区間の記録。古いセーブは試合の終わりの戦術） */
  private tactics(side: Side, t: number): Tactics {
    const tr = this.ms.teams[side].trace;
    if (!tr || tr.length === 0) return this.ms.teams[side].tactics;
    let x = tr[0];
    for (const r of tr) if (r.minute < t || (t <= 0 && r.minute <= 0)) x = r;
    return x.tactics;
  }

  /** その時刻の体力（区間の記録を直線でつなぐ。記録が無ければ試合の終わりの体力まで直線で下がるとみる） */
  private stamina(p: Pl, t: number): number {
    const step = Math.round(t / STEP);
    if (step !== this.stStep) {
      this.stStep = step;
      if (this.stCache.length !== this.players.length) this.stCache = new Float64Array(this.players.length);
      this.stCache.fill(-1);
    }
    const c = this.stCache[p.idx];
    if (c >= 0) return c;
    const v = this.staminaAt(p, t);
    this.stCache[p.idx] = v;
    return v;
  }

  private staminaAt(p: Pl, t: number): number {
    const team = this.ms.teams[p.side];
    const tr = team.trace;
    if (tr && tr.length > 0) {
      const at = (r: (typeof tr)[number]) => {
        let m = this.stIdx.get(r);
        if (!m) {
          m = new Map();
          const shape = shapeBefore(team, r.minute + 1e-6);
          shape.onPitch.forEach((id, i) => m!.set(id, r.stamina[i]));
          this.stIdx.set(r, m);
        }
        return m.get(p.id);
      };
      let a: (typeof tr)[number] | undefined, b: (typeof tr)[number] | undefined;
      for (const r of tr) {
        if (r.minute < t) a = r;
        else {
          b = r;
          break;
        }
      }
      const sa = a ? at(a) : undefined;
      const sb = b && segmentOfTime(t) >= segmentOfTime(b.minute + 1e-6) ? at(b) : undefined;
      if (sa !== undefined && sb !== undefined && a && b) return sa + ((sb - sa) * (t - a.minute)) / Math.max(1e-6, b.minute - a.minute);
      // 区間の中は、記録した体力から区間の終わりまで少しずつ下がる（次の記録はまだ無い）
      if (sa !== undefined && a) return Math.max(0, sa - (t - a.minute) * 0.25);
      return 100;
    }
    const mp = team.players[p.id];
    const end = Math.max(1, this.ms.minute);
    return 100 - (100 - (mp?.stamina ?? 100)) * Math.min(1, t / end);
  }

  private vmax(p: Pl, t: number): number {
    const F = MOVE.fatigue;
    const st = this.stamina(p, t);
    const fat = F.minSpeed + (1 - F.minSpeed) * Math.min(1, st / F.fullAt);
    return mps(MOVE.run.base + MOVE.run.perSpeed * (p.speedStat / 100)) * fat;
  }

  private reachMult(p: Pl, t: number): number {
    const F = MOVE.fatigue;
    return F.minReach + (1 - F.minReach) * Math.min(1, this.stamina(p, t) / F.fullAt);
  }

  private keyTeam(k: SimKey): Side {
    const a = k.actors[0] ? this.byId.get(k.actors[0]) : undefined;
    return a ? a.side : k.side;
  }

  /** そのキーで攻めているチーム */
  private attackTeam(k: SimKey): Side {
    const t = k.type;
    if (t === "passBlocked" || t === "dribbleFail") return this.keyTeam(k);
    if (t === "save" || t === "catch" || t === "parry" || t === "block" || t === "gkClaim" || t === "fumble" || t === "gkRush" || t === "crossCleared" || t === "pkSaved") {
      const o = k.actors[1] ? this.byId.get(k.actors[1]) : undefined;
      return o ? o.side : other(this.keyTeam(k));
    }
    if (t === "foul") {
      const o = k.actors[1] ? this.byId.get(k.actors[1]) : undefined;
      return o ? o.side : k.side;
    }
    return this.keyTeam(k);
  }

  private actorIdx(k: SimKey, who: "main" | "other" | null): number {
    if (!who) return -1;
    const id = k.actors[who === "main" ? 0 : 1];
    const p = id ? this.byId.get(id) : undefined;
    return p && p.active ? p.idx : -1;
  }

  // ================= ボール =================

  private legDur(kind: LegKind, d: number): number {
    const B = MOVE.ball,
      M = MOVE.legMin;
    switch (kind) {
      case "pass":
        return M.pass + d / mps(B.pass);
      case "air":
        return M.air + d / mps(B.air);
      case "lofted":
        return M.lofted + d / mps(B.lofted);
      case "shot":
        return M.shot + d / mps(B.shot);
      case "throw":
        return 0.04 + d / mps(B.throwIn);
      case "dribble":
        return d / mps(B.dribble);
      default:
        return 0.05;
    }
  }

  private legPeak(kind: LegKind, d: number): number {
    const P = MOVE.peak;
    if (kind === "air") return Math.min(P.airMax, P.airBase + d * P.airPerMeter);
    if (kind === "lofted") return P.lofted;
    if (kind === "shot") return P.shot;
    if (kind === "throw") return P.throwIn;
    return 0;
  }

  private startLeg(t: number, kind: LegKind, from: V, to: V, carrier: number, receiver: number, t1?: number, set?: Kick["set"]) {
    const d = len(to.x - from.x, to.y - from.y);
    const end = t1 ?? t + Math.max(STEP, this.legDur(kind, d));
    const H = MOVE.height;
    const moving = kind !== "hold" && kind !== "dribble" && kind !== "dead";
    const h0 = kind === "throw" ? H.hands : moving ? Math.max(H.ground, this.ballH) : H.ground;
    const leg: Leg = { t0: t, t1: Math.max(t + STEP * 0.5, end), from: { ...from }, to: clampV(to, 0.3), kind, carrier, receiver, peak: this.legPeak(kind, d), h0, h1: moving ? this.arriveHeight() : H.ground };
    this.leg = leg;
    if (kind !== "hold" && kind !== "dribble" && kind !== "dead") {
      this.legs.push(leg);
      if (carrier >= 0) this.kicks.push({ t, id: this.players[carrier].id, kind, set, head: (kind !== "throw" && h0 >= MOVE.height.head - 0.3) || undefined });
    }
    if (receiver >= 0 && kind !== "dribble") this.appts.set(receiver, { t: leg.t1, at: leg.to });
  }

  /** 最後の 1 本が着く高さ（頭で触れる・GK が高い所で取る・シュートが枠へ向かう。決まった値で散らす） */
  private arriveHeight(): number {
    const H = MOVE.height;
    if (this.pending < 0) return H.ground;
    const k = this.schedule.keys[this.pending];
    const inArc = EVENT_MOTIONS[k.type].in;
    if (inArc === "head") return H.head;
    if (inArc === "gkHigh") return H.gkHigh;
    if (inArc === "shot") {
      const v = Math.sin(k.index * 91.345 + 7 * 47.853) * 24634.6345;
      const u = v - Math.floor(v);
      return H.shot.min + u * (H.shot.max - H.shot.min) + (k.type === "miss" ? H.shot.overMiss : 0);
    }
    return H.ground;
  }

  private setOwner(idx: number, t: number) {
    this.owner = idx;
    if (idx < 0) return;
    const side = this.players[idx].side;
    if (side !== this.lastSide) this.startTransition(side, t, false);
    this.lastSide = side;
  }

  /** 空いている味方（パスの出しどころ） */
  private chooseOpen(side: Side, from: V, toward: V | null, exclude: number): Pl | undefined {
    const mates = this.rosters[side].ids.map((x) => this.players[x.idx]).filter((p) => p.idx !== exclude && !p.gk);
    const opps = this.rosters[other(side)].ids.map((x) => this.players[x.idx]);
    const build = this.tactics(side, this.leg.t1).buildUp;
    let best: Pl | undefined;
    let bestS = -1e9;
    for (const m of mates) {
      const d = len(m.x - from.x, m.y - from.y);
      if (d < 7 || d > (build === "long" ? 48 : 34)) continue;
      let open = 99;
      for (const o of opps) open = Math.min(open, len(o.x - m.x, o.y - m.y));
      const prog = toward ? -len(m.x - toward.x, m.y - toward.y) * 0.35 : (depthOf(side, m.y) - depthOf(side, from.y)) * (build === "long" ? 14 : 8);
      const ideal = build === "long" ? 26 : 16;
      const s = Math.min(open, 9) * 1.2 + prog - Math.abs(d - ideal) * 0.15 + this.rng.range(-3, 3);
      if (s > bestS) {
        bestS = s;
        best = m;
      }
    }
    return best;
  }

  private nearestOf(side: Side, at: V, exclude = -1): Pl | undefined {
    let best: Pl | undefined;
    let bd = 1e9;
    for (const x of this.rosters[side].ids) {
      const p = this.players[x.idx];
      if (p.gk || p.idx === exclude) continue;
      const d = len(p.x - at.x, p.y - at.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** ボールが着いた・持ち主が受けた時刻 t に、次のボールの動きを決める */
  private decide(t: number) {
    const keys = this.schedule.keys;
    const leg = this.leg;
    // パスが着いたら、受けた人が持ち主
    if (leg.receiver >= 0 && leg.kind !== "dribble" && leg.kind !== "hold" && leg.kind !== "dead" && this.players[leg.receiver].active) this.setOwner(leg.receiver, t);

    // 最後の 1 本が着いた：キーを起こす
    if (this.pending >= 0) {
      // セットプレー：蹴る人がまだ来ていなければ、来るまで待つ（遅れは少しだけ）
      const pk = keys[this.pending];
      if (SET_PIECES.has(pk.type) && leg.kind === "dead") {
        const kicker = this.actorIdx(pk, "main");
        const W = MOVE.setWait;
        const kd = kicker >= 0 ? len(this.players[kicker].x - this.ball.x, this.players[kicker].y - this.ball.y) : 0;
        if (this.cutFor !== this.pending && (kd > W.near || !this.gathered(pk, kicker, 0, t))) {
          // 待てる時間のうちに間に合いそうなら、来るまで待つ（遅れは少しだけ）
          const left = Math.min(W.max - (t - pk.t), this.phaseEnds.has(pk.seg) ? (pk.seg + 1) * 5 - W.phaseEnd - t : 99);
          const reach = kicker >= 0 ? kd - this.vmax(this.players[kicker], t) * Math.max(0, left) <= W.near : true;
          if (left > 0 && reach && this.gathered(pk, kicker, left, t)) {
            this.leg = { ...leg, t1: t + STEP };
            return;
          }
          // 間に合わない：中継の場面の切り替えのように、セットプレーの並びへ置き直し、少し間を置いて蹴る
          this.cutTo(pk, t);
          this.cutFor = this.pending;
          this.leg = { ...leg, t1: t + W.afterCut };
          return;
        }
      }
      this.fire(this.pending, t);
      return this.decide2(t);
    }
    // 予定の時刻を過ぎたキー（間に合わなかった）：すぐにその場所へ運んで起こす
    if (this.ki < this.keyLimit && keys[this.ki].t < t - 0.02 && !keys[this.ki].start) {
      const k = keys[this.ki];
      this.pending = this.ki;
      const recv = this.actorIdx(k, atActor(k.type));
      const B = recv >= 0 && !GOALLINE.has(k.type) ? { x: this.players[recv].x, y: this.players[recv].y } : k.ball;
      k.ball = clampV(B, 0.3);
      this.startLeg(t, ARRIVE_KIND[k.type] ?? "pass", this.ball, k.ball, this.owner, recv, t + Math.min(0.15, Math.max(STEP, this.legDur("pass", len(k.ball.x - this.ball.x, k.ball.y - this.ball.y)))));
      return;
    }
    this.decide2(t);
  }

  /** キーを起こす */
  private fire(ki: number, t: number) {
    const k = this.schedule.keys[ki];
    // 運んでいたボールは、運ぶ人の足もとのまま（キーの場所はそこにする）
    if (this.leg.kind === "dribble" || this.leg.kind === "hold") k.ball = { ...this.ball };
    else this.ball = { ...this.leg.to };
    const main = this.actorIdx(k, atActor(k.type));
    const d = main >= 0 ? len(this.players[main].x - this.ball.x, this.players[main].y - this.ball.y) : -1;
    this.markFired({ t, key: k, d, late: Math.max(0, t - k.t) });
    this.ki = ki + 1;
    if (SET_PIECES.has(k.type)) this.setHold = { k, kicker: k.actors[0] ?? "", t1: t + MOVE.lookahead.setHold };
    else if (this.setHold && t < this.setHold.t1 && k.actors[0] === this.setHold.kicker) this.setHold.t1 = t + MOVE.lookahead.setHold;
    else this.setHold = null;
    this.pending = -1;
    const em = EVENT_MOTIONS[k.type];
    const h = em.holder === "none" ? -1 : this.actorIdx(k, em.holder);
    this.appts.clear();
    if (h >= 0) {
      this.setOwner(h, t);
    } else {
      this.owner = -1;
      this.restart = { type: k.type, side: this.attackTeam(k), at: { ...this.ball } };
    }
    this.headed = em.in === "head" && h >= 0;
    if (k.type === "counter") this.startTransition(this.keyTeam(k), t, true);
    if (k.type === "goal" || k.type === "pkGoal") {
      const scorer = this.actorIdx(k, "main");
      if (scorer >= 0) this.joy = { idx: scorer, side: this.players[scorer].side, t1: t + MOVE.celebrate };
    }
  }

  private decide2(t: number): void {
    const keys = this.schedule.keys;
    const k = this.ki < this.keyLimit ? keys[this.ki] : undefined;
    const slack = k ? k.t - t : 99;
    const dead = (nominal: number) => Math.max(STEP, Math.min(nominal, slack - 0.3));
    const ball = this.ball;

    if (this.restart?.type === "throwWait") {
      // ボールがタッチラインを出た：投げる人が来るまで止まる
      const r = this.restart;
      const ap = r.by !== undefined ? this.appts.get(r.by) : undefined;
      this.restart = { ...r, type: "throwIn" };
      this.ball = { x: r.at.x < PW / 2 ? -0.3 : PW + 0.3, y: r.at.y };
      return this.startLeg(t, "dead", this.ball, this.ball, -1, -1, Math.max(t + STEP, Math.min(ap ? ap.t : t + 0.2, k ? k.t - 0.3 : 99)));
    }
    if (this.restart) {
      const r = this.restart;
      this.restart = null;
      if (r.type === "goal" || r.type === "pkGoal") {
        // ゴールの後：喜んで、自陣に戻ってからキックオフ（時間が無ければ早めに）
        this.startLeg(t, "dead", ball, ball, -1, -1, t + dead(0.75));
        this.restart = { type: "kickoff", side: other(this.lastSide), at: { x: PW / 2, y: PL / 2 } };
        return;
      }
      if (r.type === "miss" || r.type === "pkMiss" || r.type === "pkSaved") {
        // ゴールキック：GK がゴールエリアに置いて蹴る
        const defSide = other(this.lastSide);
        const gk = this.gkOf(defSide);
        const spot = { x: PW / 2 + (this.rng.next() < 0.5 ? -8 : 8), y: yOf(defSide, 5.5 / PL) };
        this.startLeg(t, "dead", ball, ball, -1, -1, t + dead(0.3));
        if (gk) this.appts.set(gk.idx, { t: t + dead(0.3), at: { x: spot.x, y: spot.y + (defSide === 0 ? 0.8 : -0.8) } });
        this.restart = { type: "goalKick", side: defSide, at: spot, by: gk?.idx };
        return;
      }
      if (r.type === "kickoff") {
        // キックオフ：ボールを真ん中に置き、蹴る側のいちばん近い選手が蹴る
        this.ball = { x: PW / 2, y: PL / 2 };
        const kickSide = k ? this.attackTeam(k) : r.side;
        const cf = this.nearestOf(kickSide, this.ball);
        if (cf) {
          const wait = dead(0.3);
          this.appts.set(cf.idx, { t: t + wait, at: { x: PW / 2, y: PL / 2 + (kickSide === 0 ? 0.9 : -0.9) } });
          this.startLeg(t, "dead", this.ball, this.ball, -1, -1, t + wait);
          this.restart = { type: "kickoffGo", side: kickSide, at: this.ball, by: cf.idx };
        }
        return;
      }
      if (r.type === "kickoffGo" && r.by !== undefined) {
        this.joy = null;
        this.setOwner(r.by, t);
        const side = this.players[r.by].side;
        const back = this.rosters[side].ids.map((x) => this.players[x.idx]).filter((p) => !p.gk && p.idx !== r.by && depthOf(side, p.y) < 0.45);
        const to = back.length ? back[Math.floor(this.rng.next() * back.length)] : undefined;
        if (to) return this.startLeg(t, "pass", this.ball, { x: to.x, y: to.y }, r.by, to.idx, Math.min(t + this.legDur("pass", len(to.x - this.ball.x, to.y - this.ball.y)), t + Math.max(STEP, slack * 0.4)));
      } else if (r.type === "goalKick") {
        this.ball = { ...r.at };
        if (r.by !== undefined && this.players[r.by].active) {
          this.setOwner(r.by, t);
          const to = this.chooseOpen(r.side, this.ball, null, r.by);
          if (to && slack > 0.45) return this.startLeg(t, "air", this.ball, { x: to.x, y: to.y }, r.by, to.idx, Math.min(t + this.legDur("air", len(to.x - this.ball.x, to.y - this.ball.y)), t + slack * 0.5), "gkKick");
        }
      } else if (r.type === "throwIn") {
        if (r.by !== undefined && this.players[r.by].active) {
          this.setOwner(r.by, t);
          const to = this.chooseOpen(r.side, this.ball, null, r.by) ?? this.nearestOf(r.side, this.ball, r.by);
          if (to) return this.startLeg(t, "throw", this.ball, { x: to.x, y: to.y }, r.by, to.idx, Math.min(t + this.legDur("throw", len(to.x - this.ball.x, to.y - this.ball.y)), t + Math.max(STEP, slack * 0.5)), "throwIn");
        }
      } else if (r.type === "pickUp" && r.by !== undefined) {
        if (this.players[r.by].active) this.setOwner(r.by, t);
      } else {
        const side = k ? this.attackTeam(k) : other(this.lastSide);
        // 大きく外れたボール（タッチラインの近く）：スローイン
        const nearLine = ball.x < 6 || ball.x > PW - 6;
        if (nearLine && (r.type === "crossCleared" || r.type === "longBallLost" || r.type === "passBlocked") && slack > 0.9) {
          const at = { x: ball.x < PW / 2 ? 0 : PW, y: Math.max(3, Math.min(PL - 3, ball.y)) };
          const thrower = this.nearestOf(side, at);
          if (thrower) {
            this.startLeg(t, "pass", ball, at, -1, -1);
            const wait = Math.max(this.leg.t1 + 0.1, t + Math.min(0.45, slack - 0.4));
            this.appts.set(thrower.idx, { t: wait, at: { x: at.x < PW / 2 ? -0.4 : PW + 0.4, y: at.y } });
            this.restart = { type: "throwWait", side, at, by: thrower.idx };
            return;
          }
        }
        // こぼれ球・ファウルの後：近い選手が拾う
        const near = this.nearestOf(side, ball);
        if (near) {
          if (r.type === "foul" || CARDS.has(r.type as MatchEventType)) {
            this.startLeg(t, "dead", ball, ball, -1, -1, t + dead(0.25));
            this.appts.set(near.idx, { t: t + dead(0.25), at: { ...ball } });
            this.restart = { type: "pickUp", side, at: ball, by: near.idx };
            return;
          }
          return this.startLeg(t, "pass", ball, { x: near.x, y: near.y }, -1, near.idx, Math.min(t + this.legDur("pass", len(near.x - ball.x, near.y - ball.y)), t + Math.max(STEP, slack * 0.4)));
        }
      }
    }

    if (this.owner < 0) {
      // 持ち主がいない：次のキーの側の近い選手へ転がる
      const side = k ? this.attackTeam(k) : this.lastSide;
      const near = this.nearestOf(side, this.ball);
      if (near) return this.startLeg(t, "pass", this.ball, { x: near.x, y: near.y }, -1, near.idx, Math.min(t + this.legDur("pass", len(near.x - this.ball.x, near.y - this.ball.y)), t + Math.max(STEP, slack * 0.4)));
      return this.startLeg(t, "hold", this.ball, this.ball, -1, -1);
    }
    const owner = this.owner;
    const o = this.players[owner];
    const headed = this.headed;
    this.headed = false;
    if (headed && !this.restart) {
      // 頭で触れた：ボールは頭から出る（足もとへ落とさない）
      const recv = k ? this.actorIdx(k, atActor(k.type)) : -1;
      if (k && recv === owner && k.type === "shot" && k.t - t < MOVE.headShot && t > k.minute - 1) {
        // ヘディングのシュート：頭で触れたその場で打つ（シュートのキーを少し早めに起こす）
        this.fire(this.ki, t);
        this.headed = true;
        return this.decide2(t);
      }
      if (k && !SET_PIECES.has(k.type)) {
        const kind: LegKind = ARRIVE_KIND[k.type] ?? (k.air ? "air" : "pass");
        if (recv < 0 || GOALLINE.has(k.type)) {
          // シュート・クリア：そのまま次のキーの場所へ（着くのが予定より早ければ、その分の中で早めに起こす）
          const natural = this.legDur(kind, len(k.ball.x - this.ball.x, k.ball.y - this.ball.y));
          const t1 = Math.max(t + natural, Math.min(k.t, t + natural * 2.2), k.minute - 1 + 0.02);
          this.pending = this.ki;
          return this.startLeg(t, kind, this.ball, k.ball, owner, -1, Math.max(t + STEP, t1));
        } else if (recv !== owner) {
          // 次のキーの選手へ（味方へ落とす・相手に拾われる）
          const r = this.players[recv];
          return this.startLeg(t, "lofted", this.ball, { x: r.x + r.vx * 0.15, y: r.y + r.vy * 0.15 }, owner, recv);
        }
      }
      if (!k) {
        const mate = this.chooseOpen(o.side, this.ball, null, owner);
        if (mate) return this.startLeg(t, "lofted", this.ball, { x: mate.x, y: mate.y }, owner, mate.idx);
      }
    }
    if (!k) {
      // この先のキーがまだ無い（次の区間を計算する前）：ボールをつなぐ。区間の終わりまでに収める
      const segEnd = (segmentOfTime(t) + 1) * 5 - 0.01;
      const room = segEnd - t;
      const to = this.chooseOpen(o.side, this.ball, null, owner);
      if (to && this.rng.next() < 0.7) {
        const dur = this.legDur("pass", len(to.x - this.ball.x, to.y - this.ball.y));
        if (0.06 + dur < room) return this.startLeg(t + 0.06, "pass", this.ball, { x: to.x, y: to.y }, owner, to.idx);
      }
      const dest = clampV({ x: this.ball.x + this.rng.range(-4, 4), y: yOf(o.side, depthOf(o.side, this.ball.y) + 0.03) });
      const dur = this.legDur("dribble", len(dest.x - this.ball.x, dest.y - this.ball.y));
      if (room < 0.08) return this.startLeg(t, "hold", this.ball, this.ball, owner, owner, t + Math.max(STEP, room));
      return this.startLeg(t, "dribble", this.ball, dest, owner, owner, t + Math.min(dur, room));
    }

    // ---- 次のキーへつなぐ ----
    const at = atActor(k.type);
    const recv = this.actorIdx(k, at);
    const kind: LegKind = ARRIVE_KIND[k.type] ?? (k.air ? "air" : "pass");
    let B: V = { ...k.ball };
    if (k.type === "corner") B = { x: k.ball.x < PW / 2 ? 0.6 : PW - 0.6, y: yOf(this.attackTeam(k), 0.995) };
    else if (k.type === "longThrow") B = { x: k.ball.x < PW / 2 ? 0.3 : PW - 0.3, y: k.ball.y };
    else if (recv >= 0 && !GOALLINE.has(k.type)) {
      // 選手が間に合う場所に寄せる（時刻と速さの上限が優先。場所は同じ辺りの中で動かしてよい）
      const r = this.players[recv];
      const reach = this.vmax(r, t) * 0.8 * Math.max(0, k.t - t);
      const dx = B.x - r.x,
        dy = B.y - r.y;
      const d = len(dx, dy);
      if (d > reach) B = { x: r.x + (dx / d) * reach, y: r.y + (dy / d) * reach };
    }
    k.ball = clampV(B, 0.3);
    B = k.ball;
    const deliverer = DELIVER_BY_MAIN.has(k.type) ? this.actorIdx(k, "main") : -1;
    if (recv === owner && !GOALLINE.has(k.type) && !SET_PIECES.has(k.type)) {
      // 持ち主が自分でキーの場所へ運ぶ（時間が余れば味方と短く回してから）
      const free = k.t - t - this.legDur("dribble", len(B.x - this.ball.x, B.y - this.ball.y));
      if (free > 0.45) {
        const mate = this.chooseOpen(o.side, this.ball, B, owner);
        if (mate && t + 0.04 + 2 * this.legDur("pass", len(mate.x - this.ball.x, mate.y - this.ball.y)) + 0.12 < k.t) {
          this.startLeg(t + 0.04, "pass", this.ball, { x: mate.x, y: mate.y }, owner, mate.idx);
          this.appts.set(owner, { t: k.t, at: B });
          return;
        }
      }
      this.pending = this.ki;
      return this.startLeg(t, "dribble", this.ball, B, owner, owner, Math.max(t + STEP, k.t));
    }
    if (deliverer >= 0 && deliverer !== owner) {
      const free = k.t - t - this.legDur(kind, len(B.x - this.players[deliverer].x, B.y - this.players[deliverer].y));
      if (free > 0.15) {
        const p = this.players[deliverer];
        return this.startLeg(t + 0.03, "pass", this.ball, { x: p.x, y: p.y }, owner, deliverer);
      }
    }
    const set = SET_PIECES.has(k.type);
    const final = set ? STEP : this.legDur(kind, len(B.x - this.ball.x, B.y - this.ball.y));
    const free = k.t - t - final;
    if (free > 0.35 && !GOALLINE.has(k.type) && !set) {
      const mate = this.chooseOpen(o.side, this.ball, B, owner);
      if (mate && mate.idx !== recv) {
        const dPass = this.legDur("pass", len(mate.x - this.ball.x, mate.y - this.ball.y));
        const dFinal = this.legDur(kind, len(B.x - mate.x, B.y - mate.y));
        if (t + 0.05 + dPass + 0.06 + dFinal < k.t) return this.startLeg(t + 0.05, "pass", this.ball, { x: mate.x, y: mate.y }, owner, mate.idx);
      }
    }
    if (free > 0.06 && !set) {
      // 少し運んでから
      const toward = { x: this.ball.x + (B.x - this.ball.x) * 0.25, y: this.ball.y + (B.y - this.ball.y) * 0.25 };
      const d = len(toward.x - this.ball.x, toward.y - this.ball.y);
      return this.startLeg(t, "dribble", this.ball, toward, owner, owner, t + Math.min(free, Math.max(STEP, this.legDur("dribble", d))));
    }
    // 最後の 1 本でキーの場所へ
    this.pending = this.ki;
    if (set) {
      // セットプレー：ボールを置いて（止まった時間）、蹴る人が来るのを待つ
      this.ball = { ...B };
      this.owner = -1;
      if (recv >= 0) this.appts.set(recv, { t: k.t, at: B });
      return this.startLeg(t, "dead", B, B, -1, -1, Math.max(t + STEP, k.t));
    }
    this.startLeg(Math.max(t, k.t - final), kind, this.ball, B, owner, recv, Math.max(t + STEP, k.t));
  }

  /** 場面の切り替え：両チームをセットプレーの並びに置き直す（その歩は並び直しとして記録し、2D・3D は切り替えて見せる） */
  /** セットプレーの並び（ゴール前に集まる）が、within 分のうちにおおよそできるか（0 は今できているか） */
  private gathered(k: SimKey, kicker: number, within: number, t: number): boolean {
    const W = MOVE.setWait;
    let miss = 0;
    for (const side of [0, 1] as Side[])
      for (const x of this.rosters[side].ids) {
        const p = this.players[x.idx];
        if (p.gk || p.idx === kicker) continue;
        const a = this.setPieceSpot(p, k);
        const reach = within > 0 ? this.vmax(p, t) * within * 0.8 : 0;
        if (len(p.x - a.x, p.y - a.y) - reach > W.gatherFar) miss++;
      }
    return miss <= W.gatherMiss;
  }

  private cutTo(k: SimKey, t: number) {
    for (const side of [0, 1] as Side[])
      for (const x of this.rosters[side].ids) {
        const p = this.players[x.idx];
        const a = clampV(this.setPieceSpot(p, k), -MOVE.outside);
        p.x = a.x;
        p.y = a.y;
        p.vx = 0;
        p.vy = 0;
      }
    this.separate(true);
    this.cutNow = true;
    this.cuts.push(t);
  }

  private gkOf(side: Side): Pl | undefined {
    for (const x of this.rosters[side].ids) if (this.players[x.idx].gk) return this.players[x.idx];
    return undefined;
  }

  // ================= 切り替え =================

  /** ボールを奪った（side）：奪われた側の近くの選手は全力で戻り、奪った側は 2〜3 人が前へ走って追い越す */
  private startTransition(side: Side, t: number, counter: boolean) {
    const T = MOVE.transition;
    const lose = other(side);
    const ball = this.ball;
    const bd = depthOf(side, ball.y);
    const cand = this.rosters[side].ids
      .map((x) => this.players[x.idx])
      .filter((p) => !p.gk && p.idx !== this.owner && len(p.x - ball.x, p.y - ball.y) < 55 && depthOf(side, p.y) > bd - 0.25);
    const score = (p: Pl) => {
      const slot = this.rosters[side].slots[p.slot];
      let s = depthOf(side, p.y) * 2 - len(p.x - ball.x, p.y - ball.y) / 60;
      if (slot?.line === "FW") s += 0.35;
      if (p.style === "speedster") s += 0.4;
      if (p.style === "wingDribbler" || p.style === "attackingFullback" || p.style === "boxToBox" || p.style === "insideDribbler") s += 0.2;
      if (p.style === "anchor" || p.style === "poacher" || slot?.line === "DF") s -= 0.3;
      return s;
    };
    cand.sort((a, b) => score(b) - score(a));
    const runners = cand.slice(0, counter ? T.counterRunners : T.runners).map((p) => p.idx);
    const recover = new Set<number>();
    for (const x of this.rosters[lose].ids) {
      const p = this.players[x.idx];
      if (p.gk) continue;
      const ahead = depthOf(lose, p.y) > depthOf(lose, ball.y) - 0.02;
      if (len(p.x - ball.x, p.y - ball.y) < T.recoverRadius || ahead) recover.add(p.idx);
    }
    this.trans = { side, t0: t, t1: t + (counter ? T.counterMinutes : T.minutes), runners, recover, counter };
  }

  // ================= 立ち位置 =================

  /** フォーメーションと戦術・スタイルから決まる、その選手の今の立ち位置 */
  private anchor(p: Pl, t: number, kickoff: boolean, possOverride?: boolean, push = 0): V {
    const side = p.side;
    const roster = this.rosters[side];
    const slot = roster.slots[p.slot];
    if (!slot) return { x: p.x, y: p.y };
    const tac = this.tactics(side, t);
    const poss = possOverride ?? (this.owner >= 0 ? this.players[this.owner].side : this.lastSide) === side;
    const ball = this.ball;
    const reach = kickoff ? 1 : this.reachMult(p, t);
    const bd = kickoff ? 0.5 : Math.min(1, depthOf(side, ball.y) + push);
    const bl = kickoff ? 0.5 : latOf(side, ball.x);
    if (slot.line === "GK") {
      if (kickoff) return { x: PW / 2, y: yOf(side, 2.5 / PL) };
      const near = Math.max(0, Math.min(1, (bd - 0.18) / 0.55));
      const sweep = p.style === "sweeperKeeper" ? 6 : 0;
      const dm = 2.5 + near * (11 + sweep) * (tac.line === "high" ? 1.15 : 0.9);
      return { x: PW / 2 + (ball.x - PW / 2) * (0.12 + 0.1 * (1 - near)), y: yOf(side, dm / PL) };
    }
    let center = 0.43 + (bd - 0.5) * (poss ? 0.5 : 0.4) * reach + (poss ? 0.05 : -0.04);
    center += tac.line === "high" ? 0.05 : -0.05;
    center += tac.attack === "attacking" ? 0.03 : tac.attack === "defensive" ? -0.04 : 0;
    if (poss && tac.buildUp === "long") center += 0.02;
    const spread = poss ? 1.12 : 0.82;
    const off = slot.line === "DF" ? -0.2 : slot.line === "FW" ? 0.19 : 0;
    let d = center + off * spread;
    if (slot.pos === "DMF") d -= 0.05;
    if (slot.pos === "OMF") d += 0.05;
    let l = roster.lat[p.slot] ?? 0.5;
    const mv = effectiveMovement(p.style, slot);
    const mob = { free: 1, mostlyInside: 0.8, mostlyWide: 0.6, fixed: 0.4, wideOnly: 0.35 }[mv];
    l = 0.5 + (l - 0.5) * (poss ? 1.15 : 0.82);
    l += (bl - 0.5) * (poss ? 0.18 : 0.36) * mob * reach;
    // 攻撃方針：攻撃的はサイドバックや中盤も上がり、守備的は後ろに多く残る
    if (poss && !kickoff) {
      if (tac.attack === "attacking" && slot.line !== "FW") d += slot.line === "DF" ? 0.04 : 0.05;
      if (tac.attack === "defensive" && slot.line !== "FW") d -= 0.04;
    }
    // スタイルの動き（計画 1.7）
    const oppLine = this.oppDfDepth(side);
    if (poss && !kickoff) {
      const st = p.style;
      if (st === "attackingFullback" && bd > 0.45) {
        d += 0.24 * reach;
        l = l < 0.5 ? 0.04 : 0.96;
      } else if (st === "speedster") d = Math.max(d, oppLine - 0.015 + (Math.sin(t * 2.3 + p.idx) > 0.6 ? 0.07 : 0));
      else if (st === "striker") d = Math.max(d, oppLine - 0.04);
      else if (st === "number10") {
        d = Math.min(d + 0.06, oppLine - 0.1);
        l = 0.5 + (l - 0.5) * 0.5;
      } else if (st === "anchor") {
        d = center - 0.1;
        l = 0.5 + (l - 0.5) * 0.4;
      } else if (st === "wingDribbler" || st === "crosser") l = l < 0.5 ? 0.05 : 0.95;
      else if (st === "insideDribbler") l = l < 0.5 ? 0.3 : 0.7;
      else if (st === "boxToBox") d += 0.1 * reach;
      else if (st === "poacher" && bd > 0.5) d = Math.max(d, 0.86);
      else if (st === "linkman") d -= 0.07;
      else if (st === "launcher") d -= 0.04;
      else if (st === "buildUpDefender" && bd < 0.45) l = l < 0.5 ? Math.min(l, 0.2) : Math.max(l, 0.8);
    } else if (!poss && !kickoff) {
      if (p.style === "anchor") {
        d = center - 0.12;
        l = 0.5 + (l - 0.5) * 0.4;
      }
      if (p.style === "boxToBox") d -= 0.04;
      if (p.style === "coverer") d -= 0.03;
    }
    if (!poss && slot.line === "FW") d = Math.max(d, 0.5);
    if (kickoff) d = Math.min(d, 0.47);
    // 前線は相手の最終ラインより前に出すぎない（オフサイドの線の目安）
    if (poss && p.style !== "speedster") d = Math.min(d, Math.max(oppLine + 0.02, 0.55));
    d = Math.max(0.05, Math.min(0.96, d));
    l = Math.max(0.03, Math.min(0.97, l));
    return { x: xOf(side, l), y: yOf(side, d) };
  }

  /** 相手の最終ラインの奥行き（自分のチームから見た値） */
  private oppDfDepth(side: Side): number {
    let m = 0;
    for (const x of this.rosters[other(side)].ids) {
      const q = this.players[x.idx];
      if (!q.gk) m = Math.max(m, depthOf(side, q.y));
    }
    return m;
  }

  /** セットプレーの並び（コーナー：攻める側は背の高い選手がゴール前、守る側はゴール前を固める。FK：壁） */
  private setPieceSpot(p: Pl, k: SimKey): V {
    const atk = this.attackTeam(k);
    const kicker = this.actorIdx(k, "main");
    if (p.idx === kicker) return k.type === "corner" ? { x: k.ball.x < PW / 2 ? -0.2 : PW + 0.2, y: yOf(atk, 1.005) } : this.behindBall(k.ball, atk);
    const goalD = (d: number, lat: number) => ({ x: xOf(atk, lat), y: yOf(atk, d) });
    const def = other(atk);
    if (p.gk) return p.side === atk ? goalD(0.3, 0.5) : { x: PW / 2, y: yOf(atk, 0.99) };
    const mates = this.rosters[p.side].ids
      .map((x) => this.players[x.idx])
      .filter((q) => !q.gk && q.idx !== kicker)
      .sort((a, b) => b.height - a.height || a.idx - b.idx);
    const rank = mates.findIndex((q) => q.idx === p.idx);
    if (k.type === "freeKick" || k.type === "setPiece") {
      if (p.side === def && rank < 3) {
        // 壁：ボールとゴールを結ぶ線の上、9.15m 先に横に並ぶ
        const g = ownGoal(def);
        const dx = g.x - k.ball.x,
          dy = g.y - k.ball.y;
        const dd = len(dx, dy) || 1;
        const c = { x: k.ball.x + (dx / dd) * 9.15, y: k.ball.y + (dy / dd) * 9.15 };
        const off = (rank - 1) * MOVE.separation.sepTeam * 1.02;
        return clampV({ x: c.x + (-dy / dd) * off, y: c.y + (dx / dd) * off });
      }
      if (depthOf(atk, k.ball.y) < 0.62) return this.anchor(p, k.t, false, p.side === atk);
    }
    if (p.side === atk) {
      const spots = [
        [0.93, 0.45],
        [0.92, 0.56],
        [0.9, 0.38],
        [0.89, 0.62],
        [0.94, 0.52],
        [0.84, 0.5],
        [0.8, 0.3],
        [0.62, 0.5],
        [0.5, 0.36],
        [0.5, 0.66],
      ];
      const [d, l] = spots[Math.min(spots.length - 1, rank)];
      return goalD(d, l);
    }
    const spots = [
      [0.955, 0.47],
      [0.955, 0.56],
      [0.93, 0.4],
      [0.93, 0.62],
      [0.91, 0.5],
      [0.89, 0.34],
      [0.89, 0.66],
      [0.86, 0.44],
      [0.86, 0.57],
      [0.7, 0.5],
    ];
    const [d, l] = spots[Math.min(spots.length - 1, Math.max(0, rank - (k.type === "corner" ? 0 : 3)))];
    return goalD(d, l);
  }

  /** ボールの少し後ろ（そのチームの自陣の側） */
  private behindBall(b: V, side: Side, back = 0.9): V {
    return { x: b.x, y: b.y + (side === 0 ? back : -back) };
  }

  // ================= 1 歩 =================

  private stepOnce(s: number) {
    const t = s * STEP;
    const seg = segmentOfTime(t);
    if (seg !== this.rngSeg) {
      this.rngSeg = seg;
      this.rng = Rng.fromSeed(`${this.seed}:${seg}`);
    }
    // この歩で使ってよいキー（この区間まで）
    const keys = this.schedule.keys;
    while (this.keyLimit < keys.length && keys[this.keyLimit].seg <= seg) this.keyLimit++;

    // ---- ピッチにいる選手 ----
    let reset = s === 0;
    // 前半・後半などの始めになっても起きていないキー（セットプレーを待ちすぎたとき）は、その場で起きたことにする
    for (let j = this.ki; j < this.keyLimit; j++) {
      if (!keys[j].start) continue;
      if (keys[j].t <= t + 1e-9)
        for (; this.ki < j; this.ki++) this.markFired({ t, key: keys[this.ki], d: -1, late: Math.max(0, t - keys[this.ki].t), skipped: true });
      break;
    }
    while (this.ki < this.keyLimit && keys[this.ki].start && keys[this.ki].t <= t + 1e-9) {
      const k = keys[this.ki];
      this.markFired({ t, key: k, d: -1, late: Math.max(0, t - k.t) });
      this.ki++;
      if (this.pending >= 0 && this.pending < this.ki) this.pending = -1;
      reset = true;
      this.owner = -1;
      this.trans = null;
      this.joy = null;
      this.setHold = null;
      this.appts.clear();
      this.ball = { x: PW / 2, y: PL / 2 };
      this.restart = { type: "kickoff", side: k.side, at: this.ball };
      this.leg = { t0: t, t1: t, from: this.ball, to: this.ball, kind: "dead", carrier: -1, receiver: -1, peak: 0, h0: 0.11, h1: 0.11 };
    }
    this.updateRosters(t, s, reset);
    if (reset) {
      this.resets.add(s);
      for (const side of [0, 1] as Side[])
        for (const x of this.rosters[side].ids) {
          const p = this.players[x.idx];
          const a = this.anchor(p, t, true);
          p.x = a.x;
          p.y = a.y;
          p.vx = 0;
          p.vy = 0;
        }
      this.separate(true);
    }

    // ---- ボール ----
    let guard = 0;
    while (t >= this.leg.t1 - 1e-9 && guard++ < 8) {
      // 着いたボールは、着いた場所と高さから次へ（頭で触れたボールは頭の高さから出る）
      const l = this.leg;
      if (l.kind !== "dead" && l.kind !== "hold" && l.kind !== "dribble") {
        this.ball = { ...l.to };
        this.ballH = l.h1;
      }
      this.decide(t);
    }
    if (this.cutNow) {
      this.cutNow = false;
      reset = true;
      this.resets.add(s);
    }
    const leg = this.leg;
    const carried = (leg.kind === "dribble" || leg.kind === "hold") && leg.carrier >= 0;
    if (leg.kind === "dead" || carried) {
      // 止まったボール・運んでいるボール（運ぶボールは、選手を動かしてから足もとに置く）
      this.ballH = MOVE.height.ground;
    } else if (t >= leg.t0) {
      const u = Math.max(0, Math.min(1, (t - leg.t0) / Math.max(1e-6, leg.t1 - leg.t0)));
      // 転がるパスは少しずつ遅くなる
      const e = leg.kind === "pass" ? 1 - (1 - u) * (1 - u) * 0.5 - 0.5 * (1 - u) : u;
      this.ball = { x: leg.from.x + (leg.to.x - leg.from.x) * e, y: leg.from.y + (leg.to.y - leg.from.y) * e };
      const lift = Math.max(0, leg.peak - Math.max(leg.h0, leg.h1));
      this.ballH = leg.h0 * (1 - u) + leg.h1 * u + 4 * lift * u * (1 - u);
    }
    const carrying = (leg.kind === "dribble" || leg.kind === "hold" || (t < leg.t0 && leg.carrier >= 0)) && leg.carrier >= 0 ? leg.carrier : -1;
    const ballOwnerNow = carrying >= 0 ? carrying : t < leg.t0 ? leg.carrier : -1;
    const possSide: Side = this.owner >= 0 ? this.players[this.owner].side : this.lastSide;

    // ---- 選手の行きたい場所 ----
    this.homing(t);
    const ball = this.ball;
    const pressers = new Set<number>();
    {
      const defSide = other(possSide);
      const tac = this.tactics(defSide, t);
      const ballD = depthOf(defSide, ball.y);
      const nPress = tac.press === "low" ? (ballD < 0.45 ? 1 : 0) : MOVE.pressers[tac.press];
      const cand = this.rosters[defSide].ids
        .map((x) => this.players[x.idx])
        .filter((p) => !p.gk)
        .sort((a, b) => len(a.x - ball.x, a.y - ball.y) - len(b.x - ball.x, b.y - ball.y));
      cand.slice(0, nPress).forEach((p) => pressers.add(p.idx));
      cand.filter((p) => p.style === "ballHunter" && len(p.x - ball.x, p.y - ball.y) < 20).forEach((p) => pressers.add(p.idx));
    }
    // 先の約束：次のキーの選手・競る相手は、早めにその場所へ向かう（この区間のキーだけ）
    const cur = this.pending >= 0 ? this.pending : this.ki;
    for (let j = cur; j < Math.min(this.keyLimit, cur + 12); j++) {
      const nk = keys[j];
      if (nk.start) break;
      const setp = SET_PIECES.has(nk.type);
      if (nk.t - t >= (setp ? MOVE.lookahead.setPiece : MOVE.lookahead.play)) continue;
      if (j > cur + MOVE.lookahead.keys && !setp) continue;
      const who = atActor(nk.type);
      const r = this.actorIdx(nk, who);
      // 間のキーに出てくる選手は、そちらを先に（あとのキーの約束は、間のキーが済んでから）
      let busy = false;
      for (let q = cur; q < j && !busy; q++) busy = keys[q].actors.includes(this.players[r]?.id ?? "");
      if (busy && !setp) continue;
      const spot = nk.type === "corner" ? { x: nk.ball.x < PW / 2 ? -0.2 : PW + 0.2, y: yOf(this.attackTeam(nk), 1.005) } : setp ? this.behindBall(nk.ball, this.attackTeam(nk)) : nk.ball;
      if (r >= 0 && r !== ballOwnerNow && (!this.appts.has(r) || (setp && this.appts.get(r)!.t < t))) this.appts.set(r, { t: nk.t, at: spot, set: setp || undefined });
      const o2 = DUELS.has(nk.type) ? this.actorIdx(nk, who === "main" ? "other" : "main") : -1;
      if (o2 >= 0 && o2 !== ballOwnerNow && !this.appts.has(o2)) {
        const g = ownGoal(this.players[o2].side);
        const dx = g.x - nk.ball.x,
          dy = g.y - nk.ball.y;
        const dd = len(dx, dy) || 1;
        this.appts.set(o2, { t: nk.t, at: clampV({ x: nk.ball.x + (dx / dd) * 1.6, y: nk.ball.y + (dy / dd) * 1.6 }) });
      }
    }
    let setSoon: SimKey | undefined;
    for (let j = cur; j < Math.min(this.keyLimit, cur + 3); j++) {
      const nk = keys[j];
      // まだ起きていないセットプレー（蹴る人を待っている間も）
      if (SET_PIECES.has(nk.type) && nk.t - t < MOVE.lookahead.cornerGather) {
        setSoon = nk;
        break;
      }
    }
    if (!setSoon && this.setHold && t < this.setHold.t1) setSoon = this.setHold.k;
    const kickoffSetup = this.restart?.type === "kickoff" || this.restart?.type === "kickoffGo" || (this.joy !== null && t >= this.joy.t1);
    const tr = this.trans && t < this.trans.t1 && possSide === this.trans.side ? this.trans : null;
    if (this.trans && !tr) this.trans = null;
    if (this.joy && t > this.joy.t1 + 1.5) this.joy = null;
    const U = MOVE.urgency;
    const wants: { p: Pl; tgt: V; urg: number; vm: number }[] = [];
    for (const side of [0, 1] as Side[])
      for (const x of this.rosters[side].ids) {
        const p = this.players[x.idx];
        let tgt: V;
        let urg: number = U.idle;
        const ap = this.appts.get(p.idx);
        const vm = this.vmax(p, t);
        if (p.idx === ballOwnerNow && carried) {
          // ボールを運ぶ：行き先へ、着く時刻に合わせた速さで（止まるプレーはその場で）
          if (leg.kind === "hold") {
            tgt = { x: p.x, y: p.y };
            urg = 0.4;
          } else {
            const ah = MOVE.carry.ahead;
            const dx = leg.to.x - leg.from.x,
              dy = leg.to.y - leg.from.y;
            const dl = len(dx, dy) || 1;
            tgt = { x: leg.to.x - (dx / dl) * ah, y: leg.to.y - (dy / dl) * ah };
            const left = Math.max(STEP, leg.t1 - t);
            const need = len(tgt.x - p.x, tgt.y - p.y) / left;
            urg = Math.max(0.35, Math.min(1, (need / vm) * 1.1));
          }
        } else if (p.idx === ballOwnerNow && t < leg.t0) {
          tgt = this.behindBall(leg.from, p.side, 0.8);
          urg = 1;
        } else if (this.joy && t < this.joy.t1 && p.side === this.joy.side && !p.gk && len(p.x - this.players[this.joy.idx].x, p.y - this.players[this.joy.idx].y) < 30) {
          // ゴールの喜び：得点者に寄る
          const sc = this.players[this.joy.idx];
          tgt = p.idx === this.joy.idx ? { x: sc.x, y: sc.y } : { x: sc.x, y: sc.y };
          urg = 0.9;
        } else if (kickoffSetup) {
          tgt = this.anchor(p, t, true);
          urg = 0.8;
          if (ap) tgt = ap.at;
        } else {
          // 切り替えで奪った側は、ボールより前へ押し上げる
          const push = tr && !setSoon && p.side === tr.side ? MOVE.transition.pushUp : 0;
          tgt = setSoon ? this.setPieceSpot(p, setSoon) : this.anchor(p, t, false, undefined, push);
          if (setSoon) urg = U.setPiece;
          const inTr = tr && !setSoon;
          if (inTr && tr.runners.includes(p.idx)) {
            // 切り替え：奪った側の 2〜3 人が前へ走ってボールを追い越す
            const T = MOVE.transition;
            const ri = tr.runners.indexOf(p.idx);
            const lane = [0.28, 0.72, 0.5][ri] ?? 0.5;
            const bd = depthOf(p.side, ball.y);
            const lim = Math.max(0.6, this.oppDfDepth(p.side) + (p.style === "speedster" ? T.beatLine + 0.04 : T.beatLine));
            const d = Math.min(0.93, lim, Math.max(depthOf(p.side, tgt.y), depthOf(p.side, p.y) + T.runPast / PL, bd + T.runAhead / PL + 0.03 * ri));
            tgt = { x: xOf(p.side, lane), y: yOf(p.side, d) };
            urg = 1;
          } else if (inTr && tr.recover.has(p.idx)) {
            // 切り替え：奪われた側の近くの選手は全力で自陣へ戻る（ボールよりゴールの側へ）
            const a = this.anchor(p, t, false, false);
            const bd = depthOf(p.side, ball.y);
            const d = Math.min(depthOf(p.side, a.y) - 0.04, bd - 0.05, depthOf(p.side, p.y) - MOVE.transition.dropBack / PL);
            tgt = { x: a.x, y: yOf(p.side, Math.max(0.04, d)) };
            urg = 1;
          } else if (!setSoon && p.side !== possSide && !p.gk) {
            if (pressers.has(p.idx)) {
              const g = ownGoal(p.side);
              const dx = g.x - ball.x,
                dy = g.y - ball.y;
              const d = len(dx, dy) || 1;
              tgt = { x: ball.x + (dx / d) * 1.4, y: ball.y + (dy / d) * 1.4 };
              urg = U.press;
            } else {
              // 近くの相手をマークする（ゴール側に立つ）。ボールを持つ相手とのあいだ（パスのコース）にも寄る
              let near: Pl | undefined;
              let nd = 13;
              for (const y of this.rosters[other(p.side)].ids) {
                const o = this.players[y.idx];
                if (o.gk) continue;
                const d = len(o.x - tgt.x, o.y - tgt.y);
                if (d < nd) {
                  nd = d;
                  near = o;
                }
              }
              if (near) {
                const g = ownGoal(p.side);
                const dx = g.x - near.x,
                  dy = g.y - near.y;
                const d = len(dx, dy) || 1;
                const lane = { x: near.x + (ball.x - near.x) * 0.25, y: near.y + (ball.y - near.y) * 0.25 };
                const m = { x: lane.x + (dx / d) * 2.2, y: lane.y + (dy / d) * 2.2 };
                const w = p.style === "stopper" ? 0.75 : 0.55;
                tgt = { x: tgt.x + (m.x - tgt.x) * w, y: tgt.y + (m.y - tgt.y) * w };
              }
            }
          }
          if (ap) {
            const left = Math.max(0, ap.t - t);
            const dAp = len(ap.at.x - p.x, ap.at.y - p.y);
            // セットプレーで蹴る人は、余裕を多めにみる（遠くから来ることが多い）
            const A = ap.set ? MOVE.appointment.setPiece : MOVE.appointment.play;
            if (dAp > vm * A.go * left - 1.5 || left < 0.12) {
              tgt = ap.at;
              urg = 1;
            } else {
              // 約束に間に合う範囲で、ふだんの動き
              const lim = Math.max(0, vm * A.keep * left - 2);
              const dx = tgt.x - ap.at.x,
                dy = tgt.y - ap.at.y;
              const d = len(dx, dy);
              if (d > lim) tgt = { x: ap.at.x + (dx / (d || 1)) * lim, y: ap.at.y + (dy / (d || 1)) * lim };
              urg = Math.max(urg, U.appointment);
            }
          }
        }
        wants.push({ p, tgt, urg, vm });
      }
    // 出ていく選手（交代・ケガ・退場）はベンチの側のタッチラインへ歩く
    for (const p of this.players)
      if (p.on && !p.active) {
        const exitX = this.benchX < PW / 2 ? -1.2 : PW + 1.2;
        wants.push({ p, tgt: { x: exitX, y: Math.max(PL / 2 - 12, Math.min(PL / 2 + 12, p.y)) }, urg: 0.5, vm: this.vmax(p, t) });
      }

    // ---- 動かす ----
    this.move(wants, ballOwnerNow, s, reset);
    if (carried && this.players[leg.carrier].active) {
      // 運ぶボール：選手の足もと（進む向きの少し前。止まっているときは攻める向き）
      const c = this.players[leg.carrier];
      const sp = len(c.vx, c.vy);
      const ah = MOVE.carry.ahead;
      const fx = sp > 3 ? c.vx / sp : 0,
        fy = sp > 3 ? c.vy / sp : c.side === 0 ? -1 : 1;
      this.ball = { x: c.x + fx * ah, y: c.y + fy * ah };
    }
    for (const p of this.players)
      if (p.on && !p.active && (p.x < -1 || p.x > PW + 1)) {
        p.on = false;
      }

    const ownerRec = ballOwnerNow >= 0 ? ballOwnerNow : leg.receiver >= 0 && t > leg.t1 - 0.05 ? leg.receiver : this.owner;
    this.record(s, ownerRec);
  }

  /** 最後の 1 本：受ける選手の来る所へ、ボールの着く所を少しずつ寄せる（元の場所から 6m まで） */
  private homing(t: number) {
    if (this.pending < 0) return;
    const leg = this.leg;
    if (leg.receiver < 0 || leg.kind === "dribble" || leg.kind === "dead" || t >= leg.t1) return;
    const r = this.players[leg.receiver];
    const left = leg.t1 - t;
    const pred = { x: r.x + r.vx * left * 0.5, y: r.y + r.vy * left * 0.5 };
    const k = this.schedule.keys[this.pending];
    const dx = pred.x - leg.to.x,
      dy = pred.y - leg.to.y;
    const nx = leg.to.x + dx * 0.15,
      ny = leg.to.y + dy * 0.15;
    const ox = nx - k.ball.x,
      oy = ny - k.ball.y;
    const od = len(ox, oy);
    const lim = 6;
    leg.to = clampV(od > lim ? { x: k.ball.x + (ox / od) * lim, y: k.ball.y + (oy / od) * lim } : { x: nx, y: ny }, 0.3);
  }

  /** プレーしている選手の入れ替わり（交代・ケガ・退場・フォーメーションの変更） */
  private updateRosters(t: number, s: number, reset: boolean) {
    const seg = segmentOfTime(t);
    const out = new Set<string>();
    for (const o of this.outs) if (o.seg <= seg && o.t <= t) out.add(o.id);
    for (const side of [0, 1] as Side[]) {
      const shape = shapeBefore(this.ms.teams[side], t > 0 ? t : 1e-9);
      const prev = this.rosters[side];
      if (!reset && prev.sig === shape && prev.outs === out.size) continue;
      const slots = FORMATIONS[shape.formation];
      const ids: Roster["ids"] = [];
      shape.onPitch.forEach((id, i) => {
        const p = this.byId.get(id);
        if (!p || !slots[i] || out.has(id)) return;
        ids.push({ idx: p.idx, slot: i });
      });
      const now = new Set(ids.map((x) => x.idx));
      for (const p of this.players) {
        if (p.side !== side) continue;
        const want = now.has(p.idx);
        if (want && !p.active) {
          p.active = true;
          if (!p.on) {
            p.on = true;
            if (s === 0 || reset) {
              p.x = PW / 2;
              p.y = PL / 2;
            } else {
              // 交代で入る：ベンチの前のタッチラインから（ほかの選手と重ならない所）
              p.x = this.benchX;
              p.y = this.freeSpotOnLine(p.side);
            }
            p.vx = 0;
            p.vy = 0;
          }
        } else if (!want && p.active) {
          p.active = false;
          if (this.owner === p.idx) this.owner = -1;
          this.appts.delete(p.idx);
        }
        if (!want && reset && p.on) p.on = false;
      }
      for (const x of ids) {
        const p = this.players[x.idx];
        p.slot = x.slot;
        p.gk = slots[x.slot].line === "GK";
      }
      const onIdx = ids.map((x) => x.slot);
      const lat: number[] = [];
      for (const x of ids) lat[x.slot] = baseLat(slots, x.slot, onIdx);
      this.rosters[side] = { slots, ids, lat, sig: shape, outs: out.size };
    }
  }

  private freeSpotOnLine(side: Side): number {
    const base = PL / 2 + (side === 0 ? 6 : -6);
    for (let k = 0; k < 20; k++) {
      const y = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 4;
      if (this.players.every((q) => !q.on || len(q.x - this.benchX, q.y - y) > MOVE.separation.sepTeam + 0.4)) return y;
    }
    return base;
  }

  /** 速さと加速の上限つきで動かし、味方どうしの間隔を必ずあける */
  private move(wants: { p: Pl; tgt: V; urg: number; vm: number }[], ownerNow: number, s: number, reset: boolean) {
    const S = MOVE.separation;
    const acc = mps(MOVE.accel) * MOVE.secondsPerMinute * STEP;
    const n = wants.length;
    const nx = new Float64Array(n),
      ny = new Float64Array(n);
    // 1) ほかの選手から離れる向きを、行きたい場所に足す（味方は広めに）
    for (let i = 0; i < n; i++) {
      const w = wants[i];
      const p = w.p;
      let tx = w.tgt.x,
        ty = w.tgt.y;
      const gx = w.tgt.x - p.x,
        gy = w.tgt.y - p.y;
      const gl = len(gx, gy);
      const ux = gl > 1e-6 ? gx / gl : 0,
        uy = gl > 1e-6 ? gy / gl : 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const q = wants[j].p;
        const dx = p.x - q.x,
          dy = p.y - q.y;
        const d = len(dx, dy);
        const contest = p.idx === ownerNow || q.idx === ownerNow || this.appts.has(p.idx);
        const R = q.side === p.side ? S.steerTeam : contest ? S.duel : S.sepOpp;
        if (d < R && d > 1e-3) {
          const k = q.side === p.side ? 1.2 : 1.5;
          tx += (dx / d) * (R - d) * k;
          ty += (dy / d) * (R - d) * k;
          // 行く手にいる人は、横へよけて回り込む（まっすぐ押し返されて止まらないように）
          const ahead = -(dx * ux + dy * uy) / d;
          if (ahead > 0.4 && gl > 2) {
            const side = dx * uy - dy * ux >= 0 ? 1 : -1;
            tx += uy * side * (R - d) * S.sidestep;
            ty += -ux * side * (R - d) * S.sidestep;
          }
        }
      }
      if (p.active) {
        const c = clampV({ x: tx, y: ty }, -MOVE.outside);
        tx = c.x;
        ty = c.y;
      }
      // 2) 速さの上限と、加速の上限
      const cap = w.vm * w.urg;
      let dvx = tx - p.x,
        dvy = ty - p.y;
      const dist = len(dvx, dvy);
      const want = Math.min(cap, dist / 0.06);
      let wx = dist > 1e-6 ? (dvx / dist) * want : 0,
        wy = dist > 1e-6 ? (dvy / dist) * want : 0;
      dvx = wx - p.vx;
      dvy = wy - p.vy;
      const dv = len(dvx, dvy);
      // 止まる・向きを変えるときは、走り出すときより強く（減速の上限）
      const a = dvx * p.vx + dvy * p.vy < 0 ? acc * MOVE.decel : acc;
      if (dv > a) {
        wx = p.vx + (dvx / dv) * a;
        wy = p.vy + (dvy / dv) * a;
      }
      const sp = len(wx, wy);
      if (sp > w.vm) {
        wx *= w.vm / sp;
        wy *= w.vm / sp;
      }
      nx[i] = p.x + wx * STEP;
      ny[i] = p.y + wy * STEP;
    }
    // 3) 味方どうしの間隔を必ずあける（重なった分を押し分け、1 歩で動ける距離に収める。何度か繰り返す）
    const ox = wants.map((w) => w.p.x),
      oy = wants.map((w) => w.p.y);
    const lim = wants.map((w) => w.vm * STEP);
    const fixed = wants.map((w) => w.p.idx === ownerNow);
    for (let it = 0; it < 8; it++) {
      let moved = false;
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = wants[i].p,
            b = wants[j].p;
          if (a.side !== b.side) continue;
          const dx = nx[i] - nx[j],
            dy = ny[i] - ny[j];
          const d = len(dx, dy);
          const need = S.sepTeam;
          if (d >= need) continue;
          moved = true;
          const ux = d > 1e-6 ? dx / d : 1,
            uy = d > 1e-6 ? dy / d : 0;
          const push = need - d + 1e-3;
          // ボールを持つ人は動かさず、相手が避ける
          const wi = fixed[i] ? 0 : fixed[j] ? 1 : 0.5,
            wj = 1 - wi;
          nx[i] += ux * push * wi;
          ny[i] += uy * push * wi;
          nx[j] -= ux * push * wj;
          ny[j] -= uy * push * wj;
        }
      for (let i = 0; i < n; i++) {
        if (!reset) {
          const dx = nx[i] - ox[i],
            dy = ny[i] - oy[i];
          const d = len(dx, dy);
          if (d > lim[i]) {
            nx[i] = ox[i] + (dx / d) * lim[i];
            ny[i] = oy[i] + (dy / d) * lim[i];
          }
        }
        // ピッチの外へは、決めた所までしか出ない（出ていく選手は横へだけ出てよい）
        const mx = wants[i].p.active ? MOVE.outside : MOVE.outside + 1;
        nx[i] = Math.max(-mx, Math.min(PW + mx, nx[i]));
        ny[i] = Math.max(-MOVE.outside, Math.min(PL + MOVE.outside, ny[i]));
      }
      if (!moved) break;
    }
    for (let i = 0; i < n; i++) {
      const p = wants[i].p;
      const vx = (nx[i] - p.x) / STEP,
        vy = (ny[i] - p.y) / STEP;
      if (!reset && !this.resets.has(s)) this.maxSpeedRatio = Math.max(this.maxSpeedRatio, len(vx, vy) / wants[i].vm);
      p.vx = vx;
      p.vy = vy;
      p.x = nx[i];
      p.y = ny[i];
    }
  }

  /** 並び直しのとき：重なりを置き直す（速さの上限は見ない） */
  private separate(teleport: boolean) {
    if (!teleport) return;
    const S = MOVE.separation;
    for (let it = 0; it < 20; it++) {
      let moved = false;
      for (const side of [0, 1] as Side[]) {
        const ps = this.rosters[side].ids.map((x) => this.players[x.idx]);
        for (let i = 0; i < ps.length; i++)
          for (let j = i + 1; j < ps.length; j++) {
            const a = ps[i],
              b = ps[j];
            const dx = a.x - b.x,
              dy = a.y - b.y;
            const d = len(dx, dy);
            if (d >= S.sepTeam) continue;
            moved = true;
            const ux = d > 1e-6 ? dx / d : 1,
              uy = d > 1e-6 ? dy / d : 0;
            const push = (S.sepTeam - d) / 2 + 1e-3;
            a.x += ux * push;
            a.y += uy * push;
            b.x -= ux * push;
            b.y -= uy * push;
          }
      }
      if (!moved) break;
    }
  }
}

/** 試合ごとに 1 つ（2D と 3D を切り替えても作り直さない） */
const cache = new WeakMap<MatchState, ReplaySim>();
export function replayFor(ms: MatchState): ReplaySim {
  let sim = cache.get(ms);
  if (!sim) {
    sim = new ReplaySim(ms);
    cache.set(ms, sim);
  }
  return sim;
}
