import type { Line } from "./formations";
import type { MovementRange } from "../types";
import type { Zone } from "../match/types";

/**
 * 演出タイムライン（P3。簡易2D・P4 の3D で共通）の見た目の数値。試合の結果には関わらない。
 * 座標はピッチの幅・長さを 0〜1 にしたもの。奥行きは、そのチームの自陣ゴールが 0、相手ゴールが 1
 */
export const REPLAY = {
  /** イベントの起きた辺り → 奥行き */
  zoneDepth: { ownBox: 0.07, own: 0.3, mid: 0.5, opp: 0.7, box: 0.88 } as Record<Zone, number>,
  /** レーン → 横の位置（そのチームから見た左・中央・右） */
  laneX: { L: 0.18, C: 0.5, R: 0.82 },
  /** 同じ場所に固まらないための散らばり（イベントごとに決まった値。乱数は使わない） */
  jitter: { x: 0.08, y: 0.05 },
  /** 列ごとの基準の奥行き */
  lineDepth: { GK: 0.04, DF: 0.22, MF: 0.43, FW: 0.62 } as Record<Line, number>,
  /** ボールの奥行きに合わせてチーム全体を前後させる量（GK はこの 2 割） */
  teamShift: 0.36,
  /** ボールのある側へ寄る量（動きの範囲の倍率を掛ける） */
  ballPull: 0.28,
  movementPull: { free: 1, mostlyInside: 0.8, mostlyWide: 0.6, fixed: 0.35, wideOnly: 0.3 } as Record<MovementRange, number>,
  /** 1 分の中のイベントの間隔の上限（分）。イベントが少ない分は、ボールを回す時間にする */
  maxEventGap: 0.25,
  /** ボールを回すときに、パスを 1 本出す間隔（分） */
  idlePassMinutes: 0.35,
  /** 2 人目の関係者（受け手・競る相手）をボールからずらす量 */
  partnerOffset: 0.05,
};
