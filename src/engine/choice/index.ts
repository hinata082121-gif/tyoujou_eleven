/**
 * 選択肢のあるイベント（R2。SPEC 18.3・PHASE_R2_PLAN 5章）。
 * 人物マスに止まると、条件に合うイベントを 1 つ選び、出てくる人を決めて pending にする。
 * 選ぶと効果を適用し、せりふ（話し方の型ごと）と結果の札を返す。文言と数値は config/choiceEvents.ts。
 */
import { dayToDate, monthIndex } from "../calendar";
import { CHOICE, CHOICE_EVENTS, SCHOOL_CHOICES, ADULT_REACTIONS, type ChoiceEffect, type ChoiceEventDef, type ChoiceWho } from "../config/choiceEvents";
import { POSITION_NAMES, PLAY_STYLE_NAMES, SKILL_NAMES, STAT_NAMES } from "../config/names";
import { POSITION_RATING_WEIGHTS, STAT_MAX } from "../config/player";
import { PLAY_STYLE_DEFS } from "../config/playStyle";
import { SKILL_LEARN, TRAINING_POOLS } from "../config/skills";
import { PERSONALITY_SPEECH, REACTION_LINES, REACTION_OVERRIDES, type Lines, type Reaction } from "../config/speech";
import { TESTS } from "../config/schoolEvents";
import { STAFF_TEACH_POOLS, type CastRef, type EffectBadge, type EventOutcome, type SceneLine } from "../events";
import { positionGroup } from "../camp";
import { addExp } from "../player/growth";
import { overall } from "../player/rating";
import { changePlayStyle, gainProficiency, styleOptions, styleScore } from "../player/traits";
import { shiftCondition } from "../practice";
import type { Rng } from "../rng";
import { isPlus } from "../skills";
import { learnFromMentor, tryLearn } from "../skills/learn";
import { addAcademic, addTrust, trustSuccessBonus } from "../school/life";
import { playerSchool } from "../season";
import { staffByRole } from "../staff";
import { GK_STATS, type Alumnus, type GameState, type Player, type Position, type StaffMember, type StatKey } from "../types";

/** 出てくる人 */
export interface ChoiceCast {
  lead?: Player;
  second?: Player;
  staff?: StaffMember;
  ob?: Alumnus;
  pos?: Position;
}

/** 通しの日（年をまたいでも比べられる） */
export const absDay = (state: GameState, day = state.calendar.position) => (state.year - 1) * 365 + day;

const family = (name: string) => name.split(" ")[0];
const active = (state: GameState) => playerSchool(state).players.filter((p) => p.status === "active");
const healthy = (state: GameState) => active(state).filter((p) => p.injuryDays <= 0);

/** その選手が最近（CHOICE.playerGap 日以内）イベントの対象になったか */
function recentlyUsed(state: GameState, p: Player): boolean {
  const last = state.eventMemory?.[`p:${p.id}`];
  return last !== undefined && absDay(state) - last < CHOICE.playerGap;
}

/** キャプテン（いなければ総合の一番高い部員） */
export const captainOrTop = (state: GameState): Player | undefined => {
  const ps = active(state);
  return ps.find((p) => p.id === playerSchool(state).captainId) ?? [...ps].sort((a, b) => overall(b) - overall(a))[0];
};

/** 次のテストまでの日数（無ければ Infinity） */
function daysToNextTest(state: GameState): number {
  const pos = state.calendar.position;
  for (const sq of state.calendar.squares) if (sq.day > pos && sq.major?.kind === "school" && sq.major.event === "test") return sq.day - pos;
  return Infinity;
}

type CastRule = (state: GameState, rng: Rng) => ChoiceCast | null;

const pickFrom = (rng: Rng, list: Player[]) => (list.length > 0 ? rng.pick(list) : undefined);

