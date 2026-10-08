import { describe, expect, it } from "vitest";
import { REPUTATION_TABLE } from "../config/reputation";
import type { Reputation } from "../types";
import { addGauge, handSize, matchReputationDelta } from ".";

describe("評判", () => {
  it("ゲージが 100 に届くと昇格、0 を割ると降格する", () => {
    const r: Reputation = { level: 0, gauge: 90 };
    expect(addGauge(r, 15).levelChange).toBe(1);
    expect(r.level).toBe(1);
    expect(handSize(r)).toBe(REPUTATION_TABLE[1].handSize);
    expect(addGauge(r, -40).levelChange).toBe(-1);
    expect(r.level).toBe(0);
    // 弱小より下はない
    r.gauge = 5;
    expect(addGauge(r, -20).levelChange).toBe(0);
    expect(r.gauge).toBe(0);
  });

  it("格上に勝つほど大きく上がる", () => {
    const same = matchReputationDelta(0, "practice", "D", "D", "win", false);
    const up2 = matchReputationDelta(0, "practice", "D", "B", "win", false);
    const down = matchReputationDelta(0, "practice", "D", "E", "win", false);
    expect(up2).toBeGreaterThan(same * 2);
    expect(down).toBeLessThan(same);
    expect(matchReputationDelta(0, "national", "D", "D", "win", false)).toBeGreaterThan(same);
  });

  it("負けると下がり、評判が高いほど下がり幅が大きい（極端にはしない）", () => {
    const low = matchReputationDelta(1, "prefQualifier", "C", "C", "loss", false);
    const high = matchReputationDelta(4, "prefQualifier", "C", "C", "loss", false);
    expect(low).toBeLessThan(0);
    expect(high).toBeLessThan(low);
    expect(high / low).toBeLessThan(2);
    // 格下に負けるほど大きく下がる・PK 負けは小さめ
    expect(matchReputationDelta(2, "prefQualifier", "B", "D", "loss", false)).toBeLessThan(high / 1.4 * 1.15);
    expect(matchReputationDelta(2, "prefQualifier", "C", "C", "loss", true)).toBeGreaterThan(matchReputationDelta(2, "prefQualifier", "C", "C", "loss", false));
  });
});
