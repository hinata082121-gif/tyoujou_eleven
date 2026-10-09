import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import { buildSquares, dateToDay, dayToDate, drawCard, findDestination, formatDay, newCalendar, refillHand } from ".";

describe("カレンダー", () => {
  it("4月1日始まりの 365 日", () => {
    expect(dayToDate(0)).toEqual([4, 1]);
    expect(dayToDate(30)).toEqual([5, 1]);
    expect(dayToDate(364)).toEqual([3, 31]);
    expect(dateToDay(1, 1)).toBe(275);
    for (let d = 0; d < 365; d++) expect(dateToDay(...dayToDate(d))).toBe(d);
    expect(formatDay(0)).toBe("4月1日");
  });

  it("固定の大マス（入学式・県予選・全国大会・卒業式・年度末）と練習試合がある", () => {
    const squares = buildSquares(Rng.fromSeed("cal"), 5, 6);
    expect(squares).toHaveLength(365);
    const kinds = (k: string) => squares.filter((s) => s.major?.kind === k);
    expect(kinds("entrance").map((s) => s.day)).toEqual([0]);
    expect(kinds("prefQualifier")).toHaveLength(5);
    expect(kinds("national")).toHaveLength(6);
    expect(kinds("graduation").map((s) => dayToDate(s.day))).toEqual([[3, 1]]);
    expect(kinds("yearEnd").map((s) => s.day)).toEqual([364]);
    // 練習試合は年に 6〜8 回
    expect(kinds("practiceMatch").length).toBeGreaterThanOrEqual(6);
    expect(kinds("practiceMatch").length).toBeLessThanOrEqual(8);
    // 通常マスの種類は 5 種類
    const types = new Set(squares.map((s) => s.baseType));
    expect([...types].sort()).toEqual(["blue", "green", "red", "white", "yellow"]);
  });

  it("必ず止まるマスがあれば、その手前で大きな数字を使ってもそこで止まる", () => {
    const squares = buildSquares(Rng.fromSeed("stop"), 4, 5);
    const stop = squares.find((s) => s.day > 10 && s.major)!;
    const always = () => true;
    expect(findDestination(squares, stop.day - 2, 5, always)).toBe(stop.day);
    expect(findDestination(squares, stop.day - 5, 5, always)).toBe(stop.day);
    // 止まらない設定なら通過する
    expect(findDestination(squares, stop.day - 2, 5, () => false)).toBe(stop.day + 3);
    // 年度末を越えない
    expect(findDestination(squares, 363, 5, () => false)).toBe(364);
  });

  it("進行カードは数字 1〜5 で、手札は評判の枚数にそろう", () => {
    const rng = Rng.fromSeed("cards");
    let pk = 0;
    for (let i = 0; i < 200; i++) {
      const c = drawCard(rng);
      expect(c.value).toBeGreaterThanOrEqual(1);
      expect(c.value).toBeLessThanOrEqual(5);
      if (c.practice === "pk") pk++;
    }
    // PK 練習（P2a）は他の練習の半分くらいの出やすさ
    expect(pk).toBeGreaterThan(0);
    expect(pk).toBeLessThan(20);
    const cal = newCalendar(rng, 5, 5, 4);
    expect(cal.hand).toHaveLength(4);
    refillHand(rng, cal, 6);
    expect(cal.hand).toHaveLength(6);
    refillHand(rng, cal, 5);
    expect(cal.hand).toHaveLength(5);
  });
});
