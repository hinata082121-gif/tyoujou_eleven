import { describe, expect, it } from "vitest";
import { WINTER_RULES } from "../config/competitions";
import { createMatch, simulateToEnd, type TeamInput } from "../match/engine";
import { autoSetup, DEFAULT_TACTICS } from "../match/lineup";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import { buildTimeline, frameAt, screenLane } from ".";
import { matchFingerprint } from "./fingerprint";

const team = (seed: string, extra: Partial<TeamInput> = {}): TeamInput => {
  const players = generateCpuRoster(Rng.fromSeed(seed), 2, 1);
  return { schoolId: seed, name: seed, rank: "C", isUser: false, players, setup: autoSetup(players, "4-4-2", { ...DEFAULT_TACTICS }), ...extra };
};
const play = (seed: string) => simulateToEnd(createMatch(WINTER_RULES.early, Rng.fromSeed(seed), team("A"), team("B"), "prefQualifier"));

describe("イベントの位置（P3）", () => {
  it("lane・zone を足しても、試合の結果と乱数の使い方は変わらない", () => {
    // lane・zone を足す前のコードで計算した値（60 試合）。
    // 試合の計算や選手の生成を意図して変えたときだけ、新しい値に更新する
    expect(matchFingerprint(60)).toBe("d71781a");
  });

  it("攻撃のイベントには lane と zone が入り、守る側のイベントは左右が入れ替わる", () => {
    const m = play("lane");
    const play_ = m.events.filter((e) => ["pass", "dribble", "shot", "cross", "goal", "catch", "block"].includes(e.type));
    expect(play_.length).toBeGreaterThan(10);
    for (const e of play_) {
      expect(e.lane).toBeDefined();
      expect(e.zone).toBeDefined();
    }
    // クロスを跳ね返された直後の、守る側の GK のキャッチは、攻める側から見て同じ場所（ピッチの左右が同じ）
    const i = m.events.findIndex((e, k) => e.type === "catch" && m.events[k - 1]?.type === "shot" && m.events[k - 1].lane !== "C");
    if (i > 0) expect(screenLane(m.events[i])).toBe(screenLane(m.events[i - 1]));
  });
});

describe("演出タイムライン（P3）", () => {
  it("イベントごとに 1 コマ。時刻は増えていき、最後のコマはイベントの分と同じ", () => {
    const m = play("tl");
    const tl = buildTimeline(m);
    expect(tl.keys.length).toBe(m.events.length);
    for (let i = 1; i < tl.keys.length; i++) expect(tl.keys[i].t).toBeGreaterThanOrEqual(tl.keys[i - 1].t);
    for (const k of tl.keys) {
      expect(k.t).toBeLessThanOrEqual(m.events[k.index].minute);
      expect(k.t).toBeGreaterThan(m.events[k.index].minute - 1);
    }
  });

  it("何度作っても同じ。ゴールのコマでは、ボールが相手のゴールにある", () => {
    const m = play("tl2");
    const a = buildTimeline(m);
    const b = buildTimeline(m);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const k of a.keys.filter((k) => k.type === "goal")) expect(k.ball.y).toBe(k.side === 0 ? 0 : 1);
  });

  it("どの時刻でも、選手は 22 人（退場者を除く）でピッチの中にいる", () => {
    const m = play("tl3");
    const tl = buildTimeline(m);
    for (let t = 0; t <= m.minute; t += 0.37) {
      const f = frameAt(m, tl, t);
      const reds = m.events.filter((e) => (e.type === "red" || e.type === "secondYellow") && e.minute <= t).length;
      expect(f.dots.length).toBe(22 - reds);
      for (const p of [f.ball, ...f.dots]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      }
      // GK は自陣のゴール前
      for (const d of f.dots.filter((d) => d.gk)) expect(d.side === 0 ? d.y > 0.6 : d.y < 0.4).toBe(true);
    }
  });

  it("交代した選手は、交代の後の並びに出る", () => {
    const m = play("tl4");
    const sub = m.events.find((e) => e.type === "sub");
    if (!sub) return;
    const tl = buildTimeline(m);
    const before = frameAt(m, tl, sub.minute - 0.5).dots.map((d) => d.id);
    const after = frameAt(m, tl, sub.minute + 0.5).dots.map((d) => d.id);
    expect(before).not.toContain(sub.players![0]);
    expect(after).toContain(sub.players![0]);
  });
});
