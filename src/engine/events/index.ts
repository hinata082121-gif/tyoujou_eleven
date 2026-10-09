import { EVENTS, GREEN_RECOVERY, WHITE_GOOD_CHANCE, WHITE_ONLY_EVENTS, YELLOW_BONUS, type EventDef } from "../config/events";
import { addExp } from "../player/growth";
import { applyBonusGains, shiftCondition } from "../practice";
import { addGauge } from "../reputation";
import type { Rng } from "../rng";
import { ALL_STATS, type Calendar, type Player, type Reputation, type SquareType, type StatKey } from "../types";

export interface EventContext {
  rng: Rng;
  players: Player[];
  reputation: Reputation;
  calendar: Calendar;
}

export interface EventOutcome {
  title: string;
  text: string;
  tone: "good" | "bad" | "info";
  /** 対象になった選手の名前 */
  targets?: string[];
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
  }
  const names = targets.map((p) => p.name);
  let text = def.text;
  if (e.type === "injury" && targets[0]) text = `${targets[0].name}がケガをしてしまった（全治${targets[0].injuryDays}日）。`;
  return { title: def.title, text, tone: def.tone, targets: names.length ? names : undefined };
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
  if (type === "green") {
    for (const p of activePlayers(ctx.players)) p.fitness = clampFit(p.fitness + GREEN_RECOVERY);
    return { title: "体力回復", text: "しっかり体を休めた。部員の体力が回復した。", tone: "good" };
  }
  if (type === "yellow") {
    const last = ctx.calendar.lastGain;
    if (last && Object.keys(last.perPlayer).length > 0) {
      applyBonusGains(ctx.players, last.perPlayer, YELLOW_BONUS);
      return { title: "練習に手応え", text: "直前の練習の手応えが大きく、経験点が上乗せされた。", tone: "good" };
    }
    return { title: "練習に手応え", text: "気持ちの良い一日だった。", tone: "info" };
  }
  return applyEvent(ctx, pickEvent(ctx.rng, type));
}
