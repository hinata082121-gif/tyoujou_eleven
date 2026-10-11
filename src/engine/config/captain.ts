/**
 * キャプテン（SPEC 7.8、docs/PHASE2B_PLAN.md 6章）。数値は npm run balance で調整する。
 */
export const CAPTAIN = {
  /** 試合に出ていないときの、試合中の効果の割合 */
  offPitchShare: 0.5,
  /** 努力家：チーム全体の練習効率 */
  diligentPractice: 1.03,
  /** 情熱家：ビハインド時、チーム全体の実効能力 */
  passionateBehind: 1.02,
  /** 冷静沈着：試合の最後の 1/4 で、チーム全体の判断に足す実効値 */
  calmLateDecision: 2,
  /** 職人気質：セットプレーのキッカーの実効値 */
  craftsmanSetPiece: 1,
  /** 負けず嫌い：ランクが上の相手との試合で、チーム全体の実効能力 */
  competitiveUnderdog: 1.02,
  /** ムードメーカー：チーム全体の調子が悪くなる確率・良くなる確率の倍率 */
  moodMakerDown: 0.7,
  moodMakerUp: 1.3,
  /** 慎重派：失点した後 cautiousSegments 区間、相手に流れが行く量の倍率 */
  cautiousMomentum: 0.5,
  cautiousSegments: 2,
  /** ひらめき型：自分の特殊能力の効果の倍率 */
  inspiredSelfSkill: 1.1,
  /** おすすめ順の点数（総合 + 学年 × gradeWeight + 性格の点 + キャプテンシー） */
  gradeWeight: 4,
  captaincyScore: { captaincy1: 6, captaincy2: 12 } as Record<string, number>,
  personalityScore: { diligent: 4, passionate: 3, calm: 4, craftsman: 0, competitive: 3, moodMaker: 4, cautious: 2, inspired: 0 } as Record<string, number>,
};