/** イベントごとの、起きる条件と出てくる人 */
const CAST_RULES: Record<string, CastRule> = {
  positionWorry: (s, rng) => {
    const cands = healthy(s).filter((p) => p.grade <= 2 && !recentlyUsed(s, p) && (Object.entries(p.aptitude) as [Position, number][]).some(([pos, a]) => a === 2 && pos !== p.mainPosition));
    const lead = pickFrom(rng, cands);
    if (!lead) return null;
    const pos = rng.pick((Object.entries(lead.aptitude) as [Position, number][]).filter(([pos, a]) => a === 2 && pos !== lead.mainPosition).map(([pos]) => pos));
    return { lead, pos };
  },
  benchWorry: (s, rng) => {
    const ps = active(s);
    const top = new Set([...ps].sort((a, b) => overall(b) - overall(a)).slice(0, 14).map((p) => p.id));
    return { lead: pickFrom(rng, healthy(s).filter((p) => p.grade >= 2 && !top.has(p.id) && !recentlyUsed(s, p))) } as ChoiceCast;
  },
  studyBalance: (s, rng) => {
    if (daysToNextTest(s) > 30) return null;
    const lead = pickFrom(rng, active(s).filter((p) => (p.academic ?? 50) < CHOICE.lowAcademic && !recentlyUsed(s, p)));
    if (!lead) return null;
    const tutor = active(s)
      .filter((p) => p.id !== lead.id && p.grade >= lead.grade)
      .sort((a, b) => (b.academic ?? 0) - (a.academic ?? 0))[0];
    return tutor ? { lead, second: tutor } : null;
  },
  slumpTalk: (s, rng) => ({ lead: pickFrom(rng, active(s).filter((p) => p.condition <= -1 && !recentlyUsed(s, p))) }),
  careerTalk: (s, rng) => {
    const m = dayToDate(s.calendar.position)[0];
    if (![9, 10, 11, 12].includes(m)) return null;
    return { lead: pickFrom(rng, active(s).filter((p) => p.grade === 3 && s.eventMemory?.[`career:${p.id}`] === undefined)) };
  },
  injuryReturn: (s, rng) => {
    const now = absDay(s);
    return { lead: pickFrom(rng, healthy(s).filter((p) => { const h = s.eventMemory?.[`healed:${p.id}`]; return h !== undefined && now - h <= 7 && !recentlyUsed(s, p); })) };
  },
  freshmanLonely: (s, rng) => {
    if (monthIndex(s.calendar.position) > 2) return null;
    const lead = pickFrom(rng, active(s).filter((p) => p.grade === 1 && !recentlyUsed(s, p)));
    const second = pickFrom(rng, healthy(s).filter((p) => p.grade === 3));
    return lead && second ? { lead, second } : null;
  },
  overwork: (s, rng) => ({ lead: pickFrom(rng, healthy(s).filter((p) => p.fitness < CHOICE.tiredFitness && !recentlyUsed(s, p))) }),
  newTrick: (s, rng) => {
    const staff = s.staff.members.filter((m) => !m.temporary);
    return { lead: pickFrom(rng, healthy(s).filter((p) => p.styleProficiency >= CHOICE.skillProficiency && !recentlyUsed(s, p))), staff: staffByRole(s.staff, "head") && !staffByRole(s.staff, "head")!.temporary ? staffByRole(s.staff, "head") : staff[0] };
  },
  styleLost: (s, rng) => ({ lead: pickFrom(rng, healthy(s).filter((p) => p.grade >= 2 && p.styleProficiency < CHOICE.lostProficiency && !recentlyUsed(s, p))) }),
  captainWorry: (s) => {
    const cap = active(s).find((p) => p.id === playerSchool(s).captainId);
    return cap && !recentlyUsed(s, cap) ? { lead: cap } : null;
  },
  quarrel: (s, rng) => {
    const hs = healthy(s).filter((p) => !recentlyUsed(s, p));
    const hot = hs.filter((p) => p.personality === "passionate" || p.personality === "competitive");
    const lead = pickFrom(rng, hot.length > 0 ? hot : hs);
    if (!lead) return null;
    const second = pickFrom(rng, hs.filter((p) => p.id !== lead.id && positionGroup(p.mainPosition) === positionGroup(lead.mainPosition)));
    return second ? { lead, second } : null;
  },
  gradeClash: (s, rng) => {
    const lead = pickFrom(rng, healthy(s).filter((p) => p.grade === 1 && !recentlyUsed(s, p)));
    const second = pickFrom(rng, healthy(s).filter((p) => p.grade === 3));
    return lead && second ? { lead, second } : null;
  },
  gkRivalry: (s, rng) => {
    const gks = healthy(s).filter((p) => p.mainPosition === "GK").sort((a, b) => overall(b) - overall(a));
    if (gks.length < 2 || overall(gks[0]) - overall(gks[1]) > CHOICE.gkGap) return null;
    const [a, b] = rng.chance(0.5) ? [gks[0], gks[1]] : [gks[1], gks[0]];
    return { lead: a, second: b };
  },
  risingJunior: (s, rng) => {
    const hs = healthy(s);
    const pairs: [Player, Player][] = [];
    for (const j of hs.filter((p) => p.grade === 1 && !recentlyUsed(s, p)))
      for (const sr of hs.filter((p) => p.grade === 3 && positionGroup(p.mainPosition) === positionGroup(j.mainPosition))) if (overall(j) >= overall(sr) - CHOICE.risingGap) pairs.push([j, sr]);
    if (pairs.length === 0) return null;
    const [lead, second] = rng.pick(pairs);
    return { lead, second };
  },
  morningPractice: (s, rng) => {
    const cands = rng.shuffle(healthy(s).filter((p) => p.grade >= 2 && !recentlyUsed(s, p)));
    return cands.length >= 2 ? { lead: cands[0], second: cands[1] } : null;
  },
  headPlan: (s) => {
    const h = staffByRole(s.staff, "head");
    return h && !h.temporary ? { staff: h } : null;
  },
  physicalRest: (s) => {
    const ps = active(s);
    const avg = ps.reduce((a, p) => a + p.fitness, 0) / Math.max(1, ps.length);
    if (avg >= CHOICE.restFitness) return null;
    const m = staffByRole(s.staff, "physical") ?? staffByRole(s.staff, "head");
    return m ? { staff: m } : null;
  },
  gkSpecial: (s) => {
    const m = staffByRole(s.staff, "gk");
    const gks = healthy(s).filter((p) => p.mainPosition === "GK").sort((a, b) => overall(b) - overall(a));
    return m && gks.length > 0 ? { staff: m, lead: gks[0] } : null;
  },
  videoStudy: (s) => {
    const m = staffByRole(s.staff, "analyst");
    return m ? { staff: m } : null;
  },
  obVisit: (s, rng) => {
    const obs = s.alumni.filter((a) => a.skills.some(isPlus) && a.look);
    const ob = obs.length > 0 ? rng.pick(obs) : undefined;
    if (!ob) return null;
    const lead = pickFrom(rng, healthy(s));
    return lead ? { ob, lead } : null;
  },
  clinicRequest: (s) => ({ lead: captainOrTop(s) }),
  interview: (s) => (s.reputation.level >= CHOICE.interviewLevel ? { lead: captainOrTop(s) } : null),
  complaint: (s) => {
    const ps = active(s);
    const avg = ps.reduce((a, p) => a + (p.trust ?? 50), 0) / Math.max(1, ps.length);
    const st = s.staff.season;
    const losing = st.officialMatches >= CHOICE.complaintLosses && st.officialWins / st.officialMatches < 0.25;
    return avg < CHOICE.complaintTrust || losing ? { lead: captainOrTop(s) } : null;
  },
  rainyDay: (s) => ({ lead: captainOrTop(s) }),
  campNight: (s) => ({ lead: captainOrTop(s) }),
  seniorAdvice: (s, rng) => {
    const hs = healthy(s);
    const second = pickFrom(rng, hs.filter((p) => p.grade === 3 && p.skills.some(isPlus)));
    if (!second) return null;
    const lead = pickFrom(rng, hs.filter((p) => p.grade < 3 && positionGroup(p.mainPosition) === positionGroup(second.mainPosition) && !recentlyUsed(s, p)));
    return lead ? { lead, second } : null;
  },
};

