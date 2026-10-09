import { describe, expect, it } from "vitest";
import { PRACTICE_RULES, WINTER_RULES } from "../config/competitions";
import { STAFF_EFFECTS } from "../config/staff";
import { templateRule } from "../note";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import type { MatchRules, NoteRule, Stats } from "../types";
import { activeIds, createMatch, isBreakPhase, playSegment, playersShort, reassignSlots, resumeFromBreak, simulateToEnd, stepPk, type TeamInput } from "./engine";
import { autoSetup, DEFAULT_TACTICS } from "./lineup";
import { conditionMet, evaluateNote, minutesLeft } from "./note";
import { manualSubstitution, manualTactics } from "./orders";
import { pkEligible, resolvePkKick } from "./pk";
import type { MatchState } from "./types";

const team = (seed: string, prestige = 2, isUser = false, extra: Partial<TeamInput> = {}): TeamInput => {
  const players = generateCpuRoster(Rng.fromSeed(seed), prestige, 1);
  return { schoolId: seed, name: seed, rank: "C", isUser, players, setup: autoSetup(players, "4-4-2", { ...DEFAULT_TACTICS }), ...extra };
};

const match = (rules: MatchRules = WINTER_RULES.early, seed = "m", a = team("A", 2, true), b = team("B", 2)) => createMatch(rules, Rng.fromSeed(seed), a, b, "prefQualifier");

/** 条件に合う試合が見つかるまでシードを変えて計算する */
function findMatch(pred: (s: MatchState) => boolean, make: (seed: string) => MatchState, tries = 400): MatchState {
  for (let i = 0; i < tries; i++) {
    const s = simulateToEnd(make(`f${i}`));
    if (pred(s)) return s;
  }
  throw new Error("見つからない");
}

const stats = (v: Partial<Stats>): Stats => ({
  vision: 50, kickPower: 50, speed: 50, stamina: 50, pass: 50, technique: 50, physical: 50, pkSkill: 50,
  shooting: 50, dribble: 50, defense: 50, aerial: 50, decision: 50, saving: 50, highBall: 50, positioning: 50, catching: 50,
  ...v,
});

/** 試合を「到達するまで」進める（休憩は再開する） */
function playUntil(s: MatchState, minute: number) {
  while (s.phase !== "END" && s.phase !== "PK" && s.minute < minute) {
    if (isBreakPhase(s)) resumeFromBreak(s);
    else playSegment(s);
  }
}

describe("試合中のカード・退場", () => {
  it("2 枚目のイエローで退場し、そのチームは 10 人で戦う（枠は空きのまま）", () => {
    const s = findMatch((m) => m.events.some((e) => e.type === "secondYellow"), (seed) => match(WINTER_RULES.early, seed));
    const e = s.events.find((x) => x.type === "secondYellow")!;
    const t = s.teams[e.side];
    const p = t.players[e.players![0]];
    expect(p.yellow).toBe(2);
    expect(p.sentOff).toBe(true);
    // 1 枚目のイエローも出ている
    expect(s.events.some((x) => x.type === "yellow" && x.players?.[0] === p.id)).toBe(true);
    expect(t.onPitch).toHaveLength(11);
    expect(t.onPitch).toContain(p.id);
    expect(activeIds(t)).not.toContain(p.id);
    expect(playersShort(t)).toBeGreaterThanOrEqual(1);
    // 退場した選手は PK 戦に出られない
    expect(pkEligible(t)).not.toContain(p.id);
  });

  it("一発レッドでも退場する。退場した選手は交代で下げられない", () => {
    const s = findMatch((m) => m.events.some((e) => e.type === "red"), (seed) => match(WINTER_RULES.early, seed), 1500);
    const e = s.events.find((x) => x.type === "red")!;
    expect(s.teams[e.side].players[e.players![0]].sentOff).toBe(true);
    expect(s.teams[e.side].subbedOff).not.toContain(e.players![0]);
  });

  it("GK がいなくなると、残りの選手のうち GK に一番合う選手が GK の枠に入る", () => {
    const s = match();
    const t = s.teams[1];
    const gk = t.onPitch[0];
    t.players[gk].sentOff = true;
    reassignSlots(t);
    expect(t.onPitch[0]).not.toBe(gk);
    expect(t.onPitch).toContain(gk);
    expect(activeIds(t)).toHaveLength(10);
  });
});

