/**
 * 学校行事の処理（R2。SPEC 18.2・PHASE_R2_PLAN 3章）：テスト前の方針・テストと補習・体育祭のリレー・修学旅行・
 * 入学式と卒業式の場面。日程は config/schoolEvents.ts、学力とテストの数値は config/academics.ts。
 */
import { dateToDay } from "../calendar";
import { TEST, TEST_PREP } from "../config/academics";
import { SCHOOL_LINES } from "../config/schoolLines";
import { NO_PRACTICE_EVENTS, SCHOOL_DATES, SCHOOL_TRIP, SPORTS_DAY, TESTS } from "../config/schoolEvents";
import { PERSONALITY_SPEECH, type Lines } from "../config/speech";
import type { CastRef, EffectBadge, EventOutcome, SceneLine } from "../events";
import { overall } from "../player/rating";
import { shiftCondition } from "../practice";
import type { Rng } from "../rng";
import { playerSchool } from "../season";
import type { GameState, Player, SchoolEventId, Square, TestPrepPolicy } from "../types";
import { addAcademic } from "./life";

const family = (name: string) => name.split(" ")[0];
const say = (p: Player, lines: Lines, vars: Record<string, string | number> = {}) =>
  lines[PERSONALITY_SPEECH[p.personality]].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
const pcast = (p: Player): CastRef => ({ kind: "player", id: p.id });
const active = (state: GameState) => playerSchool(state).players.filter((p) => p.status === "active");

/** その日の学校行事 */
export function schoolEventOf(sq: Square | undefined): SchoolEventId | undefined {
  return sq?.major?.kind === "school" ? sq.major.event : undefined;
}

/** その選手が練習に出られないか（補習・修学旅行など） */
export const isAbsent = (p: Player) => (p.remedialDays ?? 0) > 0 || (p.awayDays ?? 0) > 0;

/** その日のテスト前の方針（テスト前の期間でなければ null） */
export function prepPolicyOn(state: GameState, day: number): TestPrepPolicy | null {
  const t = state.school?.testPrep;
  if (!t) return null;
  return day < t.testDay && day >= t.testDay - 3 ? t.policy : null;
}

/** その日は部全体の練習がないか（テスト・体育祭・文化祭、テスト前に「休んで勉強」を選んだ日） */
export function noPracticeDay(state: GameState, day: number): boolean {
  const ev = schoolEventOf(state.calendar.squares[day]);
  if (ev && NO_PRACTICE_EVENTS.includes(ev)) return true;
  const policy = prepPolicyOn(state, day);
  return policy !== null && !TEST_PREP[policy].practice;
}

/** 練習の補正（テスト前の「短くする」） */
export function prepPracticeMults(state: GameState, day: number): { exp: number; fitness: number } {
  const policy = prepPolicyOn(state, day);
  return policy ? { exp: TEST_PREP[policy].expMult, fitness: TEST_PREP[policy].fitnessCostMult } : { exp: 1, fitness: 1 };
}

/** 1 日の始まり：修学旅行の出発の日なら、2 年生を練習から外す */
export function startSchoolDay(state: GameState, day: number) {
  if (day !== dateToDay(...SCHOOL_DATES.schoolTrip)) return;
  if (schoolEventOf(state.calendar.squares[day]) !== "schoolTrip") return;
  for (const p of active(state)) if (p.grade === SCHOOL_TRIP.grade) p.awayDays = SCHOOL_TRIP.days;
}

/** 1 日の終わり：補習・修学旅行の残り日数を減らす。修学旅行から帰った 2 年生は、気分転換で調子が上がることがある */
export function endSchoolDay(state: GameState, rng: Rng, day: number): string[] {
  const back: string[] = [];
  for (const p of active(state)) {
    if ((p.remedialDays ?? 0) > 0) {
      p.remedialDays!--;
      if (p.remedialDays === 0) delete p.remedialDays;
    }
    if ((p.awayDays ?? 0) > 0) {
      p.awayDays!--;
      if (p.awayDays === 0) {
        delete p.awayDays;
        if (day === dateToDay(...SCHOOL_DATES.schoolTrip) + SCHOOL_TRIP.days - 1 && rng.chance(SCHOOL_TRIP.returnConditionChance)) {
          shiftCondition(p, 1);
          back.push(p.name);
        }
      }
    }
  }
  return back;
}

