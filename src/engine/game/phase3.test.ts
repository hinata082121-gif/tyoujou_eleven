import { describe, expect, it } from "vitest";
import { LEAGUE_RULES } from "../config/league";
import { createMatch, injuredAwaitingSub, isBreakPhase, playSegment, resumeFromBreak, type TeamInput } from "../match/engine";
import { autoSetup, DEFAULT_TACTICS } from "../match/lineup";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import type { GameState } from "../types";
import { autoStep, newAutoplayStats } from "./autoplay";
import { canSkipWatching, defaultSetup, newGame, startPlayerMatch, switchToAuto } from ".";

const team = (seed: string, isUser: boolean, extra: Partial<TeamInput> = {}): TeamInput => {
  const players = generateCpuRoster(Rng.fromSeed(seed), 2, 1);
  return { schoolId: seed, name: seed, rank: "C", isUser, players, setup: autoSetup(players, "4-4-2", { ...DEFAULT_TACTICS }, LEAGUE_RULES.benchSize), ...extra };
};

/** 次の試合（kind が合うもの）の前まで進める */
function untilMatch(s: GameState, pred: (kind: string) => boolean) {
  const st = newAutoplayStats();
  for (let i = 0; i < 5000; i++) {
    const p = s.pending;
    if (p?.type === "match" && !s.activeMatch && pred(p.kind)) return;
    autoStep(s, st);
  }
  throw new Error("試合が来ない");
}

describe("采配あり／結果のみ（P3）", () => {
  it("采配ありの途中で結果のみに切り替えると、最後まで計算される。同じ種なら同じ結果", () => {
    const s = newGame("p3-switch", "S高校");
    untilMatch(s, (k) => k === "league");
    const scores: string[] = [];
    for (let t = 0; t < 2; t++) {
      const g = JSON.parse(JSON.stringify(s)) as GameState;
      const am = startPlayerMatch(g, defaultSetup(g), "watch")!;
      expect(am.state.teams[0].breaksOnly).toBe(true);
      for (let i = 0; i < 5; i++) playSegment(am.state);
      expect(am.state.phase).not.toBe("END");
      expect(switchToAuto(g)).toBe(true);
      expect(am.state.phase).toBe("END");
      expect(am.mode).toBe("auto");
      expect(am.state.teams[0].isUser).toBe(false);
      // 逆（結果のみ → 采配あり）はない。2 回目は何もしない
      expect(switchToAuto(g)).toBe(false);
      scores.push(JSON.stringify(am.state.score));
    }
    expect(scores[0]).toBe(scores[1]);
  });

  it("トーナメントの試合は結果のみに切り替えられない", () => {
    const s = newGame("p3-tour", "T高校");
    untilMatch(s, (k) => k !== "league" && k !== "practice");
    expect(canSkipWatching(s)).toBe(false);
    const am = startPlayerMatch(s, defaultSetup(s), "watch")!;
    expect(am.state.teams[0].breaksOnly).toBeUndefined();
    expect(switchToAuto(s)).toBe(false);
    expect(am.state.phase).not.toBe("END");
  });

  it("采配がハーフタイムだけのときは、ケガ人を自動で交代する", () => {
    let injuries = 0;
    for (let i = 0; i < 40 && injuries < 3; i++) {
      const m = createMatch(LEAGUE_RULES, Rng.fromSeed(`inj${i}`), team("A", true, { breaksOnly: true, injuryMult: 30 }), team("B", false), "league");
      const me = m.teams[0];
      while (m.phase !== "END") {
        if (isBreakPhase(m)) resumeFromBreak(m);
        else playSegment(m);
        const hurt = injuredAwaitingSub(me);
        injuries += m.events.filter((e) => e.type === "injury" && e.side === 0).length > 0 ? 1 : 0;
        // 交代枠と控えが残っていれば、ケガ人は交代の予約に入っている
        if (me.subsUsed + (me.pending?.subs.length ?? 0) < LEAGUE_RULES.maxSubs && me.bench.length > (me.pending?.subs.length ?? 0)) expect(hurt).toEqual([]);
      }
    }
    expect(injuries).toBeGreaterThan(0);
  });
});