describe("試合中のケガ", () => {
  it("交代枠が残っていなければ、人数が減ったまま戦う", () => {
    const rules = { ...WINTER_RULES.early, maxSubs: 0 };
    const s = findMatch((m) => m.events.some((e) => e.type === "injury"), (seed) => match(rules, seed));
    const e = s.events.find((x) => x.type === "injury")!;
    expect(s.events.some((x) => x.type === "shortHanded" && x.players?.[0] === e.players![0])).toBe(true);
    expect(activeIds(s.teams[e.side])).not.toContain(e.players![0]);
    expect(["light", "medium", "severe"]).toContain(e.note);
  });

  it("交代枠があれば、次の区間の頭で通常の枠を使って交代する（観戦中に選ばなければ自動）", () => {
    const s = findMatch(
      (m) => m.events.some((e) => e.type === "injury" && m.teams[e.side].subbedOff.includes(e.players![0])),
      (seed) => match(WINTER_RULES.early, seed),
    );
    const e = s.events.find((x) => x.type === "injury" && s.teams[x.side].subbedOff.includes(x.players![0]))!;
    const sub = s.events.find((x) => x.type === "sub" && x.side === e.side && x.players?.[1] === e.players![0])!;
    expect(sub.minute).toBeGreaterThanOrEqual(e.minute);
    expect(s.teams[e.side].subsUsed).toBeGreaterThan(0);
  });

  it("フィジカルコーチ（ケガの倍率）がいるとケガが減る", () => {
    let base = 0;
    let coached = 0;
    for (let i = 0; i < 300; i++) {
      const a = simulateToEnd(createMatch(WINTER_RULES.early, Rng.fromSeed(`inj${i}`), team("A"), team("B")));
      const b = simulateToEnd(createMatch(WINTER_RULES.early, Rng.fromSeed(`inj${i}`), team("A", 2, false, { injuryMult: 0.6 }), team("B", 2, false, { injuryMult: 0.6 })));
      base += (a.teams[0].stats.injuries ?? 0) + (a.teams[1].stats.injuries ?? 0);
      coached += (b.teams[0].stats.injuries ?? 0) + (b.teams[1].stats.injuries ?? 0);
    }
    expect(coached).toBeLessThan(base);
  });
});

describe("PK のスカウティング（SPEC 10.6）", () => {
  it("分析担当のスカウティングがキッカー側・GK 側の読みに入る。いなければ 0", () => {
    const k = stats({ pkSkill: 50, shooting: 60 });
    const g = stats({ pkSkill: 50, saving: 60 });
    const reads = (ks: number, gs: number) => {
      const rng = Rng.fromSeed("read");
      let won = 0;
      for (let i = 0; i < 4000; i++) if (resolvePkKick(rng, k, g, ks, gs).kickerWonRead) won++;
      return won / 4000;
    };
    const none = reads(0, 0);
    const kickerScout = reads(100 * STAFF_EFFECTS.pkScouting, 0);
    const gkScout = reads(0, 100 * STAFF_EFFECTS.pkScouting);
    expect(kickerScout).toBeGreaterThan(none + 0.05);
    expect(gkScout).toBeLessThan(none - 0.05);
  });

  it("試合中の PK と PK 戦の両方で、チームのスカウティングを使う", () => {
    const s = match(WINTER_RULES.early, "pk", team("A", 2, false, { scouting: 100 }), team("B", 2, false, { scouting: 0 }));
    expect(s.teams[0].scouting).toBe(100);
    expect(s.teams[1].scouting).toBe(0);
  });
});

