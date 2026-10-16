import { BRANCH, CAMP_DATES, CARD_PRACTICE_WEIGHTS, CARD_VALUE_WEIGHTS, DAYS_IN_YEAR, FIXED_DATES, MONTH_DAYS, MONTH_NUMBERS, PRACTICE_MATCH, SQUARE_WEIGHTS } from "../config/calendar";
import { SCHOOL_DATES, TESTS } from "../config/schoolEvents";
import { NATIONAL_DATES, PREF_QUALIFIER_DATES, ROOKIE_PREF_DATES, ROOKIE_REGION_DATES, SUMMER_NATIONAL_DATES, SUMMER_QUALIFIER_DATES } from "../config/competitions";
import type { Rng } from "../rng";
import {
  PRACTICE_KINDS,
  type Branch,
  type BranchTheme,
  type Calendar,
  type CompetitionKind,
  type MajorKind,
  type MoveCard,
  type PracticeKind,
  type RandomSquareType,
  type Square,
} from "../types";

// ================= 日付 =================

/** 4/1 を 0 とした日のインデックス → [月, 日] */
export function dayToDate(day: number): [number, number] {
  let d = day;
  for (let i = 0; i < MONTH_DAYS.length; i++) {
    if (d < MONTH_DAYS[i]) return [MONTH_NUMBERS[i], d + 1];
    d -= MONTH_DAYS[i];
  }
  return [3, 31];
}

export function dateToDay(month: number, date: number): number {
  let day = 0;
  for (let i = 0; i < MONTH_NUMBERS.length; i++) {
    if (MONTH_NUMBERS[i] === month) return day + date - 1;
    day += MONTH_DAYS[i];
  }
  throw new Error(`invalid date ${month}/${date}`);
}

export function formatDay(day: number): string {
  const [m, d] = dayToDate(day);
  return `${m}月${d}日`;
}

// ================= マス =================

export function prefQualifierDays(rounds: number): number[] {
  return PREF_QUALIFIER_DATES.slice(PREF_QUALIFIER_DATES.length - rounds).map(([m, d]) => dateToDay(m, d));
}

export function nationalDays(rounds: number): number[] {
  return NATIONAL_DATES.slice(NATIONAL_DATES.length - rounds).map(([m, d]) => dateToDay(m, d));
}

/** 大会ごとの日程（[月, 日]） */
export const COMPETITION_DATES: Record<CompetitionKind, [number, number][]> = {
  prefQualifier: PREF_QUALIFIER_DATES,
  national: NATIONAL_DATES,
  summerQualifier: SUMMER_QUALIFIER_DATES,
  summerNational: SUMMER_NATIONAL_DATES,
  rookiePref: ROOKIE_PREF_DATES,
  rookieRegion: ROOKIE_REGION_DATES,
};

/** 大会のラウンドの日（ラウンド数が少なければ後ろから使う） */
export function competitionDays(kind: CompetitionKind, rounds: number): number[] {
  const dates = COMPETITION_DATES[kind];
  return dates.slice(Math.max(0, dates.length - rounds)).map(([m, d]) => dateToDay(m, d));
}

/** 合宿の日（出発の大マスの翌日から） */
export function campDays(season: "summer" | "winter"): number[] {
  const c = CAMP_DATES[season];
  const depart = dateToDay(c.depart[0], c.depart[1]);
  return Array.from({ length: c.days }, (_, i) => depart + 1 + i);
}

function randomBaseType(rng: Rng, mult: Partial<Record<RandomSquareType, number>> = {}): RandomSquareType {
  const types = Object.keys(SQUARE_WEIGHTS) as RandomSquareType[];
  return rng.weighted(types, (t) => SQUARE_WEIGHTS[t] * (mult[t] ?? 1));
}

/** P2c で足した日程（夏の全国大会・新人戦のラウンド数、合宿・スカウトの返事・分岐マス） */
export interface CalendarPlan {
  rounds: Partial<Record<CompetitionKind, number>>;
  camps: boolean;
  scoutReply: boolean;
  branches: boolean;
  /** P3：自校の県リーグの節の日（大マス。round = 節） */
  leagueDays?: number[];
  /** R2：学校行事（テスト前・テスト・体育祭・文化祭・修学旅行）を入れる */
  school?: boolean;
}

