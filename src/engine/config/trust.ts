/**
 * 信頼度（監督への信頼。R2。SPEC 7.2・18.4・PHASE_R2_PLAN 4.3）。試合の計算には入れない
 */
export const TRUST = {
  /** 新入生：平均とばらつき（特待生は平均が高い） */
  mean: 50,
  sd: 8,
  scholarshipMean: 55,
  /** キャプテンに指名されると上がる */
  captainBonus: 10,
  /** 調子が下がる確率の倍率 = downBase − downPer × 信頼度/100（100 で ×0.7、0 で ×1.3） */
  downBase: 1.3,
  downPer: 0.6,
  /** 月初の指示の重点の効き目 = focusBase + focusPer × 信頼度/100（50 で ×1） */
  focusBase: 0.8,
  focusPer: 0.4,
  /** 選択肢の「話を聞く・任せる」系が うまくいく確率の上乗せ = (信頼度 − 50) / successDiv */
  successDiv: 200,
  /** 表示の 5 段階の区切り */
  bands: [30, 45, 60, 75] as const,
};
