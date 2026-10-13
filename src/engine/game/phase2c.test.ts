import { describe, expect, it } from "vitest";
import { branchPreview, dateToDay } from "../calendar";
import { seedOrder, totalRounds } from "../competition/bracket";
import { carriedFitness } from "../competition/simulate";
import { CAMP } from "../config/camp";
import { BRANCH } from "../config/calendar";
import { RECOVERY_CAP } from "../config/facilities";
import { STAFF_EFFECTS } from "../config/staff";
import { defaultCampPolicy } from "../camp";
import { facilitiesForReputation, facilityPracticeBonus, grantReputationFacilities, totalRecoveryMult } from "../facilities";
import { practiceStaffMult } from "../staff";
import { meterSd, resolveReplies } from "../scout";
import { Rng } from "../rng";
import { playerSchool } from "../season";
import type { GameState } from "../types";
import {
  advanceToNextMatch,
  chooseBranch,
  confirmCamp,
  eligiblePlayers,
  inTournamentRun,
  newGame,
  summerNationalSize,
  visitScout,
} from ".";
import { autoplayYears, autoStep, newAutoplayStats } from "./autoplay";

/** 条件を満たすまで自動で進める（skilled） */
function runUntil(s: GameState, pred: (s: GameState) => boolean, max = 20000, scout = true) {
  const st = newAutoplayStats();
  for (let i = 0; i < max && !pred(s); i++) autoStep(s, st, "skilled", { scout });
  expect(pred(s)).toBe(true);
}

describe("夏の全国大会（P2c）", () => {
  it("51 校で、開催県は 2 校。同じ県の 2 校は別の半分に入る", () => {
    const s = newGame("p2c-summer", "テスト高校", "shizuoka");
    expect(summerNationalSize(s)).toBe(51);
    const host = s.prefectures.find((p) => p.id === s.competitions.summerHostPrefId)!;
    expect(host.summerReps).toBe(2);
    expect(["tokyo", "kanagawa", "osaka"]).not.toContain(host.id);
    runUntil(s, (x) => !!x.competitions.summerNational);
    const b = s.competitions.summerNational!;
    const ids = b.rounds[0].flatMap((m) => [m.a, m.b]).filter((x): x is string => !!x);
    expect(new Set(ids).size).toBe(51);
    // 1 回戦の並び（シード順）から、どちらの半分かを調べる
    const size = 1 << totalRounds(b);
    const order = seedOrder(size);
    const half = new Map<string, number>();
    b.rounds[0].forEach((m, i) => {
      for (const [k, id] of [m.a, m.b].entries()) if (id) half.set(id, order.indexOf(order[i * 2 + k]) < size / 2 ? 0 : 1);
    });
    const byPref = new Map<string, string[]>();
    for (const id of ids) byPref.set(s.schools[id].prefectureId, [...(byPref.get(s.schools[id].prefectureId) ?? []), id]);
    for (const [, list] of byPref) if (list.length === 2) expect(half.get(list[0])).not.toBe(half.get(list[1]));
    // 本戦は連戦：日程が続いている
    const days = b.roundDays;
    expect(days[days.length - 1] - days[0]).toBeLessThanOrEqual(7);
  });
});

describe("新人戦（P2c）", () => {
  it("1・2 年生だけが出られ、県大会の上位 8 校が次の夏の県予選のシードになる", () => {
    const s = newGame("p2c-rookie", "テスト高校");
    runUntil(s, (x) => x.pending?.type === "match" && x.pending.kind === "rookiePref");
    expect(eligiblePlayers(s).every((p) => p.grade <= 2)).toBe(true);
    runUntil(s, (x) => !!x.competitions.rookieRegion);
    const seeds = s.competitions.rookieSeeds!;
    expect(seeds.length).toBe(8);
    runUntil(s, (x) => x.year === 2 && !!x.competitions.summerQualifier);
    const first = s.competitions.summerQualifier!.rounds[0].flatMap((m) => [m.a, m.b]);
    // シード 1・2 はブラケットの両端
    expect(first[0]).toBe(seeds[0]);
    expect(first[first.length - 1] === seeds[1] || first.includes(seeds[1])).toBe(true);
  });
});

