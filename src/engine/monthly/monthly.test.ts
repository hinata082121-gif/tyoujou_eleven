import { describe, expect, it } from "vitest";
import { confirmMonthly, newGame } from "../game";
import { autoplayYears } from "../game/autoplay";
import { playerSchool } from "../season";
import type { GameState } from "../types";
import { beginMonthly, effectiveFocus, finishMonthly, focusStreaks, setFocus } from ".";
import { Rng } from "../rng";
import { dateToDay } from "../calendar";

/** 月初の指示の画面を、その月で開き直す（月を進めたことにする） */
function openMonth(s: GameState, month: number) {
  s.pending = { type: "monthly", month };
}

describe("重点にしてからの累計の伸び（R3。計画 4 章）", () => {
  it("重点にした月から数え、今の値との差を出す。今月からは 0 か月", () => {
    const s = newGame("r3-focus", "テスト高校");
    const p = playerSchool(s).players[0];
    openMonth(s, 0);
    expect(setFocus(p, ["speed"])).toBe(true);
    expect(focusStreaks(s, p)).toEqual([{ stat: "speed", months: 0, gain: 0 }]);
    expect(confirmMonthly(s)).toBeNull();
    const base = p.stats.speed;
    p.stats.speed = base + 6;
    openMonth(s, 5);
    expect(focusStreaks(s, p)).toEqual([{ stat: "speed", months: 5, gain: 6 }]);
  });

  it("「指示」と「おまかせ」を切り替えても、同じ能力が重点のままなら数え続ける。重点から外したら消して、また 0 から", () => {
    const s = newGame("r3-focus2", "テスト高校");
    const p = playerSchool(s).players[1];
    openMonth(s, 0);
    setFocus(p, ["stamina", "pass"]);
    finishMonthly(s);
    const base = p.stats.stamina;
    // 2 か月後：おまかせに戻し、おまかせでも持久力が重点
    openMonth(s, 2);
    setFocus(p, null);
    p.autoFocus = ["stamina"];
    p.stats.stamina = base + 3;
    expect(effectiveFocus(p)).toEqual(["stamina"]);
    expect(focusStreaks(s, p)).toEqual([{ stat: "stamina", months: 2, gain: 3 }]);
    finishMonthly(s);
    expect(s.monthly?.focusLog?.[p.id]?.pass).toBeUndefined();
    // 外した能力をまた重点にすると、今月から
    openMonth(s, 3);
    setFocus(p, ["pass"]);
    expect(focusStreaks(s, p)).toEqual([{ stat: "pass", months: 0, gain: 0 }]);
    finishMonthly(s);
    expect(s.monthly?.focusLog?.[p.id]?.stamina).toBeUndefined();
    openMonth(s, 4);
    expect(focusStreaks(s, p)[0]).toMatchObject({ stat: "pass", months: 1 });
  });

  it("記録は表示だけ：成長・乱数・試合には使わない（記録を消しても 1 年の結果は同じ）。年度をまたいでも月は続く", () => {
    const a = newGame("r3-focus3", "テスト高校");
    const b = newGame("r3-focus3", "テスト高校");
    const sa = autoplayYears(a, 1, "skilled", { focus: "manual" });
    // b は月初ごとに記録を消しながら進める
    const steps = 2000;
    for (let i = 0; i < steps && b.year < 2; i++) {
      if (b.monthly) delete b.monthly.focusLog;
      autoplayYears(b, 1, "skilled", { focus: "manual" }, 1);
    }
    expect(b.year).toBe(a.year);
    const ov = (s: GameState) => playerSchool(s).players.map((p) => [p.id, p.stats]);
    expect(ov(b)).toEqual(ov(a));
    expect(sa.monthly).toBe(12);
    // 年度をまたいだ：2 年目の 4 月の指示で、1 年目から重点の能力は 12 か月
    beginMonthly(a, Rng.fromSeed("x"), dateToDay(4, 1));
    const kept = playerSchool(a).players.find((p) => focusStreaks(a, p).some((f) => f.months >= 12));
    expect(kept).toBeDefined();
  }, 120000);
});
