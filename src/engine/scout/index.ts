/**
 * 特待生スカウト（SPEC 8章、docs/PHASE2C_PLAN.md 3章）。
 * 11/1 に候補リストを作り、スカウトカード 1 枚で 1 人を訪問する。2/28 に勧誘中の候補から返事が届き、
 * 入部が決まった特待生は翌年 4 月に入部する。
 */
import { REPUTATION_TABLE, type ScoutScope } from "../config/reputation";
import { PRESTIGE_LEVEL_BASE } from "../config/school";
import { CANDIDATE_COUNT, PREF_TENDENCY, REGION_ADJACENCY, REGION_TENDENCY, SCOUT } from "../config/scout";
import { PERSONALITY_NAMES, PLAY_STYLE_NAMES, SKILL_NAMES } from "../config/names";
import { PLAY_STYLE_DEFS } from "../config/playStyle";
import { POSITION_WEIGHTS, POTENTIAL } from "../config/player";
import { dormReactionBonus } from "../facilities";
import { clampStat, generatePlayer } from "../player/generate";
import { overall } from "../player/rating";
import type { Rng } from "../rng";
import { isPlus } from "../skills";
import {
  PERSONALITIES,
  PLAY_STYLES,
  POSITIONS,
  type Achievement,
  type Affiliation,
  type Facilities,
  type GameState,
  type MeterKey,
  type Player,
  type Position,
  type Prefecture,
  type Reaction,
  type ReputationLevel,
  type ScoutCandidate,
  type ScoutState,
  type StatKey,
} from "../types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function scoutScope(level: ReputationLevel): ScoutScope {
  return REPUTATION_TABLE[level].scoutScope;
}

/** スカウト範囲の都道府県 */
export function scopePrefectures(prefs: Prefecture[], ownPrefId: string, scope: ScoutScope): Prefecture[] {
  const own = prefs.find((p) => p.id === ownPrefId)!;
  if (scope === "pref") return [own];
  if (scope === "national") return prefs;
  const regions = new Set([own.regionId, ...(scope === "adjacent" ? (REGION_ADJACENCY[own.regionId] ?? []) : [])]);
  return prefs.filter((p) => regions.has(p.regionId));
}

/** メーターに出す項目（GK とフィールドで分ける） */
export function meterKeys(p: Pick<Player, "mainPosition">): MeterKey[] {
  return p.mainPosition === "GK" ? ["saving", "kick", "highBall", "pass", "physical", "speed"] : ["attack", "pass", "dribble", "defense", "physical", "speed"];
}

const METER_STATS: Record<MeterKey, StatKey[]> = {
  attack: ["shooting", "kickPower"],
  pass: ["pass", "vision"],
  dribble: ["dribble", "technique"],
  defense: ["defense", "decision"],
  physical: ["physical", "aerial"],
  speed: ["speed", "stamina"],
  saving: ["saving", "positioning"],
  kick: ["kickPower"],
  highBall: ["highBall", "catching"],
};

/** メーターの本当の値（項目に関係する能力の平均） */
export function trueMeter(p: Player, key: MeterKey): number {
  const ks = METER_STATS[key];
  return ks.reduce((s, k) => s + p.stats[k], 0) / ks.length;
}

/** メーターの誤差の大きさ（実績が高いほど・スカウティングが高いほど小さい） */
export function meterSd(achievement: Achievement, scouting: number, visits = 0): number {
  const sd = SCOUT.meterSd * (1 - SCOUT.perAchievement * achievement) * (1 - SCOUT.fromScouting * (scouting / 100)) * SCOUT.revisitMeterMult ** Math.max(0, visits - 1);
  return Math.max(SCOUT.meterMin, sd);
}

function estimateMeter(rng: Rng, c: Pick<ScoutCandidate, "player" | "achievement">, scouting: number, visits: number): ScoutCandidate["meter"] {
  const sd = meterSd(c.achievement, scouting, visits);
  const meter: ScoutCandidate["meter"] = {};
  for (const k of meterKeys(c.player)) {
    const est = trueMeter(c.player, k) + rng.normal(0, sd);
    meter[k] = [Math.round(clamp(est - sd, 1, 99)), Math.round(clamp(est + sd, 1, 99))];
  }
  return meter;
}

