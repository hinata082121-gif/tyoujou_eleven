import { describe, expect, it } from "vitest";
import { SKILL_LEARN, TRAINING_POOLS } from "../config/skills";
import { generatePlayer } from "../player/generate";
import { Rng } from "../rng";
import { emptyMatchPlayerStats, type MatchPlayer } from "../match/types";
import type { Player } from "../types";
import { canLearn, goldCount, hasSkill, learnSkill, nextInLine, plusCount, prerequisite, removeSkill, skillInLine } from ".";
import { applyMatchFeats, stepUpLine } from "./feats";
import { campLearning, emptyFeats, goldChance, goldReady, initialSkills, learnChance, trainingSquare } from "./learn";

const make = (pos: Player["mainPosition"] = "CF", seed = "s") => {
  const p = generatePlayer(Rng.fromSeed(seed), { grade: 2, enrolledYear: 1, base: 55, position: pos });
  p.skills = [];
  p.personality = "competitive";
  p.styleProficiency = 0;
  return p;
};

const matchPlayer = (p: Player, patch: Partial<MatchPlayer> = {}): MatchPlayer => ({
  id: p.id,
  name: p.name,
  mainPosition: p.mainPosition,
  stats: p.stats,
  aptitude: p.aptitude,
  heightCm: p.heightCm,
  condition: 0,
  stamina: 100,
  goals: 0,
  ms: emptyMatchPlayerStats(),
  ...patch,
});

describe("特殊能力の段階", () => {
  it("○ がないと ◎ は習得できず、◎ を習得すると ○ と置き換わる", () => {
    const p = make();
    expect(canLearn(p, "oneOnOne2")).toBe(false);
    expect(learnSkill(p, "oneOnOne2")).toBe(false);
    expect(learnSkill(p, "oneOnOne1")).toBe(true);
    expect(prerequisite("oneOnOne2")).toBe("oneOnOne1");
    expect(learnSkill(p, "oneOnOne2")).toBe(true);
    expect(p.skills).toEqual(["oneOnOne2"]);
    expect(skillInLine(p, "oneOnOne")).toBe("oneOnOne2");
    expect(nextInLine(p, "oneOnOne")).toBe("oneOnOneG");
  });

  it("× を持っている系統は、× を消すまで ○ を習得できない", () => {
    const p = make();
    expect(learnSkill(p, "oneOnOneX")).toBe(true);
    expect(canLearn(p, "oneOnOne1")).toBe(false);
    expect(removeSkill(p, "oneOnOneX")).toBe(true);
    expect(canLearn(p, "oneOnOne1")).toBe(true);
  });

  it("GK 専用・フィールド専用の特殊能力は役割に合う選手だけ", () => {
    const gk = make("GK");
    const cf = make("CF");
    expect(canLearn(gk, "pkStopper")).toBe(true);
    expect(canLearn(cf, "pkStopper")).toBe(false);
    expect(canLearn(gk, "doubleTouch")).toBe(false);
  });

  it("金色はプラスの数にも金色の数にも数える。× は数えない", () => {
    const p = make();
    p.skills = ["oneOnOneG", "doubleTouch", "pkX"];
    expect(plusCount(p)).toBe(2);
    expect(goldCount(p)).toBe(1);
  });
});

