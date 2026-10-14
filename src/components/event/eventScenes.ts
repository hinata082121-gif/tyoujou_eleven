/**
 * カードを使ったあとの出来事を、イベントの場面（背景・立ち絵・名前の札・せりふの枠・結果の札）にする（R1。PHASE_R1_PLAN 3.5）。
 * 表示だけ。エンジンの EventOutcome の kind（出来事の種類）と cast（関わった人の ID）から作り、ゲームの状態は変えない。
 * 表情の選び方もここに置く（エンジンには置かない）。
 */
import { choiceDef } from "@/engine/choice";
import { addEventLines } from "@/engine/events/speech";
import { POSITION_NAMES, ROLE_NAMES, SKILL_NAMES } from "@/engine/config/names";
import { SKILL_DEFS } from "@/engine/config/skills";
import type { EventOutcome, CastRef } from "@/engine/events";
import type { CardResult } from "@/engine/game";
import { bodyScale, generateKits } from "@/engine/look";
import { ageEffects, staffAppearance, type StaffOutfit } from "@/engine/look/staff";
import { playerSchool } from "@/engine/season";
import { alumnusAge } from "@/engine/staff";
import type { GameState, Kit, Look, Player } from "@/engine/types";
import type { Expression } from "../look/Figure";
import type { SceneBg } from "./backgrounds";

/** 場面に立つ人 */
export interface SceneActor {
  key: string;
  name: string;
  /** 名前の札の横の小さい文字（学年・ポジション、役割、OB・年齢） */
  role: string;
  look: Look;
  expr: Expression;
  /** 少し遅れて変わる表情（ケガ：驚き → 悲しい） */
  exprAfter?: Expression;
  kit?: Kit;
  number?: number;
  outfit?: StaffOutfit;
  gray?: number;
  height: number;
  build: number;
}

/** 結果の札（右上に飛び込む） */
export interface SceneBadge {
  label: string;
  value: string;
  tone: "good" | "bad" | "info";
}

export interface EventSceneData {
  key: string;
  bg: SceneBg;
  title: string;
  tone: "good" | "bad" | "info";
  text: string;
  /** 名前の札（中心の人）。いなければ札を出さない（題名は左上の札） */
  speaker?: { name: string; role: string };
  /** 話している人の立ち絵（R2。少し前に出して明るくする） */
  speakerKey?: string;
  actors: SceneActor[];
  badges: SceneBadge[];
}

/** 出来事の種類 → 背景 */
const BG_FOR_KIND: Record<string, SceneBg> = {
  snack: "clubroom",
  obCoaching: "ground",
  motivation: "clubroom",
  newspaper: "gate",
  selfTraining: "groundNight",
  goodWeather: "ground",
  quickRecovery: "infirmary",
  obTeach: "ground",
  staffTeach: "ground",
  seniorTeach: "groundDusk",
  selfAwake: "groundNight",
  rain: "rain",
  injury: "ground",
  cold: "classroom",
  slump: "clubroom",
  badHabit: "groundDusk",
  tired: "clubroom",
  scrimmage: "ground",
  pepTalk: "meeting",
  green: "clubroom",
  yellow: "ground",
  training: "groundDusk",
  donation: "gate",
  practiceInjury: "ground",
};

/** 出来事の種類と良し悪しから、表情を選ぶ（[中心の人, まわりの人]） */
function exprFor(kind: string | undefined, tone: EventOutcome["tone"], learnedBad: boolean): { lead: Expression; others: Expression; after?: Expression } {
  if (kind === "injury" || kind === "practiceInjury") return { lead: "surprise", others: "surprise", after: "sad" };
  if (kind === "pepTalk") return { lead: "surprise", others: "frustrated" };
  if (kind === "badHabit") return learnedBad ? { lead: "frustrated", others: "sad" } : { lead: "normal", others: "normal" };
  if (kind === "cold") return { lead: "sad", others: "sad" };
  if (kind === "obTeach" || kind === "staffTeach" || kind === "seniorTeach" || kind === "obCoaching") return { lead: "joy", others: "focus" };
  if (kind === "training" || kind === "selfAwake" || kind === "selfTraining") return tone === "good" ? { lead: "joy", others: "joy" } : { lead: "focus", others: "focus" };
  if (tone === "good") return { lead: "joy", others: "joy" };
  if (tone === "bad") return { lead: "frustrated", others: "sad" };
  return { lead: "normal", others: "focus" };
}

