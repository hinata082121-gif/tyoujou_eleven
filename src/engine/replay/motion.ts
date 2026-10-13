/**
 * モーションの台本（SPEC 10.8。P4）：試合のイベントと演出タイムラインから、3D で「誰が・いつ・どの動きをするか」と、
 * ボールの高さ・カメラ・観客の盛り上がりを決める。表示（src/view3d）はこれを再生するだけ。
 * 試合の結果には関わらず、乱数も使わない（イベントの番号から決まった値で散らす）。
 */
import { FORMATIONS } from "../config/formations";
import { MOTION_TIMING, REPLAY } from "../config/replay";
import type { DribbleMove } from "../types";
import type { MatchEventType, MatchState, Side } from "../match/types";
import { shapeAt, type ReplayKey, type ReplayTimeline } from ".";

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
  dribble: { holder: "main", cues: [{ who: "main", motion: "dribbleMove" }, { who: "other", motion: "tackle", delay: 0.1 }], expr: "focus", camera: "follow", crowd: 0 },
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
  goal: { holder: "none", in: "shot", cues: [{ who: "oppGk", motion: "gkDive" }, { who: "main", motion: "celebrate", delay: 0.3, expr: "joy" }], expr: "joy", camera: "goal", crowd: 2 },
  pkAwarded: { holder: "main", cues: [{ who: "main", motion: "fall" }, { who: "other", motion: "handUp", delay: 0.5 }], expr: "pain", camera: "near", crowd: 1 },
  pkGoal: { holder: "none", in: "shot", cues: [{ who: "oppGk", motion: "gkDive" }, { who: "main", motion: "celebrate", delay: 0.3, expr: "joy" }], expr: "joy", camera: "goal", crowd: 2 },
  pkMiss: { holder: "none", in: "shot", cues: [{ who: "main", motion: "headInHands", delay: 0.2, expr: "sad" }], expr: "sad", camera: "near", crowd: 1 },
  pkSaved: { holder: "main", in: "shot", receive: "gkDive", cues: [{ who: "other", motion: "headInHands", delay: 0.4, expr: "sad" }], camera: "near", crowd: 1 },
  sub: none(),
  tactics: none(),
  formation: none(),
  position: none(),
  note: none(),
  shortHanded: none(),
  foul: { holder: "none", cues: [{ who: "main", motion: "tackle" }, { who: "other", motion: "fall", delay: 0.1, expr: "pain" }], camera: "follow", crowd: 0 },
  yellow: { holder: "none", cues: [{ who: "referee", motion: "cardShown" }, { who: "main", motion: "bowHead", delay: 0.2 }], expr: "sad", camera: "follow", crowd: 0 },
  secondYellow: { holder: "none", cues: [{ who: "referee", motion: "cardShown" }, { who: "main", motion: "bowHead", delay: 0.2 }], expr: "sad", camera: "follow", crowd: 1 },
  red: { holder: "none", cues: [{ who: "referee", motion: "cardShown" }, { who: "main", motion: "bowHead", delay: 0.2 }], expr: "sad", camera: "follow", crowd: 1 },
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
  /** 元のイベントの番号 */
  event: number;
}

/** ボールの 1 区間の運び方（区間の外は地面） */
export interface Flight {
  t0: number;
  t1: number;
  arc: BallArc;
  /** 出たときの高さ・着いたときの高さ・頂点の高さ（m） */
  h0: number;
  h1: number;
  peak: number;
}

/** カメラ・観客の切り替え（その時刻から次の切り替えまで） */
export interface Shot {
  t: number;
  camera: CameraShot;
  crowd: CrowdLevel;
  event: number;
}

export interface MotionScript {
  cues: Cue[];
  flights: Flight[];
  shots: Shot[];
}

export const REFEREE_ID = "@referee";
const PITCH_LENGTH = 105;
const PITCH_WIDTH = 68;

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

