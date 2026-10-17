/**
 * モーションの台本（SPEC 10.8・19章）：選手とボールの動き（sim.ts）が起こしたイベントと、蹴った・投げた記録から、
 * 3D で「誰が・いつ・どの動きをするか」と、カメラ・観客の盛り上がりを決める。表示（src/view3d）はこれを再生するだけ。
 * ボールの位置と高さは動き（sim.ts）が決める。試合の結果には関わらず、乱数も使わない（イベントの番号から決まった値で散らす）。
 */
import { FORMATIONS } from "../config/formations";
import { MOTION_TIMING } from "../config/replay";
import type { DribbleMove } from "../types";
import type { MatchEventType, MatchState, Side } from "../match/types";
import { shapeAt } from ".";
import type { Fired, Kick, Leg, LegKind, ReplaySim } from "./sim";

/** モーションの種類（4a で姿勢を作るもの、4b で作るものを含めたすべて） */
export type MotionId = keyof typeof MOTION_TIMING.dur;
export type Expr = "normal" | "focus" | "joy" | "sad" | "pain";
export type CameraShot = "follow" | "wide" | "near" | "box" | "corner" | "goal" | "pk";
/** 観客：0 ふだん、1 立ち上がる（決定機）、2 大きく跳ねる（ゴール） */
export type CrowdLevel = 0 | 1 | 2;
/** ボールの運び方：地面を転がる・浮き球・シュート・頭の高さで触れる・GK が高い所で取る */
export type BallArc = "ground" | "air" | "lofted" | "shot" | "head" | "gkHigh";

/** 動きをする人：主役（players[0]）、相手（players[1]）、そのイベントの側の相手チームの GK、主審 */
type Role = "main" | "other" | "oppGk" | "referee";

interface CueSpec {
  who: Role;
  motion: MotionId;
  /** イベントの時刻からずらす秒数（等速） */
  delay?: number;
  expr?: Expr;
}

export interface EventMotion {
  /** そのイベントでボールを持つ（受けて、次へ出す）人。none はだれも持たない */
  holder: "main" | "other" | "none";
  /** ボールがこのイベントの位置へ来るときの運び方（前のイベントの out が優先） */
  in?: BallArc;
  /** このイベントの位置からボールが出ていくときの運び方と、出す人の動き（kick: null は動きなし。頭で触れた後など） */
  out?: { arc?: BallArc; kick: MotionId | null };
  /** ボールを受ける動き（無ければ、浮き球は胸、それ以外は足でトラップ） */
  receive?: MotionId | null;
  /** そのほかの動き */
  cues?: CueSpec[];
  /** 主役の表情（4b で顔に反映） */
  expr?: Expr;
  camera: CameraShot;
  crowd: CrowdLevel;
}

const none = (camera: CameraShot = "follow"): EventMotion => ({ holder: "none", camera, crowd: 0 });

/**
 * イベントの種類 → 動き（計画 4.2 の表）。Record にしてあるので、イベントの種類が増えると型のエラーで気づける。
 * 4b の動き（タックル・転倒・喜ぶなど）もここで決めておき、表示の側で姿勢ができたものから再生する
 */