const playerRole = (p: Player) => `${p.grade}年・${POSITION_NAMES[p.mainPosition]}`;

/** OB の服（私服のジャージ。ID から色を選ぶ） */
const OB_TOPS = [21, 3, 1, 2, 16, 7];
function obOutfit(id: string): StaffOutfit {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const top = OB_TOPS[h % OB_TOPS.length];
  return { kind: "jersey", top, trim: top === 0 ? 1 : 0, pants: top === 1 ? 21 : 1, binder: false };
}

function actorFor(game: GameState, ref: CastRef, expr: Expression, after?: Expression): SceneActor | null {
  const school = playerSchool(game);
  const kits = school.kits ?? generateKits(game.seed, school.id);
  if (ref.kind === "player") {
    const p = school.players.find((x) => x.id === ref.id);
    if (!p?.look) return null;
    const b = bodyScale(p.heightCm, p.stats.physical);
    return { key: `p:${p.id}`, name: p.name, role: playerRole(p), look: p.look, expr, exprAfter: after, kit: kits.first, number: p.shirtNumber, height: b.height, build: b.build };
  }
  if (ref.kind === "staff") {
    const m = game.staff.members.find((x) => x.id === ref.id);
    if (!m) return null;
    const a = staffAppearance(game, m, kits);
    return { key: `s:${m.id}`, name: m.name, role: `${ROLE_NAMES[m.role]}・${a.age}歳`, look: a.look, expr, exprAfter: after, outfit: a.outfit, gray: a.gray, height: 1.04, build: a.build };
  }
  const ob = game.alumni.find((x) => x.id === ref.id);
  if (!ob?.look) return null;
  const age = alumnusAge(ob, game.year);
  const fx = ageEffects(age);
  return { key: `a:${ob.id}`, name: ob.name, role: `OB・${age}歳`, look: ob.look, expr, exprAfter: after, outfit: obOutfit(ob.id), gray: fx.gray, height: 1.04, build: fx.build };
}

/** 全体の出来事（人が決まっていない）のときに立たせる人：キャプテンと、総合値の高い順にもう 1 人 */
function teamCast(game: GameState): CastRef[] {
  const school = playerSchool(game);
  const active = school.players.filter((p) => p.status === "active" && p.look);
  const cap = active.find((p) => p.id === school.captainId);
  const rest = active.filter((p) => p !== cap).sort((a, b) => (b.shirtNumber ? 1 : 0) - (a.shirtNumber ? 1 : 0) || (a.shirtNumber ?? 99) - (b.shirtNumber ?? 99));
  return [cap, rest[0]].filter((p): p is Player => !!p).map((p) => ({ kind: "player", id: p.id }));
}

function badgesFor(game: GameState, o: EventOutcome): SceneBadge[] {
  const out: SceneBadge[] = [];
  for (const l of o.learned ?? []) {
    const minus = SKILL_DEFS[l.skill].tier === "minus";
    if (l.kind === "remove") out.push({ label: `${l.name.split(" ")[0]}の癖が消えた`, value: SKILL_NAMES[l.skill], tone: "good" });
    else out.push({ label: minus ? `${l.name.split(" ")[0]}に悪い癖` : `${l.name.split(" ")[0]}が習得`, value: SKILL_NAMES[l.skill], tone: minus ? "bad" : "good" });
  }
  if (o.kind === "injury") {
    const id = o.cast?.[0]?.id;
    const p = playerSchool(game).players.find((x) => x.id === id);
    if (p) out.push({ label: "ケガ", value: `全治${p.injuryDays}日`, tone: "bad" });
  }
  if (o.kind === "newspaper") out.push({ label: "評判", value: "少し上がった", tone: "good" });
  if (o.kind === "goodWeather") out.push({ label: "次の練習", value: "効率アップ", tone: "good" });
  if (o.kind === "rain") out.push({ label: "次の練習", value: "効率ダウン", tone: "bad" });
  if (o.kind === "donation") out.push({ label: "OBからの寄付", value: "設備が良くなった", tone: "good" });
  return out.slice(0, 3);
}

