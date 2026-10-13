import { describe, expect, it } from "vitest";
import { PERSONALITY_STYLES, PERSONALITY_WEIGHTS } from "../config/personality";
import { PROFICIENCY } from "../config/playStyle";
import { Rng } from "../rng";
import { personalityPracticeMult } from "../practice";
import { PERSONALITIES, type Player } from "../types";
import { generatePlayer } from "./generate";
import { assignPlayStyle, changePlayStyle, gainProficiency, randomPersonality, styleFitsPosition, styleOptions } from "./traits";

const make = (pos: Player["mainPosition"], seed = "x") => generatePlayer(Rng.fromSeed(seed), { grade: 1, enrolledYear: 1, base: 50, position: pos });

describe("性格", () => {
  it("ひらめき型は 3% 前後、ほかの 7 種類はほぼ均等", () => {
    const rng = Rng.fromSeed("pers");
    const n = 40000;
    const count = Object.fromEntries(PERSONALITIES.map((k) => [k, 0])) as Record<string, number>;
    for (let i = 0; i < n; i++) count[randomPersonality(rng)]++;
    expect(count.inspired / n).toBeGreaterThan(0.02);
    expect(count.inspired / n).toBeLessThan(0.04);
    for (const k of PERSONALITIES) if (k !== "inspired") expect(Math.abs(count[k] / n - 0.97 / 7)).toBeLessThan(0.01);
    expect(PERSONALITY_WEIGHTS.inspired).toBeLessThan(PERSONALITY_WEIGHTS.diligent);
  });

  it("練習の倍率：情熱家はフィジカルが伸び、慎重派はシュートが伸びにくい。職人気質は得意な練習だけ大きく伸びる", () => {
    const rng = Rng.fromSeed("pp");
    const p = make("CF");
    p.personality = "passionate";
    expect(personalityPracticeMult(rng, p, "physical")).toBeGreaterThan(1.1);
    expect(personalityPracticeMult(rng, p, "shoot")).toBeLessThan(1);
    p.personality = "cautious";
    expect(personalityPracticeMult(rng, p, "shoot")).toBeLessThan(0.9);
    p.personality = "craftsman";
    p.favoritePractice = "dribble";
    expect(personalityPracticeMult(rng, p, "dribble")).toBeGreaterThan(1.3);
    expect(personalityPracticeMult(rng, p, "shoot")).toBeLessThan(1);
  });

  it("ひらめき型の倍率は、カード 1 枚の間は同じ値で、0.5〜1.8 の範囲", () => {
    const rng = Rng.fromSeed("insp");
    const p = make("CF");
    p.personality = "inspired";
    const rolls: Record<string, number> = {};
    const a = personalityPracticeMult(rng, p, "shoot", rolls);
    expect(personalityPracticeMult(rng, p, "shoot", rolls)).toBe(a);
    for (let i = 0; i < 2000; i++) {
      const v = personalityPracticeMult(rng, p, "shoot");
      expect(v).toBeGreaterThanOrEqual(0.5);
      expect(v).toBeLessThanOrEqual(1.8);
    }
  });
});

describe("プレースタイル", () => {
  it("新入生のスタイルは主ポジションの区分のもの", () => {
    const rng = Rng.fromSeed("st");
    for (let i = 0; i < 500; i++) {
      const p = generatePlayer(rng, { grade: 1, enrolledYear: 1, base: 50 });
      expect(styleFitsPosition(p.playStyle, p.mainPosition)).toBe(true);
      expect(assignPlayStyle(rng, p)).toBeDefined();
    }
  });

  it("選べるスタイルは主ポジションと適性○以上のポジションの区分だけ。変えると熟練度は 0 に戻る", () => {
    const p = make("CB", "cb");
    for (const pos of Object.keys(p.aptitude) as (keyof typeof p.aptitude)[]) p.aptitude[pos] = pos === "CB" ? 3 : 1;
    const opts = styleOptions(p);
    expect(opts).toContain("stopper");
    expect(opts).not.toContain("striker");
    p.styleProficiency = 60;
    const other = opts.find((s) => s !== p.playStyle)!;
    expect(changePlayStyle(p, other)).toBe(true);
    expect(p.styleProficiency).toBe(0);
    expect(changePlayStyle(p, "striker")).toBe(false);
    p.aptitude.CF = 2;
    expect(styleOptions(p)).toContain("striker");
  });

  it("熟練度は上がるほど上がりにくく、100 を超えない。伸ばしやすい性格は早い", () => {
    const p = make("CF");
    // 伸ばしやすいスタイルに striker を持たない、努力家でない性格
    p.personality = PERSONALITIES.find((k) => k !== "diligent" && !PERSONALITY_STYLES[k].includes("striker"))!;
    p.playStyle = "striker";
    p.styleProficiency = 0;
    const first = gainProficiency(p, 10);
    p.styleProficiency = 90;
    const late = gainProficiency(p, 10);
    expect(late).toBeLessThan(first);
    for (let i = 0; i < 500; i++) gainProficiency(p, 10);
    expect(p.styleProficiency).toBeLessThanOrEqual(PROFICIENCY.max);
    const q = make("CF");
    q.personality = "diligent";
    q.playStyle = "striker";
    q.styleProficiency = 0;
    expect(gainProficiency(q, 10)).toBeGreaterThan(first);
  });
});
