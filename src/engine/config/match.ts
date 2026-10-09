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
    attack: { attacking: 0.02, balanced: 0, defensive: -0.02 },
    press: { high: 0.01, mid: 0, low: -0.01 },
    buildUp: { buildUp: 0.01, long: 0 },
    line: { high: 0.01, low: -0.01 },
  },
  /** 攻撃回数への戦術補正（自チームの攻撃回数に掛ける） */
  attackRateTactics: { attacking: 1.08, balanced: 1.0, defensive: 0.85 },
  /** 攻撃方針による守備の質の補正（守備的なほど人数をかけて守る） */
  attackStyleDefense: { attacking: -2, balanced: 0, defensive: 3 },
  /** 攻撃方針による、ボールを失ったときにカウンターを受ける確率の倍率 */
  attackStyleCounterExposure: { attacking: 1.25, balanced: 1.0, defensive: 0.7 },
  /** 攻撃方針による、相手のボールを奪ったときにカウンターを仕掛ける確率の倍率（守って速攻） */
  attackStyleCounterAttack: { attacking: 0.9, balanced: 1.0, defensive: 1.35 },
  /** 守っている側の攻撃方針による、相手のチャンスの質の倍率 */
  attackStyleChanceQ: { attacking: 1.05, balanced: 1.0, defensive: 0.94 },
  /** モメンタムの支配率への影響（モメンタム 100 で +0.2） */
  momentumPossession: 0.002,
  /** 3 点差以上でリードしている側は攻撃が緩む */
  bigLeadRelax: 0.8,

  // ---- 攻撃ルート ----
  routeWeights: { center: 1.0, side: 0.85, long: 0.3, setPiece: 0.14 },
  /** ロングボール主体のときのロングボールの重み */
  routeLongWithLongTactic: 0.8,
  /** カウンター：攻撃失敗の後に相手がカウンターを仕掛ける確率 */
  counterChance: 0.2,
  counterLineHighMult: 1.5,

  // ---- ビルドアップ（7.3）----
  /** ビルドアップ重視で、相手のプレスに引っかかって自陣ゴール前で奪われる基本確率 */
  buildUpErrorBase: 0.08,
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
  pressDefenseBonus: { high: 1, mid: 0, low: -1 },
  /** ラインの高さによる守備の質の補正（引いて守るとゴール前が堅い） */
  lineDefenseBonus: { high: 0, low: 3 },
  /**
   * 堅守速攻（守備的・ライン低）で格上と戦うときの補正。相手とのランク差 1 段階ごとに効く（最大 maxRanks 段階）。
   * 格上に番狂わせを狙う型という位置づけ。同じランクどうしでは効かない
   */
  underdogLowBlock: { defensePerRank: 4, chanceQPerRank: 0.07, counterPerRank: 0.25, maxRanks: 3 },
  /** プレス高なのにライン低（前と後ろの間が空く）ときの守備の質の補正と、相手のチャンスの質の倍率 */
  pressLineGapDefense: -5,
  pressLineGapChanceQ: 1.12,
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
  longDistanceMax: 70,
  longAccScale: 12,
  longAccBias: 38,
  aerialHeightPerCm: 0.8,
  aerialScale: 9,
  longChanceQ: 0.48,
  /** 相手のラインが高いと、ロングボールで裏を取りやすい */
  longVsHighLineQ: 0.12,

  // ---- 戦術の相性（循環型。どの戦術にも苦手な相手がいる）----
  //   ハイプレス → つなぐ（ビルドアップ）に強い
  //   ロングボール → ハイプレス（前がかり）に強い
  //   引いて守る（ライン低） → ロングボールに強い
  //   つなぐ（ビルドアップ） → 引いて守る相手に強い
  matchup: {
    /** 相手のプレスが高いとき、ビルドアップの攻撃のチャンスの質の倍率 */
    buildUpVsHighPressQ: 0.8,
    /** 相手のラインが低いとき、ビルドアップの攻撃のチャンスの質の倍率（崩す時間がある） */
    buildUpVsLowLineQ: 1.4,
    /** 相手のプレスが高いとき、ロングボールのチャンスの質に足す値（前がかりの裏） */
    longVsHighPressQ: 0.4,
    /** 相手のラインが低いとき、ロングボールのチャンスの質から引く値（ゴール前に人数がいる） */
    longVsLowLineQ: 0.32,
    /** 相手のラインが低いとき、ロングボールの競り合いで守備側に足す値 */
    longVsLowLineAerial: 8,
    /** 支配率への補正：ビルドアップ側が、相手のハイプレスに押し込まれる */
    buildUpVsHighPressPossession: -0.07,
    /** 支配率への補正：ビルドアップ側が、引いた相手にボールを持たせてもらう */
    buildUpVsLowLinePossession: 0.07,
    /** 攻撃回数の倍率：ロングボール側が、相手のハイプレスの裏を狙える */
    longVsHighPressRate: 1.2,
    /** 攻撃回数の倍率：ロングボール側が、引いた相手に蹴り込んでも跳ね返される */
    longVsLowLineRate: 0.82,
  },

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

  // ---- ファウル・カード（SPEC 10.2。P2a）----
  fouls: {
    /** 1 対 1 で抜かれた守備側が、ファウルで止める確率 */
    duelFoul: 0.1,
    /** 守備側の判断が低いほどファウルしやすい（判断 50 で 1 倍。判断 1 ポイントあたり） */
    duelDecisionSlope: 0.012,
    /** プレスの強さによるファウルの多さ */
    pressMult: { high: 1.3, mid: 1.0, low: 0.8 },
    /** 中盤での（攻撃の判定に現れない）ファウル：チームごと、区間あたりの期待値（相手の支配率 50% のとき） */
    backgroundPerSegment: 0.32,
    /** ボックス外のファウルが、直接狙えるフリーキック・セットプレーになる確率 */
    freeKickDanger: 0.3,
    /** ファウル 1 回でイエローが出る確率（ボックス内は inBox） */
    yellow: 0.2,
    yellowInBox: 0.45,
    /** 一発レッド */
    red: 0.0008,
    redInBox: 0.03,
    /** イエローを受けている選手は、ファウルを控える（選ばれる重み）・カードが出にくい */
    bookedFoulMult: 0.3,
    bookedYellowMult: 0.5,
  },

  // ---- 試合中のケガ（P2a）----
  injury: {
    /** 区間（5 分）あたり・ピッチ上の選手 1 人あたりの確率 */
    perSegment: 0.00015,
    /** 体力が低いほど上がる：× (1 + fatigue × (1 − 体力/100)) */
    fatigue: 1.5,
    /** ファウルを受けたときのケガの確率 */
    onFoul: 0.004,
    severityWeights: { light: 6, medium: 3, severe: 1 },
    /** 試合後に離脱する日数 */
    days: { light: [3, 7], medium: [8, 20], severe: [21, 45] } as Record<string, [number, number]>,
  },

  // ---- 人数が減ったとき（退場・交代できないケガ）。1 人あたり ----
  manDown: {
    possession: 0.05,
    defense: 4,
    attackRate: 0.9,
    /** 残りの選手の疲労の増え方 */
    drain: 0.1,
  },

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
  drainPress: { high: 1.4, mid: 1.0, low: 0.82 },
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
    subFitnessBelow: 76,
    maxSubsPerSegment: 2,
    chaseFromMinute: 60,
    protectFromMinute: 72,
    /** 上の数値はこの質（0〜1）のときの値。スタッフを持たないチームもこの値 */
    baseQuality: 0.6,
    /** 質が 1 違うと、交代を始める分・交代する体力・方針を切り替える分がこれだけ変わる */
    qualitySubMinute: 25,
    qualitySubFitness: 10,
    qualityTacticsMinute: 20,
    /** この質より低いと、2 区間に 1 回しか動かない */
    sluggishBelow: 0.35,
  },
};
