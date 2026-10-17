/**
 * 2D の描画（R3。SPEC 19章・計画 2 章の A 案「中継のグラフィック」）：真上から見たピッチを canvas に毎フレーム描く。
 * 選手は柄の入った丸と背番号、ボールを持つ選手には中継のテロップ、ボールの動いた跡、ゴール・決定機・セーブ・カードの短い演出。
 * 一時停止中・ハーフタイムは、チームの広がりと最終ラインの線を重ねる（C 案の一部）。
 * 動きは engine/replay/sim.ts（3D と同じ）。ここは描くだけで、試合の結果には関わらない
 */
import { KIT_PALETTE, KIT_TEMPLATES } from "@/engine/config/look";
import { MOVE } from "@/engine/config/replay";
import { gkKit, numberColor } from "@/engine/look";
import type { MatchState, Side } from "@/engine/match/types";
import { PL, PW, type Fired, type ReplaySim, type SimFrame } from "@/engine/replay/sim";
import type { Kit } from "@/engine/types";

export interface Fonts {
  head: string;
  body: string;
  num: string;
}

/** ピッチの周りに空けておく所（px。スコアボード・速報・ボタンを重ねる） */
export interface Insets {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface DrawOptions {
  userSide: Side;
  fonts: Fonts;
  insets: Insets;
  /** 選手の id → 短い名前（同じ名字は下の名前の 1 字を足す） */
  names: Map<string, string>;
  /** 一時停止中・ハーフタイム：チームの広がりと最終ラインを重ねる */
  tactical: boolean;
  /** 倍速（演出の長さを合わせる） */
  speed: number;
}

/** DESIGN.md の基本の色 */
const C = {
  night: "#0b120f",
  turf: "#1d3b2b",
  turf2: "#22442f",
  line: "rgba(246,243,234,0.85)",
  telop: "#f3f0e6",
  ink: "#0f1512",
  yellow: "#f2c21b",
  red: "#d6372b",
  info: "#7cc8ff",
  white: "#ffffff",
};

/** 演出の長さ（試合時間の分。等速のとき。倍速では少し短く見える） */
const FX = {
  goal: 0.5,
  flash: 0.22,
  trailFade: 0.12,
};

const FALLBACK: [Kit, Kit] = [
  { template: 0, main: 12, sub: 0, shorts: 12, socks: 12 },
  { template: 0, main: 4, sub: 0, shorts: 4, socks: 4 },
];

function kitOf(ms: MatchState, side: Side, gk: boolean): Kit {
  const v = ms.view;
  if (!v) return gk ? { ...FALLBACK[side], main: side === 0 ? 9 : 11 } : FALLBACK[side];
  return gk ? gkKit(v.gk[side]) : v.kits[side];
}

/** ユニフォームの柄（簡略）を、clip した形の中に描く */
function pattern(ctx: CanvasRenderingContext2D, kit: Kit, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = KIT_PALETTE[kit.main];
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = KIT_PALETTE[kit.sub];
  const t = KIT_TEMPLATES[kit.template] ?? "solid";
  if (t === "vstripe") for (let i = 1; i < 5; i += 2) ctx.fillRect(x + (w * i) / 5, y, w / 5, h);
  else if (t === "pinstripe") for (let i = 1; i < 6; i++) ctx.fillRect(x + (w * i) / 6 - w * 0.03, y, w * 0.06, h);
  else if (t === "hoop") for (let i = 1; i < 5; i += 2) ctx.fillRect(x, y + (h * i) / 5, w, h / 5);
  else if (t === "half") ctx.fillRect(x + w / 2, y, w / 2, h);
  else if (t === "sash") {
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.15);
    ctx.lineTo(x + w * 0.2, y);
    ctx.lineTo(x + w, y + h * 0.85);
    ctx.lineTo(x + w * 0.8, y + h);
    ctx.closePath();
    ctx.fill();
  } else if (t === "shoulder") ctx.fillRect(x, y, w, h * 0.28);
  else if (t === "chestBand") ctx.fillRect(x, y + h * 0.35, w, h * 0.22);
}

