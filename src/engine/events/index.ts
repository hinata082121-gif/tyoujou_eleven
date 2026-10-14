import { EVENTS, GREEN_RECOVERY, WHITE_GOOD_CHANCE, WHITE_ONLY_EVENTS, YELLOW_BONUS, type EventDef } from "../config/events";
import { addExp } from "../player/growth";
import { applyBonusGains, shiftCondition } from "../practice";
import { addGauge } from "../reputation";
import type { Rng } from "../rng";
import { ALL_STATS, type Alumnus, type Calendar, type Player, type PracticeKind, type Reputation, type SkillId, type SquareType, type StaffRole, type StaffState, type StatKey } from "../types";
import { SKILL_NAMES } from "../config/names";
import { PLAY_STYLE_DEFS } from "../config/playStyle";
import { SKILL_LEARN, TRAINING_POOLS } from "../config/skills";
import { canLearn, hasSkill, isMinus, isPlus, removeSkill } from "../skills";
import { learnFromMentor, trainingSquare, tryLearn, tryLearnGold, type LearnEvent } from "../skills/learn";
import { styleFitsPosition } from "../player/traits";

export interface EventContext {
  rng: Rng;
  players: Player[];
  reputation: Reputation;
  calendar: Calendar;
  /** 特訓マス用：そこまで使ったカードの練習 */
  practice?: PracticeKind;
  /** 特殊能力のイベント用 */
  alumni?: Alumnus[];
  staff?: StaffState;
}

export interface EventOutcome {
  title: string;
  text: string;
  tone: "good" | "bad" | "info";
  /** 対象になった選手の名前 */
  targets?: string[];
  /** 習得した・消えた特殊能力 */
  learned?: LearnEvent[];
  /** 表示用（R1）：出来事の種類（イベントの ID か、マスの種類）。乱数は使わない */
  kind?: string;
  /** 表示用（R1）：関わった人（指導した OB・スタッフ・先輩を先に、そのあと対象の選手）。乱数は使わない */
  cast?: CastRef[];
}

/** 出来事に出てくる人（表示用） */
export interface CastRef {
  kind: "player" | "alumnus" | "staff";
  id: string;
}

const playerCast = (ps: Player[]): CastRef[] => ps.map((p) => ({ kind: "player", id: p.id }));

/** スタッフの役割ごとの、個別指導の候補 */
const STAFF_TEACH_POOLS: Record<StaffRole, SkillId[]> = {
  head: [...TRAINING_POOLS.tactics, ...TRAINING_POOLS.pass],
  gk: TRAINING_POOLS.gk,
  physical: [...TRAINING_POOLS.physical, ...TRAINING_POOLS.run],
  analyst: [...TRAINING_POOLS.pk, ...TRAINING_POOLS.defense],
};

/** 習得の文章（「○○が△△を身につけた」など） */
export function learnText(events: LearnEvent[]): string {
  return events.map((e) => (e.kind === "remove" ? `${e.name}の${SKILL_NAMES[e.skill]}が消えた` : `${e.name}が${SKILL_NAMES[e.skill]}を身につけた`)).join("。");
}

