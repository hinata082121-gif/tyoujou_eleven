import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { advanceRound, createBracket, findMatch, isAlive, recordResult, roundsFor, seedOrder } from "./bracket";

describe("トーナメント", () => {
  it("シードの並びは 1 番と最下位が当たる", () => {
    expect(seedOrder(4)).toEqual([0, 3, 1, 2]);
    expect(seedOrder(8)).toEqual([0, 7, 3, 4, 1, 6, 2, 5]);
  });

  it("2 のべき乗に足りない分は上位シードの不戦勝になる", () => {
    const teams = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const b = createBracket("prefQualifier", teams, [1, 2, 3, 4, 5], Rng.fromSeed("b"));
    expect(roundsFor(20)).toBe(5);
    expect(b.rounds[0]).toHaveLength(16);
    const byes = b.rounds[0].filter((m) => m.b === null || m.a === null);
    expect(byes).toHaveLength(12);
    for (const m of byes) expect(Number((m.a ?? m.b)!.slice(1))).toBeLessThan(12);
    expect(findMatch(b, 0, "t0")).toBeUndefined(); // 不戦勝は試合なし
    expect(isAlive(b, "t0")).toBe(true);
  });

  it("勝者が次のラウンドに進み、決勝で優勝校が決まる", () => {
    const rng = Rng.fromSeed("adv");
    const teams = Array.from({ length: 8 }, (_, i) => `t${i}`);
    const b = createBracket("national", teams, [1, 2, 3], rng);
    while (!b.championId) {
      for (const m of b.rounds[b.roundsDone]) if (m.winner === undefined) recordResult(m, { winner: m.a!, score: [1, 0] });
      advanceRound(b, rng);
    }
    expect(b.rounds).toHaveLength(3);
    expect(b.championId).toBe("t0");
    expect(isAlive(b, "t7")).toBe(false);
  });
});