/** ピッチの座標（m）→ 画面（px）。自校が右へ攻める向き */
export interface Proj {
  /** 1m の px */
  k: number;
  x: (X: number, Y: number) => number;
  /** h：高さ（m。上に少しずらして浮いて見せる） */
  y: (X: number, Y: number, h?: number) => number;
}

export function project(w: number, h: number, userSide: Side, m: Insets): Proj {
  const aw = Math.max(1, w - m.l - m.r);
  const ah = Math.max(1, h - m.t - m.b);
  // ゴールの奥行きとライン外の余白を含めて収める
  const k = Math.min(aw / (PL + 6), ah / (PW + 4));
  const ox = m.l + (aw - PL * k) / 2;
  const oy = m.t + (ah - PW * k) / 2;
  const flip = userSide === 1;
  return {
    k,
    x: (_X, Y) => ox + (flip ? Y : PL - Y) * k,
    y: (X, _Y, hh = 0) => oy + (flip ? PW - X : X) * k - hh * k * 0.5,
  };
}

function path(ctx: CanvasRenderingContext2D, pr: Proj, pts: readonly (readonly [number, number])[]) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [X, Y] = pts[i];
    if (i === 0) ctx.moveTo(pr.x(X, Y), pr.y(X, Y));
    else ctx.lineTo(pr.x(X, Y), pr.y(X, Y));
  }
  ctx.stroke();
}

function arc(ctx: CanvasRenderingContext2D, pr: Proj, cx: number, cy: number, r: number, a0: number, a1: number) {
  const pts: [number, number][] = [];
  const n = Math.max(8, Math.round((Math.abs(a1 - a0) / (Math.PI * 2)) * 48));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  path(ctx, pr, pts);
}

/** 芝（刈り込みの縞）と正しいライン（105m × 68m）とゴール */
function pitch(ctx: CanvasRenderingContext2D, pr: Proj) {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const y0 = -3.5 + (i * (PL + 7)) / n,
      y1 = -3.5 + ((i + 1) * (PL + 7)) / n;
    const xa = pr.x(0, y0),
      xb = pr.x(0, y1);
    const ya = pr.y(-2.5, 0),
      yb = pr.y(PW + 2.5, 0);
    ctx.fillStyle = i % 2 ? C.turf2 : C.turf;
    ctx.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa) + 0.5, Math.abs(yb - ya));
  }
  ctx.strokeStyle = C.line;
  ctx.lineWidth = Math.max(1.2, pr.k * 0.16);
  ctx.lineJoin = "miter";
  path(ctx, pr, [
    [0, 0],
    [PW, 0],
    [PW, PL],
    [0, PL],
    [0, 0],
  ]);
  path(ctx, pr, [
    [0, PL / 2],
    [PW, PL / 2],
  ]);
  arc(ctx, pr, PW / 2, PL / 2, 9.15, 0, Math.PI * 2);
  const a = Math.acos(5.5 / 9.15);
  for (const end of [0, PL]) {
    const s = end === 0 ? 1 : -1;
    path(ctx, pr, [
      [PW / 2 - 20.16, end],
      [PW / 2 - 20.16, end + s * 16.5],
      [PW / 2 + 20.16, end + s * 16.5],
      [PW / 2 + 20.16, end],
    ]);
    path(ctx, pr, [
      [PW / 2 - 9.16, end],
      [PW / 2 - 9.16, end + s * 5.5],
      [PW / 2 + 9.16, end + s * 5.5],
      [PW / 2 + 9.16, end],
    ]);
    // ペナルティアーク（エリアの外の部分だけ）
    const base = s > 0 ? Math.PI / 2 : -Math.PI / 2;
    arc(ctx, pr, PW / 2, end + s * 11, 9.15, base - (Math.PI / 2 - a), base + (Math.PI / 2 - a));
    // コーナーアーク
    for (const cx of [0, PW]) {
      const a0 = s > 0 ? (cx === 0 ? 0 : Math.PI / 2) : cx === 0 ? -Math.PI / 2 : Math.PI;
      arc(ctx, pr, cx, end, 1, a0, a0 + Math.PI / 2);
    }
  }
  ctx.fillStyle = C.line;
  const spot = Math.max(1.2, pr.k * 0.3);
  for (const [X, Y] of [
    [PW / 2, 11],
    [PW / 2, PL - 11],
    [PW / 2, PL / 2],
  ]) {
    ctx.beginPath();
    ctx.arc(pr.x(X, Y), pr.y(X, Y), spot, 0, Math.PI * 2);
    ctx.fill();
  }
  // ゴール（奥行き 2m の網と枠）
  for (const end of [0, PL]) {
    const s = end === 0 ? -1 : 1;
    const x0 = pr.x(0, end),
      x1 = pr.x(0, end + s * 2);
    const y0 = pr.y(PW / 2 - 3.66, 0),
      y1 = pr.y(PW / 2 + 3.66, 0);
    ctx.fillStyle = "rgba(246,243,234,0.18)";
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeStyle = C.white;
    ctx.lineWidth = Math.max(1.5, pr.k * 0.3);
    ctx.beginPath();
    ctx.moveTo(x1, y0);
    ctx.lineTo(x0, y0);
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y0);
    ctx.stroke();
  }
}

