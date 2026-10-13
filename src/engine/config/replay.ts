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

/**
 * 3D 観戦のモーション（P4。SPEC 10.8）の長さ。表示だけで、試合の結果には関わらない。
 * dur は等速での秒数、contact はボールに触れる（蹴る・受ける）瞬間の割合（0〜1）。
 * 倍速でも試合時間に対する長さは同じ（倍速なら動きも速く再生する）
 */
export const MOTION_TIMING = {
  /** 等速での現実の 1 秒 = 試合時間の何分か（SPEC 10.7：15 分 = 1 分） */
  minutesPerSecond: 15 / 60,
  dur: {
    pass: 0.5,
    longKick: 0.7,
    shot: 0.6,
    cross: 0.6,
    trap: 0.4,
    chestTrap: 0.45,
    header: 0.7,
    tackle: 0.5,
    slide: 0.9,
    block: 0.6,
    gkDive: 0.9,
    gkCatch: 0.5,
    gkHighCatch: 0.6,
    gkPunch: 0.6,
    gkKick: 0.8,
    gkRush: 0.8,
    dribbleMove: 0.8,
    turnBack: 0.3,
    setKick: 0.9,
    throwIn: 0.8,
    fall: 1.2,
    celebrate: 3,
    dejected: 2,
    headInHands: 1.2,
    cardShown: 1.5,
    bowHead: 1.5,
    hurt: 2,
    handUp: 1,
  },
  contact: {
    pass: 0.5,
    longKick: 0.55,
    shot: 0.5,
    cross: 0.5,
    trap: 0.45,
    chestTrap: 0.45,
    header: 0.5,
    tackle: 0.45,
    slide: 0.35,
    block: 0.35,
    gkDive: 0.4,
    gkCatch: 0.45,
    gkHighCatch: 0.5,
    gkPunch: 0.45,
    gkKick: 0.6,
    gkRush: 0.55,
    setKick: 0.65,
    throwIn: 0.6,
  },
  /**
   * ボールの高さ（3D の世界の単位。ピッチは実寸 105×68 で、2.5 頭身の選手は見やすさのため約 1.6 倍、
   * ゴールは選手に合わせて約 1.45 倍の大きさで描くので、高さもそれに合わせた値）
   */
  ball: {
    radius: 0.35,
    /** 浮き球の頂点の高さ：距離 × perMeter + base（上限 max） */
    air: { base: 3, perMeter: 0.16, max: 15 },
    /** クロス・CK・FK・ロングスローの頂点 */
    cross: 7,
    /** ヘディングで触れる高さ（頭の高さ） */
    head: 3.2,
    /** GK が跳んで取る高さ */
    gkHigh: 3.9,
    /** シュートが枠に向かうときの高さの幅（ゴールの高さは約 3.5） */
    shot: { min: 0.4, max: 3.0 },
  },
};