describe("合宿（P2c）", () => {
  it("ポジションごとの方針で数日まとめて練習し、ふだんより経験点が多く、体力も多く減る。正しくない方針は受け付けない", () => {
    const s = newGame("p2c-camp", "テスト高校");
    runUntil(s, (x) => x.pending?.type === "camp");
    const school = playerSchool(s);
    for (const p of school.players) p.fitness = 100;
    const before = school.players.reduce((a, p) => a + p.fitness, 0);
    const pos = s.calendar.position;
    expect(confirmCamp(s, { ...defaultCampPolicy(), GK: "shoot" })).toBeNull();
    const r = confirmCamp(s, defaultCampPolicy())!;
    expect(r).not.toBeNull();
    expect(r.days).toBe(5);
    expect(s.calendar.position).toBe(pos + 5);
    expect(s.pending).toBeUndefined();
    expect(school.players.reduce((a, p) => a + p.fitness, 0)).toBeLessThan(before);
    expect(r.growth.some((g) => g.overallGain > 0)).toBe(true);
    expect(CAMP.expMult).toBeGreaterThan(1);
  });
});

describe("分岐マス（P2c）", () => {
  it("年に数か所あり、選んだ道のマスに変わる。最初の数マスだけ正確に見える", () => {
    const s = newGame("p2c-branch", "テスト高校");
    const branches = s.calendar.branches!;
    // P3 でリーグ戦の大マスが入り、分岐を置ける場所が減った（年 3〜8 か所）
    expect(branches.length).toBeGreaterThanOrEqual(3);
    for (const b of branches) {
      expect(b.paths.length).toBeGreaterThanOrEqual(2);
      expect(b.paths.length).toBeLessThanOrEqual(3);
      const pv = branchPreview(b);
      expect(pv[0].first.length).toBe(BRANCH.revealFirst);
      expect(pv[0].hidden).toBe(1);
    }
    runUntil(s, (x) => x.pending?.type === "branch");
    const day = (s.pending as { day: number }).day;
    const b = s.calendar.branches!.find((x) => x.day === day)!;
    expect(chooseBranch(s, 9)).not.toBeNull();
    expect(chooseBranch(s, 1)).toBeNull();
    b.paths[1].squares.forEach((t, i) => {
      const sq = s.calendar.squares[day + 1 + i];
      if (!sq.major) expect(sq.baseType).toBe(t);
    });
  });
});

describe("連戦の疲労（P2c）", () => {
  it("CPU 校は本戦で体力を持ち越し、日がたつと回復する。自校は本戦の間は「次の試合へ」で進む", () => {
    const s = newGame("p2c-fatigue", "テスト高校");
    runUntil(s, (x) => !!x.competitions.summerNational && x.competitions.summerNational.roundsDone >= 1);
    const b = s.competitions.summerNational!;
    const alive = b.rounds[b.roundsDone].flatMap((m) => [m.a, m.b]).filter((id): id is string => !!id && !s.schools[id].isPlayer);
    const carried = alive.filter((id) => s.schools[id].carryFitness);
    expect(carried.length).toBeGreaterThan(0);
    const sch = s.schools[carried[0]];
    const d0 = sch.carryFitness!.day;
    const f0 = carriedFitness(sch, d0)!;
    const f1 = carriedFitness(sch, d0 + 1)!;
    const id = Object.keys(f0).find((k) => f0[k] < 90)!;
    expect(f1[id]).toBeGreaterThan(f0[id]);
    // 回復の倍率には上限がある
    expect(totalRecoveryMult(100, { ground: 3, trainingRoom: 3, careRoom: 3, dorm: 3 })).toBeLessThanOrEqual(RECOVERY_CAP);
  });

  it("本戦で勝ち残っている間はカードを使わず、調整日で次の試合の日まで進む", () => {
    // 自校を強くして、本戦に出る
    const s = newGame("p2c-run", "テスト高校");
    for (const p of playerSchool(s).players) for (const k of Object.keys(p.stats) as (keyof typeof p.stats)[]) p.stats[k] = 95;
    runUntil(s, (x) => inTournamentRun(x), 40000);
    const pos = s.calendar.position;
    const r = advanceToNextMatch(s)!;
    expect(r.to).toBeGreaterThan(pos);
    expect(r.practice).toBe("調整");
  });
});

