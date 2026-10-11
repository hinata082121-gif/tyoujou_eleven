/**
 * キャプテン（SPEC 7.8、docs/PHASE2B_PLAN.md 6章）。
 * 自校は年度初めと 3 年生の引退後に監督が指名する（学年は問わない）。CPU 校は自動で決める。
 * キャプテンの性格による効果は、試合・練習・調子の各処理がここの関数で読む。
 */
import { CAPTAIN } from "../config/captain";
import { overall } from "../player/rating";
import { skillInLine } from "../skills";
import type { Personality, Player, School } from "../types";

/** おすすめ順の点数（総合 + 学年 + 性格 + キャプテンシー） */
export function captainScore(p: Player): number {
  const cap = skillInLine(p, "captaincy");
  return overall(p) + p.grade * CAPTAIN.gradeWeight + (CAPTAIN.personalityScore[p.personality] ?? 0) + (cap ? (CAPTAIN.captaincyScore[cap] ?? 0) : 0);
}

/** キャプテンの候補（在籍中の全員）をおすすめ順に */
export function captainCandidates(school: School): Player[] {
  return school.players.filter((p) => p.status === "active").sort((a, b) => captainScore(b) - captainScore(a));
}

/** おすすめの 1 人を選ぶ（CPU 校・自動プレイ・ゲーム開始時） */
export function autoCaptain(school: School) {
  school.captainId = captainCandidates(school)[0]?.id;
}

/** 指名する（在籍中の部員でなければ false） */
export function appointCaptain(school: School, playerId: string): boolean {
  const p = school.players.find((x) => x.id === playerId && x.status === "active");
  if (!p) return false;
  school.captainId = p.id;
  return true;
}

export function captainOf(school: School): Player | undefined {
  if (!school.captainId) return undefined;
  return school.players.find((p) => p.id === school.captainId && p.status === "active");
}

/** キャプテンの性格（いなければ null） */
export function captainPersonality(school: School): Personality | null {
  return captainOf(school)?.personality ?? null;
}

/** チーム全体の練習効率（努力家のキャプテン） */
export function captainPracticeMult(school: School): number {
  return captainPersonality(school) === "diligent" ? CAPTAIN.diligentPractice : 1;
}

/** チーム全体の調子が悪くなる・良くなる確率の倍率（ムードメーカーのキャプテン） */
export function captainConditionMults(school: School): { down: number; up: number } {
  return captainPersonality(school) === "moodMaker" ? { down: CAPTAIN.moodMakerDown, up: CAPTAIN.moodMakerUp } : { down: 1, up: 1 };
}
