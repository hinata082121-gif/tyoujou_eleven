import { describe, expect, it } from "vitest";
import { dateToDay, isMonthStart } from "../calendar";
import { FOCUS } from "../config/growth";
import { TESTS } from "../config/schoolEvents";
import { VISIBLE_DAYS } from "../config/calendar";
import { lineFor, reactionFor } from "../choice";
import { CHOICE_EVENTS, SCHOOL_CHOICES } from "../config/choiceEvents";
import { REACTION_LINES } from "../config/speech";
import { practiceOneDay, type GainMap } from "../practice";
import { Rng } from "../rng";
import { playerSchool } from "../season";
import { trustDownMult } from "../school/life";
import type { GameState } from "../types";
import { confirmCaptain, confirmChoice, confirmMonthly, finishStaff, newGame, pendingChoice, playCard, setPlayerFocus } from ".";
import { autoplayYears, autoStep, newAutoplayStats } from "./autoplay";
import { boardSquare, nextNonMatchPlan, yearSchedule } from "./board";

/** 年度初めの流れ（スタッフ → キャプテン → 月初の指示）を終える */
function start(seed: string) {
  const s = newGame(seed, "テスト高校");
  finishStaff(s);
  confirmCaptain(s, playerSchool(s).captainId!);
  return s;
}

/** 条件を満たすまで自動で進める（skilled） */
function runUntil(s: GameState, pred: (s: GameState) => boolean, max = 20000) {
  const st = newAutoplayStats();
  for (let i = 0; i < max && !pred(s); i++) autoStep(s, st, "skilled");
  return st;
}

