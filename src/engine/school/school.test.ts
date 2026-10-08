import { describe, expect, it } from "vitest";
import { OTHER_PREF_SCHOOLS, PREFECTURE_COUNT } from "../config/school";
import { overall } from "../player/rating";
import { Rng } from "../rng";
import { generalFreshmen, generateWorld, makeCpuSchool } from "./generate";
import { advanceCpuSchool } from "./season";
import { rankIndex } from "./strength";

describe("学校の生成", () => {
  it("自県 16〜32 校、他県は各 3 校、全国大会に必要な県の数がある", () => {
    const w = generateWorld(Rng.fromSeed("w"), "自校");
    expect(w.prefectures).toHaveLength(PREFECTURE_COUNT);
    for (const p of w.prefectures) {
      if (p.isPlayerPref) {
        expect(p.schoolIds.length).toBeGreaterThanOrEqual(16);
        expect(p.schoolIds.length).toBeLessThanOrEqual(32);
      } else expect(p.schoolIds).toHaveLength(OTHER_PREF_SCHOOLS);
    }
    const names = Object.values(w.schools).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("格の高い学校ほどランクが高い。S は飛び抜けた学校だけ", () => {
    const rng = Rng.fromSeed("rank");
    const avg = (prestige: number) => {
      let sum = 0;
      for (let i = 0; i < 20; i++) sum += rankIndex(makeCpuSchool(rng, "x", "x", "p", prestige, 1).rank);
      return sum / 20;
    };
    const ranks = [0, 1, 2, 3, 4, 5].map(avg);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    expect(ranks[0]).toBeLessThan(1);
    expect(ranks[4]).toBeLessThan(5);
  });

  it("一般の新入生はほとんどが G〜E（たまに D〜C）", () => {
    const ps = generalFreshmen(Rng.fromSeed("fr"), 300, 1);
    const ov = ps.map(overall);
    expect(ov.filter((v) => v < 50).length / ov.length).toBeGreaterThan(0.85);
    expect(ov.some((v) => v >= 45)).toBe(true);
  });

  it("CPU 校は毎年、卒業・進級・新入生で入れ替わる", () => {
    const rng = Rng.fromSeed("cpu");
    const s = makeCpuSchool(rng, "x", "x", "p", 2, 1);
    const third = s.players.filter((p) => p.grade === 3).map((p) => p.id);
    advanceCpuSchool(rng, s, 2);
    expect(s.players.some((p) => third.includes(p.id))).toBe(false);
    expect(s.players.filter((p) => p.grade === 1).length).toBeGreaterThan(5);
    expect(s.players.every((p) => p.grade >= 1 && p.grade <= 3)).toBe(true);
  });
});