/** 起きる条件を満たすか（出てくる人が決まるか） */
function castFor(state: GameState, rng: Rng, def: ChoiceEventDef): ChoiceCast | null {
  const rule = CAST_RULES[def.id];
  const c = rule ? rule(state, rng) : null;
  if (!c) return null;
  if (def.speaker === "lead" && !c.lead) return null;
  if (def.speaker === "staff" && !c.staff) return null;
  if (def.speaker === "ob" && !c.ob) return null;
  if (def.speaker === "captain" && !c.lead) return null;
  return c;
}

/** ID を決めて起こす（合宿の夜・学校行事の選択）。起きる条件に合わなければ null */
export function prepareChoice(state: GameState, rng: Rng, id: string): { def: ChoiceEventDef; cast: ChoiceCast } | null {
  const def = choiceDef(id);
  if (!def) return null;
  const cast = id in CAST_RULES ? castFor(state, rng, def) : { lead: captainOrTop(state) };
  return cast && (def.speaker !== "captain" || cast.lead) ? { def, cast } : null;
}

/** 人物マスで起きるイベントを選ぶ（条件・間隔に合うものから重みつきで） */
export function pickChoiceEvent(state: GameState, rng: Rng): { def: ChoiceEventDef; cast: ChoiceCast } | null {
  const now = absDay(state);
  const mem = state.eventMemory ?? {};
  const pool = CHOICE_EVENTS.filter((d) => d.weight > 0 && (mem[d.id] === undefined || now - mem[d.id] >= (d.gap ?? CHOICE.eventGap)));
  const cands: { def: ChoiceEventDef; cast: ChoiceCast }[] = [];
  for (const def of pool) {
    const cast = castFor(state, rng, def);
    if (cast) cands.push({ def, cast });
  }
  if (cands.length === 0) {
    const rain = CHOICE_EVENTS.find((d) => d.id === "rainyDay")!;
    const cast = castFor(state, rng, rain);
    return cast ? { def: rain, cast } : null;
  }
  return rng.weighted(cands, (c) => c.def.weight);
}