/** 学校行事の出来事 → 背景（R2） */
const BG_FOR_SCHOOL: Record<string, SceneBg> = {
  "school:test": "exam",
  "school:testPrep": "exam",
  "school:sportsDay": "sportsDay",
  "school:culturalFestival": "festival",
  "school:schoolTrip": "trip",
  "school:entrance": "entrance",
  "school:graduation": "gym",
  tripReturn: "gate",
};

function bgFor(kind: string | undefined): SceneBg {
  if (!kind) return "ground";
  if (BG_FOR_SCHOOL[kind]) return BG_FOR_SCHOOL[kind];
  if (kind.startsWith("choice:")) return (choiceDef(kind.slice(7))?.bg as SceneBg | undefined) ?? "clubroom";
  return BG_FOR_KIND[kind] ?? "ground";
}

/** 特殊能力の出来事（身についた・消えたときだけ場面。何も起きなかったときは文章だけ） */
const SKILL_KINDS = new Set(["training", "obTeach", "staffTeach", "seniorTeach", "selfAwake", "badHabit"]);
/** いつも場面にする出来事 */
const SCENE_KINDS = new Set(["injury", "practiceInjury", "obCoaching", "donation"]);

/**
 * 大事な出来事か（R2。PHASE_R2_PLAN 6.1 の表）。設定が「大事なものだけ」のとき、大事な出来事は場面で、
 * そのほかはホームの速報の帯に文章だけで流す
 */
export function isImportant(o: EventOutcome): boolean {
  if (!o.kind || o.kind === "branch") return false;
  if ((o.learned ?? []).length > 0) return true;
  if (o.kind.startsWith("school:") || o.kind.startsWith("choice:")) return true;
  if (SKILL_KINDS.has(o.kind)) return false;
  return SCENE_KINDS.has(o.kind);
}

/** 文章だけで流す出来事か（「大事なものだけ」の設定のとき） */
export const isTextOnly = (o: EventOutcome) => o.kind !== "branch" && !isImportant(o);

/** 設定ごとに、場面にする出来事か（分かれ道は分かれ道の画面で見せる） */
export function showsAsScene(o: EventOutcome, mode: "important" | "all" | "text"): boolean {
  if (o.kind === "branch") return false;
  if (mode === "all") return true;
  if (mode === "text") return false;
  return isImportant(o);
}

/** せりふのある出来事（R2）の、表情。結果の札にその人の名前があれば、札の良し悪しで決める（調子が下がった人は曇る） */
function lineExpr(o: EventOutcome, speaking: boolean, name?: string): Expression {
  const surname = name?.split(" ")[0];
  const mine = surname ? (o.effects ?? []).filter((e) => e.label.includes(surname)) : [];
  if (o.kind === "school:graduation") return speaking ? "sad" : "focus";
  if (o.kind === "injury" || o.kind === "practiceInjury") return "sad";
  if (mine.some((e) => e.tone === "bad")) return speaking ? "frustrated" : "sad";
  if (mine.some((e) => e.tone === "good")) return "joy";
  if (o.tone === "good") return "joy";
  if (o.tone === "bad") return speaking ? "frustrated" : "sad";
  return speaking ? "normal" : "focus";
}

/**
 * せりふのある出来事を、場面の並びにする（R2。一言ずつ 1 枚。話す人を名前の札に出し、結果の札は最後の 1 枚に）
 */
