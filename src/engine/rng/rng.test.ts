import { describe, expect, it } from "vitest";
import { Rng } from "./index";

describe("Rng", () => {
  it("同じシードなら同じ乱数列になる", () => {
    const a = Rng.fromSeed("abc");
    const b = Rng.fromSeed("abc");
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("違うシードなら違う乱数列になる", () => {
    const a = Rng.fromSeed(1);
    const b = Rng.fromSeed(2);
    const xs = Array.from({ length: 10 }, () => a.next());
    const ys = Array.from({ length: 10 }, () => b.next());
    expect(xs).not.toEqual(ys);
  });

  it("状態を保存して再開すると続きから同じ列になる", () => {
    const a = Rng.fromSeed("save");
    for (let i = 0; i < 37; i++) a.next();
    const saved = JSON.parse(JSON.stringify(a.state()));
    const b = Rng.fromState(saved);
    for (let i = 0; i < 50; i++) expect(b.next()).toBe(a.next());
  });

  it("int は範囲内に収まり、両端も出る", () => {
    const r = Rng.fromSeed("int");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 5);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("next はおおむね一様", () => {
    const r = Rng.fromSeed("uniform");
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += r.next();
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });

  it("poisson の平均は λ に近い", () => {
    const r = Rng.fromSeed("poisson");
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += r.poisson(2.5);
    expect(sum / n).toBeGreaterThan(2.4);
    expect(sum / n).toBeLessThan(2.6);
  });

  it("fork した乱数は決定的", () => {
    const a = Rng.fromSeed("fork").fork("m");
    const b = Rng.fromSeed("fork").fork("m");
    expect(a.next()).toBe(b.next());
  });
});