/** ボールがキー a を出ていく時刻（frameAt と同じ決め方）。a の後にボールを回す時間があれば undefined */
function departure(a: ReplayKey, b: ReplayKey): number | undefined {
  const span = b.t - a.t;
  if (span > REPLAY.idlePassMinutes) return undefined;
  const travel = Math.min(span, b.air ? 0.3 : 0.2);
  return Math.max(a.t, b.t - travel);
}

const dist = (a: ReplayKey, b: ReplayKey) => Math.hypot((a.ball.x - b.ball.x) * PITCH_WIDTH, (a.ball.y - b.ball.y) * PITCH_LENGTH);

/** 試合の全イベントから台本を作る（何度呼んでも同じものができる） */
export function buildMotionScript(ms: MatchState, tl: ReplayTimeline): MotionScript {
  const cues: Cue[] = [];
  const flights: Flight[] = [];
  const shots: Shot[] = [];
  const keys = tl.keys;
  const B = MOTION_TIMING.ball;
  const sec = MOTION_TIMING.minutesPerSecond;

  const roleId = (key: ReplayKey, who: Role): string | undefined => {
    if (who === "main") return key.actors[0];
    if (who === "other") return key.actors[1];
    if (who === "referee") return REFEREE_ID;
    return gkAt(ms, key.side === 0 ? 1 : 0, key.t);
  };
  const holderOf = (key: ReplayKey) => {
    const h = EVENT_MOTIONS[key.type].holder;
    return h === "none" ? undefined : key.actors[h === "main" ? 0 : 1];
  };
  /** 横へ跳ぶ向き（ボールが GK から見て左右どちらへ来るか。決まった値） */
  const diveSide = (i: number): "left" | "right" => (hash(i, 5) < 0 ? "left" : "right");
  const push = (cue: Omit<Cue, "dur">) => cues.push({ ...cue, dur: minutes(cue.motion) });

  keys.forEach((key, k) => {
    const em = EVENT_MOTIONS[key.type];
    const e = ms.events[key.index];
    shots.push({ t: key.t, camera: em.camera, crowd: em.crowd, event: key.index });

    // ---- ボールが前のイベントからここへ来る区間 ----
    const prev = keys[k - 1];
    const dep = prev ? departure(prev, key) : undefined;
    let arc: BallArc = "ground";
    if (prev && dep !== undefined) {
      const pm = EVENT_MOTIONS[prev.type];
      arc = pm.out?.arc ?? em.in ?? "ground";
      // 頭で触れる・GK が高い所で取るのは、来るボールが浮いているときの受け方
      if (em.in === "head" || em.in === "gkHigh") arc = em.in;
      const d = dist(prev, key);
      const shotH = B.shot.min + ((hash(key.index, 7) + 1) / 2) * (B.shot.max - B.shot.min);
      const h0 = prev.type === "header" ? B.head : pm.out?.kick === "throwIn" ? 2 : B.radius;
      const peak = arc === "air" ? Math.min(B.air.max, B.air.base + B.air.perMeter * d) : arc === "lofted" ? B.cross : arc === "head" || arc === "gkHigh" ? Math.max(B.cross, (arc === "head" ? B.head : B.gkHigh) + 1.5) : 0;
      const h1 = arc === "head" ? B.head : arc === "gkHigh" ? B.gkHigh : arc === "shot" ? (key.type === "miss" ? shotH + 0.6 : shotH) : B.radius;
      if (arc !== "ground") flights.push({ t0: dep, t1: key.t, arc, h0, h1, peak });

      // 出す人の動き（前のイベントでボールを持っていた人）
      const kicker = holderOf(prev);
      let kick = pm.out ? pm.out.kick : arc === "air" ? "longKick" : arc === "shot" ? "shot" : "pass";
      if (kick === "shot" && ms.events[prev.index]?.note === "header") kick = "header";
      if (kicker && kick) push({ t: dep - contactOf(kick) * minutes(kick), id: kicker, motion: kick, event: prev.index });
    }

    // ---- ボールを受ける動き ----
    const holder = holderOf(key);
    const recv = em.receive === undefined ? (arc === "air" || arc === "lofted" ? "chestTrap" : "trap") : em.receive;
    if (holder && recv) {
      const variant = recv === "gkDive" || recv === "gkCatch" ? (recv === "gkCatch" && hash(key.index, 6) > 0.2 ? undefined : diveSide(key.index)) : undefined;
      push({ t: key.t - contactOf(recv) * minutes(recv), id: holder, motion: recv, variant, event: key.index });
    }

    // ---- そのほかの動き ----
    for (const c of em.cues ?? []) {
      const id = roleId(key, c.who);
      if (!id) continue;
      let motion = c.motion;
      // 1 対 1・シュートの GK：ボールが来る直前に跳ぶ／取る（delay 99 は「次のイベントに合わせる」）
      let t = key.t + (c.delay ?? 0) * sec;
      if (c.delay === 99) {
        const next = keys[k + 1];
        if (!next) continue;
        const nm = next.type;
        if (nm === "goal") motion = "gkDive";
        else if (nm === "catch" || nm === "parry" || nm === "save" || nm === "gkRush" || nm === "block" || nm === "miss" || nm === "shot") continue; // GK 自身のイベントで動く
        t = next.t - contactOf(motion) * minutes(motion);
      } else if (motion === "gkDive" || motion === "gkPunch") t = key.t - contactOf(motion) * minutes(motion);
      const variant = c.motion === "dribbleMove" ? e?.move ?? "chopTouch" : motion === "gkDive" ? diveSide(key.index) : undefined;
      push({ t, id, motion, variant, expr: c.expr, event: key.index });
    }
    // ドリブルで止められたとき：ゴール前・サイドの深い所ではスライディング（決まった値で 3 回に 1 回ほど）
    if (key.type === "dribbleFail") {
      const last = cues[cues.length - 1];
      if (last?.motion === "tackle" && e?.lane !== "C" && hash(key.index, 8) > 0.33) {
        last.motion = "slide";
        last.dur = minutes("slide");
        last.t = key.t - contactOf("slide") * last.dur;
      }
    }
  });

  cues.sort((a, b) => a.t - b.t);
  flights.sort((a, b) => a.t0 - b.t0);
  return { cues, flights, shots };
}