/** ボールの動いた跡：パスは点線、シュートは太い線、浮き球は弧。少しずつ消える */
function trail(ctx: CanvasRenderingContext2D, pr: Proj, f: SimFrame) {
  const l = f.leg;
  if (!l || l.kind === "dribble" || l.kind === "hold" || l.kind === "dead") return;
  const dur = Math.max(1e-6, l.t1 - l.t0);
  const u = Math.max(0, Math.min(1, (f.t - l.t0) / dur));
  const fade = f.t > l.t1 ? Math.max(0, 1 - (f.t - l.t1) / FX.trailFade) : 1;
  if (fade <= 0) return;
  const k = pr.k;
  const N = 20;
  const xs = new Array<number>(N + 1),
    ys = new Array<number>(N + 1);
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    const X = l.from.x + (l.to.x - l.from.x) * v,
      Y = l.from.y + (l.to.y - l.from.y) * v;
    const hh = l.h0 + (l.h1 - l.h0) * v + 4 * l.peak * v * (1 - v);
    xs[i] = pr.x(X, Y);
    ys[i] = pr.y(X, Y, Math.max(0, hh - MOVE.height.ground));
  }
  ctx.save();
  ctx.lineCap = "butt";
  const base = Math.max(1.2, k * 0.22);
  if (l.kind === "shot") {
    ctx.strokeStyle = C.yellow;
    ctx.lineWidth = base * 2.4;
  } else if (l.kind === "air" || l.kind === "lofted") {
    ctx.strokeStyle = C.telop;
    ctx.lineWidth = base * 1.3;
    ctx.setLineDash([base * 4, base * 2.5]);
  } else {
    ctx.strokeStyle = C.telop;
    ctx.lineWidth = base * 1.1;
    ctx.setLineDash([base * 1.4, base * 2]);
  }
  // まだ通っていない所は薄く、通った所は濃く
  ctx.globalAlpha = 0.28 * fade;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, xs[i], ys[i]);
  ctx.stroke();
  const m = Math.max(1, Math.round(u * N));
  ctx.globalAlpha = 0.95 * fade;
  ctx.beginPath();
  for (let i = 0; i <= m; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, xs[i], ys[i]);
  ctx.stroke();
  // 着く所に小さな印
  if (l.kind !== "shot" && u < 1) {
    const ex = xs[N],
      ey = ys[N];
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.65 * fade;
    ctx.lineWidth = base;
    ctx.beginPath();
    ctx.moveTo(ex - base * 3, ey);
    ctx.lineTo(ex + base * 3, ey);
    ctx.moveTo(ex, ey - base * 3);
    ctx.lineTo(ex, ey + base * 3);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 名前の札（中継のテロップ：番号の地はチームの色、名前は明るい帯に墨の文字、右下を斜めに切る）。
 * 選手の上（y は丸の上の端）に出し、上が足りない（スコアボードに隠れる）ときは丸の下（yBelow）に出す
 */
function nameTag(ctx: CanvasRenderingContext2D, x: number, y: number, yBelow: number, top: number, name: string, num: number, kit: Kit, fonts: Fonts, w: number) {
  const fs = 12;
  ctx.font = `900 ${fs}px ${fonts.body}`;
  const nw = ctx.measureText(name).width;
  ctx.font = `700 ${fs}px ${fonts.num}`;
  const numW = ctx.measureText(String(num)).width + 8;
  const tw = nw + numW + 13;
  const h = fs + 7;
  // 画面の外に出ないように
  const x0 = Math.max(2, Math.min(w - tw - 2, x - tw / 2));
  const below = y - h - 5 < top;
  const y0 = below ? yBelow + 5 : y - h - 5;
  ctx.fillStyle = KIT_PALETTE[kit.main];
  ctx.fillRect(x0, y0, numW, h);
  ctx.fillStyle = C.telop;
  ctx.beginPath();
  ctx.moveTo(x0 + numW, y0);
  ctx.lineTo(x0 + tw, y0);
  ctx.lineTo(x0 + tw - h * 0.35, y0 + h);
  ctx.lineTo(x0 + numW, y0 + h);
  ctx.closePath();
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = C.ink;
  ctx.font = `900 ${fs}px ${fonts.body}`;
  ctx.fillText(name, x0 + numW + 4, y0 + h / 2 + 0.5);
  ctx.textAlign = "center";
  ctx.font = `700 ${fs}px ${fonts.num}`;
  ctx.fillStyle = numberColor(kit) === 1 ? "#1c1c1e" : C.white;
  ctx.fillText(String(num), x0 + numW / 2, y0 + h / 2 + 0.5);
  // 選手を指す小さな三角
  const tx = Math.max(x0 + 4, Math.min(x0 + tw - 4, x));
  const ty = below ? y0 : y0 + h;
  ctx.fillStyle = C.telop;
  ctx.beginPath();
  ctx.moveTo(tx - 4, ty);
  ctx.lineTo(tx + 4, ty);
  ctx.lineTo(tx, below ? ty - 5 : ty + 5);
  ctx.closePath();
  ctx.fill();
}

/** 斜めに切った帯と文字（ゴールの演出・小さな札） */
function band(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, text: string, color: string, font: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + h * 0.4, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - h * 0.4, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
}

/** 時刻 t の前 span 分に起きたイベント（新しい順） */
function recentFired(sim: ReplaySim, t: number, span: number, out: Fired[]) {
  out.length = 0;
  const a = sim.fired;
  let lo = 0,
    hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo - 1; i >= 0 && a[i].t > t - span; i--) out.push(a[i]);
  return out;
}

