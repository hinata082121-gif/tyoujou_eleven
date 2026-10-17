/**
 * 演出の共通の部品（SPEC 10.4・19章）：イベントの起きた場所、記録した並び。
 * 選手とボールの動きは sim.ts（R3）、時刻の割り付けは schedule.ts、3D の台本は motion.ts。
 * 試合の結果には関わらず、乱数も使わない。
 *
 * 座標（0〜1 にしたもの）：x はピッチの左 0 → 右 1、y は上 0 → 下 1。side 0 は上（y = 0）へ攻め、side 1 は下へ攻める。
 */
import type { Lane } from "../config/formations";
import { MOVE, REPLAY } from "../config/replay";
import type { MatchEvent, MatchEventType, MatchTeamState, Side } from "../match/types";

export interface Pt {
  x: number;
  y: number;
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

function ballOf(e: MatchEvent, i: number, prev: Pt): Pt {
  if (e.type === "goal" || e.type === "pkGoal") return toPitch(e.side, 1.0, 0.5 + jitter(i, 1) * 0.05);
  if (e.type === "miss") return toPitch(e.side, 1.0, 0.5 + jitter(i, 2) * 0.25);
  if (!e.zone) return prev;
  const lane = e.lane ?? "C";
  const x = REPLAY.laneX[lane] + jitter(i, 3) * REPLAY.jitter.x;
  const d = REPLAY.zoneDepth[e.zone] + jitter(i, 4) * REPLAY.jitter.y;
  return toPitch(e.side, d, clamp01(x));
}

/**
 * イベントの起きた場所（m。x はピッチの幅 0〜68、y は長さ 0〜105）。lane・zone から決まった値で作る（乱数は使わない）。
 * ゴール・外れたシュートはゴールライン。場所の無いイベントは前の場所
 */
export function ballSpot(e: MatchEvent, i: number, prevM: Pt): Pt {
  const { length, width } = MOVE.pitch;
  const p = ballOf(e, i, { x: prevM.x / width, y: prevM.y / length });
  return { x: p.x * width, y: p.y * length };
}

/** 時刻 t の並び（記録した並びのうち、t までの最後のもの） */
export function shapeAt(team: MatchTeamState, t: number) {
  const shapes = team.shapes ?? [{ minute: 0, formation: team.formation, onPitch: team.onPitch }];
  let s = shapes[0];
  for (const x of shapes) if (x.minute <= t) s = x;
  return s;
}

/**
 * 時刻 t（> 0）に効いている並び：t より前に記録したものの最後（R3 の動き用）。
 * 区間の頭に記録した並び（交代など）は、その時刻を過ぎてから効く（次の区間を計算する前と後で同じ動きになるように）
 */
export function shapeBefore(team: MatchTeamState, t: number) {
  const shapes = team.shapes ?? [{ minute: 0, formation: team.formation, onPitch: team.onPitch }];
  let s = shapes[0];
  for (const x of shapes) if (x.minute < t) s = x;
  return s;
}

/** 自校から見た左右（イベントのレーンを、ピッチの左右にする。テスト・表示用） */
export function screenLane(e: Pick<MatchEvent, "side" | "lane">): Lane | undefined {
  if (!e.lane) return undefined;
  return e.side === 0 ? e.lane : flipLane(e.lane);
}