export const EVENT_MOTIONS: Record<MatchEventType, EventMotion> = {
  kickoff: none("wide"),
  halfTime: none("wide"),
  secondHalf: none("wide"),
  fullTime: { holder: "none", camera: "wide", crowd: 1 },
  extraTime: none("wide"),
  extraSecondHalf: none("wide"),
  pkShootout: none("pk"),
  pass: { holder: "main", out: { kick: "pass" }, camera: "follow", crowd: 0 },
  throughBall: { holder: "main", out: { kick: "pass" }, camera: "follow", crowd: 0 },
  passBlocked: { holder: "other", receive: "tackle", camera: "follow", crowd: 0 },
  noOption: { holder: "main", cues: [{ who: "main", motion: "turnBack", delay: 0.3 }], camera: "follow", crowd: 0 },
  dribble: {
    holder: "main",
    cues: [
      { who: "main", motion: "dribbleMove" },
      { who: "other", motion: "tackle", delay: 0.1 },
    ],
    expr: "focus",
    camera: "follow",
    crowd: 0,
  },
  dribbleFail: { holder: "other", cues: [{ who: "main", motion: "dribbleMove" }], receive: "tackle", camera: "follow", crowd: 0 },
  counter: { holder: "main", expr: "focus", camera: "follow", crowd: 1 },
  oneOnOne: { holder: "main", cues: [{ who: "other", motion: "gkDive", delay: 99 }], expr: "focus", camera: "near", crowd: 1 },
  gkRush: { holder: "main", receive: "gkRush", cues: [{ who: "other", motion: "fall", delay: 0.2 }], camera: "near", crowd: 1 },
  cross: { holder: "main", out: { arc: "lofted", kick: "cross" }, camera: "box", crowd: 1 },
  header: { holder: "main", in: "head", receive: "header", out: { arc: "shot", kick: null }, cues: [{ who: "other", motion: "header" }], camera: "near", crowd: 1 },
  crossCleared: { holder: "main", in: "head", receive: "header", out: { arc: "air", kick: null }, camera: "box", crowd: 0 },
  gkClaim: { holder: "main", in: "gkHigh", receive: "gkHighCatch", out: { kick: "gkKick", arc: "air" }, camera: "box", crowd: 0 },
  fumble: { holder: "none", in: "gkHigh", cues: [{ who: "main", motion: "gkPunch" }], camera: "box", crowd: 1 },
  longBall: { holder: "other", in: "air", camera: "follow", crowd: 0 },
  switchPlay: { holder: "other", in: "air", camera: "follow", crowd: 0 },
  longBallShort: { holder: "none", in: "air", camera: "follow", crowd: 0 },
  longBallLost: { holder: "none", in: "air", camera: "follow", crowd: 0 },
  buildUpError: { holder: "main", receive: "tackle", cues: [{ who: "other", motion: "headInHands", delay: 0.4, expr: "sad" }], camera: "near", crowd: 1 },
  setPiece: { holder: "main", out: { arc: "lofted", kick: "setKick" }, camera: "box", crowd: 0 },
  corner: { holder: "main", out: { arc: "lofted", kick: "setKick" }, camera: "corner", crowd: 1 },
  freeKick: { holder: "main", out: { arc: "ground", kick: "setKick" }, camera: "near", crowd: 1 },
  longThrow: { holder: "main", out: { arc: "lofted", kick: "throwIn" }, camera: "box", crowd: 0 },
  shot: { holder: "main", out: { arc: "shot", kick: "shot" }, cues: [{ who: "oppGk", motion: "gkCatch", delay: 99 }], expr: "focus", camera: "near", crowd: 1 },
  block: { holder: "main", in: "shot", receive: "block", camera: "near", crowd: 1 },
  miss: { holder: "none", in: "shot", cues: [{ who: "main", motion: "headInHands", delay: 0.2, expr: "sad" }], camera: "near", crowd: 1 },
  save: { holder: "main", in: "shot", receive: "gkDive", out: { kick: "gkKick", arc: "air" }, camera: "near", crowd: 1 },
  catch: { holder: "main", in: "shot", receive: "gkCatch", out: { kick: "gkKick", arc: "air" }, camera: "near", crowd: 1 },
  parry: { holder: "none", in: "shot", cues: [{ who: "main", motion: "gkDive" }], camera: "near", crowd: 1 },
  rebound: { holder: "main", camera: "near", crowd: 1 },
  goal: {
    holder: "none",
    in: "shot",
    cues: [
      { who: "oppGk", motion: "gkDive" },
      { who: "main", motion: "celebrate", delay: 0.3, expr: "joy" },
    ],
    expr: "joy",
    camera: "goal",
    crowd: 2,
  },
  pkAwarded: {
    holder: "main",
    cues: [
      { who: "main", motion: "fall" },
      { who: "other", motion: "handUp", delay: 0.5 },
    ],
    expr: "pain",
    camera: "near",
    crowd: 1,
  },
  pkGoal: {
    holder: "none",
    in: "shot",
    cues: [
      { who: "oppGk", motion: "gkDive" },
      { who: "main", motion: "celebrate", delay: 0.3, expr: "joy" },
    ],
    expr: "joy",
    camera: "goal",
    crowd: 2,
  },
  pkMiss: { holder: "none", in: "shot", cues: [{ who: "main", motion: "headInHands", delay: 0.2, expr: "sad" }], expr: "sad", camera: "near", crowd: 1 },
  pkSaved: { holder: "main", in: "shot", receive: "gkDive", cues: [{ who: "other", motion: "headInHands", delay: 0.4, expr: "sad" }], camera: "near", crowd: 1 },
  sub: none(),
  tactics: none(),
  formation: none(),
  position: none(),
  note: none(),
  shortHanded: none(),
  foul: {
    holder: "none",
    cues: [
      { who: "main", motion: "tackle" },
      { who: "other", motion: "fall", delay: 0.1, expr: "pain" },
    ],
    camera: "follow",
    crowd: 0,
  },
  yellow: {
    holder: "none",
    cues: [
      { who: "referee", motion: "cardShown" },
      { who: "main", motion: "bowHead", delay: 0.2 },
    ],
    expr: "sad",
    camera: "follow",
    crowd: 0,
  },
  secondYellow: {
    holder: "none",
    cues: [
      { who: "referee", motion: "cardShown" },
      { who: "main", motion: "bowHead", delay: 0.2 },
    ],
    expr: "sad",
    camera: "follow",
    crowd: 1,
  },
  red: {
    holder: "none",
    cues: [
      { who: "referee", motion: "cardShown" },
      { who: "main", motion: "bowHead", delay: 0.2 },
    ],
    expr: "sad",
    camera: "follow",
    crowd: 1,
  },
  injury: { holder: "none", cues: [{ who: "main", motion: "hurt" }], expr: "pain", camera: "follow", crowd: 0 },
};