// ---- pending に入れる出てくる人の形（"p:ID" "s:ID" "a:ID" "pos:CB"） ----

export function encodeCast(c: ChoiceCast): string[] {
  const out: string[] = [];
  if (c.lead) out.push(`lead:${c.lead.id}`);
  if (c.second) out.push(`second:${c.second.id}`);
  if (c.staff) out.push(`staff:${c.staff.id}`);
  if (c.ob) out.push(`ob:${c.ob.id}`);
  if (c.pos) out.push(`pos:${c.pos}`);
  return out;
}

export function decodeCast(state: GameState, refs: string[]): ChoiceCast {
  const c: ChoiceCast = {};
  const players = playerSchool(state).players;
  for (const r of refs) {
    const i = r.indexOf(":");
    const k = r.slice(0, i);
    const v = r.slice(i + 1);
    if (k === "lead") c.lead = players.find((p) => p.id === v);
    else if (k === "second") c.second = players.find((p) => p.id === v);
    else if (k === "staff") c.staff = state.staff.members.find((m) => m.id === v);
    else if (k === "ob") c.ob = state.alumni.find((a) => a.id === v);
    else if (k === "pos") c.pos = v as Position;
  }
  return c;
}

export function choiceDef(id: string): ChoiceEventDef | undefined {
  return CHOICE_EVENTS.find((d) => d.id === id) ?? (SCHOOL_CHOICES as Record<string, ChoiceEventDef>)[id];
}

/** 文中の {lead} などを置き換える */
export function fillText(state: GameState, text: string, c: ChoiceCast, extra: Record<string, string> = {}): string {
  const higherLower = c.lead && c.second ? (overall(c.lead) >= overall(c.second) ? [c.lead, c.second] : [c.second, c.lead]) : [];
  const nextTest = (() => {
    const pos = state.calendar.position;
    const sq = state.calendar.squares.find((x) => x.day > pos && x.major?.kind === "school" && x.major.event === "test");
    return sq ? (TESTS[sq.major!.round ?? 0]?.label ?? "テスト") : "テスト";
  })();
  const map: Record<string, string> = {
    lead: c.lead ? family(c.lead.name) : "",
    second: c.second ? family(c.second.name) : "",
    staff: c.staff ? family(c.staff.name) : "",
    ob: c.ob ? family(c.ob.name) : "",
    pos: c.pos ? POSITION_NAMES[c.pos] : "",
    higher: higherLower[0] ? family(higherLower[0].name) : "",
    test: nextTest,
    ...extra,
  };
  return text.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? "");
}

