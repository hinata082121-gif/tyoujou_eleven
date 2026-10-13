/**
 * 画質の設定（P4。計画 8.2）：標準と軽量
 */
export type Quality = "standard" | "light";

export interface QualitySettings {
  /** 画素密度の上限 */
  dpr: number;
  antialias: boolean;
  /** 観客の多さ（標準 = 1） */
  crowdDensity: number;
  /** 選手の足元の丸い影 */
  shadows: boolean;
  /** ピッチのテクスチャの細かさ（1m あたりの画素） */
  pitchTexScale: number;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  standard: { dpr: 1.5, antialias: true, crowdDensity: 1, shadows: true, pitchTexScale: 10 },
  light: { dpr: 1, antialias: false, crowdDensity: 0.5, shadows: false, pitchTexScale: 6 },
};