// ================= 寸評 =================

const PERSONALITY_HINTS: Record<(typeof PERSONALITIES)[number], string> = {
  diligent: "黙々と練習を続けるタイプらしい",
  passionate: "試合になると誰よりも熱くなるらしい",
  calm: "どんな場面でも落ち着いているらしい",
  craftsman: "得意なことをとことん磨くタイプらしい",
  competitive: "負けると悔しくて眠れないらしい",
  moodMaker: "いるだけでチームが明るくなるらしい",
  cautious: "ミスをしない、堅実なプレーが持ち味らしい",
  inspired: "ときどき誰も思いつかないプレーを見せるらしい",
};

function potentialHint(potential: number): string {
  if (potential >= POTENTIAL.mean + POTENTIAL.sd) return "まだ体ができておらず、伸びしろは大きそうだ";
  if (potential <= POTENTIAL.mean - POTENTIAL.sd) return "すでに完成されつつあり、伸びしろは小さいかもしれない";
  return "伸びしろは人並みに見える";
}

function skillHint(p: Player): string {
  const plus = p.skills.filter(isPlus);
  if (plus.length > 0) return `「${SKILL_NAMES[plus[0]]}」を思わせるプレーがある`;
  const aff = PLAY_STYLE_DEFS[p.playStyle].skillAffinity[0];
  return aff ? `「${SKILL_NAMES[aff]}」の素質がありそうだ` : "目立った武器はまだ見えない";
}

/** 寸評（性格・スタイルの素質・特殊能力の素質・伸びしろ）。1 行ごとに、正しい内容になる確率は accuracy */
export function makeComments(rng: Rng, p: Player, accuracy: number): string[] {
  const ok = () => rng.chance(clamp(accuracy, 0, 0.98));
  const pers = ok() ? p.personality : rng.pick(PERSONALITIES.filter((x) => x !== p.personality));
  const styles = PLAY_STYLES.filter((s) => s !== p.playStyle && PLAY_STYLE_DEFS[s].groups.some((g) => PLAY_STYLE_DEFS[p.playStyle].groups.includes(g)));
  const style = ok() || styles.length === 0 ? p.playStyle : rng.pick(styles);
  const fake = { ...p, skills: [] as Player["skills"], playStyle: style };
  const pot = ok() ? p.potential : p.potential >= POTENTIAL.mean ? POTENTIAL.mean - POTENTIAL.sd * 1.2 : POTENTIAL.mean + POTENTIAL.sd * 1.2;
  return [
    `${PERSONALITY_HINTS[pers]}（${PERSONALITY_NAMES[pers]}？）`,
    `プレーぶりは「${PLAY_STYLE_NAMES[style]}」に近い`,
    ok() ? skillHint(p) : skillHint(fake),
    potentialHint(pot),
  ];
}

// ================= 候補 =================

function candidatePosition(rng: Rng, pref: Prefecture): Position {
  const rt = REGION_TENDENCY[pref.regionId]?.positions ?? {};
  const pt = PREF_TENDENCY[pref.id]?.positions ?? {};
  return rng.weighted(POSITIONS, (p) => POSITION_WEIGHTS[p] * (rt[p] ?? 1) * (pt[p] ?? 1));
}

export function achievementFor(rng: Rng, ov: number, affiliation: Affiliation): Achievement {
  const score = ov + SCOUT.achievementBonus[affiliation] + rng.normal(0, SCOUT.achievementSd);
  const [a1, a2, a3] = SCOUT.achievementAt;
  return score >= a3 ? 3 : score >= a2 ? 2 : score >= a1 ? 1 : 0;
}

export interface ScoutContext {
  year: number;
  level: ReputationLevel;
  ownPrefId: string;
  prefectures: Prefecture[];
  /** 分析担当のスカウティング（0 は不在） */
  scouting: number;
  facilities: Facilities;
  /** 取り合いの相手になる CPU 校（県 ID → 学校 ID） */
  strongSchools: Record<string, string[]>;
}

