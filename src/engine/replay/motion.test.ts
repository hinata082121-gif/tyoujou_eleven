import { describe, expect, it } from "vitest";
import { WINTER_RULES } from "../config/competitions";
import { MOTION_TIMING } from "../config/replay";
import { createMatch, simulateToEnd, type TeamInput } from "../match/engine";
import { autoSetup, DEFAULT_TACTICS } from "../match/lineup";
import type { MatchEventType, MatchState } from "../match/types";
import type { MatchRules } from "../types";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import { buildTimeline } from ".";
import { matchFingerprint } from "./fingerprint";
import { activeCues, ballHeightAt, buildMotionScript, EVENT_MOTIONS, gkAt, REFEREE_ID } from "./motion";

const team = (seed: string, rank: "S" | "C" | "E" = "C"): TeamInput => {
  const players = generateCpuRoster(Rng.fromSeed(seed), rank === "S" ? 4 : rank === "E" ? 0 : 2, 1);
  return { schoolId: seed, name: seed, rank, isUser: false, players, setup: autoSetup(players, "4-4-2", { ...DEFAULT_TACTICS }) };
};
const play = (seed: string, rules: MatchRules = WINTER_RULES.early, a = team("A"), b = team("B")) => simulateToEnd(createMatch(rules, Rng.fromSeed(seed), a, b, "prefQualifier"));

/** いろいろな試合（延長・PK 戦・退場・ケガ・交代を含むように数を回す） */
function manyMatches(n: number): MatchState[] {
  const out: MatchState[] = [];
  for (let i = 0; i < n; i++) out.push(play(`m${i}`, i % 3 === 0 ? WINTER_RULES.final : WINTER_RULES.early, team(`A${i % 7}`, i % 5 === 0 ? "S" : "C"), team(`B${i % 11}`, i % 4 === 0 ? "E" : "C")));
  return out;
}

describe("モーションの台本（P4）", () => {
  it("すべてのイベントの種類に動きが決まっていて、使う動きには長さがある", () => {
    const types = Object.keys(EVENT_MOTIONS) as MatchEventType[];
    expect(types.length).toBeGreaterThanOrEqual(53);
    for (const t of types) {
      const m = EVENT_MOTIONS[t];
      for (const c of m.cues ?? []) expect(MOTION_TIMING.dur[c.motion]).toBeGreaterThan(0);
      if (m.receive) expect(MOTION_TIMING.dur[m.receive]).toBeGreaterThan(0);
      if (m.out?.kick) expect(MOTION_TIMING.dur[m.out.kick]).toBeGreaterThan(0);
    }
  });

  it("いろいろな試合の全イベントで台本が作れ、動く人は試合に出ている選手か主審。延長・PK 戦・退場・ケガ・交代も含む", () => {
    const seen = new Set<MatchEventType>();
    for (const ms of manyMatches(40)) {
      const tl = buildTimeline(ms);
      const script = buildMotionScript(ms, tl);
      const ids = new Set([...Object.keys(ms.teams[0].players), ...Object.keys(ms.teams[1].players), REFEREE_ID]);
      for (const e of ms.events) seen.add(e.type);
      expect(script.shots.length).toBe(ms.events.length);
      for (const c of script.cues) {
        expect(ids.has(c.id)).toBe(true);
        expect(Number.isFinite(c.t)).toBe(true);
        expect(c.dur).toBeGreaterThan(0);
      }
      for (let i = 1; i < script.cues.length; i++) expect(script.cues[i].t).toBeGreaterThanOrEqual(script.cues[i - 1].t);
      for (const f of script.flights) {
        expect(f.t1).toBeGreaterThanOrEqual(f.t0);
        for (const u of [0, 0.25, 0.5, 0.75, 1]) {
          const h = ballHeightAt(script, f.t0 + (f.t1 - f.t0) * u);
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThanOrEqual(MOTION_TIMING.ball.air.max + 0.5);
        }
      }
    }
    for (const t of ["extraTime", "pkShootout", "sub", "injury", "goal", "shot", "cross", "header", "catch", "parry", "dribble"] as MatchEventType[]) expect(seen.has(t)).toBe(true);
  });

  it("同じ試合なら何度作っても同じ台本", () => {
    const ms = play("same");
    const a = buildMotionScript(ms, buildTimeline(ms));
    const b = buildMotionScript(ms, buildTimeline(ms));
    expect(b).toEqual(a);
  });

  it("シュートは主役が蹴り、ゴールでは相手の GK が跳ぶ。キャッチは GK が受ける。クロスは浮き球、ヘディングは頭の高さで触れる", () => {
    let checked = 0;
    for (const ms of manyMatches(12)) {
      const tl = buildTimeline(ms);
      const script = buildMotionScript(ms, tl);
      tl.keys.forEach((key, k) => {
        const prev = tl.keys[k - 1];
        if (key.type === "goal" && prev?.type === "shot" && key.t - prev.t <= 0.35) {
          const shooter = prev.actors[0];
          expect(script.cues.some((c) => c.id === shooter && (c.motion === "shot" || c.motion === "header") && c.event === prev.index)).toBe(true);
          const gk = gkAt(ms, key.side === 0 ? 1 : 0, key.t)!;
          expect(script.cues.some((c) => c.id === gk && c.motion === "gkDive" && c.event === key.index)).toBe(true);
          checked++;
        }
        if (key.type === "catch") expect(script.cues.some((c) => c.id === key.actors[0] && c.motion === "gkCatch")).toBe(true);
        if (key.type === "header" && prev && key.t - prev.t <= 0.35) {
          expect(Math.abs(ballHeightAt(script, key.t) - MOTION_TIMING.ball.head)).toBeLessThan(0.05);
          expect(ballHeightAt(script, (key.t + Math.max(prev.t, key.t - 0.2)) / 2)).toBeGreaterThan(MOTION_TIMING.ball.head);
        }
      });
    }
    expect(checked).toBeGreaterThan(3);
  });

  it("その時刻に動いている選手を取り出せる（1 人に 1 つ）", () => {
    const ms = play("active");
    const script = buildMotionScript(ms, buildTimeline(ms));
    const c = script.cues[Math.floor(script.cues.length / 2)];
    const now = activeCues(script, c.t + c.dur / 2, new Map());
    expect(now.get(c.id)).toBeDefined();
    expect(activeCues(script, -10, new Map()).size).toBe(0);
  });

  it("台本を作っても、試合の結果と乱数の使い方は変わらない", () => {
    expect(matchFingerprint(60)).toBe("d71781a");
  });
});
