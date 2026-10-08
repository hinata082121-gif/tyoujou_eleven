import type { ReputationLevel, SchoolRank } from "../types";

/** 評判ごとの手札・1学年の人数（SPEC 6章） */
export const REPUTATION_TABLE: Record<ReputationLevel, { handSize: number; gradeSize: number; scholarshipSlots: number }> = {
  0: { handSize: 4, gradeSize: 9, scholarshipSlots: 2 },
  1: { handSize: 5, gradeSize: 10, scholarshipSlots: 3 },
  2: { handSize: 6, gradeSize: 11, scholarshipSlots: 3 },
  3: { handSize: 7, gradeSize: 13, scholarshipSlots: 4 },
  4: { handSize: 8, gradeSize: 14, scholarshipSlots: 5 },
};

/** 評判ゲージ（0〜100）の動き */
export const REPUTATION_GAUGE = {
  max: 100,
  /** 昇格した直後のゲージ */
  afterPromotion: 25,
  /** 降格した直後のゲージ */
  afterDemotion: 70,
  /** 勝利の基本値（試合の種類別） */
  winBase: { practice: 3, prefQualifier: 5, national: 9 },
  /** 敗戦の基本値（試合の種類別） */
  lossBase: { practice: 2, prefQualifier: 5, national: 4 },
  /** 引き分け（練習試合）で格上相手なら少し上がる */
  drawVsStronger: 1,
  /** PK 戦での敗戦は下がり幅を小さくする */
  pkLossMult: 0.7,
  /**
   * 相手とのランク差（相手 − 自校）ごとの勝利の倍率。格上に勝つほど大きい。
   * キーは -5〜5。範囲外は端の値を使う
   */
  winRankMult: { [-3]: 0.2, [-2]: 0.35, [-1]: 0.6, 0: 1.0, 1: 1.7, 2: 2.5, 3: 3.4 } as Record<number, number>,
  /** ランク差ごとの敗戦の倍率。格下に負けるほど大きい */
  lossRankMult: { [-3]: 1.8, [-2]: 1.5, [-1]: 1.2, 0: 1.0, 1: 0.6, 2: 0.4, 3: 0.3 } as Record<number, number>,
  /** 評判が高いほど下がり幅を大きくする（極端にはしない） */
  lossLevelMult: { 0: 0.8, 1: 1.0, 2: 1.15, 3: 1.3, 4: 1.4 } as Record<ReputationLevel, number>,
  /** 大会の成績ボーナス */
  bonus: {
    prefChampion: 18,
    nationalWinPerRound: 4,
    nationalChampion: 40,
  },
};

/** 評判とランクの目安（表示・CPU の格の換算用） */
export const REPUTATION_TO_RANK: Record<ReputationLevel, SchoolRank> = { 0: "E", 1: "D", 2: "C", 3: "B", 4: "A" };