/** 学校行事のマス（R2。PHASE_R2_PLAN 3.1）。round はテストの番号（TESTS の何番目か） */
export function schoolEventDays(): { day: number; event: NonNullable<NonNullable<Square["major"]>["event"]>; round?: number }[] {
  const out: ReturnType<typeof schoolEventDays> = [];
  TESTS.forEach((t, i) => {
    out.push({ day: dateToDay(t.prep[0], t.prep[1]), event: "testPrep", round: i });
    out.push({ day: dateToDay(t.test[0], t.test[1]), event: "test", round: i });
  });
  out.push({ day: dateToDay(...SCHOOL_DATES.sportsDay), event: "sportsDay" });
  out.push({ day: dateToDay(...SCHOOL_DATES.culturalFestival), event: "culturalFestival" });
  out.push({ day: dateToDay(...SCHOOL_DATES.schoolTrip), event: "schoolTrip" });
  return out.sort((a, b) => a.day - b.day);
}

/** 月の初めの日（R2：月初の指示で必ず止まる日）か */
export function isMonthStart(day: number): boolean {
  return dayToDate(day)[1] === 1;
}

/** その日が年度の何か月目か（4 月 = 0） */
export function monthIndex(day: number): number {
  let d = day;
  for (let i = 0; i < MONTH_DAYS.length; i++) {
    if (d < MONTH_DAYS[i]) return i;
    d -= MONTH_DAYS[i];
  }
  return MONTH_DAYS.length - 1;
}

/** 1 年分（365 マス）のカレンダーを作る。plan を省くと Phase 2b までの日程 */
export function buildSquares(rng: Rng, prefRounds: number, nationalRounds: number, plan?: CalendarPlan): Square[] {
  return buildCalendarParts(rng, prefRounds, nationalRounds, plan).squares;
}

export function buildCalendarParts(rng: Rng, prefRounds: number, nationalRounds: number, plan?: CalendarPlan): { squares: Square[]; branches: Branch[] } {
  const squares: Square[] = Array.from({ length: DAYS_IN_YEAR }, (_, day) => ({ day, baseType: randomBaseType(rng) }));
  const setMajor = (day: number, kind: NonNullable<Square["major"]>["kind"], round?: number) => {
    squares[day].major = round === undefined ? { kind } : { kind, round };
  };
  setMajor(dateToDay(...FIXED_DATES.entrance), "entrance");
  setMajor(dateToDay(...FIXED_DATES.graduation), "graduation");
  setMajor(dateToDay(...FIXED_DATES.yearEnd), "yearEnd");
  prefQualifierDays(prefRounds).forEach((day, r) => setMajor(day, "prefQualifier", r));
  nationalDays(nationalRounds).forEach((day, r) => setMajor(day, "national", r));
  // 合宿の期間（出発の翌日から）には、ほかの大マスを置かない
  const blocked = new Set<number>();
  if (plan) {
    for (const [kind, rounds] of Object.entries(plan.rounds) as [CompetitionKind, number][]) {
      if (kind === "prefQualifier" || kind === "national") continue;
      competitionDays(kind, rounds).forEach((day, r) => setMajor(day, kind, r));
    }
    if (plan.camps) {
      (["summer", "winter"] as const).forEach((season, i) => {
        setMajor(dateToDay(CAMP_DATES[season].depart[0], CAMP_DATES[season].depart[1]), "camp", i);
        for (const d of campDays(season)) blocked.add(d);
      });
    }
    if (plan.scoutReply) setMajor(dateToDay(...FIXED_DATES.scoutReply), "scoutReply");
    plan.leagueDays?.forEach((day, r) => {
      if (!squares[day].major) setMajor(day, "league", r);
    });
    if (plan.school) placeSchoolEvents(squares);
  }

  // 練習試合：年に 6〜8 回。月をランダムに選び、1 か月に 1 回まで
  const tooClose = (day: number) => blocked.has(day) || squares.some((s) => s.major && Math.abs(s.day - day) < PRACTICE_MATCH.minGap);
  const months: { start: number; len: number }[] = [];
  let start = 0;
  MONTH_NUMBERS.forEach((month, i) => {
    if (!PRACTICE_MATCH.excludeMonths.includes(month)) months.push({ start, len: MONTH_DAYS[i] });
    start += MONTH_DAYS[i];
  });
  const target = rng.int(PRACTICE_MATCH.perYearMin, PRACTICE_MATCH.perYearMax);
  let placed = 0;
  for (const m of rng.shuffle([...months])) {
    if (placed >= target) break;
    for (let tries = 0; tries < 30; tries++) {
      const day = m.start + rng.int(2, m.len - 1);
      if (!tooClose(day)) {
        setMajor(day, "practiceMatch");
        placed++;
        break;
      }
    }
  }
  const branches = plan?.branches ? placeBranches(rng, squares, blocked, !!plan.school) : [];
  return { squares, branches };
}

