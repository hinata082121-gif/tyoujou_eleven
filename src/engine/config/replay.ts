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

/**
 * 選手とボールが常に動く演出（R3。計画 1 章）の数値。表示だけで、試合の結果には関わらない。
 * 長さは m、時刻は試合時間の分。速さは「現実の m/秒」で書き、等速の換算（試合の 1 分 = 現実の 4 秒）で分あたりにする
 */
export const MOVE = {
  /** ピッチ（m）：長さ・幅 */
  pitch: { length: 105, width: 68 },
  /** 1 歩の長さ（試合時間の分。等速で 0.1 秒） */
  step: 0.025,
  /** 等速での現実の秒 / 試合の 1 分（SPEC 10.7） */
  secondsPerMinute: 4,
  /** 走る速さの上限（m/秒）：base + perSpeed × スピード / 100 */
  run: { base: 6.0, perSpeed: 2.8 },
  /** 加速の上限（m/秒²） */
  accel: 5.5,
  /** 疲れ：体力 fullAt 以上は 1、0 で minMult（速さの上限と、立ち位置へ戻る動きの大きさに掛ける） */
  fatigue: { fullAt: 80, minSpeed: 0.72, minReach: 0.7 },
  /** ふだんの動きの速さ（上限に対する割合）。約束に向かう・プレス・切り替えは 1 */
  urgency: { idle: 0.55, appointment: 0.75, setPiece: 0.85, press: 0.9 },
  /** 間隔：味方どうしは必ず sepTeam 以上（2D の丸が重ならない）。相手とはふだん sepOpp、競り合いは duel */
  separation: { sepTeam: 3.6, sepOpp: 2.4, duel: 1.4, steerTeam: 5.0, sidestep: 2.0 },
  /** ボールの速さ（m/秒）。dribble はボールを運ぶ速さ */
  ball: { pass: 17, air: 21, lofted: 19, shot: 27, dribble: 5.6, throwIn: 12 },
  /** ボールの区間の最低の長さ（分） */
  legMin: { pass: 0.03, air: 0.08, lofted: 0.08, shot: 0.02 },
  /** 浮き球の頂点（m）：air は 3 + 距離 × 0.16（上限 14）、lofted（クロス・CK）は 6、shot は 1.2 */
  peak: { airBase: 3, airPerMeter: 0.16, airMax: 14, lofted: 6, shot: 1.2, throwIn: 2.5 },
  /**
   * 時刻の割り付け（計画 1.2）：前のイベントからの間隔の目安（分）。
   * 0.1 + ボールの距離 ÷ pass の速さ。同じ選手が運ぶならドリブルの速さ。止まるプレーの前後は長め
   */
  gap: { base: 0.1, travel: 14, carry: 6.5, afterGoal: 0.9, afterMiss: 0.35, beforeSetPiece: 1.0, afterFoul: 0.25, afterPhaseStart: 0.3 },
  /** 速報に出るイベントの時刻：その分の (m − 1 + lead, m − tail] に入れる。区間の始めの分は segmentLead から */
  window: { lead: 0.04, tail: 0.02, segmentLead: 0.3 },
  /** 先読み：次のイベントの選手が動き出すのは何分前から（セットプレーは長め）。setHold：セットプレーを蹴った後もゴール前の並びを保つ長さ */
  lookahead: { play: 1.2, setPiece: 3.5, cornerGather: 1.6, keys: 3, setHold: 0.4 },
  /** 約束（次のキーに間に合う）：速さの上限 × go × 残り時間より遠ければまっすぐ向かう。近ければ keep の範囲でふだんの動き */
  appointment: { play: { go: 0.8, keep: 0.7 }, setPiece: { go: 0.6, keep: 0.5 } },
  /** 切り替え（計画 1.6・承認のときの修正 1）：奪われた側は近くの選手が全力で戻り、奪った側は 2〜3 人が前へ走る */
  transition: {
    minutes: 1.0,
    counterMinutes: 1.4,
    recoverRadius: 38,
    runners: 2,
    counterRunners: 3,
    /** 前へ走る人の行き先：ボールの runAhead m 先、自分の今の位置の runPast m 先。相手の最終ラインを beatLine（奥行き）まで越えてよい */
    runAhead: 18,
    runPast: 16,
    beatLine: 0.05,
    /** 奪った側のほかの選手：ボールがこれだけ前にあるつもりで押し上げる（奥行き） */
    pushUp: 0.12,
    /** 奪われた側の戻る選手：今の位置より少なくとも dropBack m 自陣へ */
    dropBack: 8,
  },
  /** プレスの人数（高・中・低）。低は自陣（奥行き 0.45 未満）に入ったら 1 人 */
  pressers: { high: 2, mid: 1, low: 0 },
  /** 交代で出入りするところ（タッチラインの中央、ベンチの側） */
  bench: { x: 0.6 },
  /** ゴールの喜び（分）：味方が得点者に寄る時間 */
  celebrate: 0.35,
  /** ボールの高さ（実寸の m。地面はボールの半径）。頭の高さ・GK が跳んで取る高さ・シュートが枠へ向かう高さの幅（外れは上へ） */
  height: { ground: 0.11, hands: 2, head: 2.0, gkHigh: 2.45, shot: { min: 0.25, max: 1.9, overMiss: 0.5 } },
  /** ドリブル：ボールは運ぶ人の足もと（前へ m） */
  carry: { ahead: 0.7 },
  /**
   * セットプレー：蹴る人がボールのそばに来て、両チームがおおよそ並ぶまで待つ（m・最大の分。前半・後半などの終わりの何分前まで）。
   * 並べたかは、自分の位置から gatherFar m より離れている選手が gatherMiss 人以下か。待っても間に合わなければ、
   * 場面を切り替えて並びに置き直し、afterCut 分の後に蹴る
   */
  setWait: { near: 1.6, max: 0.45, phaseEnd: 0.4, gatherFar: 12, gatherMiss: 4, afterCut: 0.12 },
  /** ヘディングの後、同じ選手のシュートがこの分より近ければ、頭で触れたその場で打つ */
  headShot: 0.5,
  /** 減速・向きを変えるときの加速の上限（走り出すときの何倍か） */
  decel: 1.6,
  /** 2D の選手の丸の半径（m）。味方どうしの間隔 sepTeam は、この 2 倍より広くする（丸が重ならない） */
  disc2d: 1.65,
  /** 選手が出てよいピッチの外（m。スローイン・コーナーキック） */
  outside: 1.2,
} as const;