/** 台本の 1 つの動き */
export interface Cue {
  /** 動きの始まり（試合時間の分） */
  t: number;
  /** 選手の ID（主審は REFEREE_ID） */
  id: string;
  motion: MotionId;
  /** 長さ（試合時間の分） */
  dur: number;
  /** ドリブルの技・横へ跳ぶ向き（-1 左・1 右）など */
  variant?: DribbleMove | "left" | "right" | "high";
  expr?: Expr;
  /** 元のイベントの番号（つなぎのプレーは -1） */
  event: number;
}

/** カメラ・観客の切り替え（その時刻から次の切り替えまで） */
export interface Shot {
  t: number;
  camera: CameraShot;
  crowd: CrowdLevel;
  event: number;
}

export const REFEREE_ID = "@referee";

/** 決まった散らばり（-1〜1。replay の jitter と同じ作り方で、別の系列） */
function hash(i: number, k: number): number {
  const v = Math.sin(i * 91.345 + k * 47.853) * 24634.6345;
  return (v - Math.floor(v)) * 2 - 1;
}

const minutes = (motion: MotionId) => MOTION_TIMING.dur[motion] * MOTION_TIMING.minutesPerSecond;
const contactOf = (motion: MotionId) => (MOTION_TIMING.contact as Partial<Record<MotionId, number>>)[motion] ?? 0;

/** その時刻にピッチにいる GK の ID */
export function gkAt(ms: MatchState, side: Side, t: number): string | undefined {
  const shape = shapeAt(ms.teams[side], t);
  const slots = FORMATIONS[shape.formation];
  const i = slots.findIndex((s) => s.line === "GK");
  return i >= 0 ? shape.onPitch[i] : undefined;
}

/** 蹴り方 → 蹴る動き */
const KICK_OF: Record<LegKind, MotionId | null> = { pass: "pass", air: "longKick", lofted: "cross", shot: "shot", throw: "throwIn", dribble: null, hold: null, dead: null };