// ================= 分岐マス（SPEC 5.1。P2c） =================

/**
 * 学校行事のマスを置く（R2）。すでに大マスがある日（大会など）とぶつかったら、その行事は飛ばす。
 * テスト前の 2〜3 日目は大マスではないが、ほかの大マス（練習試合）を置かないよう、テスト前の初日とテストの日の大マスで間隔をとる
 */
export function placeSchoolEvents(squares: Square[], fromDay = 0) {
  for (const e of schoolEventDays()) {
    if (e.day < fromDay || !squares[e.day] || squares[e.day].major) continue;
    squares[e.day].major = e.round === undefined ? { kind: "school", event: e.event } : { kind: "school", event: e.event, round: e.round };
  }
}

/** 試合の大マス（R2：すごろく上では隠す） */
export const MATCH_MAJOR_KINDS: readonly MajorKind[] = ["practiceMatch", "prefQualifier", "national", "summerQualifier", "summerNational", "rookiePref", "rookieRegion", "league"];
export const isMatchKind = (k: MajorKind) => MATCH_MAJOR_KINDS.includes(k);

/**
 * 分岐マスを置く。分岐の先（BRANCH.length 日）に大マスがない場所を選ぶ。
 * R2：分岐マスそのものは月の 1 日を避け、道の中の試合の日（すごろく上では隠す日）は許す
 */
function placeBranches(rng: Rng, squares: Square[], blocked: Set<number>, avoidMonthStart = false): Branch[] {
  const matchesInPath = avoidMonthStart;
  const L = BRANCH.length;
  const ok = (d: number) => {
    if (d + L >= squares.length) return false;
    if (BRANCH.excludeMonths.includes(dayToDate(d)[0])) return false;
    if (squares[d].major || blocked.has(d) || (avoidMonthStart && isMonthStart(d))) return false;
    for (let x = d; x <= d + L; x++) {
      const m = squares[x].major;
      // R2：試合の大マス（すごろく上では隠す日）は道の中にあってよい。行事などほかの大マスは置かない
      if ((m && !(matchesInPath && isMatchKind(m.kind))) || blocked.has(x) || squares[x].baseType === "branch") return false;
    }
    return true;
  };
  const cands = squares.map((s) => s.day).filter(ok);
  const branches: Branch[] = [];
  for (const d of rng.shuffle(cands)) {
    if (branches.length >= BRANCH.perYear) break;
    if (branches.some((b) => Math.abs(b.day - d) <= L + 3)) continue;
    squares[d].baseType = "branch";
    const normal = squares.slice(d + 1, d + 1 + L).map((s) => s.baseType as RandomSquareType);
    const themes = rng.shuffle(["blue", "training", "rest", "yellow"] as Exclude<BranchTheme, "normal">[]).slice(0, rng.int(...BRANCH.extraPaths));
    branches.push({ day: d, paths: [{ theme: "normal", squares: normal }, ...themes.map((t) => ({ theme: t, squares: themedPath(rng, t, L) }))] });
  }
  return branches.sort((a, b) => a.day - b.day);
}