describe("学校行事と月初の指示（R2）", () => {
  it("行事は決まった日にあり、4/1 はキャプテンの指名の後に月初の指示が出る", () => {
    const s = start("r2-dates");
    const at = (m: number, d: number) => s.calendar.squares[dateToDay(m, d)].major;
    expect(at(5, 11)).toMatchObject({ kind: "school", event: "testPrep", round: 0 });
    expect(at(5, 14)).toMatchObject({ kind: "school", event: "test", round: 0 });
    expect(at(6, 17)).toMatchObject({ kind: "school", event: "sportsDay" });
    expect(at(9, 24)).toMatchObject({ kind: "school", event: "culturalFestival" });
    expect(at(11, 11)).toMatchObject({ kind: "school", event: "schoolTrip" });
    expect(at(2, 22)).toMatchObject({ kind: "school", event: "test", round: 4 });
    expect(s.pending).toMatchObject({ type: "monthly", month: 0 });
    // おまかせの選手は、指示の前に重点が決まっている
    expect(playerSchool(s).players.every((p) => (p.autoFocus?.length ?? 0) > 0)).toBe(true);
    expect(confirmMonthly(s)).toBeNull();
    expect(s.pending).toBeUndefined();
  });

  it("毎月 1 日に必ず止まり、1 年で 12 回指示を出す。テストは 5 回、選択肢のあるイベントが起きる", () => {
    const s = newGame("r2-year", "テスト高校");
    const stats = autoplayYears(s, 1, "skilled");
    expect(stats.monthly).toBe(12);
    expect(stats.tests).toHaveLength(TESTS.length);
    for (const t of stats.tests) expect(t.average).toBeGreaterThan(20);
    const choices = Object.values(stats.choices).reduce((a, b) => a + b, 0);
    // 人物マス（年 14 回前後）＋ 行事の選択 7 回 ＋ 合宿の夜 2 回
    expect(choices).toBeGreaterThanOrEqual(12);
    expect(stats.choices.testPrep).toBe(5);
    expect(stats.choices.sportsDay).toBe(1);
    expect(stats.choices.culturalFestival).toBe(1);
    // 学力・信頼度は全員が持つ
    for (const p of playerSchool(s).players) {
      expect(p.academic).toBeGreaterThanOrEqual(0);
      expect(p.trust).toBeGreaterThanOrEqual(0);
    }
  }, 120000);

  it("重点は経験点の一部を回すだけで、合計は変えない", () => {
    const s = start("r2-focus");
    const p = playerSchool(s).players.find((x) => x.mainPosition !== "GK")!;
    const a = structuredClone(p);
    const b = structuredClone(p);
    for (const x of [a, b]) {
      x.fitness = 100;
      x.condition = 0;
      x.injuryDays = 0;
    }
    const ga: GainMap = {};
    const gb: GainMap = {};
    practiceOneDay(Rng.fromSeed("f"), [a], "shoot", 1, ga, {});
    practiceOneDay(Rng.fromSeed("f"), [b], "shoot", 1, gb, { focus: () => ({ stats: ["speed"], share: FOCUS.share }) });
    const sum = (g: GainMap) => Object.values(g[p.id] ?? {}).reduce((x, y) => x + (y ?? 0), 0);
    expect(sum(gb)).toBeCloseTo(sum(ga), 6);
    expect(gb[p.id].speed).toBeCloseTo(sum(ga) * FOCUS.share, 6);
    expect(gb[p.id].shooting!).toBeLessThan(ga[p.id].shooting!);
  });

  it("重点は 1〜2 個。おまかせに戻すと AI が決め直す", () => {
    const s = start("r2-focus2");
    const p = playerSchool(s).players[0];
    expect(setPlayerFocus(s, p.id, ["speed", "stamina", "decision"])).not.toBeNull();
    expect(setPlayerFocus(s, p.id, ["speed"])).toBeNull();
    expect(p.focus).toEqual(["speed"]);
    expect(p.autoFocus).toBeUndefined();
    expect(setPlayerFocus(s, p.id, null)).toBeNull();
    expect(p.focus).toBeUndefined();
    expect(p.autoFocus?.length).toBeGreaterThan(0);
  });

  it("テストで赤点だった部員は補習で練習に出られない（試合には出られる）", () => {
    const s = start("r2-test");
    confirmMonthly(s);
    const ps = playerSchool(s).players;
    for (const p of ps) p.academic = 5;
    runUntil(s, (x) => x.pending?.type === "choice" && x.pending.eventId === "testPrep");
    expect(pendingChoice(s)?.options).toHaveLength(3);
    confirmChoice(s, 2); // いつもどおり
    expect(s.school?.testPrep?.policy).toBe("normal");
    runUntil(s, (x) => !!x.school?.lastTest);
    const t = s.school!.lastTest!;
    expect(t.failed.length).toBeGreaterThan(ps.length / 2);
    const failed = ps.find((p) => p.id === t.failed[0])!;
    expect(failed.remedialDays).toBe(TESTS[0].remedialDays);
    expect(failed.lastTestScore).toBeLessThan(30);
  });

  it("体育祭・文化祭は選択肢で、効果の札とせりふが返る", () => {
    const s = start("r2-sports");
    runUntil(s, (x) => x.pending?.type === "choice" && x.pending.eventId === "sportsDay");
    const v = pendingChoice(s)!;
    expect(v.bg).toBe("sportsDay");
    expect(v.intro.length).toBeGreaterThan(0);
    const o = confirmChoice(s, 0)!;
    expect(o.lines!.length).toBeGreaterThanOrEqual(2);
    expect(o.effects!.some((e) => e.label === "リレー")).toBe(true);
    expect(s.pending).toBeUndefined();
  });
});

describe("すごろくの見え方（R2）", () => {
  it("10 日先までだけ見え、試合の日は通常マスに見える。次の予定は試合以外", () => {
    const s = start("r2-board");
    confirmMonthly(s);
    const pos = s.calendar.position;
    const sq = s.calendar.squares;
    expect(boardSquare(s, sq[pos + VISIBLE_DAYS + 1]).type).toBe("hidden");
    // 4 月のリーグ戦の日（10 日以内）
    const league = sq.find((x) => x.day > pos && x.day <= pos + VISIBLE_DAYS && x.major?.kind === "league");
    if (league) expect(boardSquare(s, league).type).toBe(league.baseType);
    // 月の 1 日には「指示」の印
    const first = sq.find((x) => x.day > pos && isMonthStart(x.day))!;
    expect(boardSquare(s, first).monthly).toBe(true);
    const next = nextNonMatchPlan(s)!;
    expect(["月初の指示", "テスト前"]).toContain(next.label);
    // 予定表は 12 か月。4 月の練習試合は申し込みが届いたものだけ
    const sch = yearSchedule(s);
    expect(sch).toHaveLength(12);
    expect(sch[0].items.some((i) => i.kind === "monthly")).toBe(true);
  });

  it("練習試合は 10 日前に申し込みが届き、その相手と対戦する", () => {
    const s = start("r2-offer");
    confirmMonthly(s);
    runUntil(s, (x) => x.pending?.type === "match" && x.pending.kind === "practice");
    const p = s.pending as { opponentId: string };
    expect(s.school?.offers?.[s.calendar.position]).toBe(p.opponentId);
  });
});

