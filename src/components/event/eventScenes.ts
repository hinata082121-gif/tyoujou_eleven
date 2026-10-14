/**
 * カードを使ったあとの出来事を、イベントの場面（背景・立ち絵・名前の札・せりふの枠・結果の札）にする（R1。PHASE_R1_PLAN 3.5）。
 * 表示だけ。エンジンの EventOutcome の kind（出来事の種類）と cast（関わった人の ID）から作り、ゲームの状態は変えない。
 * 表情の選び方もここに置く（エンジンには置かない）。
 */
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

/** 場面にする出来事か（分かれ道は分かれ道の画面で見せる） */
const isScene = (o: EventOutcome) => o.kind !== "branch";

export function scenesFromCard(game: GameState, card: CardResult): EventSceneData[] {
  const scenes: EventSceneData[] = [];
  // 練習中のケガ（練習の途中で起きるので先に見せる）
  (card.injuredIds ?? []).forEach((id, i) => {
    const a = actorFor(game, { kind: "player", id }, "surprise", "sad");
    if (!a) return;
    const p = playerSchool(game).players.find((x) => x.id === id);
    scenes.push({
      key: `inj${i}`,
      bg: BG_FOR_KIND.practiceInjury,
      title: "練習中のケガ",
      tone: "bad",
      text: `${card.practice}の最中に、${a.name}が倒れ込んだ。${p ? `全治${p.injuryDays}日の見込み。` : ""}`,
      speaker: { name: a.name, role: a.role },
      actors: [a],
      badges: p ? [{ label: "ケガ", value: `全治${p.injuryDays}日`, tone: "bad" }] : [],
    });
  });
  card.outcomes.filter(isScene).forEach((o, i) => {
    const learnedBad = (o.learned ?? []).some((l) => l.kind === "learn" && SKILL_DEFS[l.skill].tier === "minus");
    const ex = exprFor(o.kind, o.tone, learnedBad);
    const refs = o.cast && o.cast.length > 0 ? o.cast : teamCast(game);
    const named = !!o.cast && o.cast.length > 0;
    const actors = refs
      .slice(0, 3)
      .map((r, j) => actorFor(game, r, j === 0 ? ex.lead : ex.others, j === 0 ? ex.after : undefined))
      .filter((a): a is SceneActor => !!a);
    const lead = actors[0];
    scenes.push({
      key: `o${i}`,
      bg: (o.kind && BG_FOR_KIND[o.kind]) || "ground",
      title: o.title,
      tone: o.tone,
      text: o.text,
      speaker: named && lead ? { name: lead.name, role: lead.role } : undefined,
      actors,
      badges: badgesFor(game, o),
    });
  });
  return scenes;
}