const SAVES = new Set(["save", "catch", "parry", "pkSaved"]);
const CHANCES = new Set(["oneOnOne", "pkAwarded"]);
const CARDS = new Set(["yellow", "secondYellow", "red"]);
const tmpFired: Fired[] = [];

/** 大事な場面の短い演出：ゴールの帯・決定機・セーブ・カードの小さな札と光 */
function effects(ctx: CanvasRenderingContext2D, w: number, h: number, pr: Proj, sim: SimFrame, rs: ReplaySim, o: DrawOptions, pos: Map<number, { x: number; y: number }>) {
  const t = sim.t;
  const sp = Math.max(1, Math.sqrt(o.speed));
  const goalSpan = FX.goal * sp,
    flashSpan = FX.flash * sp;
  for (const f of recentFired(rs, t, Math.max(goalSpan, flashSpan), tmpFired)) {
    const type = f.key.type;
    const u = (t - f.t) / (type === "goal" || type === "pkGoal" ? goalSpan : flashSpan);
    if (u < 0 || u >= 1) continue;
    const mine = f.key.side === o.userSide;
    if (type === "goal" || type === "pkGoal") {
      // 「ゴール」の帯が横切る
      const inU = Math.min(1, u / 0.18);
      const outU = u > 0.8 ? (u - 0.8) / 0.2 : 0;
      const bh = Math.max(36, h * 0.17);
      const x0 = -w * (1 - inU) + w * outU;
      ctx.save();
      band(ctx, x0, h * 0.42 - bh / 2, w, bh, mine ? C.yellow : C.red, "ゴール", mine ? C.ink : C.white, `400 ${Math.round(bh * 0.6)}px ${o.fonts.head}`);
      ctx.restore();
      continue;
    }
    const label = SAVES.has(type) ? "セーブ" : CHANCES.has(type) ? "決定機" : CARDS.has(type) ? (type === "yellow" ? "警告" : "退場") : null;
    if (!label) continue;
    // 光の輪（場所はイベントの選手、いなければボール）
    const actor = f.key.actors[0] ? rs.players.findIndex((p) => p.id === f.key.actors[0]) : -1;
    const at = pos.get(actor) ?? { x: pr.x(f.key.ball.x, f.key.ball.y), y: pr.y(f.key.ball.x, f.key.ball.y) };
    const fade = 1 - u;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = CARDS.has(type) ? (type === "yellow" ? C.yellow : C.red) : C.telop;
    ctx.lineWidth = Math.max(2, pr.k * 0.4);
    ctx.beginPath();
    ctx.arc(at.x, at.y, pr.k * (MOVE.disc2d + 1 + u * 3.5), 0, Math.PI * 2);
    ctx.stroke();
    // 小さな札
    const fs = 12;
    const bw = fs * label.length + 18,
      bh = fs + 8;
    const bx = Math.max(2, Math.min(w - bw - 2, at.x + pr.k * 2.4)),
      by = Math.max(2, Math.min(h - bh - 2, at.y + pr.k * 1.2));
    if (CARDS.has(type)) {
      ctx.fillStyle = type === "yellow" ? C.yellow : C.red;
      ctx.fillRect(bx, by, 9, bh);
      band(ctx, bx + 8, by, bw - 8, bh, C.telop, label, C.ink, `900 ${fs}px ${o.fonts.body}`);
    } else band(ctx, bx, by, bw, bh, mine ? C.yellow : C.telop, label, C.ink, `900 ${fs}px ${o.fonts.body}`);
    ctx.restore();
  }
}

