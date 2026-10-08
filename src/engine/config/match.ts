/**
 * 試合エンジンの係数（SPEC 10.3）。数値は npm run balance で調整する。
 */
export const MATCH = {
  segmentMinutes: 5,

  /**
   * 能力差の圧縮（SPEC 10.3-5）：実効値 = pivot + (値 - pivot) × compression。
   * 判定の各段階で能力差が積み重なりすぎないようにする
   */
  skillPivot: 50,
  skillCompression: 0.5,
  /** その日の出来（チームごとに試合開始時に決まる。平均 1、標準偏差） */
  matchDayFormSd: 0.1,
  /** 適性係数（◎/○/△） */
  aptitudeMult: { 3: 1.0, 2: 0.9, 1: 0.75 } as Record<number, number>,
  /** 疲労係数 = fatigueFloor + (1 - fatigueFloor) × (体力/100) */
  fatigueFloor: 0.72,
  /** 試合開始時の体力 = startBase + startFromFitness × 普段の体力 */
  startStaminaBase: 72,
  startStaminaFromFitness: 0.28,

  // ---- ゾーン評価の重み ----
  /** 中盤の評価（支配率） */
  midWeights: { pass: 0.24, technique: 0.18, vision: 0.16, decision: 0.18, physical: 0.12, stamina: 0.12 },
  /** 列ごとの中盤への寄与 */
  midLineWeights: { GK: 0, DF: 0.35, MF: 1, FW: 0.35 },
  /** 守備の評価（パスの余裕時間・ブロック） */
  defWeights: { defense: 0.36, decision: 0.26, physical: 0.14, speed: 0.14, aerial: 0.1 },
  /** 攻撃の評価（受け手を選ぶ重み） */
  atkWeights: { shooting: 0.25, dribble: 0.2, speed: 0.15, technique: 0.15, decision: 0.15, kickPower: 0.1 },

  // ---- 区間ごとの攻撃回数・支配率 ----
  /** 1 区間（5 分）の両チーム合計の攻撃回数の期待値 */
  attacksPerSegment: 2.25,
  /** 支配率 = mid^k / (mid_A^k + mid_B^k) */
  possessionExponent: 1.6,
  possessionMin: 0.25,
  possessionMax: 0.75,
  possessionTactics: {
    attack: { attacking: 0.03, balanced: 0, defensive: -0.04 },
    press: { high: 0.03, mid: 0, low: -0.03 },
    buildUp: { buildUp: 0.02, long: -0.02 },
  },
  /** 攻撃回数への戦術補正（自チームの攻撃回数に掛ける） */
  attackRateTactics: { attacking: 1.12, balanced: 1.0, defensive: 0.85 },
  /** モメンタムの支配率への影響（モメンタム 100 で +0.2） */
  momentumPossession: 0.002,
  /** 3 点差以上でリードしている側は攻撃が緩む */
  bigLeadRelax: 0.8,

  // ---- 攻撃ルート ----
  routeWeights: { center: 1.0, side: 0.85, long: 0.3, setPiece: 0.14 },
  /** ロングボール主体のときのロングボールの重み */
  routeLongWithLongTactic: 1.0,
  /** カウンター：攻撃失敗の後に相手がカウンターを仕掛ける確率 */
  counterChance: 0.2,
  counterLineHighMult: 1.5,

  // ---- ビルドアップ（7.3）----
  /** ビルドアップ重視で、相手のプレスに引っかかって自陣ゴール前で奪われる基本確率 */
  buildUpErrorBase: 0.05,
  buildUpErrorScale: 9,
  buildUpPressMult: { high: 1.0, mid: 0.5, low: 0 },
  /** 奪われたときの相手のチャンスの質 */
  buildUpErrorChanceQ: 0.75,

  // ---- 視野の広さ × 判断（7.3）----
  /** 候補数 = 1 + floor(視野 / visionPerCandidate)（最大 5） */
  visionPerCandidate: 25,
  maxCandidates: 5,
  /** 余裕時間 T = T0 - Ta × 守備の質 / 100 */
  timeT0: 2.55,
  timeTa: 1.55,
  /** プレスの強さによる守備の質の補正 */
  pressDefenseBonus: { high: 7, mid: 0, low: -6 },
  /** 必要時間 t = t0 - tb × 判断 / 100 + 難しさ */
  needT0: 1.55,
  needTb: 0.9,
  /** 難しさの最大値（候補ごとに 0〜この値） */
  difficultyMax: 0.85,
  /** 候補の価値 = valueBase + (難しさ / 最大) × valueRange */
  valueBase: 0.25,
  valueRange: 0.75,
  /** パス精度の判定 */
  passAccBias: 40,
  passAccValue: 25,
  passAccScale: 11,
  /** 受け手の動き出し（判断・スピード）と相手 DF の差のチャンスの質への影響 */
  receiverEdgeScale: 30,
  receiverEdgeWeight: 0.35,
  /** パスが出せないとき、ドリブル突破を試みる確率 = ドリブル / dribbleTryDiv */
  dribbleTryDiv: 160,
  dribbleScale: 10,
  dribbleChanceQ: 0.5,

  // ---- ロングボール（7.3：パス × キック力）----
  /** 必要な飛距離（キック力で比べる） */
  longDistanceMin: 40,
  longDistanceMax: 85,
  longAccScale: 12,
  longAccBias: 45,
  aerialHeightPerCm: 0.8,
  aerialScale: 9,
  longChanceQ: 0.42,

  // ---- サイド ----
  crossChance: 0.55,
  crossQualityScale: 100,
  gkHighBallScale: 10,
  gkHighBallBias: -6,
  /** クロスに GK が届いたときのキャッチ判定 */
  gkCatchCrossBias: 48,
  gkCatchCrossScale: 9,
  headerChanceQ: 0.5,
  /** ヘディングの競り合いに負けたときのコーナーの確率 */
  clearedCornerChance: 0.3,

  // ---- 試合中の PK（エリア内のファウル）----
  /** チャンス（ボックス内）1 回あたりのファウルで PK の確率 */
  pkFoulChance: 0.012,

  // ---- シュート ----
  /** シュートを打つ確率 = sigmoid((Q - shotQBias)/shotQScale) */
  shotQBias: 0.18,
  shotQScale: 0.12,
  /** シュートの精度 = シュート × accShoot + キック力 × accPower（ミドルは強さの比重が大きい） */
  blockBase: 0.24,
  /** 枠内率 = sigmoid((精度 - onTargetBias + Q × onTargetQ)/onTargetScale) */
  onTargetBias: 61,
  onTargetQ: 28,
  onTargetScale: 13,
  middlePenalty: 9,
  /** ミドルシュートの割合（Q が低いチャンスほどミドルになりやすい） */
  middleShotBase: 0.35,

  // ---- GK（7.3）----
  /** コース = 一様乱数 × placeSpread + 精度/100 × placeAcc + Q × placeQ */
  placeSpread: 0.75,
  placeAcc: 0.2,
  placeQ: 0.22,
  /** 届く範囲 = reachBase + ポジショニング/100 × reachPos */
  reachBase: 0.52,
  reachPos: 0.5,
  /** セーブ = sigmoid((セービング - 強さ × savePowerW - Q × saveQ + saveBias)/saveScale) */
  savePowerW: 0.55,
  saveQ: 26,
  saveBias: 5,
  saveScale: 11,
  /** キャッチ = sigmoid((キャッチング - 強さ × catchPowerW + catchBias)/catchScale) */
  catchPowerW: 0.4,
  catchBias: -4,
  catchScale: 10,
  /** こぼれ球を攻撃側が拾う確率 */
  reboundToAttacker: 0.45,
  reboundChanceQ: 0.55,
  /** はじいたボールがコーナーになる確率 */
  parryCornerChance: 0.35,

  // ---- カウンター・1 対 1 ----
  counterScale: 10,
  counterChanceQ: 0.62,
  /** GK の飛び出し（スピード・スタミナ・フィジカル）で 1 対 1 を止める */
  oneOnOneScale: 11,
  oneOnOneBias: -6,

  // ---- 疲労 ----
  /** 1 区間あたりの体力の減り = drainBase × プレス係数 × (drainStamA - スタミナ/100 × drainStamB) */
  drainBase: 2.25,
  drainStamA: 1.35,
  drainStamB: 0.7,
  drainPress: { high: 1.3, mid: 1.0, low: 0.82 },
  gkDrainMult: 0.35,

  // ---- モメンタム ----
  momentumDecay: 0.82,
  momentum: { goal: 26, onTarget: 7, shot: 4, chance: 2 },

  // ---- PK（SPEC 10.6）----
  pk: {
    /** 読み勝ち確率 = sigmoid((キッカーの読み - GK の読み)/readScale + readBias) */
    readScale: 22,
    readBias: 0.48,
    /** 逆を突いても枠を外す確率 = missBase + missAcc × (1 - シュート/100)^2 */
    missBase: 0.02,
    missAcc: 0.17,
    /** 読まれた場合 = sigmoid(((シュート+キック力) - (セービング+ポジショニング))/duelScale + duelBias) */
    duelScale: 28,
    duelBias: -0.15,
    /** 5 本ずつ */
    kicks: 5,
  },

  // ---- CPU の采配 ----
  ai: {
    subFromMinute: 55,
    subFitnessBelow: 52,
    maxSubsPerSegment: 2,
    chaseFromMinute: 60,
    protectFromMinute: 72,
  },
};