export function makeCandidate(rng: Rng, ctx: ScoutContext, pref: Prefecture): ScoutCandidate {
  const affiliation = rng.weighted(["juniorHigh", "townClub", "juniorYouth"] as Affiliation[], (a) => SCOUT.affiliation[a]);
  const topChance = SCOUT.topShare * (affiliation === "juniorYouth" ? SCOUT.topYouthMult : 1);
  const tier: 0 | 1 = rng.chance(topChance) ? 1 : 0;
  const tierPrestige = (tier ? SCOUT.topPrestige : SCOUT.normalPrestige) + SCOUT.levelStep[ctx.level];
  const top = PRESTIGE_LEVEL_BASE.length - 1;
  const level = tierPrestige > top ? PRESTIGE_LEVEL_BASE[top] + SCOUT.beyondTopBase * (tierPrestige - top) : PRESTIGE_LEVEL_BASE[tierPrestige];
  const base = rng.normal(level, SCOUT.baseSd);
  const player = generatePlayer(rng, { grade: 1, enrolledYear: ctx.year + 1, base, position: candidatePosition(rng, pref) });
  player.admission = "scholarship";
  const bias = { ...(REGION_TENDENCY[pref.regionId]?.stats ?? {}), ...(PREF_TENDENCY[pref.id]?.stats ?? {}) };
  for (const [k, v] of Object.entries(bias) as [StatKey, number][]) player.stats[k] = clampStat(player.stats[k] + v);
  const achievement = achievementFor(rng, overall(player), affiliation);
  const rivals: string[] = [];
  if (tier === 1) {
    const n = rng.int(...SCOUT.rivals);
    if (affiliation === "juniorYouth") rivals.push("youth");
    const pool = rng.shuffle([...(ctx.strongSchools[pref.id] ?? [])]);
    while (rivals.length < n && pool.length > 0) rivals.push(pool.pop()!);
  }
  const c: ScoutCandidate = { id: rng.id("sc"), player, prefectureId: pref.id, affiliation, achievement, tier, rivals, meter: {}, visits: 0, status: "open" };
  c.meter = estimateMeter(rng, c, ctx.scouting, 0);
  return c;
}

/** 11/1：その年の候補リストとカードの届く日を決める */
export function startScoutSeason(rng: Rng, ctx: ScoutContext, cardDays: number[]): ScoutState {
  const scope = scoutScope(ctx.level);
  const prefs = scopePrefectures(ctx.prefectures, ctx.ownPrefId, scope);
  const weight = (p: Prefecture) => (p.tier === "competitive" ? 3 : p.tier === "normal" ? 2 : 1) * (p.id === ctx.ownPrefId ? 2 : 1);
  const candidates = Array.from({ length: CANDIDATE_COUNT[scope] }, () => makeCandidate(rng, ctx, rng.weighted(prefs, weight)));
  candidates.sort((a, b) => b.achievement - a.achievement);
  return { year: ctx.year, candidates, cardsTotal: cardDays.length, cardDays, cardsDelivered: 0, cards: 0, priority: [], committed: [], toCpu: [], replied: false };
}

/** カードが届く日（start〜lastCard に均等） */
export function scoutCardDays(count: number, start: number, last: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [start];
  return Array.from({ length: count }, (_, i) => Math.round(start + ((last - start) * i) / (count - 1)));
}

/** 強さ（0〜1）。能力の高い選手ほど反応が悪くなりやすい */
export function candidateStrength(c: ScoutCandidate): number {
  return clamp((overall(c.player) - SCOUT.strengthFrom) / SCOUT.strengthRange, 0, 1);
}

/** 初めての反応 */
export function firstReaction(rng: Rng, c: ScoutCandidate, level: ReputationLevel, facilities: Facilities): Reaction {
  const r = SCOUT.reaction;
  const score = r.base + r.perReputation * level - r.fromStrength * candidateStrength(c) - (c.tier ? r.topPenalty : 0) + dormReactionBonus(facilities) + rng.range(-r.noise, r.noise);
  return score >= r.good ? "good" : score >= r.normal ? "normal" : "bad";
}