/** チームの広がり（外側を結んだ形）と最終ラインの点線（一時停止中・ハーフタイム） */
function tacticalOverlay(ctx: CanvasRenderingContext2D, pr: Proj, f: SimFrame, rs: ReplaySim, ms: MatchState) {
  for (const side of [0, 1] as Side[]) {
    const pts: { x: number; y: number }[] = [];
    let deepest = Infinity;
    const own = side === 0 ? PL : 0;
    for (const d of f.dots) {
      if (d.gk || rs.players[d.idx].side !== side) continue;
      pts.push({ x: pr.x(d.x, d.y), y: pr.y(d.x, d.y) });
      deepest = Math.min(deepest, Math.abs(d.y - own));
    }
    if (pts.length < 3) continue;
    const color = KIT_PALETTE[kitOf(ms, side, false).main];
    const hull = convexHull(pts);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    hull.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const Y = side === 0 ? PL - deepest : deepest;
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pr.x(0, Y), pr.y(0, Y));
    ctx.lineTo(pr.x(PW, Y), pr.y(PW, Y));
    ctx.stroke();
    ctx.restore();
  }
}

function convexHull(pts: { x: number; y: number }[]) {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: typeof p = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: typeof p = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/** 場面の切り替え（セットプレーの並び直し）の前後を短く暗くする（0〜1） */
export function cutFade(sim: ReplaySim, t: number, span = 0.06): number {
  let k = 0;
  for (const c of sim.cuts) {
    const d = Math.abs(t - c);
    if (d < span) k = Math.max(k, 1 - d / span);
  }
  return k;
}

/** 1 コマを描く。w・h は CSS の px（ctx は画素密度を掛けてある）。動きの計算がまだ追いついていなければ true */
export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, sim: ReplaySim, t0: number, o: DrawOptions): boolean {
  const ms = sim.ms;
  // 動きの計算は 1 フレームに少しずつ（計画 5.1）
  const { t, seeking } = sim.pumpFrame(t0);
  const pr = project(w, h, o.userSide, o.insets);
  const k = pr.k;
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, w, h);
  pitch(ctx, pr);
  if (seeking) {
    // 途中から再開して追いつくまでは、選手を描かない
    ctx.fillStyle = "rgba(11,18,15,0.85)";
    ctx.fillRect(0, 0, w, h);
    return true;
  }
  const f = sim.frame(t, 0);
  if (o.tactical) tacticalOverlay(ctx, pr, f, sim, ms);
  trail(ctx, pr, f);

  // 選手（丸の半径は、テストで重ならないことを確かめている MOVE.disc2d）
  const r = Math.max(5, k * MOVE.disc2d);
  const pos = new Map<number, { x: number; y: number }>();
  const fs = Math.max(10, Math.round(r * 1.1));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const d of f.dots) {
    const p = sim.players[d.idx];
    const x = pr.x(d.x, d.y),
      y = pr.y(d.x, d.y);
    pos.set(d.idx, { x, y });
    const kit = kitOf(ms, p.side, d.gk);
    const owner = f.owner === d.idx;
    // 影
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(x + 1.5, y + 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    pattern(ctx, kit, x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = owner ? C.yellow : "rgba(11,18,15,0.85)";
    ctx.lineWidth = owner ? Math.max(2, k * 0.45) : Math.max(1, k * 0.18);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    // 背番号（柄の上でも読めるように縁取り）
    const dark = numberColor(kit) === 1;
    ctx.font = `700 ${fs}px ${o.fonts.num}`;
    ctx.lineWidth = Math.max(2, fs * 0.22);
    ctx.strokeStyle = dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)";
    ctx.strokeText(String(p.num), x, y + 0.5);
    ctx.fillStyle = dark ? "#1c1c1e" : C.white;
    ctx.fillText(String(p.num), x, y + 0.5);
    // 走っている向きに小さな三角
    const v = Math.hypot(d.vx, d.vy);
    if (v > 16) {
      const flip = o.userSide === 1;
      const dx = (flip ? d.vy : -d.vy) / v,
        dy = (flip ? -d.vx : d.vx) / v;
      ctx.fillStyle = "rgba(243,240,230,0.9)";
      ctx.beginPath();
      ctx.moveTo(x + dx * (r + k * 0.9 + 1), y + dy * (r + k * 0.9 + 1));
      ctx.lineTo(x + dx * (r + 1) - dy * k * 0.5, y + dy * (r + 1) + dx * k * 0.5);
      ctx.lineTo(x + dx * (r + 1) + dy * k * 0.5, y + dy * (r + 1) - dx * k * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ボール：少し大きく、縁取りと影（高いほど上にずらし、影は離れる）
  const lift = Math.max(0, f.ball.h - MOVE.height.ground);
  const gx = pr.x(f.ball.x, f.ball.y),
    gy = pr.y(f.ball.x, f.ball.y);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(gx + lift * k * 0.25, gy + 1 + lift * k * 0.12, Math.max(3, k * Math.max(0.5, 0.95 - lift * 0.04)), Math.max(2, k * Math.max(0.35, 0.65 - lift * 0.03)), 0, 0, Math.PI * 2);
  ctx.fill();
  const bx = gx,
    by = pr.y(f.ball.x, f.ball.y, lift);
  const br = Math.max(4.5, k * (0.95 + Math.min(0.5, lift * 0.05)));
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(bx, by, br + Math.max(1.5, k * 0.25), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.white;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2f2c";
  ctx.beginPath();
  ctx.arc(bx, by, br * 0.38, 0, Math.PI * 2);
  ctx.fill();

  // ボールを持つ選手の名前
  if (f.owner >= 0) {
    const q = pos.get(f.owner);
    const p = sim.players[f.owner];
    if (q) {
      const gk = f.dots.find((d) => d.idx === f.owner)?.gk ?? false;
      nameTag(ctx, q.x, q.y - r - 2, q.y + r + 2, o.insets.t, o.names.get(p.id) ?? p.name, p.num, kitOf(ms, p.side, gk), o.fonts, w);
    }
  }
  effects(ctx, w, h, pr, f, sim, o, pos);

  const fade = cutFade(sim, t);
  if (fade > 0) {
    ctx.fillStyle = `rgba(11,18,15,${(0.85 * fade).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  return false;
}
