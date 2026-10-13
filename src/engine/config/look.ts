/**
 * 選手の見た目とユニフォーム（SPEC 17章。P4）の種類と出やすさ。
 *
 * 種類はこの一覧の「番号」でセーブに入る。**一覧は後ろに足すだけにする（並べ替え・削除はしない）**。
 * 新しい種類（P5 の留学生の髪の色・肌の色など）は後ろに足し、ふつうの新入生の出やすさ（weight）を 0 にしておけば、
 * 今までの選手の見た目も、これから生まれる選手の見た目も変わらない。
 */
import type { CompetitionKind } from "../types";

export interface LookOption {
  id: string;
  /** ふつうの新入生（自校・CPU 校）での出やすさ */
  weight: number;
}

export interface ColorOption extends LookOption {
  hex: string;
}

/** 髪型（表示名は names.ts の HAIR_STYLE_NAMES） */
export const HAIR_STYLES: readonly LookOption[] = [
  { id: "short", weight: 4 },
  { id: "buzz", weight: 3 },
  { id: "long", weight: 1 },
  { id: "twoBlock", weight: 3 },
  { id: "curly", weight: 1 },
  { id: "spiky", weight: 1.5 },
  { id: "bowl", weight: 1.5 },
  { id: "centerPart", weight: 1.5 },
];

/** 髪の色（黒・こげ茶が中心。金髪などの明るい色は入れない。SPEC 17.3） */
export const HAIR_COLORS: readonly ColorOption[] = [
  { id: "black", hex: "#1d1a1a", weight: 50 },
  { id: "darkBrown", hex: "#2e2420", weight: 30 },
  { id: "brown", hex: "#4a3426", weight: 9 },
  { id: "lightBrown", hex: "#7a5232", weight: 2 },
  { id: "auburn", hex: "#5a3022", weight: 4 },
  { id: "ashBlack", hex: "#3a3634", weight: 5 },
];

/** 肌の色（明るい → 濃い） */
export const SKIN_TONES: readonly ColorOption[] = [
  { id: "s1", hex: "#f6dcc4", weight: 1 },
  { id: "s2", hex: "#eccba9", weight: 3 },
  { id: "s3", hex: "#deb48c", weight: 3 },
  { id: "s4", hex: "#c8956b", weight: 2 },
  { id: "s5", hex: "#a6714c", weight: 0.6 },
];

export const EYES: readonly LookOption[] = [
  { id: "dot", weight: 1 },
  { id: "oval", weight: 1 },
  { id: "round", weight: 1 },
  { id: "narrow", weight: 1 },
  { id: "droopy", weight: 1 },
  { id: "sharp", weight: 1 },
];

export const BROWS: readonly LookOption[] = [
  { id: "straight", weight: 1 },
  { id: "up", weight: 1 },
  { id: "thick", weight: 1 },
  { id: "thin", weight: 1 },
  { id: "worried", weight: 1 },
];

export const MOUTHS: readonly LookOption[] = [
  { id: "flat", weight: 1 },
  { id: "smallSmile", weight: 1 },
  { id: "wide", weight: 1 },
  { id: "o", weight: 1 },
];

/** 見た目の要素の並び（セーブの配列の順。要素を足すときは後ろに足す） */
export const LOOK_PARTS = ["hair", "hairColor", "skin", "eyes", "brows", "mouth"] as const;
export const LOOK_OPTIONS: Record<(typeof LOOK_PARTS)[number], readonly LookOption[]> = {
  hair: HAIR_STYLES,
  hairColor: HAIR_COLORS,
  skin: SKIN_TONES,
  eyes: EYES,
  brows: BROWS,
  mouth: MOUTHS,
};

/** 身長・フィジカルを体型に反映する幅（表示用） */
export const BODY = {
  heightCm: { min: 160, max: 195 },
  /** 身長の最小 → 最大での体の高さの倍率（頭の大きさは変えない） */
  heightScale: { min: 0.92, max: 1.08 },
  /** フィジカルの能力 20 → 99 での体の厚みの倍率 */
  physical: { min: 20, max: 99 },
  buildScale: { min: 0.9, max: 1.12 },
};

// ================= ユニフォーム =================

