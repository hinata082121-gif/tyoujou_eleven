import { describe, expect, it } from "vitest";
import { REPUTATION_TABLE } from "../config/reputation";
import { playerSchool } from "../season";
import { newGame, playCard, isStopSquare } from ".";
import { dateToDay, nationalDays } from "../calendar";
import { createBracket } from "../competition/bracket";
import { Rng } from "../rng";
import { autoplayYears, autoStep, newAutoplayStats } from "./autoplay";
import { canSkipWatching, defaultSetup, startPlayerMatch } from ".";

describe("ゲームの進行", () => {
  it("学校を作ると、自県 16〜32 校・1〜3 年生がそろった部員・弱小から始まる", () => {
    const s = newGame("t1", "テスト高校");
    const pref = s.prefectures.find((p) => p.isPlayerPref)!;
    expect(pref.schoolIds.length).toBeGreaterThanOrEqual(16);
    expect(pref.schoolIds.length).toBeLessThanOrEqual(32);
    expect(s.reputation.level).toBe(0);
    const players = playerSchool(s).players;
    for (const g of [1, 2, 3]) expect(players.filter((p) => p.grade === g).length).toBe(REPUTATION_TABLE[0].gradeSize);
    expect(s.calendar.hand.length).toBe(REPUTATION_TABLE[0].handSize);
    // CPU 校もランクと部員を持つ
    for (const id of pref.schoolIds) {
      expect(s.schools[id].players.length).toBeGreaterThan(20);
      expect(["E", "D", "C", "B", "A", "S"]).toContain(s.schools[id].rank);
    }
  });

  it("同じシードなら同じゲームになる", () => {
    const a = newGame("same", "A高校");
    const b = newGame("same", "A高校");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    playCard(a, a.calendar.hand[0].id);
    playCard(b, b.calendar.hand[0].id);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("カードを使うと数字の日数だけ進み、必ず止まるマスの手前では止まる", () => {
    const s = newGame("t2", "B高校");
    const cal = s.calendar;
    // 直近の必ず止まるマスを探す
    const stop = cal.squares.find((sq) => sq.day > 0 && isStopSquare(s, sq))!;
    cal.position = stop.day - 2;
    cal.hand[0] = { id: "x", value: 5, practice: "pass" };
    const r = playCard(s, "x")!;
    expect(r.to).toBe(stop.day);
    expect(r.days).toBe(2);
    expect(s.pending).toBeDefined();
  });

  it("東京の予選は代表 2 校。冬の全国大会は 48 校（6 ラウンド）", () => {
    const s = newGame("tokyo", "東京高校", "tokyo");
    expect(s.competitions.prefQualifier!.qualifiers).toBe(2);
    const st = newAutoplayStats();
    while (!s.competitions.national) autoStep(s, st);
    const pq = s.competitions.prefQualifier!;
    expect(pq.qualifiedIds).toHaveLength(2);
    const nat = s.competitions.national;
    const teams = nat.rounds[0].flatMap((m) => [m.a, m.b]).filter(Boolean);
    expect(teams).toHaveLength(48);
    expect(nat.roundDays).toHaveLength(6);
    const tokyo = s.prefectures.find((p) => p.id === "tokyo")!;
    expect(teams.filter((id) => tokyo.schoolIds.includes(id!))).toHaveLength(2);
  });

  it("「結果のみ」は練習試合だけ選べる", () => {
    const s = newGame("auto", "E高校");
    const st = newAutoplayStats();
    let sawPractice = false;
    let sawTournament = false;
    for (let i = 0; i < 3000 && !(sawPractice && sawTournament); i++) {
      const p = s.pending;
      if (p?.type === "match" && !s.activeMatch) {
        if (p.kind === "practice" && !sawPractice) {
          expect(canSkipWatching(s)).toBe(true);
          const m = startPlayerMatch(s, defaultSetup(s), "auto")!;
          expect(m.state.phase).toBe("END");
          sawPractice = true;
        } else if (p.kind !== "practice" && !sawTournament) {
          expect(canSkipWatching(s)).toBe(false);
          expect(startPlayerMatch(s, defaultSetup(s), "auto")).toBeNull();
          sawTournament = true;
        }
      }
      autoStep(s, st);
    }
    expect(sawPractice && sawTournament).toBe(true);
  });

  it("練習試合は年に 6〜8 回", () => {
    const s = newGame("pm", "F高校");
    const n = s.calendar.squares.filter((sq) => sq.major?.kind === "practiceMatch").length;
    expect(n).toBeGreaterThanOrEqual(6);
    expect(n).toBeLessThanOrEqual(8);
  });

  it("不戦勝の次のラウンドは、同じカードで通り過ぎずにその日に止まる", () => {
    const s = newGame("bye", "D高校");
    const others = Object.keys(s.schools).filter((id) => id !== s.playerSchoolId).slice(0, 47);
    // 自校を 1 番シード（1 回戦は不戦勝）にした全国大会
    s.competitions.national = createBracket("national", [s.playerSchoolId, ...others], nationalDays(6), Rng.fromSeed("b"));
    s.calendar.position = dateToDay(12, 28);
    s.calendar.hand[0] = { id: "x", value: 5, practice: "pass" };
    const r = playCard(s, "x")!;
    expect(r.to).toBe(dateToDay(12, 31));
    expect(s.pending).toMatchObject({ type: "match", kind: "national", round: 1 });
  });

  it(
    "2 年以上、途切れずに遊べる（選手権 → 引退 → 卒業 → 新入生）",
    () => {
      const s = newGame("long", "C高校");
      const stats = autoplayYears(s, 3);
      expect(s.year).toBe(4);
      expect(stats.yearEnds).toBe(3);
      expect(stats.graduations).toBe(3);
      // 毎年、冬の全国大会に出ている
      const winter = stats.matches.filter((m) => m.kind === "prefQualifier");
      expect(winter.length).toBeGreaterThanOrEqual(3);
      expect(stats.matches.some((m) => m.kind === "practice")).toBe(true);
      // OB が記録され、毎年新入生が入っている
      expect(s.alumni.length).toBeGreaterThanOrEqual(27);
      const players = playerSchool(s).players;
      expect(players.filter((p) => p.grade === 1).length).toBe(REPUTATION_TABLE[s.history[2].reputationLevel].gradeSize);
      expect(players.every((p) => p.status === "active")).toBe(true);
      expect(s.history.length).toBe(3);
    },
    60_000,
  );
});
