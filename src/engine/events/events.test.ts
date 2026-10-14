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
  it("イベントは P1 の 10〜15 種類に、P2b の特殊能力のイベントを足したもの", () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(15);
    expect(EVENTS.length).toBeLessThanOrEqual(20);
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

  it("表示用の項目（R1）：出来事の種類と、関わった人の ID（乱数は使わない。ゲームの結果が変わらないことは balance:quick で確かめる）", () => {
    const injury = EVENTS.find((e) => e.id === "injury")!;
    const c = ctx("cast");
    for (const p of c.players) p.fitness = 50;
    const out = applyEvent(c, injury);
    expect(out.kind).toBe("injury");
    const hurt = c.players.find((p) => p.injuryDays > 0)!;
    expect(out.cast).toEqual([{ kind: "player", id: hurt.id }]);
    // OB の直伝：先頭が教えに来た OB
    const ob = EVENTS.find((e) => e.id === "obTeach")!;
    const c2 = ctx("cast-ob");
    const mentor = { ...c2.players[0], id: "ob1", graduatedYear: 0, position: "CF", overall: 60, career: "pro", wasCaptain: false, record: { apps: 0, goals: 0, officialApps: 0, officialGoals: 0, winterResults: [] }, skills: ["oneOnOne1"] } as never;
    const out2 = applyEvent({ ...c2, alumni: [mentor] }, ob);
    expect(out2.cast?.[0]).toEqual({ kind: "alumnus", id: "ob1" });
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
