import type { SchoolRank } from "../types";

export type PrefTier = "competitive" | "normal" | "small";

/**
 * 県ごとの区分（激戦区／普通／少数）。
 * 実在の高校のデータは使わない。人口の規模をもとにした架空の傾向で、自由に書き換えてよい。
 */
export const PREFECTURE_TIERS: Record<string, PrefTier> = {
  tokyo: "competitive",
  kanagawa: "competitive",
  osaka: "competitive",
  aichi: "competitive",
  saitama: "competitive",
  chiba: "competitive",
  hyogo: "competitive",
  fukuoka: "competitive",
  hokkaido: "competitive",
  tottori: "small",
  shimane: "small",
  kochi: "small",
  tokushima: "small",
  fukui: "small",
  saga: "small",
  yamanashi: "small",
  wakayama: "small",
  kagawa: "small",
  akita: "small",
  toyama: "small",
  yamagata: "small",
};
export const prefTier = (prefId: string): PrefTier => PREFECTURE_TIERS[prefId] ?? "normal";

/** 冬の全国大会の代表校の数（東京のみ 2） */
export const PREFECTURE_REPS: Record<string, number> = { tokyo: 2 };
export const prefReps = (prefId: string): number => PREFECTURE_REPS[prefId] ?? 1;
/** 夏の全国大会の代表校の数（東京・神奈川・大阪は 2。開催県の +1 は年ごとに足す。P2c） */
export const PREFECTURE_SUMMER_REPS: Record<string, number> = { tokyo: 2, kanagawa: 2, osaka: 2 };
export const prefSummerReps = (prefId: string): number => PREFECTURE_SUMMER_REPS[prefId] ?? 1;

/** 区分ごとの設定 */
export const TIER_SETTINGS: Record<
  PrefTier,
  {
    /** 自県にしたときの県予選の参加校数 */
    playerPrefSchools: { min: number; max: number };
    /** 自県の学校の格の出やすさ（0=E 〜 5=S） */
    playerPrefPrestige: number[];
    /** 他県のとき、部員を持つ学校の数 */
    otherPrefSchools: number;
    /** 他県のとき、部員を持つ学校（県内の上位校）の格の出やすさ */
    otherPrefPrestige: number[];
  }
> = {
  competitive: {
    playerPrefSchools: { min: 28, max: 32 },
    playerPrefPrestige: [26, 26, 22, 15, 9, 2],
    otherPrefSchools: 4,
    /** P3 で格 5 を減らした（全国の上位に S が多すぎて、自校が全国で優勝できなかったため。計画 Q7） */
    otherPrefPrestige: [0, 6, 22, 36, 30, 6],
  },
  normal: {
    playerPrefSchools: { min: 20, max: 26 },
    playerPrefPrestige: [30, 28, 22, 13, 6, 1],
    otherPrefSchools: 3,
    otherPrefPrestige: [3, 14, 30, 34, 17, 2],
  },
  small: {
    playerPrefSchools: { min: 16, max: 19 },
    playerPrefPrestige: [36, 30, 20, 10, 4, 0],
    /** P2c で 2 → 3（開催県になったときに夏の予選の意味がなくならないように） */
    otherPrefSchools: 3,
    otherPrefPrestige: [8, 24, 36, 24, 8, 0],
  },
};

/**
 * チーム力（ベスト 11 の評価値の平均）からランクを決める下限値。
 * 目安：弱小≈E、そこそこ≈D、中堅≈C、強豪≈B、名門≈A、S は飛び抜けたチームだけ
 */
export const RANK_STRENGTH_MIN: Record<SchoolRank, number> = {
  E: 0,
  D: 50,
  C: 54,
  B: 58,
  A: 62,
  S: 66.5,
};

/**
 * CPU 校の「格」（prestige 0〜5。ほぼランクに対応）ごとの新入生の能力の基準値。
 * 2・3 年生は、新入生として生成してから在学年数分の成長をかけて作る。
 * 格の高い学校ほど良い新入生が集まる（特待生に相当）。
 * P3 で格 5 を 52 → 49 に下げた（全国の上位に S が多すぎたため。計画 Q7）
 */
export const PRESTIGE_LEVEL_BASE = [28, 33, 37.3, 42, 47.2, 49];
/** 格ごとの 1 学年の人数 */
export const PRESTIGE_GRADE_SIZE = [9, 10, 11, 12, 13, 14];


/** プレイヤー校の初期部員（弱小） */
export const PLAYER_START = {
  /** 新入生としての基準値（上の学年は成長をかけて作る） */
  freshmanBase: 29,
};

/** CPU 校の格は年度替わりに少し変動する */
export const PRESTIGE_DRIFT = {
  /** 上下に 1 動く確率 */
  chance: 0.15,
  /** 全国大会で好成績なら上がりやすい */
};

/**
 * CPU 校の試合のときの部員の状態（試合ごとに決める。保存はしない）。
 * プレイヤー校はすごろくで体力・調子・ケガが変わるので、CPU 校にも同じ程度の変動を持たせる。
 * 値は「うまい采配の自動プレイ」での自校の試合時の状態（調子はやや良い、ケガ 1 試合 0.2 人程度）に合わせた。
 * P2c で「15% の試合でチーム全体が疲れた状態で来る」仕組みをやめ、体力の平均と散らばりを自校の実測に合わせた。
 * 大会の本戦では、この値ではなく持ち越した体力を使う（School.carryFitness）。
 */
export const CPU_MATCH_CONDITION = {
  fitnessMean: 76,
  fitnessSd: 13,
  fitnessMin: 15,
  /** 調子 -2〜2 の出やすさ */
  conditionWeights: [4, 16, 48, 24, 8],
  /** ケガなどで出られない確率（1 人あたり） */
  unavailableChance: 0.008,
};