function scenesFromLines(game: GameState, o: EventOutcome, keyPrefix: string): EventSceneData[] {
  const lines = o.lines ?? [];
  const refs = [...(o.cast ?? [])];
  for (const l of lines) if (l.speaker && !refs.some((r) => r.kind === l.speaker!.kind && r.id === l.speaker!.id)) refs.push(l.speaker);
  const bg = bgFor(o.kind);
  const badges = (o.effects && o.effects.length > 0 ? o.effects : badgesFor(game, o)).slice(0, 4);
  return lines.map((l, i) => {
    const visible = refs.slice(0, 3);
    if (l.speaker && !visible.some((r) => r.id === l.speaker!.id)) visible[visible.length - 1] = l.speaker;
    const actors = visible
      .map((r) => actorFor(game, r, "normal"))
      .filter((a): a is SceneActor => !!a)
      .map((a) => ({ ...a, expr: lineExpr(o, !!l.speaker && a.key.endsWith(`:${l.speaker.id}`), a.name) }));
    const sp = l.speaker ? actors.find((a) => a.key.endsWith(`:${l.speaker!.id}`)) : undefined;
    return {
      key: `${keyPrefix}l${i}`,
      bg,
      title: o.title,
      tone: o.tone,
      text: l.text,
      speaker: sp ? { name: sp.name, role: sp.role } : undefined,
      speakerKey: sp?.key,
      actors: actors.length > 0 ? actors : teamCast(game).map((r) => actorFor(game, r, lineExpr(o, false))).filter((a): a is SceneActor => !!a),
      badges: i === lines.length - 1 ? badges : [],
    };
  });
}

/** 1 つの出来事を場面にする */
export function scenesFromOutcome(game: GameState, o: EventOutcome, keyPrefix = "o"): EventSceneData[] {
  if (o.lines && o.lines.length > 0) return scenesFromLines(game, o, keyPrefix);
  const learnedBad = (o.learned ?? []).some((l) => l.kind === "learn" && SKILL_DEFS[l.skill].tier === "minus");
  const ex = exprFor(o.kind, o.tone, learnedBad);
  const refs = o.cast && o.cast.length > 0 ? o.cast : teamCast(game);
  const named = !!o.cast && o.cast.length > 0;
  const actors = refs
    .slice(0, 3)
    .map((r, j) => actorFor(game, r, j === 0 ? ex.lead : ex.others, j === 0 ? ex.after : undefined))
    .filter((a): a is SceneActor => !!a);
  const lead = actors[0];
  return [
    {
      key: keyPrefix,
      bg: bgFor(o.kind),
      title: o.title,
      tone: o.tone,
      text: o.text,
      speaker: named && lead ? { name: lead.name, role: lead.role } : undefined,
      speakerKey: named && lead ? lead.key : undefined,
      actors,
      badges: o.effects && o.effects.length > 0 ? o.effects.slice(0, 4) : badgesFor(game, o),
    },
  ];
}

/** 立ち絵を選ぶ（選択肢の場面用。話す人を先に） */
export function actorsFor(game: GameState, refs: CastRef[], expr: Expression): SceneActor[] {
  return refs
    .slice(0, 3)
    .map((r) => actorFor(game, r, expr))
    .filter((a): a is SceneActor => !!a);
}

export function scenesFromCard(game: GameState, card: CardResult, mode: "important" | "all" | "text" = "all"): EventSceneData[] {
  const scenes: EventSceneData[] = [];
  // 練習中のケガ（練習の途中で起きるので先に見せる）
  (card.injuredIds ?? []).forEach((id, i) => {
    const p = playerSchool(game).players.find((x) => x.id === id);
    if (!p) return;
    const o: EventOutcome = {
      title: "練習中のケガ",
      text: `${card.practice}の最中に、${p.name}が倒れ込んだ。全治${p.injuryDays}日の見込み。`,
      tone: "bad",
      kind: "practiceInjury",
      cast: [{ kind: "player", id }],
      effects: [{ label: "ケガ", value: `全治${p.injuryDays}日`, tone: "bad" }],
    };
    scenes.push(...scenesFromOutcome(game, addEventLines(game, o), `inj${i}`));
  });
  card.outcomes
    .filter((o) => showsAsScene(o, mode))
    .forEach((o, i) => scenes.push(...scenesFromOutcome(game, o, `o${i}`)));
  return scenes;
}