/** 時刻 t のボールの高さ（m）。浮いている区間は放物線、それ以外は地面 */
export function ballHeightAt(script: MotionScript, t: number): number {
  const f = flightAt(script, t);
  if (!f) return MOTION_TIMING.ball.radius;
  const u = Math.max(0, Math.min(1, (t - f.t0) / Math.max(1e-6, f.t1 - f.t0)));
  if (f.arc === "shot") return f.h0 + (f.h1 - f.h0) * u + Math.sin(u * Math.PI) * 0.4;
  // 頂点が peak になる放物線（出た高さ・着く高さが違っても滑らかにつなぐ）
  const base = f.h0 + (f.h1 - f.h0) * u;
  const lift = Math.max(0, f.peak - Math.max(f.h0, f.h1));
  return base + 4 * lift * u * (1 - u);
}

/** 時刻 t を含むボールの区間 */
export function flightAt(script: MotionScript, t: number): Flight | undefined {
  const fl = script.flights;
  let lo = 0;
  let hi = fl.length - 1;
  let k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fl[mid].t0 <= t) {
      k = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const f = k >= 0 ? fl[k] : undefined;
  return f && t <= f.t1 ? f : undefined;
}

/** 時刻 t のカメラ・観客（直前の切り替え） */
export function shotAt(script: MotionScript, t: number): Shot | undefined {
  let s: Shot | undefined;
  for (const x of script.shots) {
    if (x.t > t) break;
    s = x;
  }
  return s;
}

/** 時刻 t に動いている選手の動き（同じ選手に重なれば後から始まった方）。startIndex から探す */
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
