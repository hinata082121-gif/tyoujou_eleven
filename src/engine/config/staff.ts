/**
 * スタッフ制度の係数（SPEC 9章、docs/PHASE2A_PLAN.md 2〜4章）。数値は npm run balance で調整する。
 */
import type { Career, StaffAbility, StaffRole } from "../types";

export const STAFF_GEN = {
  /** 雇えるときの能力 = base + fromAptitude × 素地 + 進路の補正 + 誤差 */
  base: 15,
  fromAptitude: 45,
  sd: 5,
  min: 5,
  max: 70,
  /** 指導力の素地 = 総合/100 × fromOverall + 指導の素質 × fromTalent（名選手、名監督にあらず） */
  coachingFromOverall: 0.2,
  coachingFromTalent: 0.8,
  /** 指導の素質（仮の隠しパラメーター。Phase 2b で性格に置き換える） */
  talentMean: 0.5,
  talentSd: 0.18,
  /** 主将だった人の戦術眼の素地への加算 */
  captainTactics: 0.1,
  /** 2 番目に高い素地との差がこの値以内なら、得意分野を 2 つにする */
  secondSpecialtyGap: 0.08,
  /** 得意分野の上限 = capBase + capFromAptitude × 素地 + 誤差。範囲は capMin〜100 */
  specialtyCapBase: 78,
  specialtyCapFromAptitude: 22,
  specialtyCapSd: 6,
  specialtyCapMin: 75,
  /** 得意分野以外の上限（一様乱数）。雇えるときの能力 + otherCapMargin は下回らない */
  otherCapMin: 60,
  otherCapMax: 80,
  otherCapMargin: 5,
};

/** 進路ごとの、雇える時期（卒業から何年後）・能力の補正・伸び方 */
export const CAREER_STAFF: Record<Career, { availableAfter: [number, number]; bonus: Partial<Record<StaffAbility, number>>; growthMult: number }> = {
  pro: { availableAfter: [8, 14], bonus: { tactics: 8, gkCoaching: 8, conditioning: 8 }, growthMult: 0.9 },
  university: { availableAfter: [4, 4], bonus: {}, growthMult: 1.0 },
  worker: { availableAfter: [6, 10], bonus: { conditioning: 5 }, growthMult: 0.95 },
  coach: { availableAfter: [4, 4], bonus: { coaching: 10, tactics: 5 }, growthMult: 1.2 },
  other: { availableAfter: [4, 10], bonus: { coaching: -5, tactics: -5, gkCoaching: -5, conditioning: -5, scouting: -5 }, growthMult: 0.9 },
};

/** 架空の OB（ゲーム開始時とマイグレーション） */
export const FICTIONAL_ALUMNI = {
  count: [5, 6] as [number, number],
  /** 年齢の範囲 */
  age: [24, 50] as [number, number],
  /** 現役時代の能力の基準値（弱小校の OB という想定） */
  statBase: 42,
  /** 最初から強いスタッフは出さない（雇えるときの能力の上限） */
  maxStart: 49,
};

/** 年度末の成長：伸び = base × 役割の重み × 進路の倍率 × 年齢の倍率 × 伸びしろ × (1 + 成果) + 誤差 */
export const STAFF_GROWTH = {
  base: 6,
  sd: 1,
  /** 伸びしろ = clamp((上限 − 現在) / headroomScale, 0, 1) */
  headroomScale: 30,
  /** 役割の主な能力の重みと、それ以外の重み */
  mainWeight: 1.0,
  otherWeight: 0.25,
  /** 年齢の倍率：peakAge まで 1、stopAge で 0 */
  peakAge: 45,
  stopAge: 60,
  /** 成果ボーナスの上限 */
  maxBonus: 0.5,
};

/** 役割ごとの主な能力 */
export const ROLE_ABILITIES: Record<StaffRole, StaffAbility[]> = {
  head: ["coaching", "tactics"],
  gk: ["gkCoaching"],
  physical: ["conditioning"],
  analyst: ["scouting"],
};

export const STAFF_LIFE = {
  /** 卒業時の年齢 */
  graduateAge: 18,
  /** この年齢から毎年 retireChance の確率で勇退。forceRetireAge で必ず勇退 */
  retireFromAge: 60,
  retireChance: 0.2,
  forceRetireAge: 68,
  /** 引き抜き：確率 = poachMax × clamp((最も高い能力 − poachFrom) / poachRange, 0, 1)^poachPow */
  poachMax: 0.25,
  poachFrom: 65,
  poachRange: 30,
  poachPow: 1.5,
  /** この能力以上ならプロからの誘いもある */
  proOfferFrom: 90,
  /** 予告の後、年度末に去る確率 */
  leaveAfterNotice: 0.7,
  /** 引き抜きの判定日（[月, 日]） */
  poachDate: [12, 1] as const,
};

/** 臨時コーチ（ヘッドコーチが不在のときに自動で配置） */
export const TEMP_COACH = {
  min: 15,
  max: 25,
  cap: 30,
  age: [35, 60] as [number, number],
};

/** スタッフの効果（SPEC 9章・PLAN 4章） */
export const STAFF_EFFECTS = {
  /** 練習効率 = +(能力 − effectFrom) / effectRange × perRole（effectFrom 以下は 0） */
  effectFrom: 20,
  effectRange: 80,
  /** ヘッドコーチの指導力による全体の練習効率 */
  headPractice: 0.1,
  /** GK コーチの GK 指導による、GK の練習効率（GK 練習・PK 練習） */
  gkPractice: 0.1,
  /** GK コーチによる、PK 練習での GK の PK 駆け引きの伸び */
  gkPkPractice: 0.15,
  /** 1 人の選手にかかる練習効率の補正の合計の上限（インフレ防止） */
  practiceCap: 0.15,
  /** フィジカルコーチ：毎日の自然回復 +(体力管理/100) × recovery */
  recovery: 0.3,
  /** フィジカルコーチ：練習中・試合中のケガの確率 −(体力管理/100) × injuryReduce */
  injuryReduce: 0.4,
  /** 分析担当：PK の読みに足す値 = スカウティング × pkScouting */
  pkScouting: 0.25,
};

/** CPU 校のスタッフの値（格 prestige 0〜5 に応じてばらつかせる） */
export const CPU_STAFF = {
  /** 戦術眼の平均。格が中くらいの学校で、Phase 1 の CPU の采配（質 0.6）と同じくらい */
  tacticsMean: [45, 50, 55, 60, 65, 70],
  scoutingMean: [22, 28, 35, 42, 50, 58],
  sd: 10,
  /** 分析担当がいない（scouting = 0）確率 */
  noAnalystChance: [0.7, 0.55, 0.4, 0.25, 0.12, 0.05],
  /** 年度替わりの変動 */
  yearlySd: 3,
};
