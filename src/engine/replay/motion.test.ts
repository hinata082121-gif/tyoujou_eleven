import { describe, expect, it } from "vitest";
import { WINTER_RULES } from "../config/competitions";
import { MOTION_TIMING, MOVE } from "../config/replay";
import { createMatch, simulateToEnd, type TeamInput } from "../match/engine";
import { autoSetup, DEFAULT_TACTICS } from "../match/lineup";
import type { MatchEventType, MatchState } from "../match/types";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import { matchFingerprint } from "./fingerprint";
import { activeCues, EVENT_MOTIONS, gkAt, MotionScript, REFEREE_ID, shotAt } from "./motion";
import { ReplaySim } from "./sim";

const team = (seed: string, rank: "S" | "C" | "E" = "C"): TeamInput => {
  const players = generateCpuRoster(Rng.fromSeed(seed), rank === "S" ? 4 : rank === "E" ? 0 : 2, 1);
  return { schoolId: seed, name: seed, rank, isUser: false, players, setup: autoSetup(players, "4-4-2", { ...DEFAULT_TACTICS }) };
};

function manyMatches(n: number): MatchState[] {
  const out: MatchState[] = [];
  for (let i = 0; i < n; i++) out.push(simulateToEnd(createMatch(i % 3 === 0 ? WINTER_RULES.final : WINTER_RULES.early, Rng.fromSeed(`m${i}`), team(`A${i % 7}`, i % 5 === 0 ? "S" : "C"), team(`B${i % 11}`, i % 4 === 0 ? "E" : "C"), "prefQualifier")));
  return out;
}

/** 試合の最後まで動かして台本を作る */
function scriptOf(ms: MatchState) {
  const sim = new ReplaySim(ms);
  sim.advance(ms.minute);
  const script = new MotionScript(sim);
  script.sync();
  return { sim, script };
}

const BUILT = manyMatches(10).map(scriptOf);

describe("モーションの台本（P4・R3）", () => {
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

  it("いろいろな試合で台本が作れ、動く人は試合に出ている選手か主審。動きは時刻の順", () => {
    for (const { sim, script } of BUILT) {
      const ms = sim.ms;
      const ids = new Set([...Object.keys(ms.teams[0].players), ...Object.keys(ms.teams[1].players), REFEREE_ID]);
      expect(script.shots.length).toBe(sim.fired.length);
      expect(script.cues.length).toBeGreaterThan(200);
      for (const c of script.cues) {
        expect(ids.has(c.id)).toBe(true);
        expect(Number.isFinite(c.t)).toBe(true);
        expect(c.dur).toBeGreaterThan(0);
      }
      for (let i = 1; i < script.cues.length; i++) expect(script.cues[i].t).toBeGreaterThanOrEqual(script.cues[i - 1].t);
    }
  });

  it("少しずつ取り込んでも、最後にまとめて作っても、同じ台本", () => {
    const ms = BUILT[1].sim.ms;
    const sim = new ReplaySim(ms);
    const live = new MotionScript(sim);
    for (let t = 0; t <= ms.minute; t += 0.7) {
      sim.advance(t);
      live.sync();
    }
    sim.advance(ms.minute);
    live.sync();
    expect(live.cues).toEqual(BUILT[1].script.cues);
    expect(live.shots).toEqual(BUILT[1].script.shots);
  });

  it("シュートは蹴る人が蹴り、ゴールでは相手の GK が跳ぶ。キャッチは GK が受ける。ヘディングは頭の高さで触れる", () => {
    let goals = 0,
      heads = 0;
    for (const { sim, script } of BUILT) {
      const ms = sim.ms;
      sim.fired.forEach((f, n) => {
        const key = f.key;
        const prev = sim.fired[n - 1];
        if (key.type === "goal" && prev?.key.type === "shot" && !f.skipped) {
          const shooter = prev.key.actors[0];
          expect(script.cues.some((c) => c.id === shooter && (c.motion === "shot" || c.motion === "header") && c.t >= prev.t - 0.1 && c.t <= f.t)).toBe(true);
          const gk = gkAt(ms, key.side === 0 ? 1 : 0, f.t)!;
          expect(script.cues.some((c) => c.id === gk && c.motion === "gkDive" && c.event === key.index)).toBe(true);
          goals++;
        }
        if (key.type === "catch") expect(script.cues.some((c) => c.id === key.actors[0] && c.motion === "gkCatch")).toBe(true);
        if (key.type === "header" && !f.skipped && f.late < 0.05) {
          // 頭に届いた時刻（イベントが起きる直前に着いたボール）の高さ
          const leg = sim.legAt(f.t - 1e-6, 0.05);
          if (leg && leg.t1 <= f.t + 1e-9 && leg.kind !== "dribble") {
            expect(Math.abs(sim.frame(Math.ceil(leg.t1 / MOVE.step - 1e-6) * MOVE.step, 0).ball.h - MOVE.height.head)).toBeLessThan(0.3);
            heads++;
          }
        }
      });
    }
    expect(goals).toBeGreaterThan(3);
    expect(heads).toBeGreaterThan(3);
  });

  it("パスを出す人には蹴る動き、受ける人にはトラップの動きがつく（つなぎのプレーも）", () => {
    const { sim, script } = BUILT[2];
    const kicks = sim.kicks.filter((k) => k.kind === "pass").slice(0, 30);
    for (const k of kicks) expect(script.cues.some((c) => c.id === k.id && Math.abs(c.t - k.t) < 0.2 && (c.motion === "pass" || c.motion === "setKick" || c.motion === "gkKick" || c.motion === "cross" || c.motion === "shot"))).toBe(true);
    const traps = script.cues.filter((c) => c.motion === "trap" || c.motion === "chestTrap");
    expect(traps.length).toBeGreaterThan(sim.fired.length / 3);
  });

  it("その時刻に動いている選手と、カメラの場面を取り出せる", () => {
    const { script } = BUILT[0];
    const c = script.cues[Math.floor(script.cues.length / 2)];
    const now = activeCues(script, c.t + c.dur / 2, new Map());
    expect(now.get(c.id)).toBeDefined();
    expect(activeCues(script, -10, new Map()).size).toBe(0);
    const s = script.shots[5];
    expect(shotAt(script, s.t + 1e-6)?.t).toBe(s.t);
    expect(shotAt(script, -1)).toBeUndefined();
  });

  it("台本を作っても、試合の結果と乱数の使い方は変わらない", () => {
    expect(matchFingerprint(60)).toBe("d71781a");
  });
});
