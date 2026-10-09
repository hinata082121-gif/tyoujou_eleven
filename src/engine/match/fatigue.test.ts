import { describe, expect, it } from "vitest";
import { fatigueFactor } from "./fatigue";
import { MATCH } from "../config/match";

describe("fatigueFactor", () => {
  it("体力が高いうちは能力が落ちない", () => {
    expect(fatigueFactor(100)).toBe(1);
    expect(fatigueFactor(MATCH.fatigue.from)).toBe(1);
  });
  it("70%前後から低下がはっきり出る", () => {
    expect(fatigueFactor(75)).toBeGreaterThan(0.93);
    expect(fatigueFactor(70)).toBeLessThan(0.92);
    expect(fatigueFactor(60)).toBeLessThan(0.75);
  });
  it("体力が下がるほど単調に下がり、下限で止まる", () => {
    let prev = 1;
    for (let s = 100; s >= 0; s -= 5) {
      const f = fatigueFactor(s);
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
    expect(fatigueFactor(0)).toBe(MATCH.fatigue.floor);
  });
});
