import { describe, expect, it } from "vitest";
import { GROWTH } from "../config/growth";
import { PRACTICES } from "../config/practice";
import { addExp, expToNext } from "../player/growth";
import { generatePlayer } from "../player/generate";
import { statRank } from "../player/rank";
import { Rng } from "../rng";
import type { Player } from "../types";
import { applyBonusGains, isPracticeTarget, runPractice } from ".";

const make = (pos: Player["mainPosition"], seed = "p") => {
  const p = generatePlayer(Rng.fromSeed(seed), { grade: 1, enrolledYear: 1, base: 40, position: pos });
  p.potential = 1;
  p.fitness = 100;
  p.condition = 0;
  return p;
};

describe("練習と成長", () => {
  it("経験点 = 練習 1 日あたりの値 × 進んだ日数", () => {
    const one = make("CF");
    const three = make("CF");
    const r1 = runPractice(Rng.fromSeed("a"), [one], "shoot", 1, 1);
    const r3 = runPractice(Rng.fromSeed("a"), [three], "shoot", 3, 1);
    const g1 = r1.gains[one.id].shooting!;
    const g3 = r3.gains[three.id].shooting!;
    expect(g1).toBeCloseTo(PRACTICES.shoot.gains.shooting! * GROWTH.practiceMult, 5);
    // 体力が少し落ちるぶん効率が下がるが、おおむね 3 倍
    expect(g3 / g1).toBeGreaterThan(2.7);
    expect(g3 / g1).toBeLessThanOrEqual(3.0001);
  });

  it("練習カードの対象：GK 練習は GK だけ、シュート練習はフィールド選手だけ", () => {
    const gk = make("GK", "gk");
    const cf = make("CF", "cf");
    expect(isPracticeTarget(gk, "gk")).toBe(true);
    expect(isPracticeTarget(cf, "gk")).toBe(false);
    expect(isPracticeTarget(gk, "shoot")).toBe(false);
    expect(isPracticeTarget(gk, "pass")).toBe(true);
    // フィジカルの空中戦はフィールド選手のみ
    const r = runPractice(Rng.fromSeed("f"), [gk, cf], "physical", 2, 1);
    expect(r.gains[gk.id].aerial).toBeUndefined();
    expect(r.gains[cf.id].aerial).toBeGreaterThan(0);
  });

  it("能力値が高いほど次の 1 ポイントに多くの経験点が必要", () => {
    expect(expToNext(80)).toBeGreaterThan(expToNext(50));
    expect(expToNext(50)).toBeGreaterThan(expToNext(20));
    const low = make("CF", "low");
    const high = make("CF", "high");
    low.stats.shooting = 30;
    high.stats.shooting = 80;
    expect(addExp(low, "shooting", 100)).toBeGreaterThan(addExp(high, "shooting", 100));
  });

  it("伸びしろが大きい選手ほど伸びる", () => {
    const a = make("CF", "x");
    const b = make("CF", "x");
    a.potential = 0.7;
    b.potential = 1.4;
    addExp(a, "dribble", 300);
    addExp(b, "dribble", 300);
    expect(b.stats.dribble).toBeGreaterThan(a.stats.dribble);
  });

  it("役割外の能力（GK のシュートなど）はほとんど伸びない", () => {
    const gk = make("GK", "g");
    const cf = make("CF", "g");
    gk.stats.shooting = cf.stats.shooting = 30;
    addExp(gk, "shooting", 200);
    addExp(cf, "shooting", 200);
    expect(cf.stats.shooting - 30).toBeGreaterThan((gk.stats.shooting - 30) * 4);
  });

  it("休養で体力が大きく回復する", () => {
    const p = make("CB");
    p.fitness = 30;
    runPractice(Rng.fromSeed("r"), [p], "rest", 2, 1);
    expect(p.fitness).toBeGreaterThan(55);
  });

  it("黄マスは直前の練習の経験点を上乗せする", () => {
    const p = make("CF");
    p.stats.shooting = 20;
    const r = runPractice(Rng.fromSeed("y"), [p], "shoot", 5, 1);
    const before = p.stats.shooting + (p.exp.shooting ?? 0) / 100;
    applyBonusGains([p], r.gains, 0.5);
    expect(p.stats.shooting + (p.exp.shooting ?? 0) / 100).toBeGreaterThan(before);
  });

  it("能力ランクは SPEC 7.1 の通り", () => {
    expect(statRank(100)).toBe("SS");
    expect(statRank(95)).toBe("S");
    expect(statRank(80)).toBe("A");
    expect(statRank(79)).toBe("B");
    expect(statRank(60)).toBe("C");
    expect(statRank(50)).toBe("D");
    expect(statRank(40)).toBe("E");
    expect(statRank(20)).toBe("F");
    expect(statRank(19)).toBe("G");
    expect(statRank(1)).toBe("G");
  });
});