/** その選手の話し方で、型ごとのせりふを選ぶ */
export function lineFor(p: Player, lines: Lines): string {
  return lines[PERSONALITY_SPEECH[p.personality]];
}

export function reactionFor(p: Player | undefined, r: Reaction): string {
  if (!p) return ADULT_REACTIONS[r];
  return REACTION_OVERRIDES[r]?.[p.personality] ?? REACTION_LINES[r][PERSONALITY_SPEECH[p.personality]];
}

const ref = (kind: CastRef["kind"], id: string): CastRef => ({ kind, id });

/** 話し出す人 */
export function speakerOf(def: ChoiceEventDef, c: ChoiceCast): { ref: CastRef | null; player?: Player } {
  if (def.speaker === "staff" && c.staff) return { ref: ref("staff", c.staff.id) };
  if (def.speaker === "ob" && c.ob) return { ref: ref("alumnus", c.ob.id) };
  if (c.lead) return { ref: ref("player", c.lead.id), player: c.lead };
  return { ref: null };
}

/** 場面に立つ人（話す人を先に） */
export function castRefs(def: ChoiceEventDef, c: ChoiceCast): CastRef[] {
  const out: CastRef[] = [];
  const sp = speakerOf(def, c).ref;
  if (sp) out.push(sp);
  if (c.lead && sp?.id !== c.lead.id) out.push(ref("player", c.lead.id));
  if (c.second) out.push(ref("player", c.second.id));
  return out.slice(0, 3);
}

/** 選択肢の場面の最初の部分（地の文・最初のせりふ・選択肢） */
export interface ChoiceView {
  def: ChoiceEventDef;
  title: string;
  bg: string;
  narration: string;
  speaker: CastRef | null;
  intro: string;
  options: string[];
  cast: CastRef[];
}

export function choiceView(state: GameState, eventId: string, refs: string[]): ChoiceView | null {
  const def = choiceDef(eventId);
  if (!def) return null;
  const c = decodeCast(state, refs);
  const sp = speakerOf(def, c);
  const intro = typeof def.intro === "string" ? def.intro : sp.player ? lineFor(sp.player, def.intro) : def.intro.polite;
  return {
    def,
    title: def.title,
    bg: def.bg,
    narration: fillText(state, def.narration, c),
    speaker: sp.ref,
    intro: fillText(state, intro, c),
    options: availableOptions(state, def).map((o) => o.label),
    cast: castRefs(def, c),
  };
}

/** 出せる選択肢（スタッフがいないと出さないものを除く） */
export function availableOptions(state: GameState, def: ChoiceEventDef) {
  const hasStaff = state.staff.members.some((m) => !m.temporary);
  return def.options.filter((o) => o.requires !== "staff" || hasStaff);
}

// ================= 効果 =================

export interface EffectEnv {
  state: GameState;
  rng: Rng;
  cast: ChoiceCast;
  /** 評判を動かす（段階の変化はゲームの側で扱う） */
  addReputation: (delta: number) => void;
  /** テスト前の方針を決める */
  setTestPrep?: (policy: "study" | "short" | "normal") => void;
}

const WHO_LABEL: Partial<Record<ChoiceWho, string>> = { team: "全員", grade1: "1年生", grade3: "3年生", lowerGrades: "1・2年生", gks: "GK", otherGks: "ほかのGK", top11: "主力", lowTrust: "信頼度の低い部員", lowAcademic: "学力の低い部員" };

function resolveWho(env: EffectEnv, who: ChoiceWho): Player[] {
  const { state, cast } = env;
  const ps = active(state);
  const pair = [cast.lead, cast.second].filter((p): p is Player => !!p);
  const [higher, lower] = pair.length === 2 ? (overall(pair[0]) >= overall(pair[1]) ? pair : [pair[1], pair[0]]) : [undefined, undefined];
  switch (who) {
    case "lead":
      return cast.lead ? [cast.lead] : [];
    case "second":
    case "senior":
      return cast.second ? [cast.second] : [];
    case "pair":
      return pair;
    case "team":
      return ps;
    case "grade1":
      return ps.filter((p) => p.grade === 1);
    case "grade3":
      return ps.filter((p) => p.grade === 3);
    case "lowerGrades":
      return ps.filter((p) => p.grade < 3);
    case "gks":
      return ps.filter((p) => p.mainPosition === "GK");
    case "otherGks":
      return ps.filter((p) => p.mainPosition === "GK" && p.id !== cast.lead?.id);
    case "top11":
      return [...ps].sort((a, b) => overall(b) - overall(a)).slice(0, 11);
    case "captain": {
      const cap = ps.find((p) => p.id === playerSchool(state).captainId);
      return cap ? [cap] : cast.lead ? [cast.lead] : [];
    }
    case "lowTrust":
      return ps.filter((p) => (p.trust ?? 50) < CHOICE.lowTrust);
    case "lowAcademic":
      return ps.filter((p) => (p.academic ?? 50) < 45);
    case "higher":
      return higher ? [higher] : [];
    case "lower":
      return lower ? [lower] : [];
  }
}

