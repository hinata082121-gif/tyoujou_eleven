/**
 * 特待生スカウト（SPEC 8章、docs/PHASE2C_PLAN.md 3章）。数値は npm run balance で調整する。
 * 地域・県の傾向はすべて架空のもの。
 */
import type { ScoutScope } from "./reputation";
import type { Affiliation, Position, Reaction, StatKey } from "../types";

/** 地域の隣接（実在の 9 地域をもとに） */
export const REGION_ADJACENCY: Record<string, string[]> = {
  hokkaido: ["tohoku"],
  tohoku: ["hokkaido", "kanto", "hokushinetsu"],
  kanto: ["tohoku", "hokushinetsu", "tokai"],
  hokushinetsu: ["tohoku", "kanto", "tokai", "kinki"],
  tokai: ["kanto", "hokushinetsu", "kinki"],
  kinki: ["hokushinetsu", "tokai", "chugoku", "shikoku"],
  chugoku: ["kinki", "shikoku", "kyushu"],
  shikoku: ["kinki", "chugoku", "kyushu"],
  kyushu: ["chugoku", "shikoku"],
};

/** 範囲ごとの候補の人数 */
export const CANDIDATE_COUNT: Record<ScoutScope, number> = { pref: 8, region: 12, adjacent: 16, national: 20 };

/** 地域の傾向（架空）：ポジションの出やすさの倍率と、能力の傾き */
export const REGION_TENDENCY: Record<string, { label: string; positions?: Partial<Record<Position, number>>; stats?: Partial<Record<StatKey, number>> }> = {
  hokkaido: { label: "GKとDFが多め。体の強い選手が育つ", positions: { GK: 1.6, CB: 1.3 }, stats: { physical: 2 } },
  tohoku: { label: "守備型が多い。粘り強い", positions: { CB: 1.2, DMF: 1.3, SB: 1.2 }, stats: { stamina: 2, defense: 1 } },
  kanto: { label: "平均的。候補が多い", stats: {} },
  hokushinetsu: { label: "空中戦の強い選手が多い", positions: { CB: 1.2, CF: 1.2 }, stats: { aerial: 2 } },
  tokai: { label: "攻撃型（FW・トップ下）が多い。技術が高い", positions: { CF: 1.3, OMF: 1.4, WG: 1.2 }, stats: { technique: 2 } },
  kinki: { label: "ドリブラーが多い", positions: { WG: 1.4, OMF: 1.2 }, stats: { dribble: 2 } },
  chugoku: { label: "パスのうまいMFが多い", positions: { CMF: 1.4, DMF: 1.2 }, stats: { pass: 2 } },
  shikoku: { label: "スピード型が多い", positions: { WG: 1.3, SB: 1.3 }, stats: { speed: 2 } },
  kyushu: { label: "フィジカル・スピード型が多い", positions: { CF: 1.2, CB: 1.2 }, stats: { physical: 1, speed: 1 } },
};
/** 県ごとの上乗せ（架空。初期は数県だけ） */
export const PREF_TENDENCY: Record<string, { positions?: Partial<Record<Position, number>>; stats?: Partial<Record<StatKey, number>> }> = {
  shizuoka: { positions: { OMF: 1.3 }, stats: { technique: 1 } },
  saitama: { positions: { CF: 1.2 } },
  kagoshima: { stats: { stamina: 1 } },
  hiroshima: { positions: { GK: 1.3 } },
};

export const SCOUT = {
  /** スカウト期間（[月, 日]）。カードは start〜lastCard に均等に届き、replyDate で消える */
  start: [11, 1] as const,
  lastCard: [2, 20] as const,
  /** 候補の能力の基準値：ふつうの候補は CPU の強豪校（格 3）、最上位は一段上（格 4）の新入生と同じ */
  normalPrestige: 3,
  topPrestige: 4,
  /**
   * P3：評判ごとに候補の水準を上げる段数（計画 Q7）。強豪は一段（ふつう 格 4・最上位 格 5）、名門は二段（ふつう 格 5・最上位はその上）
   */
  levelStep: [0, 0, 0, 1, 2] as number[],
  /** 格 5 より上の水準（名門の最上位の候補）は、格 5 の基準値にこれを足す */
  beyondTopBase: 2.5,
  /** P3：評判ごとに候補の基準値へ足す値（名門の自校が A に届くように。総合 B の割合は一般入部だけなので変わらない） */
  /** R2：強豪 +1・名門 +3 に上げた（重点で総合ほどは試合の強さが上がらず、全国優勝の到達率が下がったため。2026-10-15） */
  levelBonus: [0, 0, 0, 1, 3] as number[],
  baseSd: 2.5,
  /** 最上位の候補の割合（ジュニアユースは ×topYouthMult） */
  topShare: 0.2,
  topYouthMult: 2,
  affiliation: { juniorHigh: 50, townClub: 30, juniorYouth: 20 } as Record<Affiliation, number>,
  /** 実績：総合 + 所属の補正 + 誤差 が、この値以上なら 全国／地域／県 */
  achievementAt: [40, 45, 50] as [number, number, number],
  achievementSd: 4,
  achievementBonus: { juniorHigh: 0, townClub: 1, juniorYouth: 4 } as Record<Affiliation, number>,
  /** メーターの誤差 = meterSd ×（1 − perAchievement × 実績）×（1 − fromScouting × スカウティング/100）。最小 meterMin */
  meterSd: 8,
  perAchievement: 0.22,
  fromScouting: 0.5,
  meterMin: 1.5,
  /** 再訪問ごとのメーターの誤差の倍率 */
  revisitMeterMult: 0.85,
  /** 寸評が正しい確率 = commentBase + commentFromScouting × スカウティング/100 + 再訪問ごとに commentPerVisit */
  commentBase: 0.55,
  commentFromScouting: 0.4,
  commentPerVisit: 0.1,
  /** 初めての反応：点数 = base + perReputation × 評判 − fromStrength × 強さ − topPenalty（最上位）+ 寮 ± noise */
  reaction: { base: 0.55, perReputation: 0.12, fromStrength: 0.3, topPenalty: 0.25, noise: 0.2, good: 0.7, normal: 0.35 },
  /** 強さ = clamp((総合 − strengthFrom) / strengthRange, 0, 1) */
  strengthFrom: 38,
  strengthRange: 12,
  /** 再訪問で 1 段階好転する確率 = base + perReputation × 評判 + 寮の補正 × improveFromDorm */
  improve: { base: 0.2, perReputation: 0.08, fromDorm: 0.8 },
  /** 2/28 の返事：入部する確率（反応ごと）× 取り合いの相手 1 つにつき rivalMult */
  joinChance: { good: 0.75, normal: 0.4, bad: 0.1 } as Record<Reaction, number>,
  rivalMult: 0.7,
  /** 断られたとき、取り合いの相手に決まる確率 */
  lostToRival: 0.8,
  /** 最上位の候補の取り合いの相手の数 */
  rivals: [1, 2] as [number, number],
  /** 取り合いの相手になる CPU 校の格 */
  rivalPrestige: 3,
};
