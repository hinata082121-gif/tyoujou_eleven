import { describe, expect, it } from "vitest";
import { confirmCaptain, confirmMonthly, finishStaff, newGame } from "../game";
import { autoplayYears } from "../game/autoplay";
import { playerSchool } from "../season";
import { appointCaptain, autoCaptain, captainCandidates, captainConditionMults, captainOf, captainPracticeMult, captainScore } from ".";

describe("キャプテン", () => {
  it("年度初めはスタッフの編成の後に指名する。学年は問わず、決めるまで進めない", () => {
    const s = newGame("cap", "C高校");
    finishStaff(s);
    expect(s.pending?.type).toBe("captain");
    const school = playerSchool(s);
    // おすすめの 1 位が初期選択
    expect(school.captainId).toBe(captainCandidates(school)[0].id);
    const freshman = school.players.find((p) => p.grade === 1)!;
    expect(confirmCaptain(s, "nobody")).not.toBeNull();
    expect(confirmCaptain(s, freshman.id)).toBeNull();
    expect(captainOf(school)?.id).toBe(freshman.id);
    // 4/1 はキャプテンの指名の後に月初の指示（R2）
    expect(s.pending?.type).toBe("monthly");
    confirmMonthly(s);
    expect(s.pending).toBeUndefined();
    // 指名の時期以外は変えられない
    expect(confirmCaptain(s, school.players[0].id)).not.toBeNull();
  });

  it("おすすめ順は総合・学年・性格・キャプテンシーで決まる", () => {
    const s = newGame("cap2", "C高校");
    const school = playerSchool(s);
    const p = school.players[0];
    const base = captainScore(p);
    p.skills = ["captaincy2"];
    expect(captainScore(p)).toBeGreaterThan(base);
    autoCaptain(school);
    expect(school.captainId).toBe(captainCandidates(school)[0].id);
    expect(appointCaptain(school, "none")).toBe(false);
  });

  it("努力家のキャプテンは練習効率、ムードメーカーは調子の上がり下がりに効く", () => {
    const s = newGame("cap3", "C高校");
    const school = playerSchool(s);
    const p = school.players[0];
    appointCaptain(school, p.id);
    p.personality = "diligent";
    expect(captainPracticeMult(school)).toBeGreaterThan(1);
    p.personality = "moodMaker";
    expect(captainConditionMults(school).down).toBeLessThan(1);
    expect(captainConditionMults(school).up).toBeGreaterThan(1);
  });

  it("3 年生の引退でキャプテンがいなくなったら、そのときにも指名する（自動プレイで 1 年）", () => {
    const s = newGame("cap4", "C高校");
    autoplayYears(s, 1);
    const appointments = s.log.filter((l) => l.text.includes("キャプテンに指名"));
    expect(appointments.length).toBeGreaterThanOrEqual(2);
    // CPU 校にもキャプテンがいる
    const cpu = Object.values(s.schools).filter((x) => !x.isPlayer);
    expect(cpu.filter((x) => x.captainId).length / cpu.length).toBeGreaterThan(0.95);
  });
});