/** 特殊能力のイベント（OB・スタッフ・先輩・自主練・悪い癖） */
function skillEvent(ctx: EventContext, e: Extract<EventDef["effect"], { type: "obTeach" | "staffTeach" | "seniorTeach" | "selfAwake" | "badHabit" }>, players: Player[]): { targets: Player[]; learned: LearnEvent[]; note?: string; mentor?: CastRef } {
  const { rng } = ctx;
  const healthy = players.filter((p) => p.injuryDays <= 0);
  const learned: LearnEvent[] = [];
  const push = (p: Player, skill: SkillId | null, kind: LearnEvent["kind"] = "learn") => {
    if (skill) learned.push({ playerId: p.id, name: p.name, skill, kind });
  };
  if (healthy.length === 0) return { targets: [], learned };
  switch (e.type) {
    case "obTeach": {
      const obs = (ctx.alumni ?? []).filter((a) => a.skills.some(isPlus));
      if (obs.length === 0) return { targets: [], learned, note: "OBが練習を見に来て、部員を励ましてくれた。" };
      const ob = rng.pick(obs);
      const sameGroup = healthy.filter((p) => styleFitsPosition(ob.playStyle, p.mainPosition));
      const targets = rng.shuffle([...(sameGroup.length > 0 ? sameGroup : healthy)]).slice(0, rng.int(1, 2));
      for (const p of targets) push(p, learnFromMentor(rng, p, ob.skills, e.base, SKILL_LEARN.goldObTeach));
      return { targets, learned, note: `OBの${ob.name}が練習に来て、得意のプレーを教えてくれた。`, mentor: { kind: "alumnus", id: ob.id } };
    }
    case "staffTeach": {
      const staff = (ctx.staff?.members ?? []).filter((m) => !m.temporary);
      if (staff.length === 0) return { targets: [], learned, note: "コーチが部員の1人を付きっきりで指導した。" };
      const m = rng.pick(staff);
      const withMinus = healthy.filter((p) => p.skills.some(isMinus));
      if (withMinus.length > 0) {
        const p = rng.pick(withMinus);
        const minus = rng.pick(p.skills.filter(isMinus));
        if (rng.chance(e.removeChance) && removeSkill(p, minus)) push(p, minus, "remove");
        return { targets: [p], learned, note: `${m.name}が${p.name}の癖を直そうと付きっきりで指導した。`, mentor: { kind: "staff", id: m.id } };
      }
      const pool = STAFF_TEACH_POOLS[m.role];
      const cands = healthy.filter((p) => pool.some((id) => canLearn(p, id)));
      if (cands.length === 0) return { targets: [], learned, note: `${m.name}が部員を熱心に指導した。`, mentor: { kind: "staff", id: m.id } };
      const p = rng.pick(cands);
      const ability = m.role === "gk" ? m.abilities.gkCoaching : m.role === "physical" ? m.abilities.conditioning : m.role === "analyst" ? m.abilities.scouting : m.abilities.coaching;
      push(p, tryLearn(rng, p, pool, e.base * (0.5 + ability / 100)));
      return { targets: [p], learned, note: `${m.name}が${p.name}を付きっきりで指導した。`, mentor: { kind: "staff", id: m.id } };
    }
    case "seniorTeach": {
      const seniors = healthy.filter((p) => p.grade === 3 && p.skills.some(isPlus));
      if (seniors.length === 0) return { targets: [], learned, note: "上級生が後輩の練習に付き合った。" };
      const s = rng.pick(seniors);
      const juniors = healthy.filter((p) => p.grade < 3 && p.playStyle === s.playStyle);
      const pool = juniors.length > 0 ? juniors : healthy.filter((p) => p.grade < 3 && styleFitsPosition(s.playStyle, p.mainPosition));
      if (pool.length === 0) return { targets: [], learned, note: "上級生が後輩の練習に付き合った。" };
      const j = rng.pick(pool);
      push(j, learnFromMentor(rng, j, s.skills, e.base, 0));
      return { targets: [j], learned, note: `${s.name}が${j.name}に自分の技を伝えた。`, mentor: { kind: "player", id: s.id } };
    }
    case "selfAwake": {
      const cands = healthy.filter((p) => p.styleProficiency >= e.minProficiency);
      if (cands.length === 0) return { targets: [], learned, note: "居残りで自主練をする部員が増えてきた。" };
      const p = rng.pick(cands);
      const pool = PLAY_STYLE_DEFS[p.playStyle].skillAffinity;
      push(p, tryLearn(rng, p, pool, e.base) ?? tryLearnGold(rng, p, pool, SKILL_LEARN.goldTraining));
      return { targets: [p], learned };
    }
    case "badHabit": {
      const p = rng.pick(healthy);
      const habit = rng.pick(["roughPlay", "footX"] as SkillId[]);
      if (!hasSkill(p, habit) && canLearn(p, habit)) {
        p.skills.push(habit);
        push(p, habit);
      }
      return { targets: [p], learned };
    }
  }
}

const clampFit = (v: number) => Math.max(0, Math.min(100, v));
const activePlayers = (ps: Player[]) => ps.filter((p) => p.status === "active");

function pickSome(rng: Rng, players: Player[], [min, max]: [number, number]): Player[] {
  const pool = rng.shuffle([...players]);
  return pool.slice(0, Math.min(pool.length, rng.int(min, max)));
}

