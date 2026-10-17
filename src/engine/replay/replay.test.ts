import { describe, expect, it } from "vitest";
import { WINTER_RULES } from "../config/competitions";
import { MOVE } from "../config/replay";
import { createMatch, isBreakPhase, playSegment, resumeFromBreak, simulateToEnd, stepPk, type TeamInput } from "../match/engine";
import { autoSetup, DEFAULT_TACTICS } from "../match/lineup";
import type { MatchState } from "../match/types";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import type { FormationId, MatchRules } from "../types";
import { screenLane } from ".";
import { matchFingerprint } from "./fingerprint";
import { NO_BALL, PHASE_START } from "./schedule";
import { PL, PW, ReplaySim, STEP } from "./sim";

const team = (seed: string, rank: "S" | "C" | "E" = "C"): TeamInput => {
  const players = generateCpuRoster(Rng.fromSeed(seed), rank === "S" ? 4 : rank === "E" ? 0 : 2, 1);
  return { schoolId: seed, name: seed, rank, isUser: false, players, setup: autoSetup(players, "4-4-2", { ...DEFAULT_TACTICS }) };
};

/**
 * 1 区間ずつ試合を進める（観戦と同じ）。each で区間ごとに何かできる。
 * formationAt の分になったら、自分の側のフォーメーションを変える（フォーメーションの変更を含む試合を作るため）
 */
function playStepwise(seed: string, rules: MatchRules, a: TeamInput, b: TeamInput, each?: (ms: MatchState) => void, formationAt?: { minute: number; formation: FormationId }): MatchState {
  const ms = createMatch(rules, Rng.fromSeed(seed), a, b, "prefQualifier");
  let guard = 0;
  while (ms.phase !== "END" && guard++ < 1000) {
    if (isBreakPhase(ms)) resumeFromBreak(ms);
    else if (ms.phase === "PK") stepPk(ms);
    else {
      if (formationAt && ms.minute >= formationAt.minute && ms.teams[0].formation !== formationAt.formation && !ms.teams[0].pending) ms.teams[0].pending = { subs: [], formation: formationAt.formation };
      playSegment(ms);
      each?.(ms);
    }
  }
  return ms;
}

/** いろいろな試合（延長・PK 戦・退場・ケガ・交代・フォーメーションの変更を含むように数を回す） */
function manyMatches(n: number): MatchState[] {
  const out: MatchState[] = [];
  const forms: FormationId[] = ["3-5-2", "4-3-3", "5-3-2", "4-2-3-1"];
  for (let i = 0; i < n; i++) {
    const rules = i % 3 === 0 ? WINTER_RULES.final : WINTER_RULES.early;
    const a = team(`A${i % 7}`, i % 5 === 0 ? "S" : "C"),
      b = team(`B${i % 11}`, i % 4 === 0 ? "E" : "C");
    out.push(i % 2 === 0 ? playStepwise(`m${i}`, rules, a, b, undefined, { minute: 30 + (i % 4) * 10, formation: forms[i % 4] }) : simulateToEnd(createMatch(rules, Rng.fromSeed(`m${i}`), a, b, "prefQualifier")));
  }
  return out;
}

const MATCHES = manyMatches(16);
const SIMS = MATCHES.map((ms) => {
  const sim = new ReplaySim(ms);
  sim.advance(ms.minute);
  return sim;
});

describe("イベントの位置（P3）", () => {
  it("演出を作り直しても、試合の結果と乱数の使い方は変わらない", () => {
    // 試合の計算や選手の生成を意図して変えたときだけ、新しい値に更新する
    expect(matchFingerprint(60)).toBe("d71781a");
  });

  it("攻撃のイベントには lane と zone が入り、守る側のイベントは左右が入れ替わる", () => {
    const m = MATCHES[1];
    const play_ = m.events.filter((e) => ["pass", "dribble", "shot", "cross", "goal", "catch", "block"].includes(e.type));
    expect(play_.length).toBeGreaterThan(10);
    for (const e of play_) {
      expect(e.lane).toBeDefined();
      expect(e.zone).toBeDefined();
    }
    const i = m.events.findIndex((e, k) => e.type === "catch" && m.events[k - 1]?.type === "shot" && m.events[k - 1].lane !== "C");
    if (i > 0) expect(screenLane(m.events[i])).toBe(screenLane(m.events[i - 1]));
  });
});