describe("作戦ノート（SPEC 10.5）", () => {
  const withNote = (rules: NoteRule[], kind: "practice" | "prefQualifier" = "prefQualifier") =>
    team("N", 2, true, { note: { noteName: "テスト", rules, kind } });

  it("残り○分は「今のスコアのままなら試合が終わるまで」。延長がある試合の同点は延長の終わりまで数える", () => {
    const s = match(WINTER_RULES.final);
    s.minute = 80;
    s.phase = "H2";
    expect(minutesLeft(s)).toBe(10 + 2 * (WINTER_RULES.final.extraTimeHalfMinutes ?? 0));
    s.score = [1, 0];
    expect(minutesLeft(s)).toBe(10);
  });

  it("条件：スコア・時間・交代枠・大会の種類", () => {
    const s = match(PRACTICE_RULES);
    s.kind = "practice";
    // 練習試合は 70 分
    s.minute = 50;
    s.score = [0, 1];
    expect(conditionMet(s, 0, { type: "score", state: "behind", by: 1 })).toBe(true);
    expect(conditionMet(s, 0, { type: "score", state: "lead", by: 1 })).toBe(false);
    expect(conditionMet(s, 0, { type: "minuteFrom", minute: 50 })).toBe(true);
    expect(conditionMet(s, 0, { type: "minutesLeft", minutes: 10 })).toBe(false);
    s.minute = 60;
    expect(conditionMet(s, 0, { type: "minutesLeft", minutes: 10 })).toBe(true);
    expect(conditionMet(s, 0, { type: "subsLeft", atLeast: 5 })).toBe(true);
    expect(conditionMet(s, 0, { type: "competition", kinds: ["national"] })).toBe(false);
    expect(conditionMet(s, 0, { type: "competition", kinds: ["practice"] })).toBe(true);
  });

  it("発動したら速報に出し、1 試合 1 回だけ。交代は次の区間で反映される", () => {
    const rule: NoteRule = { ...templateRule("fatigueSub", "r1"), conditions: [{ type: "minuteFrom", minute: 10 }] };
    const s = match(WINTER_RULES.early, "note", withNote([rule]));
    playUntil(s, 10);
    expect(s.events.filter((e) => e.type === "note")).toHaveLength(1);
    expect(s.teams[0].note!.fired).toContain("r1");
    playSegment(s);
    expect(s.teams[0].subsUsed).toBe(1);
    playUntil(s, 40);
    expect(s.events.filter((e) => e.type === "note")).toHaveLength(1);
  });

  it("優先順位：交代枠が足りないときは上のルールから実行し、全部できないルールは見送る", () => {
    const sub = (id: string, name: string): NoteRule => ({ ...templateRule("fatigueSub", id), name, conditions: [{ type: "minuteFrom", minute: 10 }] });
    const rules = { ...WINTER_RULES.early, maxSubs: 1 };
    const s = match(rules, "prio", withNote([sub("a", "上"), sub("b", "下")]));
    playUntil(s, 10);
    const fired = s.events.filter((e) => e.type === "note").map((e) => e.note);
    expect(fired).toEqual(["上"]);
    expect(s.teams[0].note!.fired).not.toContain("b");
  });

  it("観戦中に自分で交代・戦術変更をしたら、関係するルールはその試合では止まる", () => {
    const s = match(WINTER_RULES.early, "manual", withNote([]));
    const t = s.teams[0];
    const target = t.onPitch[5];
    const benchId = t.bench[1];
    t.note!.rules = [
      { id: "x", name: "指定交代", enabled: true, conditions: [{ type: "minuteFrom", minute: 70 }], actions: [{ type: "sub", out: { kind: "player", id: target }, in: { kind: "auto", pick: "bestForSlot" } }] },
      templateRule("powerPlay", "pp"),
      templateRule("fatigueSub", "fs"),
    ];
    expect(manualSubstitution(s, 0, target, benchId)).toBeNull();
    expect(t.note!.stopped).toEqual(["x"]);
    manualTactics(s, 0, { ...t.tactics, attack: "attacking" });
    expect(t.note!.stopped).toEqual(["x", "pp"]);
    // 止まったルールは条件を満たしても発動しない
    s.minute = 75;
    evaluateNote(s, 0);
    expect(t.note!.fired).not.toContain("x");
  });

  it("「PK準備」：同点の終盤に PK 駆け引きの高い控えの GK を入れ、その GK が PK 戦を守る", () => {
    const base = team("PKG", 2, true);
    // 控えの GK を PK の名手にする
    const benchGk = base.players.find((p) => p.mainPosition === "GK" && !base.setup.lineup.includes(p.id) && base.setup.bench.includes(p.id))!;
    benchGk.stats.pkSkill = 95;
    const input = { ...base, note: { noteName: "PK", rules: [templateRule("pkPrep", "pk")], kind: "prefQualifier" as const } };
    const s = findMatch(
      (m) => m.phase === "END" && !!m.pk,
      (seed) => createMatch(WINTER_RULES.early, Rng.fromSeed(seed), structuredClone(input), team("Opp", 2), "prefQualifier"),
    );
    expect(s.events.some((e) => e.type === "note" && e.note === "PK準備")).toBe(true);
    expect(s.teams[0].onPitch[0]).toBe(benchGk.id);
    // 相手のキックを守った GK は投入した GK
    const saves = s.pk!.kicks.filter((k) => k.side === 1);
    expect(saves.every((k) => k.gkId === benchGk.id)).toBe(true);
  });

  it("練習試合では「PK準備」は発動しない（大会の種類の条件）", () => {
    const s = createMatch(PRACTICE_RULES, Rng.fromSeed("pr"), withNote([templateRule("pkPrep", "pk")], "practice"), team("B"), "practice");
    simulateToEnd(s);
    expect(s.events.some((e) => e.type === "note")).toBe(false);
  });
});

describe("PK 戦の参加資格", () => {
  it("PK 戦はピッチにいる選手だけで蹴る", () => {
    const s = findMatch((m) => !!m.pk, (seed) => match(WINTER_RULES.early, seed));
    const kickers = new Set(s.pk!.kicks.filter((k) => k.side === 0).map((k) => k.kickerId));
    for (const id of kickers) expect(activeIds(s.teams[0])).toContain(id);
    expect(stepPk(s)).toBeNull();
  });
});