/** イベントの効果を適用する */
export function applyEvent(ctx: EventContext, def: EventDef): EventOutcome {
  const { rng } = ctx;
  const players = activePlayers(ctx.players);
  const e = def.effect;
  let targets: Player[] = [];
  switch (e.type) {
    case "teamFitness":
      for (const p of players) p.fitness = clampFit(p.fitness + e.amount);
      break;
    case "teamCondition":
      for (const p of players) shiftCondition(p, e.amount);
      break;
    case "someCondition":
      targets = pickSome(rng, players, e.count);
      for (const p of targets) shiftCondition(p, e.amount);
      break;
    case "someFitness":
      targets = pickSome(rng, players, e.count);
      for (const p of targets) {
        p.fitness = clampFit(p.fitness + e.amount);
        if (e.condition) shiftCondition(p, e.condition);
      }
      break;
    case "someExp":
      targets = pickSome(rng, players.filter((p) => p.injuryDays <= 0), e.count);
      for (const p of targets) {
        const stats = ALL_STATS.filter((s) => s !== "pkSkill");
        addExp(p, rng.pick(stats), e.exp);
        addExp(p, rng.pick(stats), e.exp / 2);
      }
      break;
    case "teamExp":
      for (const p of players) {
        if (p.injuryDays > 0) continue;
        for (const s of e.stats) addExp(p, s as StatKey, e.exp);
        p.fitness = clampFit(p.fitness + e.fitness);
      }
      break;
    case "injury": {
      const healthy = players.filter((p) => p.injuryDays <= 0);
      if (healthy.length > 0) {
        // 体力が低い選手ほどケガをしやすい
        const p = rng.weighted(healthy, (x) => 110 - x.fitness);
        p.injuryDays = rng.int(e.days[0], e.days[1]);
        targets = [p];
      }
      break;
    }
    case "healInjuries":
      targets = players.filter((p) => p.injuryDays > 0);
      for (const p of targets) p.injuryDays = Math.max(0, p.injuryDays - e.days);
      break;
    case "reputation":
      addGauge(ctx.reputation, e.amount);
      break;
    case "nextPractice":
      ctx.calendar.nextPracticeMult = e.mult;
      break;
    case "randomCondition":
      for (const p of players) if (rng.chance(0.4)) shiftCondition(p, rng.chance(0.5) ? 1 : -1);
      break;
    case "obTeach":
    case "staffTeach":
    case "seniorTeach":
    case "selfAwake":
    case "badHabit": {
      const r = skillEvent(ctx, e, players);
      targets = r.targets;
      const names = targets.map((p) => p.name);
      let text = r.note ?? def.text;
      if (r.learned.length > 0) text += ` ${learnText(r.learned)}。`;
      else if (e.type === "badHabit") text = "部員の1人に悪い癖がつきかけたが、なんとか直った。";
      else if (targets.length > 0) text += " 今回は身につかなかった。";
      const cast = [...(r.mentor ? [r.mentor] : []), ...playerCast(targets)];
      return { title: def.title, text, tone: def.tone, targets: names.length ? names : undefined, learned: r.learned.length ? r.learned : undefined, kind: def.id, cast };
    }
  }
  const names = targets.map((p) => p.name);
  let text = def.text;
  if (e.type === "injury" && targets[0]) text = `${targets[0].name}がケガをしてしまった（全治${targets[0].injuryDays}日）。`;
  return { title: def.title, text, tone: def.tone, targets: names.length ? names : undefined, kind: def.id, cast: playerCast(targets) };
}

/** マスの種類からイベントを選ぶ */
export function pickEvent(rng: Rng, type: "blue" | "red" | "white"): EventDef {
  let tone: "good" | "bad";
  let pool: EventDef[];
  if (type === "white") {
    tone = rng.chance(WHITE_GOOD_CHANCE) ? "good" : "bad";
    pool = EVENTS.filter((e) => e.tone === tone || WHITE_ONLY_EVENTS.includes(e.id));
  } else {
    tone = type === "blue" ? "good" : "bad";
    pool = EVENTS.filter((e) => e.tone === tone && !WHITE_ONLY_EVENTS.includes(e.id));
  }
  return rng.weighted(pool, (e) => e.weight);
}

/** 止まった通常マスの効果 */
export function landOnSquare(ctx: EventContext, type: Exclude<SquareType, "major">): EventOutcome {
  if (type === "branch") return { title: "分かれ道", text: "道が分かれている。", tone: "info", kind: "branch" };
  if (type === "green") {
    for (const p of activePlayers(ctx.players)) p.fitness = clampFit(p.fitness + GREEN_RECOVERY);
    return { title: "体力回復", text: "しっかり体を休めた。部員の体力が回復した。", tone: "good", kind: "green" };
  }
  if (type === "yellow") {
    const last = ctx.calendar.lastGain;
    if (last && Object.keys(last.perPlayer).length > 0) {
      applyBonusGains(ctx.players, last.perPlayer, YELLOW_BONUS);
      return { title: "練習に手応え", text: "直前の練習の手応えが大きく、経験点が上乗せされた。", tone: "good", kind: "yellow" };
    }
    return { title: "練習に手応え", text: "気持ちの良い一日だった。", tone: "info", kind: "yellow" };
  }
  if (type === "training") {
    const practice = ctx.practice ?? "rest";
    const learned = trainingSquare(ctx.rng, ctx.players, practice);
    const text = learned.length > 0 ? `${learnText(learned)}。` : practice === "rest" ? "体を休めながら、癖を見直した。今回は変化がなかった。" : "厳しい特訓に取り組んだ。今回は身につかなかった。";
    const cast = [...new Set(learned.map((l) => l.playerId))].map((id): CastRef => ({ kind: "player", id }));
    return { title: "特訓", text, tone: learned.some((l) => l.kind === "learn" && !isMinus(l.skill)) || learned.some((l) => l.kind === "remove") ? "good" : "info", learned: learned.length ? learned : undefined, kind: "training", cast };
  }
  return applyEvent(ctx, pickEvent(ctx.rng, type));
}
