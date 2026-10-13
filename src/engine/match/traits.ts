/**
 * 試合の中の、性格・プレースタイル・特殊能力・キャプテンの補正（SPEC 7.5〜7.8、PLAN 2.2・3.3・4.1・6章）。
 * 試合の作成時・区間の頭に選手ごとの補正表を作り、判定のたびに定義を探さないようにする。
 * 補正は今の判定式の「実効値」に足すか、実効能力に掛けるだけにし、式そのものは変えない。
 */
import type { Slot } from "../config/formations";
import { CAPTAIN } from "../config/captain";
import { PERSONALITY_MATCH } from "../config/personality";
import { PLAY_STYLE_DEFS, type PlayStyleMatchMod, type StyleBonus, type StylePick } from "../config/playStyle";
import { GOLD_PLAYS, SKILL_DEFS, SKILL_EFFECTS, TIER_POINTS, type GoldPlay } from "../config/skills";
import { styleFitsPosition } from "../player/traits";
import type { Personality, SkillId, SkillLine } from "../types";
import { activeIds } from "./orders";
import type { MatchPlayer, MatchTeamState } from "./types";

export interface ActorTraits {
  personality?: Personality;
  /** スタイルの選ばれやすさ（熟練度を掛けた後の倍率） */
  pick: Partial<Record<StylePick, number>>;
  /** スタイルの質の補正（熟練度を掛けた後の点数） */
  bonus: Partial<Record<StyleBonus, number>>;
  /** MF 以外が中央攻撃の出し手に加わる重み */
  joinCentralPass: number;
  fullbackCarry: boolean;
  noCutInside: boolean;
  buildUpErrorCut: number;
  counterExposure: number;
  /** ファウル・カードの倍率（スタイル・性格・特殊能力） */
  foulMult: number;
  cardMult: number;
  /** ケガの確率の倍率（ケガしにくさ系） */
  injuryMult: number;
  skills: ReadonlySet<SkillId>;
  /** 系統ごとに持っている特殊能力 */
  lines: Partial<Record<SkillLine, SkillId>>;
  /** 特殊能力の効果の倍率（ひらめき型のキャプテンは自分の分だけ上がる） */
  skillMult: number;
}

/** 試合に出ている枠で効くスタイルの補正（区分に入らない枠なら無し） */
export function styleMod(p: Pick<MatchPlayer, "playStyle">, slot: Pick<Slot, "pos">): PlayStyleMatchMod | null {
  if (!p.playStyle || !styleFitsPosition(p.playStyle, slot.pos)) return null;
  return PLAY_STYLE_DEFS[p.playStyle].match;
}

/** ケガしにくさ系の倍率（試合・練習で共通） */
export function durabilityMult(skills: readonly SkillId[] | undefined): number {
  const id = skills?.find((s) => SKILL_DEFS[s].line === "durability");
  if (!id) return 1;
  const t = SKILL_DEFS[id].tier;
  return t === "minus" ? SKILL_EFFECTS.durability.minus : t === "plus" ? SKILL_EFFECTS.durability.plus : SKILL_EFFECTS.durability.double;
}

/** 試合中の体力の減りの倍率（スタミナ持続系・ボックストゥボックス） */
export function staminaDrainMult(p: MatchPlayer, slot: Pick<Slot, "pos">): number {
  let m = 1;
  const id = p.skills?.find((s) => SKILL_DEFS[s].line === "staminaKeep");
  if (id) {
    const t = SKILL_DEFS[id].tier;
    m *= t === "minus" ? SKILL_EFFECTS.staminaKeep.minus : t === "plus" ? SKILL_EFFECTS.staminaKeep.plus : SKILL_EFFECTS.staminaKeep.double;
  }
  const mod = styleMod(p, slot);
  if (mod?.staminaSave) m *= 1 - mod.staminaSave * prof(p);
  return m;
}

const prof = (p: Pick<MatchPlayer, "styleProficiency">) => Math.max(0, Math.min(1, (p.styleProficiency ?? 0) / 100));

export function actorTraits(p: MatchPlayer, slot: Pick<Slot, "pos">, inspiredCaptain: boolean): ActorTraits {
  const mod = styleMod(p, slot);
  const k = prof(p);
  const pick: ActorTraits["pick"] = {};
  const bonus: ActorTraits["bonus"] = {};
  if (mod) {
    for (const [key, v] of Object.entries(mod.pick ?? {}) as [StylePick, number][]) pick[key] = 1 + (v - 1) * k;
    for (const [key, v] of Object.entries(mod.bonus ?? {}) as [StyleBonus, number][]) bonus[key] = v * k;
  }
  const skills = new Set(p.skills ?? []);
  const lines: ActorTraits["lines"] = {};
  for (const id of skills) {
    const l = SKILL_DEFS[id].line;
    if (l) lines[l] = id;
  }
  let foulMult = 1 + (mod?.foulUp ?? 0) * k;
  let cardMult = 1;
  if (p.personality === "passionate") {
    foulMult *= PERSONALITY_MATCH.passionateFoulMult;
    cardMult *= PERSONALITY_MATCH.passionateCardMult;
  }
  if (p.personality === "cautious") foulMult *= PERSONALITY_MATCH.cautiousFoulMult;
  if (skills.has("roughPlay")) {
    foulMult *= SKILL_EFFECTS.roughPlayFoulMult;
    cardMult *= SKILL_EFFECTS.roughPlayCardMult;
  }
  if (skills.has("slidingTackle")) foulMult *= SKILL_EFFECTS.slidingTackleFoulMult;
  return {
    personality: p.personality,
    pick,
    bonus,
    joinCentralPass: (mod?.joinCentralPass ?? 0) * k,
    fullbackCarry: !!mod?.fullbackCarry && k > 0,
    noCutInside: !!mod?.noCutInside && k > 0,
    buildUpErrorCut: (mod?.buildUpErrorCut ?? 0) * k,
    counterExposure: (mod?.counterExposure ?? 0) * k,
    foulMult,
    cardMult,
    injuryMult: durabilityMult(p.skills),
    skills,
    lines,
    skillMult: inspiredCaptain ? CAPTAIN.inspiredSelfSkill : 1,
  };
}