describe("設備（P2c）", () => {
  it("評判で整備され、下がらない。練習の効率はスタッフと合わせて上限まで", () => {
    const h = { year: 1, facilities: facilitiesForReputation(0), facilityLog: [], facilityGrantedLevel: 0 as const };
    expect(Object.values(h.facilities).every((v) => v === 0)).toBe(true);
    const holder = { ...h, facilityGrantedLevel: 0 as 0 | 1 | 2 | 3 | 4 };
    grantReputationFacilities(holder, 4);
    expect(holder.facilities).toEqual(facilitiesForReputation(4));
    const snapshot = { ...holder.facilities };
    grantReputationFacilities(holder, 1);
    expect(holder.facilities).toEqual(snapshot);
    const full = { ground: 3, trainingRoom: 3, careRoom: 3, dorm: 3 } as const;
    expect(facilityPracticeBonus(full, "shoot")).toBeGreaterThan(0);
    const s = newGame("p2c-fac", "テスト高校");
    const p = playerSchool(s).players[0];
    expect(practiceStaffMult(s.staff, p, "shoot", 1)).toBeLessThanOrEqual(1 + STAFF_EFFECTS.practiceCap + 1e-9);
  });
});

describe("特待生スカウト（P2c）", () => {
  it("実績とスカウティングで推定が正確になり、返事は枠まで。入部が決まった中学生は 4 月に特待生として入る", () => {
    expect(meterSd(3, 0)).toBeLessThan(meterSd(0, 0));
    expect(meterSd(0, 100)).toBeLessThan(meterSd(0, 0));
    const s = newGame("p2c-scout", "テスト高校");
    runUntil(s, (x) => !!x.scout && x.scout.cards > 0 && !x.pending && !x.activeMatch && !inTournamentRun(x), 20000, false);
    const target = s.scout!.candidates[0];
    const r = visitScout(s, target.id)!;
    expect(r.visit.candidate.reaction).toBeDefined();
    expect(target.status).toBe("courting");
    // 返事：全員を「良好」にしても枠を超えない
    const sc = structuredClone(s.scout!);
    for (const c of sc.candidates) {
      c.status = "courting";
      c.reaction = "good";
      c.rivals = [];
    }
    const res = resolveReplies(Rng.fromSeed("x"), sc, 2);
    expect(res.joined.length).toBeLessThanOrEqual(2);
    // 4 月に特待生として入る
    s.scout!.candidates.forEach((c) => {
      if (c.status === "courting") c.reaction = "good";
      c.rivals = [];
    });
    runUntil(s, (x) => x.year === 2);
    const committed = s.history.length > 0 ? playerSchool(s).players.filter((p) => p.admission === "scholarship") : [];
    for (const p of committed) {
      expect(p.grade).toBe(1);
      expect(p.enrolledYear).toBe(2);
    }
    expect(dateToDay(11, 1)).toBeLessThan(dateToDay(2, 28));
  });
});

describe("カレンダーの流れ（P2c）", () => {
  it("12 年分、すべての大会・合宿・スカウト・分岐を通して自動で進められる", () => {
    const s = newGame("p2c-flow", "テスト高校");
    const st = autoplayYears(s, 12, "skilled");
    expect(s.year).toBe(13);
    expect(s.history.length).toBe(12);
    for (const h of s.history) {
      expect(h.summerResult).toBeDefined();
      expect(h.rookieResult).toBeDefined();
    }
    const kinds = new Set(st.matches.map((m) => m.kind));
    for (const k of ["practice", "prefQualifier", "summerQualifier", "rookiePref"]) expect(kinds.has(k as never)).toBe(true);
    expect(s.log.length).toBeGreaterThan(0);
  }, 120000);
});
