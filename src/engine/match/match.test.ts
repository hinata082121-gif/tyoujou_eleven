import { describe, expect, it } from "vitest";
import { PRACTICE_RULES, WINTER_RULES } from "../config/competitions";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import type { MatchRules, Stats } from "../types";
import {
  bestPassValue,
  createMatch,
  goalkeeperOutcome,
  isBreakPhase,
  longBallOutcome,
  matchupAdjust,
  matchupFlow,
  playSegment,
  underdogLowBlockRanks,
  queueFormation,
  queueSubstitution,
  queueTactics,
  resumeFromBreak,
  simulateToEnd,
  stepPk,
  type TeamInput,
} from "./engine";
import { autoSetup, DEFAULT_TACTICS } from "./lineup";
import { pkDecided, resolvePkKick, setPkOrder } from "./pk";
import { halfReport } from "./report";

const team = (seed: string, prestige: number, isUser = false): TeamInput => {
  const players = generateCpuRoster(Rng.fromSeed(seed), prestige, 1);
  return { schoolId: seed, name: seed, rank: "C", isUser, players, setup: autoSetup(players, "4-4-2", { ...DEFAULT_TACTICS }) };
};

const match = (rules: MatchRules = WINTER_RULES.early, seed = "m", a = team("A", 2, true), b = team("B", 2)) => createMatch(rules, Rng.fromSeed(seed), a, b);

const freq = (n: number, f: (rng: Rng) => boolean, seed = "f") => {
  const rng = Rng.fromSeed(seed);
  let c = 0;
  for (let i = 0; i < n; i++) if (f(rng)) c++;
  return c / n;
};

const stats = (v: Partial<Stats>): Stats => ({
  vision: 50, kickPower: 50, speed: 50, stamina: 50, pass: 50, technique: 50, physical: 50, pkSkill: 50,
  shooting: 50, dribble: 50, defense: 50, aerial: 50, decision: 50, saving: 50, highBall: 50, positioning: 50, catching: 50,
  ...v,
});

describe("試合エンジン：進行", () => {
  it("同じシードなら同じ試合になる", () => {
    const a = simulateToEnd(match());
    const b = simulateToEnd(match());
    expect(a.events).toEqual(b.events);
    expect(a.score).toEqual(b.score);
  });

  it("5 分ごとの区間で進み、前半が終わるとハーフタイムになる", () => {
    const s = match();
    for (let i = 0; i < 8; i++) {
      expect(s.phase).toBe("H1");
      playSegment(s);
      expect(s.minute).toBe((i + 1) * 5);
    }
    expect(s.phase).toBe("HT");
    expect(playSegment(s)).toEqual([]); // 休憩中は進まない
    resumeFromBreak(s);
    expect(s.phase).toBe("H2");
    expect(s.minute).toBe(40);
  });

  it("イベントは時間順で、試合時間の範囲に収まる", () => {
    const s = simulateToEnd(match(WINTER_RULES.early, "order"));
    for (let i = 1; i < s.events.length; i++) expect(s.events[i].minute).toBeGreaterThanOrEqual(s.events[i - 1].minute);
    expect(s.events.every((e) => e.minute <= 80)).toBe(true);
  });

  it("練習試合は同点で終了する（PK なし）", () => {
    for (let i = 0; i < 30; i++) {
      const s = simulateToEnd(match(PRACTICE_RULES, `p${i}`));
      expect(s.phase).toBe("END");
      expect(s.pk).toBeUndefined();
      if (s.score[0] === s.score[1]) expect(s.winner).toBeNull();
    }
  });

  it("トーナメントは同点ならすぐ PK 戦、決勝は延長戦のあと PK 戦", () => {
    let sawPk = false;
    let sawEt = false;
    for (let i = 0; i < 60 && !(sawPk && sawEt); i++) {
      const early = simulateToEnd(match(WINTER_RULES.early, `e${i}`));
      if (early.pk) {
        sawPk = true;
        expect(early.events.some((e) => e.type === "extraTime")).toBe(false);
      }
      expect(early.winner === 0 || early.winner === 1).toBe(true);
      const final = simulateToEnd(match(WINTER_RULES.final, `f${i}`));
      if (final.events.some((e) => e.type === "extraTime")) {
        sawEt = true;
        expect(final.events.some((e) => e.type === "fullTime" && e.minute === 90)).toBe(true);
      }
      expect(final.winner === 0 || final.winner === 1).toBe(true);
    }
    expect(sawPk).toBe(true);
    expect(sawEt).toBe(true);
  });
});