/** 再訪問で好転する確率（評判が低いと好転しにくい。寮が良いと好転しやすい） */
export function improveChance(level: ReputationLevel, facilities: Facilities): number {
  const im = SCOUT.improve;
  return clamp(im.base + im.perReputation * level + dormReactionBonus(facilities) * im.fromDorm, 0, 0.95);
}

export interface VisitResult {
  candidate: ScoutCandidate;
  first: boolean;
  improved: boolean;
}

/** 訪問する（カードの消費と日付の進行は呼び出し側） */
export function visitCandidate(rng: Rng, scout: ScoutState, ctx: ScoutContext, candidateId: string): VisitResult | null {
  const c = scout.candidates.find((x) => x.id === candidateId);
  if (!c || (c.status !== "open" && c.status !== "courting")) return null;
  c.visits++;
  const first = c.reaction === undefined;
  let improved = false;
  if (first) {
    c.reaction = firstReaction(rng, c, ctx.level, ctx.facilities);
    c.status = "courting";
    if (!scout.priority.includes(c.id)) scout.priority.push(c.id);
  } else if (c.reaction !== "good" && rng.chance(improveChance(ctx.level, ctx.facilities))) {
    c.reaction = c.reaction === "bad" ? "normal" : "good";
    improved = true;
  }
  c.comments = makeComments(rng, c.player, SCOUT.commentBase + SCOUT.commentFromScouting * (ctx.scouting / 100) + SCOUT.commentPerVisit * (c.visits - 1));
  c.meter = estimateMeter(rng, c, ctx.scouting, c.visits);
  return { candidate: c, first, improved };
}

/** 入部する確率（反応 × 取り合いの相手の数） */
export function joinChance(c: ScoutCandidate): number {
  if (!c.reaction) return 0;
  return SCOUT.joinChance[c.reaction] * SCOUT.rivalMult ** c.rivals.length;
}

export interface ReplyResult {
  joined: ScoutCandidate[];
  declined: ScoutCandidate[];
  lost: ScoutCandidate[];
}

/** 2/28：勧誘中の候補から一斉に返事が届く。枠を超えたら優先順で枠まで */
export function resolveReplies(rng: Rng, scout: ScoutState, slots: number): ReplyResult {
  const out: ReplyResult = { joined: [], declined: [], lost: [] };
  const courting = scout.candidates.filter((c) => c.status === "courting");
  const order = [...courting].sort((a, b) => {
    const ia = scout.priority.indexOf(a.id);
    const ib = scout.priority.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  for (const c of order) {
    const yes = rng.chance(joinChance(c)) && out.joined.length < slots;
    if (yes) {
      c.status = "joined";
      out.joined.push(c);
      scout.committed.push(c.player);
      continue;
    }
    if (c.rivals.length > 0 && rng.chance(SCOUT.lostToRival)) {
      c.status = "lost";
      c.lostTo = rng.pick(c.rivals);
      out.lost.push(c);
      if (c.lostTo !== "youth") scout.toCpu.push({ schoolId: c.lostTo, player: { ...c.player, admission: "general" } });
    } else {
      c.status = "declined";
      out.declined.push(c);
    }
  }
  // 勧誘しなかった最上位の候補も、取り合いの相手に決まる
  for (const c of scout.candidates) {
    if (c.status !== "open" || c.rivals.length === 0) continue;
    c.status = "lost";
    c.lostTo = rng.pick(c.rivals);
    if (c.lostTo !== "youth") scout.toCpu.push({ schoolId: c.lostTo, player: { ...c.player, admission: "general" } });
  }
  scout.replied = true;
  scout.cards = 0;
  return out;
}

/** スカウトの文脈（GameState から） */
export function scoutContext(state: GameState, scouting: number): ScoutContext {
  const strongSchools: Record<string, string[]> = {};
  for (const pref of state.prefectures) {
    strongSchools[pref.id] = pref.schoolIds.filter((id) => {
      const s = state.schools[id];
      return !s.isPlayer && s.prestige >= SCOUT.rivalPrestige;
    });
  }
  const own = state.prefectures.find((p) => p.isPlayerPref)!;
  return { year: state.year, level: state.reputation.level, ownPrefId: own.id, prefectures: state.prefectures, scouting, facilities: state.facilities, strongSchools };
}