/**
 * 台本（1 試合分）。sync を呼ぶと、動きが進んだ分（起きたイベント・蹴った記録・着いたパス）を取り込む。
 * 動きは同じ試合なら同じなので、台本も同じになる
 */
export class MotionScript {
  readonly cues: Cue[] = [];
  readonly shots: Shot[] = [];
  private nf = 0;
  private nk = 0;
  private nl = 0;
  /** イベントで受けた人の、次に出すときの動き（ヘディングの後は動きなし、GK はキック） */
  private outOf = new Map<string, MotionId | null>();
  /** イベントで受けた時刻（同じ時刻に着くつなぎのパスでは、トラップの動きを重ねない） */
  private keyRecv = new Map<string, number>();

  constructor(private sim: ReplaySim) {}

  private push(cue: Omit<Cue, "dur">) {
    const c = { ...cue, dur: minutes(cue.motion) };
    const cues = this.cues;
    let i = cues.length;
    while (i > 0 && cues[i - 1].t > c.t) i--;
    cues.splice(i, 0, c);
  }

  sync() {
    const sim = this.sim;
    const done = sim.steps * sim.stepMinutes;
    // 起きたイベント・蹴った記録・着いたパスを、時刻の順に取り込む（同じ時刻はイベントが先）
    for (;;) {
      const f = this.nf < sim.fired.length ? sim.fired[this.nf] : undefined;
      const k = this.nk < sim.kicks.length ? sim.kicks[this.nk] : undefined;
      const l = this.nl < sim.legs.length && sim.legs[this.nl].t1 < done ? sim.legs[this.nl] : undefined;
      const tf = f ? f.t : Infinity,
        tk = k ? k.t : Infinity,
        tl = l ? l.t1 : Infinity;
      if (tf === Infinity && tk === Infinity && tl === Infinity) break;
      if (tf <= tk && tf <= tl) {
        this.nf++;
        this.onFired(f!);
      } else if (tk <= tl) {
        this.nk++;
        this.onKick(k!);
      } else {
        this.nl++;
        this.onLeg(l!);
      }
    }
  }

  /** イベントが起きた：受ける動き・そのほかの動き・カメラ */
  private onFired(f: Fired) {
    const sim = this.sim;
    const ms = sim.ms;
    const key = f.key;
    const em = EVENT_MOTIONS[key.type];
    const e = ms.events[key.index];
    const t = f.t;
    this.shots.push({ t, camera: em.camera, crowd: em.crowd, event: key.index });
    const roleId = (who: Role): string | undefined => {
      if (who === "main") return key.actors[0];
      if (who === "other") return key.actors[1];
      if (who === "referee") return REFEREE_ID;
      return gkAt(ms, key.side === 0 ? 1 : 0, t);
    };
    const holder = em.holder === "none" ? undefined : key.actors[em.holder === "main" ? 0 : 1];
    const diveSide = (): "left" | "right" => (hash(key.index, 5) < 0 ? "left" : "right");
    // ボールを受ける動き（浮き球は胸、それ以外は足でトラップ）
    const leg = sim.legAt(t - 1e-6, 0);
    const high = leg && (leg.kind === "air" || leg.kind === "lofted");
    const recv = em.receive === undefined ? (high ? "chestTrap" : "trap") : em.receive;
    if (holder && recv && !key.start) {
      const variant = recv === "gkDive" || recv === "gkCatch" ? (recv === "gkCatch" && hash(key.index, 6) > 0.2 ? undefined : diveSide()) : undefined;
      this.push({ t: t - contactOf(recv) * minutes(recv), id: holder, motion: recv, variant, event: key.index });
      this.keyRecv.set(holder, t);
    }
    this.outOf.clear();
    if (holder && em.out) this.outOf.set(holder, em.out.kick);
    // そのほかの動き（GK が跳ぶ・取るは、その GK のイベントで動く）
    for (const c of em.cues ?? []) {
      if (c.delay === 99) continue;
      const id = roleId(c.who);
      if (!id) continue;
      const motion = c.motion;
      let ct = t + (c.delay ?? 0) * MOTION_TIMING.minutesPerSecond;
      if (motion === "gkDive" || motion === "gkPunch") ct = t - contactOf(motion) * minutes(motion);
      const variant = motion === "dribbleMove" ? (e?.move ?? "chopTouch") : motion === "gkDive" ? diveSide() : undefined;
      // ドリブルで止められたとき：ゴール前・サイドの深い所ではスライディング（決まった値で 3 回に 1 回ほど）
      if (key.type === "dribbleFail" && motion === "tackle" && e?.lane !== "C" && hash(key.index, 8) > 0.33) {
        this.push({ t: t - contactOf("slide") * minutes("slide"), id, motion: "slide", event: key.index });
        continue;
      }
      this.push({ t: ct, id, motion, variant, expr: c.expr, event: key.index });
    }
    if (key.type === "dribbleFail" && holder && recv === "tackle" && e?.lane !== "C" && hash(key.index, 8) > 0.33) {
      // 受ける動き（タックル）をスライディングに
      const i = this.cues.findIndex((c) => c.id === holder && c.event === key.index && c.motion === "tackle");
      if (i >= 0) {
        const [c] = this.cues.splice(i, 1);
        this.push({ ...c, motion: "slide", t: t - contactOf("slide") * minutes("slide") });
      }
    }
  }