describe("試合エンジン：采配", () => {
  it("戦術の変更は次の区間から反映される", () => {
    const s = match();
    playSegment(s);
    queueTactics(s, 0, { ...DEFAULT_TACTICS, attack: "attacking" });
    expect(s.teams[0].tactics.attack).toBe("balanced");
    const ev = playSegment(s);
    expect(s.teams[0].tactics.attack).toBe("attacking");
    expect(ev[0]).toMatchObject({ type: "tactics", minute: 5, side: 0 });
  });

  it("交代は次の区間から反映され、最大 5 人まで。下がった選手は戻れない", () => {
    const s = match();
    const t = s.teams[0];
    const outs = t.onPitch.slice(1, 7);
    const ins = t.bench.slice(0, 6);
    for (let i = 0; i < 5; i++) expect(queueSubstitution(s, 0, outs[i], ins[i])).toBeNull();
    expect(queueSubstitution(s, 0, outs[5], ins[5])).not.toBeNull();
    expect(t.onPitch).toContain(outs[0]);
    playSegment(s);
    for (let i = 0; i < 5; i++) {
      expect(t.onPitch).toContain(ins[i]);
      expect(t.onPitch).not.toContain(outs[i]);
    }
    expect(t.subsUsed).toBe(5);
    expect(queueSubstitution(s, 0, t.onPitch[1], outs[0])).not.toBeNull();
  });

  it("フォーメーションを変えると、選手がスロットに割り当て直される", () => {
    const s = match();
    queueFormation(s, 0, "3-5-2");
    playSegment(s);
    expect(s.teams[0].formation).toBe("3-5-2");
    expect(new Set(s.teams[0].onPitch).size).toBe(11);
  });

  it("交代回数の制限はフラグで切り替えられる", () => {
    const rules = { ...WINTER_RULES.early, maxSubWindows: 1 };
    const s = match(rules);
    const t = s.teams[0];
    expect(queueSubstitution(s, 0, t.onPitch[1], t.bench[0])).toBeNull();
    playSegment(s);
    expect(queueSubstitution(s, 0, t.onPitch[2], t.bench[0])).not.toBeNull();
  });

  it("体力はスタミナとプレスの強さに応じて減る", () => {
    const s = match();
    s.teams[0].tactics.press = "high";
    s.teams[1].tactics.press = "low";
    const start0 = s.teams[0].onPitch.map((id) => s.teams[0].players[id].stamina);
    const start1 = s.teams[1].onPitch.map((id) => s.teams[1].players[id].stamina);
    for (let i = 0; i < 4; i++) playSegment(s);
    const drop = (side: 0 | 1, start: number[]) =>
      s.teams[side].onPitch.slice(1).reduce((sum, id, i) => sum + start[i + 1] - s.teams[side].players[id].stamina, 0);
    expect(drop(0, start0)).toBeGreaterThan(0);
    expect(drop(0, start0)).toBeGreaterThan(drop(1, start1));
  });
});

