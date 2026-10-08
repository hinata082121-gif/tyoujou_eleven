import { CARD_PRACTICE_WEIGHTS, CARD_VALUE_WEIGHTS, DAYS_IN_YEAR, FIXED_DATES, MONTH_DAYS, MONTH_NUMBERS, PRACTICE_MATCH, SQUARE_WEIGHTS } from "../config/calendar";
import { NATIONAL_DATES, PREF_QUALIFIER_DATES } from "../config/competitions";
import type { Rng } from "../rng";
import { PRACTICE_KINDS, type Calendar, type MoveCard, type PracticeKind, type Square, type SquareType } from "../types";

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

function randomBaseType(rng: Rng): Exclude<SquareType, "major"> {
  const types = Object.keys(SQUARE_WEIGHTS) as Exclude<SquareType, "major">[];
  return rng.weighted(types, (t) => SQUARE_WEIGHTS[t]);
}

/** 1 年分（365 マス）のカレンダーを作る */
export function buildSquares(rng: Rng, prefRounds: number, nationalRounds: number): Square[] {
  const squares: Square[] = Array.from({ length: DAYS_IN_YEAR }, (_, day) => ({ day, baseType: randomBaseType(rng) }));
  const setMajor = (day: number, kind: NonNullable<Square["major"]>["kind"], round?: number) => {
    squares[day].major = round === undefined ? { kind } : { kind, round };
  };
  setMajor(dateToDay(...FIXED_DATES.entrance), "entrance");
  setMajor(dateToDay(...FIXED_DATES.graduation), "graduation");
  setMajor(dateToDay(...FIXED_DATES.yearEnd), "yearEnd");
  prefQualifierDays(prefRounds).forEach((day, r) => setMajor(day, "prefQualifier", r));
  nationalDays(nationalRounds).forEach((day, r) => setMajor(day, "national", r));

  // 練習試合：月に 1〜2 回
  const tooClose = (day: number) => squares.some((s) => s.major && Math.abs(s.day - day) < PRACTICE_MATCH.minGap);
  let start = 0;
  MONTH_NUMBERS.forEach((month, i) => {
    const len = MONTH_DAYS[i];
    if (!PRACTICE_MATCH.excludeMonths.includes(month)) {
      const count = rng.int(PRACTICE_MATCH.perMonthMin, PRACTICE_MATCH.perMonthMax);
      for (let c = 0; c < count; c++) {
        for (let tries = 0; tries < 30; tries++) {
          const day = start + rng.int(2, len - 1);
          if (!tooClose(day)) {
            setMajor(day, "practiceMatch");
            break;
          }
        }
      }
    }
    start += len;
  });
  return squares;
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

export function newCalendar(rng: Rng, prefRounds: number, nationalRounds: number, handSize: number): Calendar {
  const cal: Calendar = { squares: buildSquares(rng, prefRounds, nationalRounds), position: 0, hand: [], nextPracticeMult: 1 };
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