describe("選択肢のあるイベントと信頼度（R2）", () => {
  it("26 種以上あり、どの選択肢にも結果がある。せりふは話し方の型ごと", () => {
    expect(CHOICE_EVENTS.length).toBeGreaterThanOrEqual(26);
    for (const d of [...CHOICE_EVENTS, ...Object.values(SCHOOL_CHOICES)]) {
      expect(d.options.length).toBeGreaterThanOrEqual(2);
      for (const o of d.options) expect(o.results.length).toBeGreaterThanOrEqual(1);
    }
    const s = start("r2-speech");
    const p = playerSchool(s).players[0];
    p.personality = "passionate";
    expect(lineFor(p, REACTION_LINES.fired)).toBe(REACTION_LINES.fired.hot);
    p.personality = "cautious";
    expect(reactionFor(p, "glad")).toBe(REACTION_LINES.glad.timid);
  });

  it("人物マスに止まると選択肢のイベントが起き、選ぶと効果と結果の札が出る", () => {
    const s = start("r2-person");
    confirmMonthly(s);
    const pos = s.calendar.position;
    const target = s.calendar.squares.find((x) => x.day > pos + 1 && x.day <= pos + 5 && !x.major)!;
    target.baseType = "person";
    s.calendar.hand[0] = { id: "x", value: (target.day - pos) as 1, practice: "pass" };
    // 途中で止まる日が無いことを確かめてから使う
    const r = playCard(s, "x")!;
    expect(r.to).toBe(target.day);
    expect(s.pending?.type).toBe("choice");
    const v = pendingChoice(s)!;
    expect(v.options.length).toBeGreaterThanOrEqual(2);
    const o = confirmChoice(s, 0)!;
    expect(o.kind).toBe(`choice:${v.def.id}`);
    expect(o.lines![0].speaker).toBeNull();
    expect(s.pending).toBeUndefined();
    expect(s.eventMemory?.[v.def.id]).toBeDefined();
  });

  it("信頼度が高いほど調子が下がりにくい。キャプテンに指名されると信頼度が上がる", () => {
    const s = newGame("r2-trust", "テスト高校");
    finishStaff(s);
    const p = playerSchool(s).players.find((x) => x.id !== playerSchool(s).captainId)!;
    const before = p.trust!;
    confirmCaptain(s, p.id);
    expect(p.trust).toBe(Math.min(100, before + 10));
    p.trust = 100;
    expect(trustDownMult(p)).toBeCloseTo(0.7);
    p.trust = 0;
    expect(trustDownMult(p)).toBeCloseTo(1.3);
  });
});

describe("イベントのせりふ（R2。PLAN 5.3）", () => {
  it("すごろくのイベントすべてに、型ごとのせりふがある", async () => {
    const { EVENTS } = await import("../config/events");
    const { EVENT_LINES } = await import("../config/eventLines");
    for (const e of EVENTS) expect(EVENT_LINES[e.id], e.id).toBeDefined();
    for (const k of ["green", "yellow", "training", "donation", "practiceInjury", "staffFix"]) expect(EVENT_LINES[k], k).toBeDefined();
  });

  it("出来事に地の文と人物のせりふが付き（先輩の技は先輩 → 後輩の順）、埋め込みの残りがない", async () => {
    const { addEventLines } = await import("../events/speech");
    const s = start("r2-lines");
    const school = playerSchool(s);
    const p = school.players.find((x) => x.status === "active")!;
    const snack = addEventLines(s, { title: "差し入れ", text: "保護者会から差し入れが届いた。部員の体力が回復した。", tone: "good", kind: "snack", cast: [] });
    expect(snack.lines![0]).toEqual({ speaker: null, text: "保護者会から差し入れが届いた。" });
    expect(snack.lines![1].speaker?.id).toBe(school.captainId);
    const teach = addEventLines(s, {
      title: "先輩の背中",
      text: `${p.name}が後輩に自分の技を伝えた。`,
      tone: "good",
      kind: "seniorTeach",
      cast: [
        { kind: "player", id: p.id },
        { kind: "player", id: school.players[1].id },
      ],
    });
    expect(teach.lines!.map((l) => l.speaker?.id ?? null)).toEqual([null, p.id, school.players[1].id]);
    for (const l of [...snack.lines!, ...teach.lines!]) expect(l.text).not.toMatch(/[{}]/);
  });
});