describe("試合エンジン：判定（7.3）", () => {
  it("視野の広さ×判断：弱い相手には出せるパスが、強い相手には出せない", () => {
    const n = 4000;
    const vsWeak = freq(n, (r) => bestPassValue(r, 50, 50, 35) !== null);
    const vsStrong = freq(n, (r) => bestPassValue(r, 50, 50, 75) !== null);
    expect(vsWeak).toBeGreaterThan(0.95);
    expect(vsStrong).toBeLessThan(vsWeak - 0.2);
    // 判断が速いほど、強い相手にも出せる
    expect(freq(n, (r) => bestPassValue(r, 50, 85, 75) !== null)).toBeGreaterThan(vsStrong + 0.2);
    // 視野が広いほど候補が増えて出せる確率が上がる
    expect(freq(n, (r) => bestPassValue(r, 90, 50, 75) !== null)).toBeGreaterThan(freq(n, (r) => bestPassValue(r, 10, 50, 75) !== null));
  });

  it("ロングパス：キック力が足りないと、精度が高くても届かない", () => {
    const n = 4000;
    const weakKick = freq(n, (r) => longBallOutcome(r, 30, 90) === "short");
    const strongKick = freq(n, (r) => longBallOutcome(r, 85, 90) === "short");
    expect(weakKick).toBeGreaterThan(0.8);
    expect(strongKick).toBeLessThan(0.3);
  });

  it("GK：ポジショニングが低いと、セービングが高くても届かないコースが増える", () => {
    const n = 6000;
    const shot = { acc: 60, power: 60, q: 0.5 };
    const goodPos = freq(n, (r) => goalkeeperOutcome(r, shot, { positioning: 85, saving: 85, catching: 60 }) === "goal");
    const badPos = freq(n, (r) => goalkeeperOutcome(r, shot, { positioning: 20, saving: 85, catching: 60 }) === "goal");
    expect(badPos).toBeGreaterThan(goodPos + 0.15);
    const badSave = freq(n, (r) => goalkeeperOutcome(r, shot, { positioning: 85, saving: 20, catching: 60 }) === "goal");
    expect(badSave).toBeGreaterThan(goodPos + 0.15);
  });

  it("GK：キャッチングが低いとこぼれ球（2 本目の機会）が増える", () => {
    const n = 6000;
    const shot = { acc: 50, power: 50, q: 0.3 };
    const gk = (catching: number) => ({ positioning: 80, saving: 80, catching });
    const parryLow = freq(n, (r) => goalkeeperOutcome(r, shot, gk(20)) === "parry");
    const parryHigh = freq(n, (r) => goalkeeperOutcome(r, shot, gk(90)) === "parry");
    expect(parryLow).toBeGreaterThan(parryHigh + 0.2);
  });

  it("シュートの強さ（キック力）が高いほど GK が止めにくい", () => {
    const n = 6000;
    const gk = { positioning: 60, saving: 60, catching: 60 };
    const weak = freq(n, (r) => goalkeeperOutcome(r, { acc: 60, power: 30, q: 0.4 }, gk) === "goal");
    const strong = freq(n, (r) => goalkeeperOutcome(r, { acc: 60, power: 90, q: 0.4 }, gk) === "goal");
    expect(strong).toBeGreaterThan(weak);
  });

  it("強いチームの方が勝ちやすいが、運でひっくり返ることもある", () => {
    let strongWins = 0;
    let weakWins = 0;
    for (let i = 0; i < 150; i++) {
      const s = simulateToEnd(match(PRACTICE_RULES, `s${i}`, team(`S${i % 10}`, 5), team(`W${i % 10}`, 0)));
      if (s.winner === 0) strongWins++;
      if (s.winner === 1) weakWins++;
    }
    expect(strongWins).toBeGreaterThan(weakWins * 3);
    expect(weakWins).toBeGreaterThan(0);
  });
});