describe("時刻の割り付け（R3。計画 1.2）", () => {
  it("試合のいろいろな形を含む（延長・PK 戦・退場・ケガ・交代・フォーメーションの変更）", () => {
    const seen = new Set(MATCHES.flatMap((m) => m.events.map((e) => e.type)));
    for (const t of ["extraTime", "pkShootout", "sub", "injury", "formation", "goal", "corner", "counter"] as const) expect(seen.has(t)).toBe(true);
    expect(seen.has("red") || seen.has("secondYellow")).toBe(true);
  });

  it("速報に出るイベントは、その分の中（m − 1 より後、m まで）。ボールが関わらないイベントはその分。キーの時刻は増えていく", () => {
    for (const sim of SIMS) {
      const ms = sim.ms;
      expect(sim.schedule.times.length).toBe(ms.events.length);
      ms.events.forEach((e, i) => {
        const t = sim.schedule.times[i];
        if (NO_BALL.has(e.type) || PHASE_START.has(e.type)) expect(t).toBe(e.minute);
        else {
          expect(t).toBeLessThanOrEqual(e.minute + 1e-9);
          expect(t).toBeGreaterThan(e.minute - 1);
        }
      });
      for (let i = 1; i < sim.keys.length; i++) expect(sim.keys[i].t).toBeGreaterThanOrEqual(sim.keys[i - 1].t);
    }
  });
});

