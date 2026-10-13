import { describe, expect, it } from "vitest";
import { HAIR_COLORS, KIT_PALETTE, LOOK_OPTIONS, LOOK_PARTS, SHIRT_NUMBERS } from "../config/look";
import { newGame } from "../game";
import { DEFAULT_TACTICS } from "../match/lineup";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import type { Kit, School, SchoolKits } from "../types";
import { assignShirtNumbers, colorDistance, ensureLooks, fillShirtNumbers, generateKits, generateLook, kitsClash, kitsForMatch, packLook, pickIndex, renumberAll, secondKitFor, unpackLook, venueStage } from ".";

const kit = (main: number, sub = 0, template = 0): Kit => ({ template, main, sub, shorts: main, socks: main });
const kits = (first: Kit, second?: Kit): SchoolKits => ({ first, second: second ?? secondKitFor(first) });

describe("見た目の生成", () => {
  it("同じシードと ID なら同じ見た目。シードか ID が違えば変わることが多い", () => {
    expect(generateLook("s1", "p1")).toEqual(generateLook("s1", "p1"));
    let diff = 0;
    for (let i = 0; i < 50; i++) if (JSON.stringify(generateLook("s1", `p${i}`)) !== JSON.stringify(generateLook("s2", `p${i}`))) diff++;
    expect(diff).toBeGreaterThan(40);
  });

  it("すべての要素が一覧の範囲に入り、出やすさがだいたい設定どおり（黒とこげ茶で 8 割前後）", () => {
    const n = 4000;
    const hairColor = new Array(HAIR_COLORS.length).fill(0);
    for (let i = 0; i < n; i++) {
      const l = generateLook("dist", `p${i}`);
      for (const part of LOOK_PARTS) {
        expect(l[part]).toBeGreaterThanOrEqual(0);
        expect(l[part]).toBeLessThan(LOOK_OPTIONS[part].length);
      }
      hairColor[l.hairColor]++;
    }
    const dark = (hairColor[0] + hairColor[1]) / n;
    expect(dark).toBeGreaterThan(0.74);
    expect(dark).toBeLessThan(0.86);
  });

  it("出やすさ 0 の種類を後ろに足しても、選ばれる番号は変わらない（P5 の留学生の髪の色・肌の色を足すときの互換性）", () => {
    const base = HAIR_COLORS.map((o) => ({ ...o }));
    const extended = [...base, { id: "blond", weight: 0 }, { id: "red", weight: 0 }];
    for (let i = 0; i < 200; i++) {
      const a = pickIndex(Rng.fromSeed(`x${i}`), base);
      const b = pickIndex(Rng.fromSeed(`x${i}`), extended);
      expect(b).toBe(a);
    }
  });

  it("セーブ用の配列にして戻せる。要素が足りない古い配列や、範囲外の値は 0 として読む", () => {
    const l = generateLook("s", "p");
    expect(unpackLook(packLook(l))).toEqual(l);
    expect(unpackLook([1, 2])).toEqual({ hair: 1, hairColor: 2, skin: 0, eyes: 0, brows: 0, mouth: 0 });
    expect(unpackLook([99, -1, 1.5]).hair).toBe(0);
  });
});

describe("背番号", () => {
  const school = (seed: string): School => ({
    id: "s",
    name: "s",
    prefectureId: "p",
    isPlayer: false,
    players: generateCpuRoster(Rng.fromSeed(seed), 3, 1),
    rank: "C",
    prestige: 3,
    formation: "4-4-2",
    tactics: DEFAULT_TACTICS,
  });

  it("GK の一番手が 1、10 番がいて、番号に重複がない。先発以外は 12 から", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const s = school(seed);
      assignShirtNumbers(s);
      const active = s.players.filter((p) => p.status === "active");
      const nums = active.map((p) => p.shirtNumber!);
      expect(nums.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
      expect(new Set(nums).size).toBe(nums.length);
      const one = active.find((p) => p.shirtNumber === 1)!;
      expect(one.mainPosition === "GK" || one.aptitude.GK >= 2).toBe(true);
      expect(nums).toContain(SHIRT_NUMBERS.ace);
      expect(nums.filter((n) => n >= 1 && n <= 11).length).toBeLessThanOrEqual(11);
    }
  });

  it("番号の無い選手には空いている番号を足し、今の番号は変えない（年度の途中）", () => {
    const s = school("e");
    assignShirtNumbers(s);
    const before = new Map(s.players.map((p) => [p.id, p.shirtNumber]));
    const newcomer = s.players[0];
    delete newcomer.shirtNumber;
    fillShirtNumbers(s);
    for (const p of s.players) if (p !== newcomer) expect(p.shirtNumber).toBe(before.get(p.id));
    expect(newcomer.shirtNumber).toBeGreaterThanOrEqual(SHIRT_NUMBERS.restFrom);
    const nums = s.players.map((p) => p.shirtNumber);
    expect(new Set(nums).size).toBe(nums.length);
  });
});

