/**
 * 県リーグ（SPEC 11章。P3）：部の分け方・総当たりの組み合わせ・順位・昇格と降格。
 * 試合の計算と評判はゲームの進行（game/index.ts）で行う。
 */
import { dateToDay } from "../calendar";
import { LEAGUE } from "../config/league";
import type { LeagueDivision, LeagueFixture, LeagueStanding, LeagueState } from "../types";

/**
 * 強い順に並んだ学校を、上から 8 校ずつの部に分ける。端数（1〜7 校）は最下部に入れる
 */
export function splitDivisions(ordered: string[]): string[][] {
  const size = LEAGUE.divisionSize;
  const n = Math.max(1, Math.floor(ordered.length / size));
  const out: string[][] = [];
  for (let i = 0; i < n; i++) out.push(ordered.slice(i * size, i === n - 1 ? ordered.length : (i + 1) * size));
  return out;
}

/**
 * 総当たりの組み合わせ（サークル方式）。奇数なら毎節 1 校が休み。
 * 2 回総当たりは、1 回目の組み合わせのホームとアウェーを入れ替えて後ろに足す
 */
export function roundRobin(ids: string[], double: boolean, idPrefix: string): LeagueFixture[][] {
  const teams: (string | null)[] = [...ids];
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const rounds: LeagueFixture[][] = [];
  const rot = teams.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const order = [teams[0], ...rot];
    const fx: LeagueFixture[] = [];
    for (let k = 0; k < n / 2; k++) {
      const a = order[k];
      const b = order[n - 1 - k];
      if (!a || !b) continue;
      // ホームとアウェーが偏らないように、節と組で入れ替える
      const swap = (r + k) % 2 === 1;
      fx.push({ id: `${idPrefix}-${r}-${k}`, home: swap ? b : a, away: swap ? a : b });
    }
    rounds.push(fx);
    rot.unshift(rot.pop()!);
  }
  if (!double) return rounds;
  const second = rounds.map((fx, r) => fx.map((f, k) => ({ id: `${idPrefix}-${r + n - 1}-${k}`, home: f.away, away: f.home })));
  return [...rounds, ...second];
}

/** 節の数に合わせて日程を選ぶ（14 節より少なければ、14 の日程に均等に散らす） */
export function leagueDays(rounds: number): number[] {
  const base = LEAGUE.dates.slice(0, LEAGUE.dates.length - 1);
  const dates = rounds > base.length ? LEAGUE.dates.slice(0, rounds) : rounds === 1 ? [base[0]] : Array.from({ length: rounds }, (_, i) => base[Math.round((i * (base.length - 1)) / (rounds - 1))]);
  return dates.map(([m, d]) => dateToDay(m, d));
}

/** 部の一覧からその年のリーグを作る */
export function createLeague(divisionIds: string[][], active = true): LeagueState {
  const divisions: LeagueDivision[] = divisionIds.map((ids, i) => {
    const doubleRound = ids.length <= LEAGUE.divisionSize;
    const fixtures = active ? roundRobin(ids, doubleRound, `L${i + 1}`) : [];
    return { level: i + 1, schoolIds: [...ids], doubleRound, fixtures, days: active ? leagueDays(fixtures.length) : [] };
  });
  return { divisions, active };
}

/** リーグのすべての節の日（カレンダーの大マス用。重複なし・昇順） */
export function allLeagueDays(league: LeagueState): number[] {
  return [...new Set(league.divisions.flatMap((d) => d.days))].sort((a, b) => a - b);
}

export function divisionOf(league: LeagueState, schoolId: string): LeagueDivision | undefined {
  return league.divisions.find((d) => d.schoolIds.includes(schoolId));
}

/** その日の、ある学校の試合（休みなら undefined） */
export function fixtureOn(league: LeagueState, schoolId: string, day: number): { division: LeagueDivision; round: number; fixture: LeagueFixture } | undefined {
  const division = divisionOf(league, schoolId);
  if (!division) return undefined;
  const round = division.days.indexOf(day);
  if (round < 0) return undefined;
  const fixture = division.fixtures[round].find((f) => f.home === schoolId || f.away === schoolId);
  return fixture ? { division, round, fixture } : undefined;
}

export function findFixture(league: LeagueState, id: string): LeagueFixture | undefined {
  for (const d of league.divisions) for (const round of d.fixtures) for (const f of round) if (f.id === id) return f;
  return undefined;
}

/** 順位表。勝ち点 → 得失点差 → 総得点 → 当該チームどうしの勝ち点 → 部の並び（抽選の代わり） */
export function standings(division: LeagueDivision): LeagueStanding[] {
  const rows = new Map<string, LeagueStanding>(division.schoolIds.map((id) => [id, { schoolId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]));
  const played = division.fixtures.flat().filter((f): f is LeagueFixture & { score: [number, number] } => !!f.score);
  for (const f of played) {
    const h = rows.get(f.home);
    const a = rows.get(f.away);
    if (!h || !a) continue;
    const [gh, ga] = f.score;
    h.played++;
    a.played++;
    h.goalsFor += gh;
    h.goalsAgainst += ga;
    a.goalsFor += ga;
    a.goalsAgainst += gh;
    if (gh > ga) {
      h.won++;
      a.lost++;
      h.points += 3;
    } else if (gh < ga) {
      a.won++;
      h.lost++;
      a.points += 3;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }
  const headToHead = (x: string, y: string) => {
    let p = 0;
    for (const f of played) {
      if (f.home === x && f.away === y) p += f.score[0] > f.score[1] ? 3 : f.score[0] === f.score[1] ? 1 : 0;
      if (f.away === x && f.home === y) p += f.score[1] > f.score[0] ? 3 : f.score[0] === f.score[1] ? 1 : 0;
    }
    return p;
  };
  const seed = (id: string) => division.schoolIds.indexOf(id);
  return [...rows.values()].sort(
    (x, y) =>
      y.points - x.points ||
      y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor ||
      headToHead(y.schoolId, x.schoolId) - headToHead(x.schoolId, y.schoolId) ||
      seed(x.schoolId) - seed(y.schoolId),
  );
}

/** すべての試合が終わったか */
export function leagueFinished(league: LeagueState): boolean {
  return league.active && league.divisions.every((d) => d.fixtures.every((r) => r.every((f) => !!f.score)));
}

/**
 * 年度末の昇格・降格：隣り合う部で、上の部の下位 2 校と下の部の上位 2 校を入れ替える。
 * 返り値は翌年度の部（上から）
 */
export function promotionResult(league: LeagueState): string[][] {
  const tables = league.divisions.map((d) => standings(d).map((s) => s.schoolId));
  const next = tables.map((t) => [...t]);
  const k = LEAGUE.promote;
  for (let i = 0; i < tables.length - 1; i++) {
    const down = tables[i].slice(-k);
    const up = tables[i + 1].slice(0, k);
    next[i] = next[i].filter((id) => !down.includes(id)).concat(up);
    next[i + 1] = down.concat(next[i + 1].filter((id) => !up.includes(id)));
  }
  return next;
}

/** 自校の成績（何部の何位・昇格・降格） */
export function playerLeagueResult(league: LeagueState, schoolId: string) {
  const d = divisionOf(league, schoolId);
  if (!d) return null;
  const table = standings(d);
  const position = table.findIndex((s) => s.schoolId === schoolId) + 1;
  const k = LEAGUE.promote;
  const promoted = d.level > 1 && position <= k;
  const relegated = d.level < league.divisions.length && position > table.length - k;
  return { level: d.level, position, size: table.length, promoted, relegated, champion: position === 1 };
}