export const pickMult = (t: ActorTraits, key: StylePick) => t.pick[key] ?? 1;
export const styleBonus = (t: ActorTraits, key: StyleBonus) => t.bonus[key] ?? 0;

/** 系統の特殊能力の点数（持っていなければ 0）。× は倍率を掛けない */
export function linePoints(t: ActorTraits, line: SkillLine, scale = 1): number {
  const id = t.lines[line];
  if (!id) return 0;
  const tier = SKILL_DEFS[id].tier;
  return TIER_POINTS[tier] * (tier === "minus" ? 1 : scale * t.skillMult);
}

/** 段階のない特殊能力の点数（持っていなければ 0） */
export function singlePoints(t: ActorTraits, id: SkillId, scale = 1, points: number = TIER_POINTS.single): number {
  return t.skills.has(id) ? points * scale * t.skillMult : 0;
}

// ================= 実効能力の倍率（調子と同じく、能力差の圧縮の前に掛ける） =================

/** 区間の頭で決まる条件 */
export interface ActorEnv {
  /** 試合の最後の 1/4（延長を含む） */
  late: boolean;
  /** ビハインド */
  behind: boolean;
  /** 相手のランクが上 */
  underdog: boolean;
  /** 大舞台（全国大会・県予選の決勝） */
  bigStage: boolean;
}

export const NEUTRAL_ENV: ActorEnv = { late: false, behind: false, underdog: false, bigStage: false };

/** 選手自身の倍率（性格・大舞台系・逆境系。金色の存在感は関係するプレーだけなので goldPresence で別に扱う） */
export function playerTraitMult(p: MatchPlayer, env: ActorEnv): number {
  let m = 1;
  if (p.personality === "passionate" && env.late) m *= PERSONALITY_MATCH.passionateLateMult;
  if (p.personality === "competitive" && env.underdog) m *= PERSONALITY_MATCH.competitiveUnderdogMult;
  if (p.personality === "cautious" && env.bigStage) m *= PERSONALITY_MATCH.cautiousBigStageMult;
  for (const id of p.skills ?? []) {
    const d = SKILL_DEFS[id];
    if (d.line === "bigStage" && env.bigStage) m *= SKILL_EFFECTS.bigStage[d.tier as "minus" | "plus" | "double"];
    if (d.line === "adversity" && env.behind) m *= SKILL_EFFECTS.adversity[d.tier as "plus" | "double"];
  }
  return m;
}

/** 金色の存在感：効くプレーと、そのプレーでの実効能力の倍率（金色がなければ null） */
export function goldPresence(p: Pick<MatchPlayer, "skills" | "mainPosition">): { plays: ReadonlySet<GoldPlay>; mult: number } | null {
  const plays = new Set<GoldPlay>();
  for (const id of p.skills ?? []) for (const play of GOLD_PLAYS[id] ?? []) plays.add(play);
  if (plays.size === 0) return null;
  return { plays, mult: p.mainPosition === "GK" ? SKILL_EFFECTS.goldPresenceGk : SKILL_EFFECTS.goldPresence };
}

export interface CaptainEffect {
  id: string;
  personality?: Personality;
  /** 試合中の効果の割合（出ていなければ offPitchShare） */
  share: number;
  /** キャプテンシー系の倍率 */
  captaincy: number;
}

/** キャプテンの試合中の効果（ベンチ外・退場・P2a の試合なら null） */
export function captainEffect(team: MatchTeamState): CaptainEffect | null {
  const id = team.captainId;
  const p = id ? team.players[id] : undefined;
  if (!id || !p) return null;
  const share = activeIds(team).includes(id) ? 1 : CAPTAIN.offPitchShare;
  const cap = p.skills?.find((s) => SKILL_DEFS[s].line === "captaincy");
  const captaincy = cap ? SKILL_EFFECTS.captaincy[SKILL_DEFS[cap].tier as "plus" | "double"] : 1;
  return { id, personality: p.personality, share, captaincy };
}

const scaled = (mult: number, share: number) => 1 + (mult - 1) * share;

/** キャプテンによる、チーム全体の倍率 */
export function teamTraitMult(cap: CaptainEffect | null, env: ActorEnv): number {
  if (!cap) return 1;
  let m = scaled(cap.captaincy, cap.share);
  if (cap.personality === "passionate" && env.behind) m *= scaled(CAPTAIN.passionateBehind, cap.share);
  if (cap.personality === "competitive" && env.underdog) m *= scaled(CAPTAIN.competitiveUnderdog, cap.share);
  return m;
}
