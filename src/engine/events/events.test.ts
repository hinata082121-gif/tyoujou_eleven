import { describe, expect, it } from "vitest";
import { EVENTS } from "../config/events";
import { generateGradeGroup } from "../player/generate";
import { Rng } from "../rng";
import type { Calendar, Reputation } from "../types";
import { applyEvent, landOnSquare, pickEvent } from ".";

const ctx = (seed: string) => {
  const rng = Rng.fromSeed(seed);
  const players = generateGradeGroup(rng, 10, { grade: 2, enrolledYear: 1, base: 40 });
  const reputation: Reputation = { level: 0, gauge: 10 };
  const calendar: Calendar = { squares: [], position: 0, hand: [], nextPracticeMult: 1 };
  return { rng, players, reputation, calendar };
};

describe("イベント", () => {
  it("P1 のイベントは 10〜15 種類", () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(10);
    expect(EVENTS.length).toBeLessThanOrEqual(15);
  });

  it("青マスは良いイベント、赤マスは悪いイベント", () => {
    const rng = Rng.fromSeed("ev");
    for (let i = 0; i < 100; i++) {
      expect(pickEvent(rng, "blue").tone).toBe("good");
      expect(pickEvent(rng, "red").tone).toBe("bad");
    }
  });

  it("すべてのイベントが適用できる", () => {
    for (const def of EVENTS) {
      const c = ctx(def.id);
      for (const p of c.players) p.fitness = 50;
      const out = applyEvent(c, def);
      expect(out.title).toBe(def.title);
    }
  });

  it("差し入れで体力回復・ケガで離脱・雨で次の練習の効率が下がる", () => {
    const c = ctx("x");
    for (const p of c.players) p.fitness = 50;
    applyEvent(c, EVENTS.find((e) => e.id === "snack")!);
    expect(c.players.every((p) => p.fitness === 65)).toBe(true);
    applyEvent(c, EVENTS.find((e) => e.id === "injury")!);
    expect(c.players.filter((p) => p.injuryDays > 0)).toHaveLength(1);
    applyEvent(c, EVENTS.find((e) => e.id === "rain")!);
    expect(c.calendar.nextPracticeMult).toBeLessThan(1);
  });

  it("緑マスは体力回復", () => {
    const c = ctx("g");
    for (const p of c.players) p.fitness = 40;
    landOnSquare(c, "green");
    expect(c.players.every((p) => p.fitness > 40)).toBe(true);
  });
});