describe("選手とボールが常に動く（R3。計画 1 章）", () => {
  it("すべてのキーが起き、キーの時刻には、イベントの選手がボールのそばにいる", () => {
    const ds: number[] = [];
    for (const sim of SIMS) {
      const keys = sim.keys;
      expect(sim.fired.length).toBe(keys.length);
      expect(sim.fired.filter((f) => f.skipped).length).toBeLessThanOrEqual(2);
      for (const f of sim.fired) if (f.d >= 0) ds.push(f.d);
    }
    ds.sort((a, b) => a - b);
    const q = (p: number) => ds[Math.floor(p * (ds.length - 1))];
    expect(ds.length).toBeGreaterThan(800);
    expect(q(0.5)).toBeLessThan(1.2);
    expect(q(0.9)).toBeLessThan(2.5);
    expect(q(0.99)).toBeLessThan(5);
  });

  it("キーはほとんど予定の時刻に起きる（セットプレーで蹴る人を待つときだけ少し遅れる）", () => {
    let n = 0,
      late = 0;
    for (const sim of SIMS)
      for (const f of sim.fired) {
        n++;
        if (f.late > 0.3) late++;
      }
    expect(late / n).toBeLessThan(0.05);
  });

  it("選手の速さは、いつも上限（スピードと体力から決まる）を超えない", () => {
    for (const sim of SIMS) expect(sim.maxSpeedRatio).toBeLessThanOrEqual(1 + 1e-6);
  });

  it("選手とボールは、いつもピッチの中（スローイン・コーナーキックと、交代で出ていくときはタッチラインの少し外まで）", () => {
    const m = MOVE.outside + 1.3;
    for (const sim of SIMS.slice(0, 6)) {
      for (let t = 0; t <= sim.ms.minute; t += 0.13) {
        const f = sim.frame(t, 0);
        for (const p of [f.ball, ...f.dots]) {
          expect(p.x).toBeGreaterThanOrEqual(-m);
          expect(p.x).toBeLessThanOrEqual(PW + m);
          expect(p.y).toBeGreaterThanOrEqual(-m);
          expect(p.y).toBeLessThanOrEqual(PL + m);
        }
      }
    }
  });

  it("味方どうしは、いつも 2D の丸が重ならない間隔より離れている（すべての歩と、そのあいだのコマ）", () => {
    const need = MOVE.disc2d * 2;
    expect(MOVE.separation.sepTeam).toBeGreaterThan(need);
    for (const sim of SIMS) {
      let min = 99;
      for (let t = 0; t <= sim.ms.minute; t += STEP / 2) {
        const f = sim.frame(t, 0);
        for (let i = 0; i < f.dots.length; i++)
          for (let j = i + 1; j < f.dots.length; j++) {
            const a = f.dots[i],
              b = f.dots[j];
            if (sim.players[a.idx].side !== sim.players[b.idx].side) continue;
            min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
          }
      }
      expect(min).toBeGreaterThanOrEqual(need);
    }
  });

  it("ピッチの上の人数は、退場とケガで出た人を除いて 11 人ずつ。GK は自陣にいる", () => {
    for (const sim of SIMS.slice(0, 6)) {
      const ms = sim.ms;
      for (let t = 0.5; t <= ms.minute; t += 0.71) {
        const f = sim.frame(t, 0);
        for (const side of [0, 1] as const) {
          const reds = ms.events.filter((e, i) => (e.type === "red" || e.type === "secondYellow") && sim.schedule.times[i] < t - 1 && sim.players.find((p) => p.id === e.players![0])?.side === side).length;
          const n = f.dots.filter((d) => sim.players[d.idx].side === side).length;
          // 出ていく途中の人（交代は一度に 3 人まで）を数えることがある
          expect(n).toBeGreaterThanOrEqual(11 - reds - 1);
          expect(n).toBeLessThanOrEqual(14);
        }
      }
    }
  });

  it("前半・後半などの始めは、両チームが自陣でキックオフの並びになる", () => {
    for (const sim of SIMS.slice(0, 8)) {
      for (const fk of sim.fired.filter((f) => f.key.start)) {
        const f = sim.frame(fk.t + STEP, 0);
        for (const d of f.dots) {
          // side 0 は y の小さい方へ攻める：自陣は y が大きい側
          if (sim.players[d.idx].side === 0) expect(d.y).toBeGreaterThan(PL / 2 - 1.5);
          else expect(d.y).toBeLessThan(PL / 2 + 1.5);
        }
      }
    }
  });

  it("交代で入った選手は、交代の後にピッチに出る", () => {
    let checked = 0;
    for (const sim of SIMS) {
      const ms = sim.ms;
      ms.events.forEach((e, i) => {
        if (e.type !== "sub") return;
        const p = sim.players.find((q) => q.id === e.players![0])!;
        const t = sim.schedule.times[i];
        if (t + 1 > ms.minute) return;
        expect(sim.frame(t - 0.5, 0).dots.some((d) => d.idx === p.idx)).toBe(false);
        expect(sim.frame(t + 1, 0).dots.some((d) => d.idx === p.idx)).toBe(true);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("速報・スコアに出す時刻：ゴールはボールが入った時刻より前には出ない。ハーフタイム・試合終了で時計が追いついたら、すべて出る", () => {
    let goals = 0;
    for (const sim of SIMS) {
      const ms = sim.ms;
      for (const f of sim.fired) {
        if (f.key.type !== "goal") continue;
        expect(sim.isShown(f.key.index, f.t - 0.01)).toBe(false);
        expect(sim.isShown(f.key.index, f.t)).toBe(true);
        goals++;
      }
      // 試合が終わって時計が追いついたら、どのイベントも出ている
      ms.events.forEach((_, i) => expect(sim.isShown(i, ms.minute)).toBe(true));
    }
    expect(goals).toBeGreaterThan(5);
  });

  it("少しずつ動かしても（1 フレームの歩数の上限つき）、一度に動かしたのと同じ動きになる", () => {
    const ms = SIMS[1].ms;
    const a = new ReplaySim(ms);
    let frames = 0;
    while (!a.pump(ms.minute, MOVE.pump.frameSteps)) frames++;
    expect(frames).toBeGreaterThan(50);
    expect(a.fired.map((f) => [f.key.index, f.t])).toEqual(SIMS[1].fired.map((f) => [f.key.index, f.t]));
    for (let t = 0; t <= ms.minute; t += 1.7) expect(a.frame(t, 0)).toEqual(SIMS[1].frame(t, 0));
  });

  it("途中から再開したとき：追いつくまでは多めに計算して seeking を返し、スコアは予定の時刻で出す。追いついた後の動きは通して作ったものと同じ", () => {
    const ms = SIMS[1].ms;
    const t0 = Math.min(ms.minute, 80);
    const a = new ReplaySim(ms);
    expect(a.lagging(t0)).toBe(true);
    const goals = ms.events.map((e, i) => [e, i] as const).filter(([e]) => e.type === "goal" && e.minute < t0 - 2);
    expect(goals.length).toBeGreaterThan(0);
    // 計算前でも、予定の時刻を過ぎた得点は出す
    for (const [, i] of goals) expect(a.isShown(i, t0)).toBe(true);
    let frames = 0;
    let r = a.pumpFrame(t0);
    expect(r.seeking).toBe(true);
    while (r.seeking) {
      r = a.pumpFrame(t0);
      frames++;
    }
    expect(frames).toBeLessThan(Math.ceil(t0 / 10) + 2);
    expect(r.t).toBeGreaterThan(t0 - MOVE.pump.seekGap);
    expect(a.pumpFrame(t0).t).toBeCloseTo(t0, 6);
    expect(a.frame(t0, 0)).toEqual(SIMS[1].frame(t0, 0));
  });

  it("シュートは多くがゴール前から打つ（攻めの場所を寄せ、打つ選手は早めにゴール前へ向かう）", () => {
    const ds: number[] = [];
    for (const sim of SIMS)
      for (const f of sim.fired) {
        if (f.skipped || !["shot", "oneOnOne", "header", "rebound"].includes(f.key.type)) continue;
        ds.push(Math.abs(f.key.ball.y - (f.key.side === 0 ? 0 : PL)));
      }
    ds.sort((a, b) => a - b);
    expect(ds.length).toBeGreaterThan(20);
    expect(ds[Math.floor(ds.length / 2)]).toBeLessThan(25);
  });

  it("コーナーキックを蹴るときは、攻める側の 4 人以上と守る側の 4 人以上がペナルティエリアの中にいる（間に合わなければ場面を切り替えて並べる）", () => {
    let n = 0;
    for (const sim of SIMS)
      for (const f of sim.fired) {
        if (f.key.type !== "corner" || f.skipped) continue;
        const fr = sim.frame(f.t, 0);
        const atkSide = sim.players.find((p) => p.id === f.key.actors[0])!.side;
        const inBox = (side: number) =>
          fr.dots.filter((d) => {
            const p = sim.players[d.idx];
            return !d.gk && p.side === side && p.id !== f.key.actors[0] && d.x > PW / 2 - 20.16 && d.x < PW / 2 + 20.16 && (d.y < 16.5 || d.y > PL - 16.5);
          }).length;
        expect(inBox(atkSide), `${f.key.type} ${f.t.toFixed(2)}`).toBeGreaterThanOrEqual(4);
        expect(inBox(1 - atkSide), `${f.key.type} ${f.t.toFixed(2)}`).toBeGreaterThanOrEqual(4);
        n++;
      }
    expect(n).toBeGreaterThan(5);
  });

  it("切り替え（承認のときの修正 1）：カウンターでは、奪った側の 2 人以上が前へ走り、奪われた側の近くの選手は自陣へ戻る", () => {
    let n = 0,
      ok = 0;
    for (const sim of SIMS) {
      for (const f of sim.fired) {
        if (f.key.type !== "counter" || f.t + 0.6 > sim.ms.minute) continue;
        // すぐ次のプレーでボールを失う・止まるカウンターは除く
        const next = sim.keys[sim.keys.indexOf(f.key) + 1];
        if (!next || next.t - f.key.t < 0.45) continue;
        const atk = sim.players.find((p) => p.id === f.key.actors[0])!.side;
        const a = sim.frame(f.t, 0),
          b = sim.frame(f.t + 0.5, 0);
        // 前へ = 相手のゴールの方（side 0 は y が小さい方）
        const fwd = (s: number, dy: number) => (s === 0 ? -dy : dy);
        let runners = 0,
          back = 0,
          near = 0;
        for (const d of a.dots) {
          const e = b.dots.find((x) => x.idx === d.idx);
          if (!e) continue;
          const p = sim.players[d.idx];
          const moved = fwd(p.side, e.y - d.y);
          if (p.side === atk && p.id !== f.key.actors[0] && moved > 6) runners++;
          if (p.side !== atk && Math.hypot(d.x - a.ball.x, d.y - a.ball.y) < 25) {
            near++;
            if (moved < -4) back++;
          }
        }
        n++;
        if (runners >= 2 && back >= Math.min(2, near)) ok++;
      }
    }
    expect(n).toBeGreaterThan(10);
    expect(ok / n).toBeGreaterThan(0.85);
  });

  it("観戦しながら区間ごとに作っても、最後まで計算した試合から作っても、同じ動きになる", () => {
    const rules = WINTER_RULES.final;
    let live: ReplaySim | undefined;
    const ms = playStepwise(
      "det",
      rules,
      team("DA", "S"),
      team("DB"),
      (m) => {
        live ??= new ReplaySim(m);
        live.advance(m.minute);
      },
      { minute: 40, formation: "3-5-2" },
    );
    live!.advance(ms.minute);
    const full = new ReplaySim(ms);
    full.advance(ms.minute);
    expect(live!.fired.map((f) => [f.key.index, f.t])).toEqual(full.fired.map((f) => [f.key.index, f.t]));
    for (let t = 0; t <= ms.minute; t += 0.29) expect(live!.frame(t, 0)).toEqual(full.frame(t, 0));
  });
});