/** デザインのテンプレート（表示名は names.ts の KIT_TEMPLATE_NAMES） */
export const KIT_TEMPLATES = ["solid", "vstripe", "hoop", "half", "sash", "shoulder", "chestBand", "pinstripe"] as const;
export type KitTemplate = (typeof KIT_TEMPLATES)[number];
/** CPU 校のテンプレートの出やすさ（無地・縦縞が少し多め） */
export const CPU_TEMPLATE_WEIGHTS: Record<KitTemplate, number> = { solid: 4, vstripe: 2.5, hoop: 1.5, half: 1, sash: 1, shoulder: 1.5, chestBand: 1.5, pinstripe: 1 };

/** ユニフォームの色のパレット（24 色。表示名は names.ts の KIT_COLOR_NAMES。後ろに足すだけ） */
export const KIT_PALETTE: readonly string[] = [
  "#f4f4f2", // 0 白
  "#1c1c1e", // 1 黒
  "#8a8f98", // 2 灰
  "#1b2a5c", // 3 紺
  "#1e5bc6", // 4 青
  "#5fb4e8", // 5 水色
  "#1f8a43", // 6 緑
  "#0f5132", // 7 深緑
  "#8cc63f", // 8 黄緑
  "#f5d020", // 9 黄
  "#c9a227", // 10 金
  "#f07c19", // 11 橙
  "#d32f2f", // 12 赤
  "#7b1e2b", // 13 えんじ
  "#ef7fa8", // 14 ピンク
  "#6a3d9a", // 15 紫
  "#7a4a2a", // 16 茶
  "#d9c7a0", // 17 ベージュ
  "#13a3a3", // 18 ターコイズ
  "#a99ad6", // 19 ラベンダー
  "#c0c4ca", // 20 銀
  "#4a4e55", // 21 濃い灰
  "#7fd1b9", // 22 ミント
  "#f2a48a", // 23 サーモン
];

export const KIT = {
  /** メインの色どうしの色差（CIELAB の ΔE）がこれより小さければ「かぶり」 */
  clashDeltaE: 40,
  /** 1st と 2nd が近すぎるときに設定画面で注意を出す色差 */
  warnDeltaE: 40,
  /** GK の色の候補（パレットの番号）：黄・橙・黄緑・ピンク・黒・灰 */
  gkColors: [9, 11, 8, 14, 1, 2] as readonly number[],
  /** 予備のユニフォーム（無地）：白と黒 */
  reserve: [
    { main: 0, sub: 1 },
    { main: 1, sub: 0 },
  ] as readonly { main: number; sub: number }[],
  /** 背番号の文字の色を黒にするメインの色の明るさ（L*）の境目 */
  darkNumberL: 72,
};

// ================= 背番号（SPEC 17.3） =================

export const SHIRT_NUMBERS = {
  gk: 1,
  /** 先発の列ごとの番号の候補（先頭から順に使う） */
  byLine: { DF: [2, 3, 4, 5], MF: [6, 8, 7], FW: [9, 11] } as Record<"DF" | "MF" | "FW", number[]>,
  /** 攻撃の中心の選手（総合値の最も高い MF・FW）に付ける番号 */
  ace: 10,
  /** 先発以外は、この番号から空いている順 */
  restFrom: 12,
};

// ================= 会場の段階（SPEC 10.8。P4 で決定） =================

/** 1 学校のグラウンド、2 小さな競技場、3 競技場、4 大きなスタジアム */
export type VenueStage = 1 | 2 | 3 | 4;

/**
 * 大会とラウンドから会場の段階を決める表。
 * fromEnd：決勝 = 0、準決勝 = 1、準々決勝 = 2。この値以下なら、その段階になる（上から順に見る）
 */
export const VENUE_RULES: Record<CompetitionKind, { fromEnd: number; stage: VenueStage }[]> = {
  prefQualifier: [
    { fromEnd: 0, stage: 3 },
    { fromEnd: 2, stage: 2 },
  ],
  summerQualifier: [
    { fromEnd: 0, stage: 3 },
    { fromEnd: 2, stage: 2 },
  ],
  rookiePref: [{ fromEnd: 2, stage: 2 }],
  rookieRegion: [{ fromEnd: 99, stage: 2 }],
  national: [
    { fromEnd: 1, stage: 4 },
    { fromEnd: 99, stage: 3 },
  ],
  summerNational: [
    { fromEnd: 0, stage: 4 },
    { fromEnd: 99, stage: 3 },
  ],
};
