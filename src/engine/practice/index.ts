import { PRACTICES, NON_TARGET_FITNESS, DAILY_RECOVERY, INJURY, CONDITION_DRIFT_CHANCE } from "../config/practice";
import { GROWTH } from "../config/growth";
import { addExp, practiceEfficiency } from "../player/growth";
import { CRAFTSMAN_FAVORITE_MULT, INSPIRED_PRACTICE, PERSONALITY_CONDITION, PERSONALITY_PRACTICE } from "../config/personality";
import { PLAY_STYLE_DEFS, PROFICIENCY, STYLE_GROWTH_BONUS } from "../config/playStyle";
import { gainProficiency, styleUsesPractice } from "../player/traits";
import type { Rng } from "../rng";
import { trustDownMult } from "../school/life";
import type { Condition, Player, PracticeKind, StatKey } from "../types";

export type GainMap = Record<string, Partial<Record<StatKey, number>>>;

export function isPracticeTarget(p: Player, kind: PracticeKind): boolean {
  const target = PRACTICES[kind].target;
  if (target === "all") return true;
  if (target === "gk") return p.mainPosition === "GK";
  return p.mainPosition !== "GK";
}

const clampFit = (v: number) => Math.max(0, Math.min(100, v));

export function shiftCondition(p: Player, amount: number) {
  p.condition = Math.max(-2, Math.min(2, p.condition + amount)) as Condition;
}

/** スタッフの効果（SPEC 9章）。省略時は効果なし */
export interface PracticeStaffOptions {
  /** 選手ごとの練習効率の倍率（ヘッドコーチ・GK コーチ） */
  staffMult?: (p: Player) => number;
  /** 毎日の自然回復の倍率（フィジカルコーチ） */
  recoveryMult?: number;
  /** ケガの確率の倍率（フィジカルコーチ） */
  injuryMult?: number;
  /** チーム全体の練習効率の倍率（キャプテンが努力家など） */
  teamMult?: number;
  /** 調子が下がる・上がる確率の倍率（キャプテンがムードメーカー） */
  conditionDownMult?: number;
  conditionUpMult?: number;
  /** ひらめき型の、その練習（カード 1 枚）での倍率。同じオブジェクトを日をまたいで渡す */
  rolls?: Record<string, number>;
  /** ケガしにくさ系の倍率（選手ごと） */
  playerInjuryMult?: (p: Player) => number;
  /** ケガの離脱日数の倍率（ケアルーム。P2c） */
  injuryDaysMult?: number;
  /** 練習の体力の消耗の倍率（合宿。P2c） */
  fitnessCostMult?: number;
  /** 熟練度の伸びの倍率（合宿。P2c） */
  proficiencyMult?: number;
  /** 月初の指示の重点（R2）：その選手の重点の能力と、経験点の合計のうち重点に回す割合。無ければ重点なし */
  focus?: (p: Player) => { stats: StatKey[]; share: number } | null;
  /** 練習の効率の倍率（選手ごと。R2：テスト前の「短くする」） */
  playerExpMult?: (p: Player) => number;
  /** 体力の消耗の倍率（選手ごと。R2：テスト前の「短くする」） */
  playerFitnessCostMult?: (p: Player) => number;
  /** 練習に出ない選手（R2：補習・修学旅行など。体力は休みと同じく回復する） */
  absent?: (p: Player) => boolean;
}

/** 性格による練習の倍率（PLAN 2.2）。ひらめき型は練習 1 回ごとに引く */
export function personalityPracticeMult(rng: Rng, p: Player, kind: PracticeKind, rolls?: Record<string, number>): number {
  const t = PERSONALITY_PRACTICE[p.personality];
  if (p.personality === "craftsman" && p.favoritePractice === kind) return CRAFTSMAN_FAVORITE_MULT;
  if (p.personality === "inspired") {
    const r = rolls?.[p.id];
    if (r !== undefined) return r;
    const v = Math.max(INSPIRED_PRACTICE.min, Math.min(INSPIRED_PRACTICE.max, rng.normal(INSPIRED_PRACTICE.mean, INSPIRED_PRACTICE.sd)));
    if (rolls) rolls[p.id] = v;
    return v;
  }
  return t[kind] ?? t.default;
}

/** スタイルの能力の伸び（keyStats の経験点を熟練度に応じて増やす） */
export function styleGrowthMult(p: Player, stat: StatKey): number {
  return PLAY_STYLE_DEFS[p.playStyle].keyStats[stat] ? 1 + STYLE_GROWTH_BONUS * (p.styleProficiency / 100) : 1;
}

/** 調子の日ごとの変化（性格とキャプテンで変わる） */
export function driftCondition(rng: Rng, p: Player, opts: Pick<PracticeStaffOptions, "conditionDownMult" | "conditionUpMult"> = {}) {
  const pc = PERSONALITY_CONDITION[p.personality];
  const dir = p.condition > 0 ? -1 : p.condition < 0 ? 1 : rng.chance(pc.upChance ?? 0.5) ? 1 : -1;
  // 信頼度が高いほど調子が下がりにくい（R2。信頼度を持たない CPU 校の選手は 1）
  const mult = pc.drift * (dir < 0 ? (opts.conditionDownMult ?? 1) * trustDownMult(p) : (opts.conditionUpMult ?? 1));
  if (rng.chance(CONDITION_DRIFT_CHANCE * mult)) shiftCondition(p, dir);
}