/** テスト前の方針を決める（そのテストの日まで有効） */
export function setTestPrep(state: GameState, testIndex: number, policy: TestPrepPolicy) {
  const t = TESTS[testIndex];
  if (!t) return;
  (state.school ??= {}).testPrep = { testDay: dateToDay(t.test[0], t.test[1]), policy };
}

/** テストの日：点数を出し、赤点の部員は補習（練習に出られない） */
export function runTest(state: GameState, rng: Rng, testIndex: number, day: number): EventOutcome {
  const def = TESTS[testIndex] ?? TESTS[0];
  const school = (state.school ??= {});
  const policy: TestPrepPolicy = school.testPrep && school.testPrep.testDay === day ? school.testPrep.policy : "normal";
  const prep = TEST_PREP[policy];
  const ps = active(state);
  const scores: { p: Player; score: number }[] = [];
  for (const p of ps) {
    if (prep.academic) addAcademic(p, prep.academic);
    const score = Math.round(Math.max(0, Math.min(100, (p.academic ?? 50) + prep.scoreBonus + rng.normal(0, TEST.sd))));
    p.lastTestScore = score;
    scores.push({ p, score });
  }
  const failed = scores.filter((s) => s.score < TEST.failBelow);
  for (const { p } of failed) {
    p.remedialDays = def.remedialDays;
    addAcademic(p, TEST.remedialAcademic);
  }
  const average = scores.length > 0 ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length) : 0;
  const top = [...scores].sort((a, b) => b.score - a.score)[0];
  school.lastTest = { day, label: def.label, average, top: top ? { id: top.p.id, score: top.score } : undefined, failed: failed.map((f) => f.p.id) };
  delete school.testPrep;

  const lines: SceneLine[] = [{ speaker: null, text: `${def.label}の結果が返ってきた。部員の平均は${average}点。` }];
  if (top) lines.push({ speaker: pcast(top.p), text: say(top.p, SCHOOL_LINES.testTop, { score: top.score }) });
  const cast: CastRef[] = top ? [pcast(top.p)] : [];
  if (failed.length > 0) {
    const f = failed[0].p;
    lines.push({ speaker: null, text: `赤点は${failed.map((x) => family(x.p.name)).join("・")}。テストの次の日から${def.remedialDays}日間、補習で練習に出られない。` });
    if (f.id !== top?.p.id) {
      lines.push({ speaker: pcast(f), text: say(f, SCHOOL_LINES.testFail, { n: def.remedialDays }) });
      cast.push(pcast(f));
    }
  } else {
    const cap = ps.find((p) => p.id === playerSchool(state).captainId);
    if (cap) {
      lines.push({ speaker: pcast(cap), text: say(cap, SCHOOL_LINES.testAllPass) });
      if (cap.id !== top?.p.id) cast.push(pcast(cap));
    }
  }
  const effects: EffectBadge[] = [{ label: "平均点", value: `${average}点`, tone: "info" }];
  if (top) effects.push({ label: `1位 ${family(top.p.name)}`, value: `${top.score}点`, tone: "good" });
  effects.push(failed.length > 0 ? { label: `赤点 ${failed.length}人`, value: `補習 ${def.remedialDays}日`, tone: "bad" } : { label: "赤点", value: "なし", tone: "good" });
  return { title: def.label, text: lines[0].text, tone: failed.length > 0 ? "bad" : "good", kind: "school:test", cast, lines, effects };
}

/** 体育祭のリレー（本気）：チームのスピードの平均で勝つ確率が決まる */
export function runRelay(state: GameState, rng: Rng, addReputation: (d: number) => void): { badges: EffectBadge[]; won: boolean } {
  const ps = active(state).filter((p) => p.injuryDays <= 0);
  const avgSpeed = ps.length > 0 ? ps.reduce((a, p) => a + p.stats.speed, 0) / ps.length : 50;
  const chance = Math.max(0.15, Math.min(0.85, SPORTS_DAY.winBase + (avgSpeed - 50) * SPORTS_DAY.winPerSpeed));
  const won = rng.chance(chance);
  const badges: EffectBadge[] = [];
  if (won) {
    addReputation(SPORTS_DAY.winReputation);
    badges.push({ label: "リレー", value: "優勝", tone: "good" });
    badges.push({ label: "評判", value: "少し上がった", tone: "good" });
    let n = 0;
    for (const p of ps) {
      if (!rng.chance(SPORTS_DAY.allOutConditionChance)) continue;
      shiftCondition(p, 1);
      n++;
    }
    if (n > 0) badges.push({ label: `${n}人`, value: "調子 ＋1", tone: "good" });
  } else badges.push({ label: "リレー", value: "惜しくも負け", tone: "info" });
  if (ps.length > 0 && rng.chance(SPORTS_DAY.allOutInjuryChance)) {
    const p = rng.pick(ps);
    p.injuryDays = rng.int(SPORTS_DAY.injuryDays[0], SPORTS_DAY.injuryDays[1]);
    state.staff.season.injuryDays += p.injuryDays;
    badges.push({ label: `${family(p.name)} ケガ`, value: `全治${p.injuryDays}日`, tone: "bad" });
  }
  return { badges, won };
}