describe("習得の条件", () => {
  it("新入生は金色（両利きを含む）を持たない", () => {
    const rng = Rng.fromSeed("fresh");
    for (let i = 0; i < 3000; i++) {
      const p = generatePlayer(rng, { grade: 1, enrolledYear: 1, base: 50 });
      expect(goldCount(p)).toBe(0);
      expect(p.skills.some((s) => s.endsWith("2"))).toBe(false);
      expect(["R", "L"]).toContain(p.foot);
    }
  });

  it("新入生のプラス・マイナスはおおむね 5%・4%", () => {
    const rng = Rng.fromSeed("fresh2");
    let plus = 0;
    let minus = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const p = make("CF", `f${i}`);
      initialSkills(rng, p);
      if (plusCount(p) > 0) plus++;
      if (p.skills.some((s) => s.endsWith("X") || s === "roughPlay")) minus++;
    }
    expect(plus / n).toBeGreaterThan(0.04);
    expect(plus / n).toBeLessThan(0.06);
    expect(minus / n).toBeGreaterThan(0.03);
    expect(minus / n).toBeLessThan(0.05);
  });

  it("スタイルの相性・熟練度・性格で習得しやすくなる", () => {
    const p = make();
    p.playStyle = "wingDribbler";
    const base = learnChance(p, "middleShot", 0.1);
    const aff0 = learnChance(p, "doubleTouch", 0.1);
    p.styleProficiency = 100;
    const aff100 = learnChance(p, "doubleTouch", 0.1);
    expect(aff0).toBeGreaterThan(base);
    expect(aff100).toBeGreaterThan(aff0);
  });

  it("両利き：逆足× がなく、熟練度 80 以上のときだけ判定を受け、特訓では 1%", () => {
    const p = make();
    p.styleProficiency = 79;
    expect(goldReady(p, "footG")).toBe(false);
    p.styleProficiency = 80;
    expect(goldReady(p, "footG")).toBe(true);
    p.skills = ["footX"];
    expect(goldReady(p, "footG")).toBe(false);
    p.skills = [];
    expect(goldChance(p, "footG", SKILL_LEARN.footGoldTraining)).toBeCloseTo(0.01, 5);
  });

  it("特訓マス：練習の対象者だけが判定し、候補はその練習のもの", () => {
    const rng = Rng.fromSeed("train");
    const players = Array.from({ length: 30 }, (_, i) => make(i % 5 === 0 ? "GK" : "CF", `t${i}`));
    let learned = 0;
    for (let i = 0; i < 40; i++) {
      for (const ev of trainingSquare(rng, players, "shoot")) {
        if (ev.kind !== "learn") continue;
        learned++;
        const p = players.find((x) => x.id === ev.playerId)!;
        expect(p.mainPosition).not.toBe("GK");
        expect([...TRAINING_POOLS.shoot, "footG"]).toContain(ev.skill);
      }
    }
    expect(learned).toBeGreaterThan(0);
  });

  it("合宿の差し込み口：方針の練習の候補から、複数の選手が判定する", () => {
    const rng = Rng.fromSeed("camp");
    const players = Array.from({ length: 30 }, (_, i) => make("CB", `c${i}`));
    const out = campLearning(rng, players, ["defense", "physical"], 0.5);
    expect(out.length).toBeGreaterThan(3);
    for (const e of out) expect([...TRAINING_POOLS.defense, ...TRAINING_POOLS.physical]).toContain(e.skill);
  });
});

describe("試合での成果", () => {
  it("公式戦でハットトリック → 1 対 1 系が上がる。練習試合では数えない", () => {
    const rng = Rng.fromSeed("feat");
    const p = make();
    expect(applyMatchFeats(rng, p, matchPlayer(p, { goals: 3 }), { official: false })).toEqual([]);
    const out = applyMatchFeats(rng, p, matchPlayer(p, { goals: 3 }), { official: true });
    expect(out.map((e) => e.skill)).toContain("oneOnOne1");
    expect(hasSkill(p, "oneOnOne1")).toBe(true);
  });

  it("PK を 5 本続けて決めると PK 系が上がり、外すと連続は 0 に戻る", () => {
    const rng = Rng.fromSeed("pk");
    const p = make();
    const ms = { ...emptyMatchPlayerStats(), pkKicks: [true, true, true, true, false, true] };
    applyMatchFeats(rng, p, matchPlayer(p, { ms }), { official: true });
    expect(p.feats!.pkStreak).toBe(1);
    expect(hasSkill(p, "pk1")).toBe(false);
    const ms2 = { ...emptyMatchPlayerStats(), pkKicks: [true, true, true, true] };
    applyMatchFeats(rng, p, matchPlayer(p, { ms: ms2 }), { official: true });
    expect(p.feats!.pkStreak).toBe(5);
    expect(hasSkill(p, "pk1")).toBe(true);
  });

  it("PK 戦で 2 本止めた GK は PK ストッパーを身につける", () => {
    const gk = make("GK");
    applyMatchFeats(Rng.fromSeed("g"), gk, matchPlayer(gk, { ms: { ...emptyMatchPlayerStats(), pkShootoutSaves: 2 } }), { official: true });
    expect(hasSkill(gk, "pkStopper")).toBe(true);
  });

  it("全国大会の決勝の決勝点で大舞台系が上がり、× なら消える", () => {
    const p = make();
    p.skills = ["bigStageX"];
    expect(stepUpLine(p, "bigStage")?.kind).toBe("remove");
    expect(p.skills).toEqual([]);
    applyMatchFeats(Rng.fromSeed("b"), p, matchPlayer(p), { official: true, nationalFinalWinner: true });
    expect(hasSkill(p, "bigStage1")).toBe(true);
  });

  it("金色は ◎ と成果の条件をそろえたときだけ判定される（段階アップで直接は金色にならない）", () => {
    const p = make();
    p.skills = ["oneOnOne2"];
    expect(stepUpLine(p, "oneOnOne")).toBeNull();
    p.feats = { ...emptyFeats(), oneOnOneGoals: 2 };
    expect(goldReady(p, "oneOnOneG")).toBe(false);
    p.feats.oneOnOneGoals = 3;
    expect(goldReady(p, "oneOnOneG")).toBe(true);
    p.skills = ["oneOnOne1"];
    expect(goldReady(p, "oneOnOneG")).toBe(false);
  });
});