/**
 * 1 日分の練習。経験点 = 練習 1 日あたりの値 × 効率（体力・調子）× 補正。
 * gains に実際に入れた経験点（伸びしろ補正前）を足し込む。
 */
export function practiceOneDay(rng: Rng, players: Player[], kind: PracticeKind, mult: number, gains: GainMap, opts: PracticeStaffOptions = {}): Player[] {
  const def = PRACTICES[kind];
  const injured: Player[] = [];
  const recovery = DAILY_RECOVERY * (opts.recoveryMult ?? 1);
  for (const p of players) {
    if (p.status !== "active") continue;
    if (p.injuryDays > 0) {
      p.injuryDays--;
      p.fitness = clampFit(p.fitness + recovery);
      continue;
    }
    if (opts.absent?.(p)) {
      p.fitness = clampFit(p.fitness + NON_TARGET_FITNESS + recovery);
      driftCondition(rng, p, opts);
      continue;
    }
    if (isPracticeTarget(p, kind)) {
      const eff =
        practiceEfficiency(p) * mult * GROWTH.practiceMult * (opts.staffMult?.(p) ?? 1) * (opts.teamMult ?? 1) * personalityPracticeMult(rng, p, kind, opts.rolls) * (opts.playerExpMult?.(p) ?? 1);
      const day: Partial<Record<StatKey, number>> = {};
      for (const [stat, value] of Object.entries(def.gains) as [StatKey, number][]) {
        if (def.fieldOnly?.includes(stat) && p.mainPosition === "GK") continue;
        day[stat] = value * eff * styleGrowthMult(p, stat);
      }
      // 月初の指示の重点：合計の share を重点の能力に回す（合計は変えない。R2）
      const f = kind === "rest" ? null : (opts.focus?.(p) ?? null);
      if (f && f.stats.length > 0 && f.share > 0) {
        const total = Object.values(day).reduce((a, b) => a + (b ?? 0), 0);
        for (const k of Object.keys(day) as StatKey[]) day[k] = day[k]! * (1 - f.share);
        for (const k of f.stats) day[k] = (day[k] ?? 0) + (total * f.share) / f.stats.length;
      }
      for (const [stat, exp] of Object.entries(day) as [StatKey, number][]) {
        addExp(p, stat, exp);
        const g = (gains[p.id] ??= {});
        g[stat] = (g[stat] ?? 0) + exp;
      }
      if (kind !== "rest" && styleUsesPractice(p.playStyle, kind)) gainProficiency(p, PROFICIENCY.perPracticeDay * (opts.proficiencyMult ?? 1));
      const cost = def.fitness < 0 ? def.fitness * (opts.fitnessCostMult ?? 1) * (opts.playerFitnessCostMult?.(p) ?? 1) : def.fitness;
      p.fitness = clampFit(p.fitness + cost + recovery);
    } else {
      p.fitness = clampFit(p.fitness + NON_TARGET_FITNESS + recovery);
    }
    // 体力が低いとケガをしやすい
    if (p.fitness < INJURY.safeFitness) {
      const risk = INJURY.maxDailyChance * (1 - p.fitness / INJURY.safeFitness) * (opts.injuryMult ?? 1) * (opts.playerInjuryMult?.(p) ?? 1);
      if (rng.chance(risk)) {
        p.injuryDays = Math.max(1, Math.round(rng.int(INJURY.minDays, INJURY.maxDays) * (opts.injuryDaysMult ?? 1)));
        injured.push(p);
      }
    }
    driftCondition(rng, p, opts);
  }
  return injured;
}

/** 練習しない日（スカウトの訪問・大会の調整日。P2c）：ケガの日数を減らし、体力を recovery だけ戻す */
export function idleDay(rng: Rng, players: Player[], recovery: number, opts: Pick<PracticeStaffOptions, "conditionDownMult" | "conditionUpMult"> = {}) {
  for (const p of players) {
    if (p.status !== "active") continue;
    if (p.injuryDays > 0) p.injuryDays--;
    p.fitness = clampFit(p.fitness + recovery);
    driftCondition(rng, p, opts);
  }
}

/** 複数日の練習 */
export function runPractice(rng: Rng, players: Player[], kind: PracticeKind, days: number, mult: number, opts: PracticeStaffOptions = {}) {
  const gains: GainMap = {};
  const injured: Player[] = [];
  for (let d = 0; d < days; d++) injured.push(...practiceOneDay(rng, players, kind, mult, gains, opts));
  return { gains, injured };
}

/** 直前の練習で得た経験点に倍率をかけて追加する（黄マス） */
export function applyBonusGains(players: Player[], gains: GainMap, ratio: number) {
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const [id, g] of Object.entries(gains)) {
    const p = byId.get(id);
    if (!p || p.status !== "active") continue;
    for (const [stat, exp] of Object.entries(g) as [StatKey, number][]) addExp(p, stat, exp * ratio);
  }
}