describe("PK（10.6）", () => {
  it("同格なら成功率はおおむね 7〜8 割。駆け引きが上手いキッカーほど決める", () => {
    const n = 8000;
    const base = freq(n, (r) => resolvePkKick(r, stats({}), stats({})).scored);
    expect(base).toBeGreaterThan(0.65);
    expect(base).toBeLessThan(0.85);
    expect(freq(n, (r) => resolvePkKick(r, stats({ pkSkill: 90 }), stats({})).scored)).toBeGreaterThan(base + 0.05);
    expect(freq(n, (r) => resolvePkKick(r, stats({}), stats({ pkSkill: 90 })).scored)).toBeLessThan(base - 0.05);
  });

  it("逆を突いても、キック精度が低いと枠を外すことがある", () => {
    const n = 8000;
    const missLow = freq(n, (r) => resolvePkKick(r, stats({ shooting: 10 }), stats({})).result === "miss");
    const missHigh = freq(n, (r) => resolvePkKick(r, stats({ shooting: 95 }), stats({})).result === "miss");
    expect(missLow).toBeGreaterThan(missHigh + 0.05);
  });

  it("5 本ずつ蹴り、決着しなければサドンデス", () => {
    const k = (side: 0 | 1, scored: boolean) => ({ side, kickerId: "", gkId: "", scored, kickerWonRead: true, result: scored ? ("goal" as const) : ("miss" as const) });
    // 3-0 で残り 2 本ずつなら決着
    expect(pkDecided({ kicks: [k(0, true), k(1, false), k(0, true), k(1, false), k(0, true), k(1, false)], score: [3, 0] })).toBe(0);
    // 5 本ずつ同点なら未決着
    const tie = Array.from({ length: 10 }, (_, i) => k((i % 2) as 0 | 1, true));
    expect(pkDecided({ kicks: tie, score: [5, 5] })).toBeNull();
    // サドンデス：6 本目で差がつけば決着
    expect(pkDecided({ kicks: [...tie, k(0, true), k(1, false)], score: [6, 5] })).toBe(0);
    expect(pkDecided({ kicks: [...tie, k(0, true)], score: [6, 5] })).toBeNull();
  });

  it("キッカーはピッチにいる 11 人だけ。プレイヤーは順番だけを決める", () => {
    let s = match(WINTER_RULES.early, "pk0");
    for (let i = 0; !s.pk && i < 100; i++) {
      s = match(WINTER_RULES.early, `pk${i}`);
      while (s.phase !== "PK" && s.phase !== "END") {
        if (isBreakPhase(s)) resumeFromBreak(s);
        else playSegment(s);
      }
    }
    expect(s.phase).toBe("PK");
    const onPitch = [...s.teams[0].onPitch];
    expect(setPkOrder(s, 0, [...s.teams[0].bench.slice(0, 1), ...onPitch.slice(1)])).not.toBeNull();
    expect(setPkOrder(s, 0, onPitch.slice(0, 10))).not.toBeNull();
    const order = [...onPitch].reverse();
    expect(setPkOrder(s, 0, order)).toBeNull();
    const first = stepPk(s)!;
    expect(first.kickerId).toBe(order[0]);
    while (s.phase === "PK") stepPk(s);
    expect(s.pk!.done).toBe(true);
    expect(s.winner).toBe(s.pk!.winner);
    for (const kick of s.pk!.kicks.filter((x) => x.side === 0)) expect(onPitch).toContain(kick.kickerId);
  });

  it("試合中の PK も発生する（エリア内のファウル）", () => {
    let count = 0;
    for (let i = 0; i < 80; i++) count += simulateToEnd(match(WINTER_RULES.early, `ip${i}`)).events.filter((e) => e.type === "pkAwarded").length;
    expect(count).toBeGreaterThan(0);
  });
});

describe("CPU の采配", () => {
  it("CPU は疲れた選手を交代させる", () => {
    let subs = 0;
    for (let i = 0; i < 10; i++) {
      const s = simulateToEnd(match(WINTER_RULES.early, `ai${i}`, team("A", 2), team("B", 2)));
      subs += s.teams[0].subsUsed + s.teams[1].subsUsed;
    }
    expect(subs).toBeGreaterThan(0);
  });

  it("プレイヤーのチームは自動では交代しない", () => {
    const s = simulateToEnd(match(WINTER_RULES.early, "user"));
    expect(s.teams[0].subsUsed).toBe(0);
  });
});


