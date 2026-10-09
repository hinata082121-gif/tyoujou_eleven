import { describe, expect, it } from "vitest";
import { autoManageStaff, autoplayYears } from "./autoplay";
import { defaultSetup, eligiblePlayers, finishStaff, hire, newGame, pendingIsOfficial } from ".";
import { headCoach } from "../staff";
import { STAFF_LIFE } from "../config/staff";
import { playerSchool } from "../season";

describe("スタッフの 1 サイクル（自動プレイで 6 年）", () => {
  it("雇用・成長・勇退（引き抜き）・後任の雇用が回る", () => {
    const s = newGame("cycle", "循環高校");
    const ob = s.alumni.find((a) => a.career === "coach")!;
    expect(hire(s, ob.id, "head")).toBeNull();
    finishStaff(s);
    const head = headCoach(s.staff)!;
    // 勇退が近い年齢にしておく（遅くとも 68 歳で必ず勇退）
    head.age18Year = s.year - (STAFF_LIFE.forceRetireAge - 4 - STAFF_LIFE.graduateAge);
    const heads = new Map<string, number>([[head.id, head.abilities.coaching]]);
    let grew = false;
    for (let y = 0; y < 6; y++) {
      autoplayYears(s, 1, "skilled");
      const h = headCoach(s.staff);
      if (!h || h.temporary) continue;
      const before = heads.get(h.id);
      if (before !== undefined && h.abilities.coaching > before) grew = true;
      heads.set(h.id, h.abilities.coaching);
    }
    // 最初のヘッドコーチは去り、後任が雇われて成長している
    expect(s.staff.members.some((m) => m.id === head.id)).toBe(false);
    expect(s.staff.departedIds).toContain(ob.id);
    expect(heads.size).toBeGreaterThanOrEqual(2);
    expect(grew).toBe(true);
    // 評判が上がれば枠が増え、ほかの役割も埋まる（年度初めの編成を終えてから数える）
    autoManageStaff(s);
    finishStaff(s);
    if (s.reputation.level >= 2) expect(s.staff.members.length).toBeGreaterThanOrEqual(2);
  }, 60_000);
});

describe("出場停止", () => {
  it("公式戦では出場停止の選手を選べず、練習試合では選べる", () => {
    const s = newGame("susp", "停止高校");
    finishStaff(s);
    const p = playerSchool(s).players[0];
    p.suspended = 1;
    s.pending = { type: "match", kind: "practice", opponentId: Object.keys(s.schools).find((id) => id !== s.playerSchoolId)! };
    expect(pendingIsOfficial(s)).toBe(false);
    expect(eligiblePlayers(s)).toContain(p);
    s.pending = { ...s.pending, kind: "prefQualifier" };
    expect(pendingIsOfficial(s)).toBe(true);
    expect(eligiblePlayers(s)).not.toContain(p);
    const setup = defaultSetup(s);
    expect(setup.lineup).not.toContain(p.id);
    expect(setup.bench).not.toContain(p.id);
  });
});