function themedPath(rng: Rng, theme: Exclude<BranchTheme, "normal">, length: number): RandomSquareType[] {
  const mult = BRANCH.themes[theme];
  const path = Array.from({ length }, () => randomBaseType(rng, theme === "training" ? { ...mult, training: 0 } : mult));
  if (theme === "training") {
    for (const i of rng.shuffle(Array.from({ length }, (_, i) => i)).slice(0, BRANCH.trainingGuaranteed)) path[i] = "training";
  }
  return path;
}

/** 道を選ぶ（選んだ道のマスでカレンダーを書き換える） */
export function chooseBranchPath(cal: Calendar, day: number, index: number): boolean {
  const b = cal.branches?.find((x) => x.day === day);
  if (!b || b.chosen !== undefined || !b.paths[index]) return false;
  b.chosen = index;
  b.paths[index].squares.forEach((t, i) => {
    const sq = cal.squares[day + 1 + i];
    // 試合の日（R2 で道の中に入りうる）も、負けた後や試合のない日に使うマスの種類を道に合わせる
    if (sq && (!sq.major || isMatchKind(sq.major.kind))) sq.baseType = t;
  });
  return true;
}

export interface BranchPreview {
  theme: BranchTheme;
  /** 正確に見える最初のマス */
  first: RandomSquareType[];
  /** 残りのマスの種類ごとの数（1 つは「？」として数えない） */
  rest: Partial<Record<RandomSquareType, number>>;
  hidden: number;
}

/** 選ぶ画面での見え方（最初の数マスは正確に、残りは種類ごとの数。うち 1 つは「？」） */
export function branchPreview(b: Branch): BranchPreview[] {
  return b.paths.map((p) => {
    const first = p.squares.slice(0, BRANCH.revealFirst);
    const later = p.squares.slice(BRANCH.revealFirst);
    const rest: Partial<Record<RandomSquareType, number>> = {};
    // 最後のマスを「？」にする
    later.slice(0, -1).forEach((t) => (rest[t] = (rest[t] ?? 0) + 1));
    return { theme: p.theme, first, rest, hidden: later.length > 0 ? 1 : 0 };
  });
}

// ================= 進行カード =================

export function drawCard(rng: Rng): MoveCard {
  const practice = rng.weighted(PRACTICE_KINDS, (k: PracticeKind) => CARD_PRACTICE_WEIGHTS[k]);
  const value = rng.weighted([1, 2, 3, 4, 5] as const, (v) => CARD_VALUE_WEIGHTS[v - 1]);
  return { id: rng.id("c"), value, practice };
}

/** 手札を評判で決まる枚数にそろえる（多ければ後ろから捨て、少なければ補充） */
export function refillHand(rng: Rng, cal: Calendar, handSize: number) {
  while (cal.hand.length < handSize) cal.hand.push(drawCard(rng));
  if (cal.hand.length > handSize) cal.hand.length = handSize;
}

export function newCalendar(rng: Rng, prefRounds: number, nationalRounds: number, handSize: number, plan?: CalendarPlan): Calendar {
  const parts = buildCalendarParts(rng, prefRounds, nationalRounds, plan);
  const cal: Calendar = { squares: parts.squares, position: 0, hand: [], nextPracticeMult: 1 };
  if (plan) cal.branches = parts.branches;
  refillHand(rng, cal, handSize);
  return cal;
}

/**
 * 進む先を決める。途中に「必ず止まるマス」があればそこで止まる。
 * isStop は大マスが有効か（大会で敗退していないか など）を判定する。
 */
export function findDestination(squares: Square[], from: number, value: number, isStop: (sq: Square) => boolean): number {
  const last = squares.length - 1;
  const target = Math.min(last, from + value);
  for (let d = from + 1; d <= target; d++) {
    if (squares[d].major && isStop(squares[d])) return d;
  }
  return target;
}
