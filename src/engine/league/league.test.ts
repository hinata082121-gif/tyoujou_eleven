import { describe, expect, it } from "vitest";
import { dateToDay } from "../calendar";
import { LEAGUE } from "../config/league";
import { newGame } from "../game";
import { autoplayYears } from "../game/autoplay";
import { createLeague, divisionOf, leagueDays, promotionResult, roundRobin, splitDivisions, standings } from ".";
import type { LeagueDivision } from "../types";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

describe("県リーグの部と組み合わせ", () => {
  it("8 校ずつに分け、端数は最下部に入れる（16〜32 校で 2〜4 部）", () => {
    expect(splitDivisions(ids(16)).map((d) => d.length)).toEqual([8, 8]);
    expect(splitDivisions(ids(23)).map((d) => d.length)).toEqual([8, 15]);
    expect(splitDivisions(ids(26)).map((d) => d.length)).toEqual([8, 8, 10]);
    expect(splitDivisions(ids(32)).map((d) => d.length)).toEqual([8, 8, 8, 8]);
  });

  it.each([8, 9, 10, 15])("%i 校の総当たり：どの 2 校も決まった回数だけ当たり、同じ節に 2 試合しない", (n) => {
    const double = n <= LEAGUE.divisionSize;
    const rounds = roundRobin(ids(n), double, "L");
    const pairs = new Map<string, number>();
    for (const r of rounds) {
      const seen = new Set<string>();
      for (const f of r) {
        expect(seen.has(f.home) || seen.has(f.away)).toBe(false);
        seen.add(f.home);
        seen.add(f.away);
        const key = [f.home, f.away].sort().join("-");
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    expect(pairs.size).toBe((n * (n - 1)) / 2);
    expect([...pairs.values()].every((c) => c === (double ? 2 : 1))).toBe(true);
    // 2 回総当たりは、ホームとアウェーが 1 回ずつ
    if (double) {
      const homes = new Set(rounds.flat().map((f) => `${f.home}>${f.away}`));
      expect(homes.size).toBe(n * (n - 1));
    }
    expect(leagueDays(rounds.length).length).toBe(rounds.length);
  });

  it("日程は 7〜8 月を避け、昇順。14 節より少なければ 14 の日程に散らす", () => {
    const days = leagueDays(14);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    expect(days.every((d) => d < dateToDay(7, 1) || d >= dateToDay(9, 1))).toBe(true);
    expect(leagueDays(9)[8]).toBe(days[13]);
    expect(leagueDays(15).length).toBe(15);
  });

  it("順位は勝ち点 → 得失点差 → 総得点。上の部の下位 2 校と下の部の上位 2 校が入れ替わる", () => {
    const lg = createLeague([ids(8), ids(16).slice(8)]);
    // 番号の小さい学校が必ず勝つ
    for (const d of lg.divisions)
      for (const r of d.fixtures)
        for (const f of r) {
          const h = Number(f.home.slice(1));
          const a = Number(f.away.slice(1));
          f.score = h < a ? [2, 0] : [0, 1];
        }
    const t = standings(lg.divisions[0]);
    expect(t.map((x) => x.schoolId)).toEqual(ids(8));
    expect(t[0].points).toBe(42);
    const next = promotionResult(lg);
    expect(next[0]).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s8", "s9"]);
    expect(next[1].slice(0, 2)).toEqual(["s6", "s7"]);
    expect(next[1]).toHaveLength(8);
  });

  it("同じ勝ち点・得失点差・総得点なら、当該チームどうしの成績で決める", () => {
    const d: LeagueDivision = {
      level: 1,
      schoolIds: ["a", "b"],
      doubleRound: true,
      days: [0, 1],
      fixtures: [[{ id: "1", home: "a", away: "b", score: [0, 1] }], [{ id: "2", home: "b", away: "a", score: [0, 1] }]],
    };
    // 1 勝 1 敗・得失点 0 どうし。直接対決も 3-3 なので部の並び
    expect(standings(d).map((x) => x.schoolId)).toEqual(["a", "b"]);
  });
});

describe("県リーグの進行", () => {
  it("自校は最下部から始まり、1 年で自分の部の全節を戦う。年度末に昇格・降格が反映される", () => {
    const s = newGame("league-1", "検証高校", "tokyo");
    const lg = s.league!;
    expect(lg.active).toBe(true);
    const my = divisionOf(lg, s.playerSchoolId)!;
    expect(my.level).toBe(lg.divisions.length);
    const leagueSquares = s.calendar.squares.filter((q) => q.major?.kind === "league");
    expect(leagueSquares.map((q) => q.day)).toEqual(my.days.filter((d) => leagueSquares.some((q) => q.day === d)));
    const stats = autoplayYears(s, 1, "skilled");
    const games = stats.matches.filter((m) => m.kind === "league");
    const expected = my.fixtures.flat().filter((f) => f.home === s.playerSchoolId || f.away === s.playerSchoolId).length;
    expect(games.length).toBe(expected);
    const h = s.history.at(-1)!;
    expect(h.league).toBeDefined();
    expect(h.league!.level).toBe(my.level);
    // 新しい年の部は、前の年の結果を反映している
    const now = divisionOf(s.league!, s.playerSchoolId)!;
    expect(now.level).toBe(my.level - (h.league!.promoted ? 1 : 0) + (h.league!.relegated ? 1 : 0));
    expect(s.league!.divisions.flatMap((d) => d.schoolIds).sort()).toEqual(lg.divisions.flatMap((d) => d.schoolIds).sort());
  }, 60000);
});