function whoLabel(who: ChoiceWho, ps: Player[]): string {
  const fixed = WHO_LABEL[who];
  if (fixed && ps.length > 2) return fixed;
  const names = ps.slice(0, 3).map((p) => family(p.name));
  return names.join("・") + (ps.length > 3 ? "ほか" : "");
}

const sign = (n: number) => (n > 0 ? `＋${n}` : `−${Math.abs(n)}`);
const clampFit = (v: number) => Math.max(0, Math.min(100, v));

/** ポジションで大事な能力（重みの大きい順） */
function keyStatsOf(p: Player): StatKey[] {
  return (Object.entries(POSITION_RATING_WEIGHTS[p.mainPosition]) as [StatKey, number][]).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function expStats(p: Player, spec: StatKey[] | "weakKey" | "key2" | "gk"): StatKey[] {
  if (Array.isArray(spec)) return spec;
  if (spec === "gk") return [...GK_STATS];
  const keys = keyStatsOf(p).filter((k) => p.stats[k] < STAT_MAX);
  if (spec === "key2") return keys.slice(0, 2);
  const top = keys.slice(0, 4);
  return top.length > 0 ? [top.reduce((lo, k) => (p.stats[k] < p.stats[lo] ? k : lo), top[0])] : [];
}

/** 効果を 1 つ適用し、結果の札を返す */
export function applyChoiceEffect(env: EffectEnv, e: ChoiceEffect): EffectBadge[] {
  const { rng, state } = env;
  const out: EffectBadge[] = [];
  switch (e.t) {
    case "condition": {
      const ps = resolveWho(env, e.who);
      const hit = ps.filter(() => e.chance === undefined || rng.chance(e.chance));
      for (const p of hit) shiftCondition(p, e.amount);
      if (hit.length > 0) out.push({ label: e.chance !== undefined && ps.length > 2 ? `${hit.length}人` : whoLabel(e.who, hit), value: `調子 ${sign(e.amount)}`, tone: e.amount > 0 ? "good" : "bad" });
      break;
    }
    case "trust": {
      const ps = resolveWho(env, e.who);
      for (const p of ps) addTrust(p, e.amount);
      if (ps.length > 0) out.push({ label: whoLabel(e.who, ps), value: `信頼度 ${sign(e.amount)}`, tone: e.amount > 0 ? "good" : "bad" });
      break;
    }
    case "fitness": {
      const ps = resolveWho(env, e.who);
      for (const p of ps) p.fitness = clampFit(p.fitness + e.amount);
      if (ps.length > 0) out.push({ label: whoLabel(e.who, ps), value: `体力 ${sign(e.amount)}`, tone: e.amount > 0 ? "good" : "bad" });
      break;
    }
    case "exp": {
      const ps = resolveWho(env, e.who).filter((p) => p.injuryDays <= 0);
      let shown: StatKey[] = [];
      for (const p of ps) {
        const stats = expStats(p, e.stats);
        if (shown.length === 0) shown = stats;
        const amt = e.stats === "gk" ? e.amount / 2 : e.amount;
        for (const k of stats) addExp(p, k, amt);
      }
      if (ps.length > 0 && shown.length > 0) out.push({ label: whoLabel(e.who, ps), value: `${shown.slice(0, 2).map((k) => STAT_NAMES[k]).join("・")}${shown.length > 2 ? "ほか" : ""} ＋`, tone: "good" });
      break;
    }
    case "proficiency": {
      const ps = resolveWho(env, e.who);
      for (const p of ps) {
        if (e.amount > 0) gainProficiency(p, e.amount);
        else p.styleProficiency = Math.max(0, p.styleProficiency + e.amount);
      }
      if (ps.length > 0) out.push({ label: whoLabel(e.who, ps), value: `熟練度 ${sign(e.amount)}`, tone: e.amount > 0 ? "good" : "bad" });
      break;
    }
    case "academic": {
      const ps = resolveWho(env, e.who);
      for (const p of ps) addAcademic(p, e.amount);
      if (ps.length > 0) out.push({ label: whoLabel(e.who, ps), value: `学力 ${sign(e.amount)}`, tone: e.amount > 0 ? "good" : "bad" });
      break;
    }
    case "reputation":
      env.addReputation(e.amount);
      out.push({ label: "評判", value: e.amount >= 3 ? "上がった" : "少し上がった", tone: "good" });
      break;
    case "nextPractice":
      state.calendar.nextPracticeMult = e.mult;
      out.push({ label: "次の練習", value: e.mult >= 1 ? "効率アップ" : "効率ダウン", tone: e.mult >= 1 ? "good" : "bad" });
      break;
    case "rest": {
      const ps = resolveWho(env, e.who);
      for (const p of ps) p.awayDays = Math.max(p.awayDays ?? 0, e.days);
      if (ps.length > 0) out.push({ label: whoLabel(e.who, ps), value: `練習なし ${e.days}日`, tone: "info" });
      break;
    }
    case "injury": {
      const ps = resolveWho(env, e.who).filter((p) => p.injuryDays <= 0);
      if (ps.length > 0 && rng.chance(e.chance)) {
        const p = rng.pick(ps);
        p.injuryDays = rng.int(e.days[0], e.days[1]);
        state.staff.season.injuryDays += p.injuryDays;
        out.push({ label: `${family(p.name)} ケガ`, value: `全治${p.injuryDays}日`, tone: "bad" });
      }
      break;
    }
    case "aptitude": {
      const pos = env.cast.pos;
      for (const p of resolveWho(env, e.who)) {
        if (!pos || p.aptitude[pos] >= 3) continue;
        p.aptitude[pos] = (p.aptitude[pos] + 1) as 1 | 2 | 3;
        out.push({ label: family(p.name), value: `${POSITION_NAMES[pos]}の適性 ${p.aptitude[pos] === 3 ? "◎" : "○"}`, tone: "good" });
      }
      break;
    }
    case "learn": {
      for (const p of resolveWho(env, e.who).filter((x) => x.injuryDays <= 0)) {
        let skill = null;
        if (e.via === "style") skill = tryLearn(rng, p, PLAY_STYLE_DEFS[p.playStyle].skillAffinity, e.base);
        else if (e.via === "gk") skill = tryLearn(rng, p, TRAINING_POOLS.gk, e.base);
        else if (e.via === "ob" && env.cast.ob) skill = learnFromMentor(rng, p, env.cast.ob.skills, e.base, SKILL_LEARN.goldObTeach);
        else if (e.via === "staff") {
          const m = env.cast.staff ?? state.staff.members.find((x) => !x.temporary);
          if (m) {
            const ability = m.role === "gk" ? m.abilities.gkCoaching : m.role === "physical" ? m.abilities.conditioning : m.role === "analyst" ? m.abilities.scouting : m.abilities.coaching;
            skill = tryLearn(rng, p, STAFF_TEACH_POOLS[m.role], e.base * (0.5 + ability / 100));
          }
        }
        out.push(skill ? { label: `${family(p.name)}が習得`, value: SKILL_NAMES[skill], tone: "good" } : { label: family(p.name), value: "今回は身につかなかった", tone: "info" });
      }
      break;
    }
    case "promise": {
      const target = e.who ? resolveWho(env, e.who)[0] : undefined;
      (state.promises ??= []).push({ kind: e.kind, playerId: target?.id, year: state.year, day: state.calendar.position });
      out.push({ label: "約束", value: e.kind === "playNextOfficial" ? "次の公式戦で使う" : "次の公式戦で結果を出す", tone: "info" });
      break;
    }
    case "restyle": {
      for (const p of resolveWho(env, e.who)) {
        const best = styleOptions(p).sort((a, b) => styleScore(p.stats, b) - styleScore(p.stats, a))[0];
        if (best && best !== p.playStyle && changePlayStyle(p, best)) {
          shiftCondition(p, 1);
          out.push({ label: family(p.name), value: `スタイル「${PLAY_STYLE_NAMES[best]}」`, tone: "good" });
        } else out.push({ label: family(p.name), value: "今のスタイルが合っていた", tone: "info" });
      }
      break;
    }
    case "career":
      for (const p of resolveWho(env, e.who)) p.careerHint = e.career;
      out.push({ label: "進路", value: e.career === "pro" ? "プロを目指す" : "大学で続ける", tone: "info" });
      break;
    case "testPrep":
      env.setTestPrep?.(e.policy);
      out.push({ label: "テストまで", value: e.policy === "study" ? "部活を休んで勉強" : e.policy === "short" ? "練習を短く" : "いつもどおり", tone: "info" });
      break;
    case "relay":
      // 体育祭のリレーは school/events.ts で扱う
      break;
  }
  return out;
}

/** 選んだ結果（確率で 1 つ） */
function rollResult(env: EffectEnv, def: ChoiceEventDef, index: number) {
  const opt = availableOptions(env.state, def)[index];
  const speaker = env.cast.lead;
  for (const r of opt.results) {
    if (r.chance === undefined) return r;
    let c = r.chanceBy && speaker ? (r.chanceBy[speaker.personality] ?? r.chance) : r.chance;
    if (opt.trustBased) c += trustSuccessBonus(speaker);
    if (env.rng.chance(Math.max(0, Math.min(1, c)))) return r;
  }
  return opt.results[opt.results.length - 1];
}

/**
 * 選択肢を選ぶ。効果を適用し、地の文・反応のせりふ・結果の札を返す。
 * relay（体育祭）は extraEffects で別に扱う
 */
export function resolveChoice(env: EffectEnv, def: ChoiceEventDef, index: number, extraEffects?: (e: ChoiceEffect) => EffectBadge[] | null): EventOutcome | null {
  const opts = availableOptions(env.state, def);
  if (!opts[index]) return null;
  const r = rollResult(env, def, index);
  const badges: EffectBadge[] = [];
  for (const e of r.effects) {
    const extra = extraEffects?.(e);
    badges.push(...(extra ?? applyChoiceEffect(env, e)));
  }
  const sp = speakerOf(def, env.cast);
  const lines: SceneLine[] = [{ speaker: null, text: fillText(env.state, r.narration, env.cast) }];
  lines.push({ speaker: sp.ref, text: fillText(env.state, reactionFor(sp.player, r.reaction), env.cast) });
  const tone: EventOutcome["tone"] = badges.some((b) => b.tone === "bad") && !badges.some((b) => b.tone === "good") ? "bad" : badges.some((b) => b.tone === "good") ? "good" : "info";
  return { title: def.title, text: lines[0].text, tone, kind: `choice:${def.id}`, cast: castRefs(def, env.cast), lines, effects: badges.slice(0, 4) };
}

/** イベントが起きたことを記録する（間隔の判定用） */
export function rememberChoice(state: GameState, def: ChoiceEventDef, c: ChoiceCast) {
  const mem = (state.eventMemory ??= {});
  const now = absDay(state);
  mem[def.id] = now;
  for (const p of [c.lead, c.second]) if (p) mem[`p:${p.id}`] = now;
  if (def.id === "careerTalk" && c.lead) mem[`career:${c.lead.id}`] = now;
}

/** 古い記録を消す（1 年より前） */
export function pruneMemory(state: GameState) {
  const mem = state.eventMemory;
  if (!mem) return;
  const now = absDay(state);
  for (const [k, v] of Object.entries(mem)) if (now - v > 400) delete mem[k];
}

/** 自動プレイ：点数が一番高い選択肢 */
export function autoChoiceIndex(state: GameState, def: ChoiceEventDef): number {
  const opts = availableOptions(state, def);
  return opts.reduce((best, o, i) => (o.auto > opts[best].auto ? i : best), 0);
}