  /** 蹴った・投げた */
  private onKick(k: Kick) {
    if (k.head) return;
    let motion: MotionId | null = k.set ?? KICK_OF[k.kind];
    if (this.outOf.has(k.id)) {
      const o = this.outOf.get(k.id)!;
      this.outOf.delete(k.id);
      if (!k.set) motion = o === "pass" ? motion : o;
    }
    if (motion) this.push({ t: k.t - contactOf(motion) * minutes(motion), id: k.id, motion, event: -1 });
  }

  /** 着いたパス（つなぎのプレー）：受ける人のトラップ */
  private onLeg(l: Leg) {
    const sim = this.sim;
    if (l.receiver < 0 || l.kind === "shot") return;
    const id = sim.players[l.receiver].id;
    const kt = this.keyRecv.get(id);
    if (kt !== undefined && Math.abs(kt - l.t1) < 0.03) return;
    const motion: MotionId = l.kind === "air" || l.kind === "lofted" ? "chestTrap" : "trap";
    this.push({ t: l.t1 - contactOf(motion) * minutes(motion), id, motion, event: -1 });
  }
}

/** 試合ごとに 1 つ */
const scripts = new WeakMap<ReplaySim, MotionScript>();
export function scriptFor(sim: ReplaySim): MotionScript {
  let s = scripts.get(sim);
  if (!s) {
    s = new MotionScript(sim);
    scripts.set(sim, s);
  }
  s.sync();
  return s;
}

/** 時刻 t のカメラ・観客（直前の切り替え） */
export function shotAt(script: MotionScript, t: number): Shot | undefined {
  const sh = script.shots;
  let lo = 0,
    hi = sh.length - 1,
    k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sh[mid].t <= t) {
      k = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return k >= 0 ? sh[k] : undefined;
}

/** 時刻 t に動いている選手の動き（同じ選手に重なれば後から始まった方） */
export function activeCues(script: MotionScript, t: number, out: Map<string, Cue>): Map<string, Cue> {
  out.clear();
  const cues = script.cues;
  // 一番長い動き（喜ぶ 3 秒）より前に始まった動きは、もう終わっている
  const longest = MOTION_TIMING.dur.celebrate * MOTION_TIMING.minutesPerSecond;
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].t < t - longest) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < cues.length && cues[i].t <= t; i++) {
    const c = cues[i];
    if (t < c.t + c.dur) out.set(c.id, c);
  }
  return out;
}