describe("ハーフタイムの集計", () => {
  it("支配率・シュート・ゾーン別の攻撃が集計され、相手のゾーンは左右を入れ替えて比べる", () => {
    const s = match(WINTER_RULES.early, "half");
    while (s.phase === "H1") playSegment(s);
    const r = halfReport(s, 0);
    const r1 = halfReport(s, 1);
    expect(r.possession + r1.possession).toBeCloseTo(1, 5);
    expect(r.shots[0]).toBe(s.teams[0].stats.shots);
    const z0 = s.teams[0].stats.zones!;
    const z1 = s.teams[1].stats.zones!;
    expect(r.zones.map((z) => z.ourAttacks)).toEqual(z0.attacks);
    expect(r.zones[0].theirAttacks).toBe(z1.attacks[2]);
    expect(r.zones[2].theirAttacks).toBe(z1.attacks[0]);
    expect(z0.attacks.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    for (const z of r.zones) expect(["優勢", "互角", "押されている"]).toContain(z.verdict);
  });
});

describe("戦術の相性（循環型）", () => {
  it("どの戦術にも、相性で上回る戦術がある", () => {
    const styles = {
      possession: { attack: "balanced", buildUp: "buildUp", press: "mid", line: "high" },
      highPress: { attack: "attacking", buildUp: "buildUp", press: "high", line: "high" },
      longBall: { attack: "balanced", buildUp: "long", press: "mid", line: "high" },
      lowBlock: { attack: "defensive", buildUp: "long", press: "low", line: "low" },
    } as const;
    // つなぐ攻撃は、ハイプレスには不利、引いた相手には有利
    expect(matchupAdjust(styles.possession, styles.highPress, "pass")).toBeLessThan(1);
    expect(matchupAdjust(styles.possession, styles.lowBlock, "pass")).toBeGreaterThan(1);
    // ロングボールは、ハイプレスには有利、引いた相手には不利
    expect(matchupAdjust(styles.longBall, styles.highPress, "long")).toBeGreaterThan(matchupAdjust(styles.longBall, styles.possession, "long"));
    expect(matchupAdjust(styles.longBall, styles.lowBlock, "long")).toBeLessThan(0);
    // 流れ：ハイプレス相手のビルドアップは支配率が下がり、引いた相手には上がる
    expect(matchupFlow(styles.possession, styles.highPress).possession).toBeLessThan(0);
    expect(matchupFlow(styles.possession, styles.lowBlock).possession).toBeGreaterThan(0);
    expect(matchupFlow(styles.longBall, styles.highPress).rate).toBeGreaterThan(1);
    expect(matchupFlow(styles.longBall, styles.lowBlock).rate).toBeLessThan(1);
  });
});

describe("堅守速攻の番狂わせ補正", () => {
  const lowBlock = { attack: "defensive", buildUp: "long", press: "low", line: "low" } as const;
  const other = { attack: "balanced", buildUp: "buildUp", press: "mid", line: "high" } as const;
  it("堅守速攻で格上と戦うときだけ、ランク差に応じて効く（最大 3 段階）", () => {
    expect(underdogLowBlockRanks({ tactics: lowBlock, rank: "D" }, { rank: "B" })).toBe(2);
    expect(underdogLowBlockRanks({ tactics: lowBlock, rank: "E" }, { rank: "S" })).toBe(3);
    // 同じランク・格下・ほかの型では効かない
    expect(underdogLowBlockRanks({ tactics: lowBlock, rank: "C" }, { rank: "C" })).toBe(0);
    expect(underdogLowBlockRanks({ tactics: lowBlock, rank: "B" }, { rank: "D" })).toBe(0);
    expect(underdogLowBlockRanks({ tactics: other, rank: "D" }, { rank: "B" })).toBe(0);
  });
});