/** リレーの結果のせりふ */
export function relayLine(p: Player, won: boolean): string {
  return say(p, won ? SCHOOL_LINES.relayWin : SCHOOL_LINES.relayLose);
}

/** 修学旅行の出発の場面 */
export function tripOutcome(state: GameState): EventOutcome {
  const sophomores = active(state).filter((p) => p.grade === SCHOOL_TRIP.grade);
  const speaker = [...sophomores].sort((a, b) => overall(b) - overall(a))[0];
  const lines: SceneLine[] = [{ speaker: null, text: `今日から${SCHOOL_TRIP.days}日間、2年生は修学旅行。そのあいだは1年生${active(state).some((p) => p.grade === 3) ? "と3年生" : ""}で練習する。` }];
  if (speaker) lines.push({ speaker: pcast(speaker), text: say(speaker, SCHOOL_LINES.tripLeave) });
  return {
    title: "修学旅行",
    text: lines[0].text,
    tone: "info",
    kind: "school:schoolTrip",
    cast: speaker ? [pcast(speaker)] : [],
    lines,
    effects: [{ label: `2年生 ${sophomores.length}人`, value: `練習なし ${SCHOOL_TRIP.days}日`, tone: "info" }],
  };
}

/** 入学式の場面（新入生の代表のあいさつと、キャプテンの歓迎） */
export function entranceOutcome(state: GameState): EventOutcome {
  const school = playerSchool(state);
  const ps = active(state);
  const fresh = ps.filter((p) => p.grade === 1).sort((a, b) => overall(b) - overall(a))[0];
  const cap = ps.find((p) => p.id === school.captainId) ?? ps.filter((p) => p.grade === 3).sort((a, b) => overall(b) - overall(a))[0];
  const n = ps.filter((p) => p.grade === 1).length;
  const lines: SceneLine[] = [{ speaker: null, text: `桜の咲く校門。新入生${n}人がサッカー部に入部した。` }];
  const cast: CastRef[] = [];
  if (fresh) {
    lines.push({ speaker: pcast(fresh), text: say(fresh, SCHOOL_LINES.entranceFreshman, { school: school.name }) });
    cast.push(pcast(fresh));
  }
  if (cap && cap.id !== fresh?.id) {
    lines.push({ speaker: pcast(cap), text: say(cap, SCHOOL_LINES.entranceCaptain) });
    cast.push(pcast(cap));
  }
  return { title: "入学式", text: lines[0].text, tone: "good", kind: "school:entrance", cast, lines, effects: [{ label: "新入部員", value: `${n}人`, tone: "good" }] };
}

/** 卒業式の場面（3 年生のキャプテン、いなければ総合の一番高い 3 年生） */
export function graduationOutcome(state: GameState): EventOutcome {
  const school = playerSchool(state);
  const seniors = school.players.filter((p) => p.grade === 3);
  const sp = seniors.find((p) => p.id === school.captainId) ?? [...seniors].sort((a, b) => overall(b) - overall(a))[0];
  const lines: SceneLine[] = [{ speaker: null, text: `体育館で卒業式が行われた。3年生${seniors.length}人が、今日でサッカー部を卒業する。` }];
  if (sp) {
    lines.push({ speaker: pcast(sp), text: say(sp, SCHOOL_LINES.graduationSenior) });
    lines.push({ speaker: pcast(sp), text: say(sp, SCHOOL_LINES.graduationJunior) });
  }
  return { title: "卒業式", text: lines[0].text, tone: "info", kind: "school:graduation", cast: sp ? [pcast(sp)] : [], lines };
}