describe("ユニフォームの色かぶり", () => {
  it("同じ色・近い色はかぶり、遠い色はかぶらない", () => {
    expect(kitsClash(kit(12), kit(12))).toBe(true); // 赤と赤
    expect(kitsClash(kit(4), kit(3))).toBe(true); // 青と紺
    expect(kitsClash(kit(0), kit(17))).toBe(true); // 白とベージュ
    expect(kitsClash(kit(12), kit(4))).toBe(false); // 赤と青
    expect(kitsClash(kit(0), kit(1))).toBe(false); // 白と黒
    expect(colorDistance(12, 12)).toBe(0);
  });

  it("かぶらなければ両方 1st。かぶればアウェーが 2nd", () => {
    const red = kits(kit(12, 0)),
      blue = kits(kit(4, 0));
    expect(kitsForMatch([red, blue], 0).choice).toEqual(["first", "first"]);
    const red2 = kits(kit(12, 1));
    const m = kitsForMatch([red, red2], 0);
    expect(m.choice).toEqual(["first", "second"]);
    expect(kitsClash(m.kits[0], m.kits[1])).toBe(false);
    // ホームがチーム 1 なら、2nd を着るのはチーム 0
    expect(kitsForMatch([red, red2], 1).choice).toEqual(["second", "first"]);
  });

  it("アウェーの 2nd もかぶればホームが 2nd、それでもかぶれば予備の無地。どの場合も結果はかぶらない", () => {
    const home = kits(kit(12), kit(0));
    const away = kits(kit(12), kit(0));
    const m = kitsForMatch([home, away], 0);
    expect(kitsClash(m.kits[0], m.kits[1])).toBe(false);
    const strange = kits(kit(0), kit(0));
    const m2 = kitsForMatch([strange, kits(kit(0), kit(17))], 0);
    expect(m2.choice[1]).toBe("reserve");
    expect(kitsClash(m2.kits[0], m2.kits[1])).toBe(false);
  });

  it("ランダムな学校どうしでも、試合のユニフォームはかぶらない。GK の色は両チームのフィールドの色と離れている", () => {
    for (let i = 0; i < 300; i++) {
      const a = generateKits("seed", `a${i}`);
      const b = generateKits("seed", `b${i}`);
      const m = kitsForMatch([a, b], (i % 2) as 0 | 1);
      expect(kitsClash(m.kits[0], m.kits[1])).toBe(false);
      for (const g of m.gk) for (const k of m.kits) expect(colorDistance(g, k.main)).toBeGreaterThan(15);
      expect(m.gk[0]).not.toBe(m.gk[1]);
    }
  });

  it("CPU 校のユニフォームは同じ ID なら同じ。1st と 2nd は見分けられる。色はパレットの範囲", () => {
    expect(generateKits("s", "x")).toEqual(generateKits("s", "x"));
    for (let i = 0; i < 200; i++) {
      const k = generateKits("s", `x${i}`);
      expect(kitsClash(k.first, k.second)).toBe(false);
      for (const c of [k.first.main, k.first.sub, k.first.shorts, k.first.socks, k.second.main]) expect(c).toBeLessThan(KIT_PALETTE.length);
    }
  });
});

describe("会場の段階", () => {
  it("県予選は序盤がグラウンド、準々決勝・準決勝が小さな競技場、決勝が競技場。冬の全国大会は準決勝から大きなスタジアム", () => {
    expect(venueStage("prefQualifier", 0, 5)).toBe(1);
    expect(venueStage("prefQualifier", 2, 5)).toBe(2);
    expect(venueStage("prefQualifier", 3, 5)).toBe(2);
    expect(venueStage("prefQualifier", 4, 5)).toBe(3);
    expect(venueStage("national", 0, 6)).toBe(3);
    expect(venueStage("national", 4, 6)).toBe(4);
    expect(venueStage("summerNational", 4, 6)).toBe(3);
    expect(venueStage("summerNational", 5, 6)).toBe(4);
    expect(venueStage("rookieRegion", 0, 4)).toBe(2);
    expect(venueStage("rookiePref", 0, 5)).toBe(1);
  });
});

describe("ゲームの乱数を使わない", () => {
  it("新しいゲームでは全員に見た目と背番号、全校にユニフォームがある。付け直してもゲームの乱数は進まない", () => {
    const s = newGame("look-test", "テスト");
    for (const sc of Object.values(s.schools)) {
      expect(sc.kits).toBeDefined();
      for (const p of sc.players) {
        expect(p.look).toBeDefined();
        if (p.status === "active") expect(p.shirtNumber).toBeDefined();
      }
    }
    for (const a of s.alumni) expect(a.look).toBeDefined();
    const rng = [...s.rng];
    for (const sc of Object.values(s.schools)) for (const p of sc.players) delete p.look;
    ensureLooks(s);
    renumberAll(s);
    expect(s.rng).toEqual(rng);
  });
});
