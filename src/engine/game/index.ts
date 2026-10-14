/**
 * ゲーム全体の進行。UI はここの関数だけを呼ぶ。
 * 関数は GameState を直接書き換える（大きな状態を毎回コピーしないため）。
 */
import { ensureLooks, renumberAll } from "../look";
import { decorateMatch } from "../look/match";
import { buildCalendarParts, campDays, chooseBranchPath, competitionDays, type CalendarPlan, dateToDay, formatDay, monthIndex, nationalDays, newCalendar, placeSchoolEvents, prefQualifierDays, refillHand } from "../calendar";
import { PRACTICE_OFFER_DAYS } from "../config/calendar";
import { CHOICE } from "../config/choiceEvents";
import { SCHOOL_EVENT_LABELS } from "../config/schoolEvents";
import { absDay, choiceDef, choiceView, decodeCast, encodeCast, pickChoiceEvent, prepareChoice, pruneMemory, rememberChoice, resolveChoice, type ChoiceView } from "../choice";
import { beginMonthly, chooseAutoFocus, finishMonthly, headFocusQuality, monthlyDue, practiceFocus, resetMonthlyForYear, setFocus } from "../monthly";
import { addTrust, ensureSchoolLife } from "../school/life";
import { endSchoolDay, isAbsent, noPracticeDay, prepPracticeMults, relayLine, runRelay, runTest, schoolEventOf, setTestPrep, startSchoolDay, tripOutcome } from "../school/events";
import { CPU_GROWTH } from "../config/growth";
import {
  CAMP_NAMES,
  COMPETITION_NAMES,
  BRANCH_THEME_NAMES,
  MAJOR_NAMES,
  PRACTICE_NAMES,
  REPUTATION_NAMES,
  YOUTH_TEAM_NAME,
  prefQualifierName,
  rookiePrefName,
  rookieRegionName,
  roundLabel,
  summerQualifierName,
} from "../config/names";
import { PRACTICE_MATCH } from "../config/calendar";
import { CARRY_FATIGUE_KINDS, PRACTICE_RULES, ROOKIE_PREF_SETUP_DATE, ROOKIE_REGION, SUMMER, summerRulesForRound, winterRulesForRound } from "../config/competitions";
import { DAILY_RECOVERY, NON_TARGET_FITNESS } from "../config/practice";
import { REPUTATION_TABLE } from "../config/reputation";
import { prefSummerReps, TIER_SETTINGS } from "../config/school";
import { SCOUT } from "../config/scout";
import { ADJUST_DAY_RECOVERY } from "../config/season";
import { campLearnMult, isValidCampPolicy, positionGroup, runCamp, type CampResult } from "../camp";
import {
  cpuFacilities,
  donationChance,
  facilitiesForReputation,
  facilityInjuryMult,
  facilityLogText,
  facilityPracticeBonus,
  grantReputationFacilities,
  injuryDaysMult,
  lowestFacility,
  raiseCpuFacilities,
  raiseFacility,
  resultFacilities,
  totalRecoveryMult,
  type YearResults,
} from "../facilities";
import { idleDay } from "../practice";
import { resolveReplies, scoutCardDays, scoutContext, startScoutSeason, visitCandidate, type ReplyResult, type VisitResult } from "../scout";
import { REPUTATION_GAUGE } from "../config/reputation";
import {
  advanceRound,
  createBracket,
  findMatch,
  findMatchById,
  isAlive,
  isFinished,
  reachedRound,
  recordResult,
  seedOrder,
  roundsFor,
  totalRounds,
} from "../competition/bracket";
import { matchFatigueDrop, schoolTeamInput, simulateCpuMatch } from "../competition/simulate";
import { landOnSquare, type EventOutcome } from "../events";
import { addEventLines } from "../events/speech";
import { createMatch, simulateToEnd } from "../match/engine";
import { autoSetup } from "../match/lineup";
import type { ActiveMatch } from "../match/types";
import { runPractice } from "../practice";
import { addGauge, handSize, matchReputationDelta } from "../reputation";
import { Rng } from "../rng";
import { generateWorld, makeCpuSchool, NameGen } from "../school/generate";
import { autumnCpuGrowth } from "../school/season";
import { rankFromStrength, rankIndex, teamStrength } from "../school/strength";
import { addLog, graduate, playerSchool, retireThirdYears, rolloverCpuSchools, rolloverPlayerSchool } from "../season";
import { appointCaptain, autoCaptain, captainConditionMults, captainOf, captainPracticeMult } from "../captain";
import { PLAY_STYLE_NAMES, SKILL_NAMES } from "../config/names";
import { MATCH_EXP, PERSONALITY_MATCH } from "../config/personality";
import { POSITION_RATING_WEIGHTS } from "../config/player";
import { PROFICIENCY } from "../config/playStyle";
import { durabilityMult } from "../match/traits";
import { addExp } from "../player/growth";
import { changePlayStyle, gainProficiency } from "../player/traits";
import { applyMatchFeats } from "../skills/feats";
import type { LearnEvent } from "../skills/learn";
import { MATCH } from "../config/match";
import { STAFF_LIFE } from "../config/staff";
import {
  analystScouting,
  changeStaffRole,
  cpuConditioning,
  checkPoaching,
  dismissStaff,
  driftCpuStaff,
  emptyStaffState,
  ensureHeadCoach,
  finishStaffReview,
  generateCpuStaff,
  generateFictionalAlumni,
  headAiQuality,
  hireStaff,
  injuryMult,
  practiceStaffMult,
  releaseStaff,
  staffByRole,
  staffYearEnd,
  startStaffYear,
} from "../staff";
import { createNote, templateRule, type NoteTemplateId } from "../note";
import { LEAGUE, LEAGUE_RULES } from "../config/league";
import { leagueName } from "../config/names";
import { createLeague, divisionOf, findFixture, fixtureOn, leagueFinished, playerLeagueResult, promotionResult, splitDivisions, standings } from "../league";
import {
  COMPETITION_KINDS,
  type Alumnus,
  type Bracket,
  type CampPolicy,
  type CampSeason,
  type CompetitionKind,
  type GameState,
  type MajorKind,
  type MatchKind,
  type MatchRules,
  type NoteRule,
  type Player,
  type PlayStyle,
  type PracticeKind,
  type School,
  type Square,
  type StaffRole,
  type StatKey,
  type TacticsNote,
  type TeamSetup,
} from "../types";

export const GAME_STATE_VERSION = 1;

/** 乱数を取り出して使い、最後に状態を書き戻す */
function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = Rng.fromState(state.rng);
  const result = fn(rng);
  state.rng = rng.state();
  return result;
}

// ================= 新しいゲーム =================

export function newGame(seed: string, schoolName: string, prefectureId?: string): GameState {
  const rng = Rng.fromSeed(seed);
  const world = generateWorld(rng, schoolName, 1, prefectureId);
  const state: GameState = {
    version: GAME_STATE_VERSION,
    seed,
    year: 1,
    rng: rng.state(),
    playerSchoolId: world.playerSchoolId,
    schools: world.schools,
    prefectures: world.prefectures,
    regions: world.regions,
    reputation: { level: 0, gauge: 0 },
    calendar: { squares: [], position: 0, hand: [], nextPracticeMult: 1 },
    competitions: { winterDone: false, practiceMatchCount: 0 },
    facilities: { ground: 0, trainingRoom: 0, careRoom: 0, dorm: 0 },
    facilityLog: [],
    facilityGrantedLevel: 0,
    alumni: generateFictionalAlumni(rng, 1),
    staff: emptyStaffState(),
    notes: [],
    history: [],
    log: [],
  };
  for (const s of Object.values(state.schools)) {
    if (s.isPlayer) continue;
    s.cpuStaff = generateCpuStaff(rng, s.prestige);
    s.cpuFacilities ??= cpuFacilities(rng, s.prestige);
  }
  addLog(state, `${schoolName}サッカー部の監督に就任した。`, "info");
  startYear(state, rng);
  // 最初にヘッドコーチを OB から選ぶ（「あとで選ぶ」なら臨時コーチのまま）
  state.pending = { type: "staff" };
  state.rng = rng.state();
  return state;
}

function ownPrefecture(state: GameState) {
  return state.prefectures.find((p) => p.isPlayerPref)!;
}

/** その年の夏の全国大会の開催県を決める（東京・神奈川・大阪は外す）。開催県はその年だけ 2 校目が出る */
function pickSummerHost(state: GameState, rng: Rng) {
  const host = rng.pick(state.prefectures.filter((p) => !SUMMER.doubleRepPrefs.includes(p.id)));
  for (const p of state.prefectures) p.summerReps = prefSummerReps(p.id) + (p.id === host.id ? 1 : 0);
  return host;
}

/** カレンダーを作るための、各大会のラウンド数 */
function yearPlan(state: GameState) {
  const pref = ownPrefecture(state);
  const n = pref.schoolIds.length;
  const prefRounds = roundsFor(n) - Math.log2(pref.reps);
  const nationalRounds = roundsFor(nationalSize(state));
  const summerQualifierRounds = roundsFor(n) - Math.log2(pref.summerReps);
  const rounds: Partial<Record<CompetitionKind, number>> = {
    summerQualifier: summerQualifierRounds,
    summerNational: roundsFor(summerNationalSize(state)),
    rookiePref: roundsFor(n),
    rookieRegion: roundsFor(rookieRegionSize(state)),
  };
  const myDiv = state.league?.active ? divisionOf(state.league, state.playerSchoolId) : undefined;
  const plan: CalendarPlan = { rounds, camps: true, scoutReply: true, branches: true, leagueDays: myDiv?.days, school: true };
  return { prefRounds, nationalRounds, summerQualifierRounds, plan };
}

/** 年度の始まり：開催県・カレンダー・県予選の組み合わせを作る */
function startYear(state: GameState, rng: Rng) {
  const pref = ownPrefecture(state);
  const host = pickSummerHost(state, rng);
  state.league = createLeague(leagueDivisionsForYear(state));
  const { prefRounds, nationalRounds, summerQualifierRounds, plan } = yearPlan(state);
  state.calendar = newCalendar(rng, prefRounds, nationalRounds, handSize(state.reputation), plan);
  const byStrength = (ids: string[]) =>
    [...ids]
      .map((id) => ({ id, s: teamStrength(state.schools[id].players, state.schools[id].formation) + rng.normal(0, 1.5) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.id);
  const seeded = byStrength(pref.schoolIds);
  // 夏の県予選：前年度の新人戦の上位がシード。残りは抽選（前年度の新人戦がなければチーム力順）
  const rookieSeeds = (state.competitions?.rookieSeeds ?? []).filter((id) => pref.schoolIds.includes(id));
  const summerOrder = rookieSeeds.length > 0 ? [...rookieSeeds, ...rng.shuffle(pref.schoolIds.filter((id) => !rookieSeeds.includes(id)))] : byStrength(pref.schoolIds);
  state.competitions = {
    prefQualifier: createBracket("prefQualifier", seeded, prefQualifierDays(prefRounds), rng, pref.reps),
    summerQualifier: createBracket("summerQualifier", summerOrder, competitionDays("summerQualifier", summerQualifierRounds), rng, pref.summerReps),
    summerHostPrefId: host.id,
    winterDone: false,
    practiceMatchCount: 0,
  };
  for (const s of Object.values(state.schools)) delete s.carryFitness;
  updatePlayerRank(state);
  // キャプテンはスタッフの編成の後に指名する（おすすめを初期選択にしておく）
  autoCaptain(playerSchool(state));
  startStaffYear(state, rng);
  // 見た目・ユニフォーム（無い人・学校に付ける）と背番号の付け直し（P4。ゲームの乱数は使わない）
  ensureLooks(state);
  renumberAll(state);
  // 学校生活（R2）：学力・信頼度（新入生）、月初の指示の記録、行事の進み具合、約束
  ensureSchoolLife(state);
  resetMonthlyForYear(state);
  state.school = state.school?.lastTest ? { lastTest: state.school.lastTest } : {};
  state.promises = [];
  pruneMemory(state);
  for (let d = 1; d <= PRACTICE_OFFER_DAYS; d++) deliverOffer(state, rng, d);
  addLog(state, `${MAJOR_NAMES.entrance}。新入生が入部した。`, "info");
  addLog(state, `今年の${COMPETITION_NAMES.summer}は${host.name}で開催される。`, "info");
  grantFacilitiesForReputation(state);
}

// ================= 県リーグ（P3） =================

/** 自県の学校を強い順に並べる（自校は除く） */
function cpuPrefByStrength(state: GameState): string[] {
  const pref = ownPrefecture(state);
  return pref.schoolIds
    .filter((id) => id !== state.playerSchoolId)
    .sort((a, b) => teamStrength(state.schools[b].players, state.schools[b].formation) - teamStrength(state.schools[a].players, state.schools[a].formation));
}

/**
 * その年の部。前の年の結果があれば昇格・降格を反映し、なければチーム力の順に分ける（自校は最下部）
 */
function leagueDivisionsForYear(state: GameState): string[][] {
  const lg = state.league;
  if (lg?.final) return lg.final.nextDivisions;
  if (lg) return lg.divisions.map((d) => d.schoolIds);
  return splitDivisions([...cpuPrefByStrength(state), state.playerSchoolId]);
}

/**
 * P2c までのゲームに県リーグを足す（セーブの v5 → v6）。学校は今のチーム力の順に部に分け、
 * 自校は評判に応じた部に入れる（弱小・そこそこは最下部、名門は 1 部）。その年のリーグ戦は行わず、次の 4/1 から始める
 */
/**
 * P3 のセーブ → P4：全選手・OB に見た目、全校にユニフォーム、背番号を付ける。試合の途中なら表示用の情報も付ける。
 * どれもゲームの乱数を使わない（ゲームのシードと ID から作る）ので、同じセーブなら何度読み込んでも同じになる
 */
export function upgradeToPhase4(state: GameState) {
  ensureLooks(state);
  renumberAll(state);
  if (state.activeMatch) decorateMatch(state, state.activeMatch);
  addLog(state, "選手に見た目と背番号、学校にユニフォームが付いた。自校のユニフォームは、メニューの「ユニフォーム」からいつでも変えられます。", "info");
}

/**
 * P4a・R1 のセーブ → R2：自校の部員に学力・信頼度（キャプテンは高め）、これから先の日程に学校行事と人物マス、
 * 月初の指示は読み込んだ日の次の 1 日から。ゲームのシードから作った専用の乱数を使うので、同じセーブなら毎回同じになる
 */
export function upgradeToPhaseR2(state: GameState) {
  const rng = Rng.fromSeed(`${state.seed}:migrate-v8`);
  ensureSchoolLife(state);
  const school = playerSchool(state);
  const cap = school.players.find((p) => p.id === school.captainId);
  if (cap) addTrust(cap, CAPTAIN_TRUST);
  const cal = state.calendar;
  const pos = cal.position;
  placeSchoolEvents(cal.squares, pos + 1);
  // 人物マス：これから先の通常マス（青・赤・白・緑）の一部を置き換える（分岐の先の道は除く）
  const inBranch = (d: number) => cal.branches?.some((b) => d > b.day && d <= b.day + b.paths[0].squares.length);
  for (const sq of cal.squares) {
    if (sq.day <= pos || sq.major || inBranch(sq.day)) continue;
    if (["blue", "red", "white", "green"].includes(sq.baseType) && rng.chance(PERSON_SQUARE_SHARE)) sq.baseType = "person";
  }
  state.monthly = { doneMonth: monthIndex(pos) };
  state.school ??= {};
  state.promises ??= [];
  state.eventMemory ??= {};
  // これから先 10 日以内の練習試合の申し込み
  for (let d = pos + 1; d <= Math.min(cal.squares.length - 1, pos + PRACTICE_OFFER_DAYS); d++) deliverOffer(state, rng, d);
  addLog(state, "学校行事・月初の育成指示・選択肢のあるイベントが加わった。すごろくは 10 日先までだけ見え、大会の日程は「大会」の「予定」で確かめられます。", "info");
}

/** R2 の移行で、通常マス（青・赤・白・緑）を人物マスに置き換える割合（人物マスが全体の 13% 前後になる） */
const PERSON_SQUARE_SHARE = 0.2;

export function upgradeToPhase3(state: GameState) {
  const divs = splitDivisions(cpuPrefByStrength(state));
  const k = divs.length;
  const level = state.reputation.level;
  const idx = level <= 1 ? k - 1 : Math.min(k - 1, Math.max(0, Math.round(((4 - level) / 3) * (k - 1))));
  divs[idx].push(state.playerSchoolId);
  state.league = createLeague(divs, false);
  addLog(state, `県リーグが加わった。来年度の4月から${leagueName(ownPrefecture(state).name, idx + 1)}で戦う。`, "info");
}

/** その日の県リーグの試合のうち、自校の試合以外を計算する。全部終わったら年間の結果を出す */
function processLeagueDay(state: GameState, rng: Rng, day: number) {
  const lg = state.league;
  if (!lg?.active) return;
  let any = false;
  for (const d of lg.divisions) {
    const round = d.days.indexOf(day);
    if (round < 0) continue;
    any = true;
    for (const f of d.fixtures[round]) {
      if (f.score || f.home === state.playerSchoolId || f.away === state.playerSchoolId) continue;
      const o = simulateCpuMatch(rng.fork(f.id), state.schools[f.home], state.schools[f.away], LEAGUE_RULES);
      f.score = [o.score[0], o.score[1]];
    }
  }
  if (any) checkLeagueEnd(state);
}

/** 全節が終わったら、自校の順位・昇格・降格と評判のボーナスを決める（1 回だけ） */
function checkLeagueEnd(state: GameState) {
  const lg = state.league;
  if (!lg || lg.final || !leagueFinished(lg)) return;
  const r = playerLeagueResult(lg, state.playerSchoolId);
  const nextDivisions = promotionResult(lg);
  if (!r) {
    lg.final = { playerLevel: 0, position: 0, size: 0, promoted: false, relegated: false, nextDivisions };
    return;
  }
  lg.final = { playerLevel: r.level, position: r.position, size: r.size, promoted: r.promoted, relegated: r.relegated, nextDivisions };
  const B = LEAGUE.bonus;
  const delta = (r.champion ? (r.level === 1 ? B.topDivisionChampion : B.divisionChampion) : 0) + (r.promoted ? B.promoted : 0) + (r.relegated ? B.relegated : 0);
  const name = leagueName(ownPrefecture(state).name, r.level);
  const extra = r.promoted ? `。来年度は${r.level - 1}部に昇格する` : r.relegated ? `。来年度は${r.level + 1}部に降格する` : "";
  addLog(state, `${name}は${r.position}位で終わった${extra}。`, r.promoted || r.champion ? "good" : r.relegated ? "bad" : "info");
  if (delta !== 0) changeReputation(state, delta);
}

/** 評判を動かす（段階が変わったらログと手札） */
function changeReputation(state: GameState, delta: number) {
  const before = state.reputation.level;
  const change = addGauge(state.reputation, delta);
  if (change.levelChange !== 0) {
    addLog(state, `評判が「${REPUTATION_NAMES[before]}」から「${REPUTATION_NAMES[state.reputation.level]}」に${change.levelChange > 0 ? "上がった" : "下がった"}。`, change.levelChange > 0 ? "good" : "bad");
    withRng(state, (rng) => refillHand(rng, state.calendar, handSize(state.reputation)));
  }
  return change;
}

/** 県リーグの表示名（自校の部） */
export function playerLeagueName(state: GameState): string {
  const d = state.league ? divisionOf(state.league, state.playerSchoolId) : undefined;
  return leagueName(ownPrefecture(state).name, d?.level ?? 1);
}

/** 冬の全国大会の出場校数（各都道府県の代表数の合計。東京のみ 2 校で 48 校） */
export function nationalSize(state: GameState): number {
  return state.prefectures.reduce((n, p) => n + p.reps, 0);
}

/** 夏の全国大会の出場校数（51 校） */
export function summerNationalSize(state: GameState): number {
  return state.prefectures.reduce((n, p) => n + (p.summerReps ?? prefSummerReps(p.id)), 0);
}

/** 新人戦の地域大会の出場校数（各県 2 校。1 道だけの地域は県大会の上位 8 校） */
export function rookieRegionSize(state: GameState): number {
  const prefs = regionPrefectures(state);
  return prefs.length === 1 ? ROOKIE_REGION.singlePrefTeams : prefs.length * ROOKIE_REGION.repsPerPref;
}

function regionPrefectures(state: GameState) {
  const own = ownPrefecture(state);
  return state.prefectures.filter((p) => p.regionId === own.regionId);
}

/** 評判に初めて上がったときの設備の整備（SPEC 15章） */
function grantFacilitiesForReputation(state: GameState) {
  const h = { year: state.year, facilities: state.facilities, facilityLog: state.facilityLog, facilityGrantedLevel: state.facilityGrantedLevel };
  const given = grantReputationFacilities(h, state.reputation.level);
  state.facilityGrantedLevel = h.facilityGrantedLevel;
  for (const e of given) addLog(state, facilityLogText(e, state.reputation.level), "good");
}

/**
 * Phase 2b までのゲームを Phase 2c の形にする（セーブの v4 → v5）。
 * 設備は評判に応じて付け、これから先の日程にだけ新しい大会・合宿・分岐マスを入れる。
 * 小さな県には CPU 校を 1 校足す（他県は 3 校に）。11 月〜2 月の途中なら、スカウトを残りの期間で始める。
 */
export function upgradeToPhase2c(state: GameState, rng: Rng) {
  const level = state.reputation.level;
  state.facilities = facilitiesForReputation(level);
  state.facilityLog = [];
  state.facilityGrantedLevel = level;
  // 小さな県の CPU 校
  const names = new NameGen(rng);
  for (const s of Object.values(state.schools)) names.reserve(s.name);
  let n = Math.max(0, ...Object.keys(state.schools).map((id) => Number(id.slice(1))).filter(Number.isFinite)) + 1;
  for (const pref of state.prefectures) {
    if (pref.isPlayerPref) continue;
    const tier = TIER_SETTINGS[pref.tier];
    while (pref.schoolIds.length < Math.max(tier.otherPrefSchools, pref.reps + 1)) {
      const prestige = rng.weighted([0, 1, 2, 3, 4, 5], (p) => tier.otherPrefPrestige[p]);
      const id = `s${n++}`;
      const school = makeCpuSchool(rng, id, names.next(), pref.id, prestige, state.year);
      autoCaptain(school);
      state.schools[id] = school;
      pref.schoolIds.push(id);
    }
  }
  for (const s of Object.values(state.schools)) {
    if (s.isPlayer) continue;
    s.cpuStaff ??= generateCpuStaff(rng, s.prestige);
    s.cpuStaff.conditioning ??= cpuConditioning(rng, s.prestige);
    s.cpuFacilities ??= cpuFacilities(rng, s.prestige);
  }
  // 夏の全国大会の開催県・これから先の日程
  const host = pickSummerHost(state, rng);
  const c = state.competitions;
  c.summerHostPrefId = host.id;
  c.rookieSeeds = [];
  const { prefRounds, nationalRounds, summerQualifierRounds, plan } = yearPlan(state);
  const parts = buildCalendarParts(rng, prefRounds, nationalRounds, plan);
  const cal = state.calendar;
  const pos = cal.position;
  cal.squares = cal.squares.map((sq, d) => (d <= pos ? sq : parts.squares[d]));
  cal.branches = parts.branches.filter((b) => b.day > pos);
  const pref = ownPrefecture(state);
  const summerDays = competitionDays("summerQualifier", summerQualifierRounds);
  if (summerDays[0] > pos) {
    const order = [...pref.schoolIds].sort((a, b) => teamStrength(state.schools[b].players) - teamStrength(state.schools[a].players));
    c.summerQualifier = createBracket("summerQualifier", order, summerDays, rng, pref.summerReps);
  }
  // 途中から始まる仕組み
  const scoutStart = dateToDay(...SCOUT.start);
  const lastCard = dateToDay(...SCOUT.lastCard);
  if (pos >= scoutStart && pos < lastCard) {
    const t = REPUTATION_TABLE[level];
    const count = Math.max(1, Math.round((t.scoutCards * (lastCard - pos)) / (lastCard - scoutStart)));
    state.scout = startScoutSeason(rng, scoutContext(state, analystScouting(state.staff)), scoutCardDays(count, pos + 1, lastCard));
  }
  const rookieSetup = dateToDay(...ROOKIE_PREF_SETUP_DATE);
  if (pos >= rookieSetup && pos < competitionDays("rookiePref", 1)[0]) setupRookiePref(state, rng);
  addLog(state, `夏の全国大会・新人戦・合宿・特待生スカウト・設備が加わった。設備は評判に応じて整った状態から始まる。今年の${COMPETITION_NAMES.summer}は${host.name}で開催される。`, "info");
}

export function updatePlayerRank(state: GameState) {
  const s = playerSchool(state);
  s.rank = rankFromStrength(teamStrength(s.players, s.formation));
}

// ================= 大会の共通の扱い =================

const WINTER_KINDS: CompetitionKind[] = ["prefQualifier", "national"];
export const isCompetitionKind = (k: string): k is CompetitionKind => (COMPETITION_KINDS as readonly string[]).includes(k);
export const isRookieKind = (k: MatchKind) => k === "rookiePref" || k === "rookieRegion";
export const isCarryKind = (k: MatchKind) => (CARRY_FATIGUE_KINDS as readonly string[]).includes(k);

export function bracketOf(state: GameState, kind: CompetitionKind): Bracket | undefined {
  return state.competitions[kind];
}

/** 大会の表示名 */
export function competitionName(state: GameState, kind: CompetitionKind): string {
  const pref = ownPrefecture(state);
  switch (kind) {
    case "prefQualifier":
      return prefQualifierName(pref.name);
    case "national":
      return COMPETITION_NAMES.national;
    case "summerQualifier":
      return summerQualifierName(pref.name);
    case "summerNational":
      return COMPETITION_NAMES.summerNational;
    case "rookiePref":
      return rookiePrefName(pref.name);
    case "rookieRegion":
      return rookieRegionName(state.regions.find((r) => r.id === pref.regionId)?.name ?? "");
  }
}

// ================= すごろく =================

/** 大マスで止まるか（大会で敗退していれば止まらない） */
export function isStopSquare(state: GameState, sq: Square): boolean {
  if (!sq.major) return false;
  const kind = sq.major.kind;
  if (isCompetitionKind(kind)) {
    const b = bracketOf(state, kind);
    const round = sq.major.round ?? 0;
    return !!b && !!findMatch(b, round, state.playerSchoolId) && !matchDecided(b, round, state.playerSchoolId);
  }
  switch (kind) {
    case "entrance":
      return false;
    case "league": {
      const f = state.league?.active ? fixtureOn(state.league, state.playerSchoolId, sq.day) : undefined;
      return !!f && !f.fixture.score;
    }
    case "scoutReply":
      return !!state.scout && !state.scout.replied;
    default:
      return true;
  }
}

function matchDecided(b: Bracket, round: number, schoolId: string) {
  const m = findMatch(b, round, schoolId);
  return !m || m.winner !== undefined;
}

export interface CardResult {
  from: number;
  to: number;
  days: number;
  practice: string;
  outcomes: EventOutcome[];
  stoppedAt?: MajorKind;
  injured: string[];
  /** 表示用（R1）：練習中にケガをした選手の ID（injured と同じ順） */
  injuredIds?: string[];
  /** 検証用（R2）：練習した人数 × 日数（テスト前の短い練習は 0.5 日で数える） */
  practiceUnits?: number;
}

/** 自校の回復の倍率（フィジカルコーチ＋ケアルーム＋寮。上限あり） */
export function playerRecoveryMult(state: GameState): number {
  return totalRecoveryMult(staffByRole(state.staff, "physical")?.abilities.conditioning ?? 0, state.facilities);
}

/** 練習の補正（スタッフ・設備・キャプテン・特殊能力） */
function practiceOptions(state: GameState, school: School, kindFor: (p: Player) => PracticeKind) {
  const mood = captainConditionMults(school);
  return {
    staffMult: (p: Player) => practiceStaffMult(state.staff, p, kindFor(p), facilityPracticeBonus(state.facilities, kindFor(p))),
    recoveryMult: playerRecoveryMult(state),
    injuryMult: injuryMult(state.staff) * facilityInjuryMult(state.facilities),
    injuryDaysMult: injuryDaysMult(state.facilities),
    teamMult: captainPracticeMult(school),
    conditionDownMult: mood.down,
    conditionUpMult: mood.up,
    // ひらめき型の倍率は、カード 1 枚の間は同じ
    rolls: {} as Record<string, number>,
    playerInjuryMult: (p: Player) => durabilityMult(p.skills),
    // 月初の指示の重点と、補習・修学旅行で練習に出ない部員（R2）
    focus: practiceFocus,
    absent: isAbsent,
  };
}

/** 進行カードを 1 枚使う（1 タップ） */
export function playCard(state: GameState, cardId: string): CardResult | null {
  if (state.pending || state.activeMatch || inTournamentRun(state)) return null;
  const cal = state.calendar;
  const idx = cal.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return null;
  const card = cal.hand[idx];
  return withRng(state, (rng) => {
    const r = moveDays(state, rng, card.value, card.practice);
    cal.hand.splice(cal.hand.indexOf(card), 1);
    refillHand(rng, cal, handSize(state.reputation));
    return r;
  });
}

/**
 * days 日進む。practice が null の日は練習しない（スカウトの訪問。体力はふつうに回復）。
 * 1 日ずつ：練習 → 世界の進行（CPU の試合など）→ 必ず止まるマスなら止まる。
 * 止まるかどうかはその日に判定する（前の日の試合の結果で、次のラウンドの組み合わせが決まるため）
 */
function moveDays(state: GameState, rng: Rng, value: number, practice: PracticeKind | null): CardResult {
  const cal = state.calendar;
  const from = cal.position;
  const last = Math.min(cal.squares.length - 1, from + value);
  const school = playerSchool(state);
  const mult = cal.nextPracticeMult;
  if (practice) cal.nextPracticeMult = 1;
  const gainsAll: NonNullable<GameState["calendar"]["lastGain"]>["perPlayer"] = {};
  const injured: Player[] = [];
  let to = from;
  const opts = practiceOptions(state, school, () => practice ?? "rest");
  const news: EventOutcome[] = [];
  let practiceUnits = 0;
  for (let d = from + 1; d <= last; d++) {
    startSchoolDay(state, d);
    const hurt = school.players.filter((p) => p.injuryDays > 0).map((p) => p.id);
    const sq = cal.squares[d];
    if (practice && schoolEventOf(sq) === "testPrep" && isStopSquare(state, sq)) {
      // テスト前の初日：方針を決めてから、この日の練習をする（confirmChoice）
      (state.school ??= {}).prepDayPractice = { day: d, practice };
    } else if (practice && !noPracticeDay(state, d)) {
      const pm = prepPracticeMults(state, d);
      const dayOpts = pm.exp === 1 && pm.fitness === 1 ? opts : { ...opts, playerExpMult: () => pm.exp, playerFitnessCostMult: () => pm.fitness };
      const r = runPractice(rng, school.players, practice, 1, mult, dayOpts);
      practiceUnits += Object.keys(r.gains).length * pm.exp;
      for (const [id, g] of Object.entries(r.gains)) {
        const acc = (gainsAll[id] ??= {});
        for (const [k, v] of Object.entries(g)) acc[k as keyof typeof acc] = (acc[k as keyof typeof acc] ?? 0) + (v ?? 0);
      }
      injured.push(...r.injured);
    } else idleDay(rng, school.players, NON_TARGET_FITNESS + DAILY_RECOVERY * opts.recoveryMult, opts);
    markHealed(state, hurt, d);
    news.push(...endOfSchoolDay(state, rng, d));
    cal.position = d;
    to = d;
    news.push(...processWorldDay(state, rng, d));
    if (monthlyDue(state, d) || (sq.major && isStopSquare(state, sq))) break;
  }
  const days = to - from;
  if (practice) cal.lastGain = { practice, perPlayer: gainsAll };
  for (const p of injured) {
    addLog(state, `${p.name}が練習中にケガをした（全治${p.injuryDays}日）`, "bad");
    state.staff.season.injuryDays += p.injuryDays;
  }

  // 止まったマスの効果
  const outcomes: EventOutcome[] = [...news];
  const sq = cal.squares[to];
  let stoppedAt: MajorKind | undefined;
  const stopMajor = !!sq.major && isStopSquare(state, sq);
  if (days > 0 && (stopMajor || monthlyDue(state, to))) {
    if (stopMajor) stoppedAt = sq.major!.kind;
    const o = stopForDay(state, rng, to);
    if (o) outcomes.push(o);
  } else if (sq.baseType === "branch" && cal.branches?.some((b) => b.day === to && b.chosen === undefined)) {
    state.pending = { type: "branch", day: to };
    outcomes.push({ title: "分かれ道", text: "道が分かれている。どの道を進むか選ぼう。", tone: "info", kind: "branch" });
  } else if (days > 0 && sq.baseType === "person" && startChoiceEvent(state, rng)) {
    // 人物マス：選択肢のあるイベント（R2）。結果は confirmChoice で返す
  } else if (days > 0) {
    const donation = sq.baseType === "blue" ? tryDonation(state, rng) : null;
    if (donation) outcomes.push(addEventLines(state, donation));
    else {
      const ctx = { rng, players: school.players, reputation: state.reputation, calendar: cal, practice: practice ?? "rest", alumni: state.alumni, staff: state.staff };
      const o = addEventLines(state, landOnSquare(ctx, sq.baseType));
      outcomes.push(o);
      addLog(state, `${o.title}：${o.text}`, o.tone);
    }
  }
  updatePlayerRank(state);
  grantFacilitiesForReputation(state);
  return { from, to, days, practice: practice ? PRACTICE_NAMES[practice] : "練習なし", outcomes, stoppedAt, injured: injured.map((p) => p.name), injuredIds: injured.map((p) => p.id), practiceUnits };
}

/** OB からの寄付（青マス。年 1 回まで） */
function tryDonation(state: GameState, rng: Rng): EventOutcome | null {
  if (state.lastDonationYear === state.year) return null;
  if (!rng.chance(donationChance(state.alumni))) return null;
  const id = lowestFacility(state.facilities, 3, rng);
  if (!id) return null;
  const e = raiseFacility({ year: state.year, facilities: state.facilities, facilityLog: state.facilityLog, facilityGrantedLevel: state.facilityGrantedLevel }, id, "donation");
  if (!e) return null;
  state.lastDonationYear = state.year;
  const text = facilityLogText(e);
  addLog(state, `OBからの寄付：${text}`, "good");
  return { title: "OBからの寄付", text, tone: "good", kind: "donation" };
}

/**
 * 必ず止まる日の処理（R2）。月初の指示がある日は、先に指示（卒業式の日だけは卒業式が先）、そのあと大マス。
 * 結果をその場で見せる行事（テスト・修学旅行）は、場面の出来事を返す
 */
function stopForDay(state: GameState, rng: Rng, day: number): EventOutcome | null {
  const sq = state.calendar.squares[day];
  const major = !!sq.major && isStopSquare(state, sq);
  if (monthlyDue(state, day)) {
    state.monthly ??= { doneMonth: -1 };
    if (major && sq.major!.kind === "graduation") {
      state.monthly.after = "monthly";
      return setPendingForMajor(state, rng, sq);
    }
    beginMonthly(state, rng, day);
    if (major) state.monthly.after = "major";
    else delete state.monthly.after;
    return null;
  }
  return major ? setPendingForMajor(state, rng, sq) : null;
}

/** 練習試合の申し込み（試合の PRACTICE_OFFER_DAYS 日前。R2）。届いたら速報の出来事を返す */
function deliverOffer(state: GameState, rng: Rng, matchDay: number): EventOutcome | null {
  const sq = state.calendar.squares[matchDay];
  if (sq?.major?.kind !== "practiceMatch") return null;
  const school = (state.school ??= {});
  if (school.offers?.[matchDay]) return null;
  const opp = pickPracticeOpponent(state, rng);
  school.offers = { ...school.offers, [matchDay]: opp.id };
  const text = `${opp.name}（ランク${opp.rank}）から、${formatDay(matchDay)}の練習試合の申し込みが届いた。`;
  addLog(state, text, "info");
  return { title: "練習試合の申し込み", text, tone: "info", kind: "offer" };
}

/** ケガが治った日を記録する（選択肢のイベント「ケガからの復帰」用） */
function markHealed(state: GameState, before: string[], day: number) {
  if (before.length === 0) return;
  const school = playerSchool(state);
  for (const id of before) {
    const p = school.players.find((x) => x.id === id);
    if (p && p.injuryDays <= 0) (state.eventMemory ??= {})[`healed:${id}`] = absDay(state, day);
  }
}

/** 1 日の終わりの学校生活（補習・修学旅行の残り日数）。修学旅行から帰った日は速報を返す */
function endOfSchoolDay(state: GameState, rng: Rng, day: number): EventOutcome[] {
  const back = endSchoolDay(state, rng, day);
  if (back.length === 0) return [];
  const text = `修学旅行から2年生が帰ってきた。${back.map((n) => n.split(" ")[0]).join("・")}は気分転換になったようだ（調子 ＋1）。`;
  addLog(state, text, "good");
  return [{ title: "修学旅行から帰ってきた", text, tone: "good", kind: "tripReturn" }];
}

/** 人物マス：条件に合う選択肢のイベントを起こす（無ければ false） */
function startChoiceEvent(state: GameState, rng: Rng): boolean {
  const pick = pickChoiceEvent(state, rng);
  if (!pick) return false;
  rememberChoice(state, pick.def, pick.cast);
  state.pending = { type: "choice", eventId: pick.def.id, cast: encodeCast(pick.cast) };
  return true;
}

/** ID を決めて選択肢のイベントを起こす（学校行事の選択・合宿の夜） */
function startChoiceById(state: GameState, rng: Rng, id: string): boolean {
  const pick = prepareChoice(state, rng, id);
  if (!pick) return false;
  rememberChoice(state, pick.def, pick.cast);
  state.pending = { type: "choice", eventId: pick.def.id, cast: encodeCast(pick.cast) };
  return true;
}

function setPendingForMajor(state: GameState, rng: Rng, sq: Square): EventOutcome | null {
  const kind = sq.major!.kind;
  if (kind === "school") {
    const ev = sq.major!.event;
    if (ev === "test") {
      const o = runTest(state, rng, sq.major!.round ?? 0, sq.day);
      addLog(state, `${o.title}：平均${state.school?.lastTest?.average ?? 0}点${state.school?.lastTest?.failed.length ? `。赤点${state.school.lastTest.failed.length}人は補習` : "。赤点なし"}。`, o.tone);
      return o;
    }
    if (ev === "schoolTrip") {
      const o = tripOutcome(state);
      addLog(state, o.text, "info");
      return o;
    }
    // テスト前・体育祭・文化祭は選択肢の場面
    if (ev && !startChoiceById(state, rng, ev)) {
      // 部員がいないなど：テスト前は「短くする」にしておく
      if (ev === "testPrep") setTestPrep(state, sq.major!.round ?? 0, "short");
    }
    return null;
  }
  if (kind === "practiceMatch") {
    const offered = state.school?.offers?.[sq.day];
    const opp = offered && state.schools[offered] ? state.schools[offered] : pickPracticeOpponent(state, rng);
    state.pending = { type: "match", kind: "practice", opponentId: opp.id };
    addLog(state, `${COMPETITION_NAMES.practice}：${opp.name}（ランク${opp.rank}）と対戦する。`, "info");
  } else if (isCompetitionKind(kind)) {
    const b = bracketOf(state, kind)!;
    const round = sq.major!.round ?? 0;
    const m = findMatch(b, round, state.playerSchoolId)!;
    const oppId = m.a === state.playerSchoolId ? m.b! : m.a!;
    state.pending = { type: "match", kind, opponentId: oppId, bracketMatchId: m.id, round };
    addLog(state, `${competitionName(state, kind)} ${roundLabel(totalRounds(b), round, b.qualifiers)}：${state.schools[oppId].name}と対戦する。`, "info");
  } else if (kind === "league") {
    const f = fixtureOn(state.league!, state.playerSchoolId, sq.day)!;
    const oppId = f.fixture.home === state.playerSchoolId ? f.fixture.away : f.fixture.home;
    state.pending = { type: "match", kind: "league", opponentId: oppId, bracketMatchId: f.fixture.id, round: f.round };
    addLog(state, `${playerLeagueName(state)} 第${f.round + 1}節：${state.schools[oppId].name}と対戦する。`, "info");
  } else if (kind === "camp") {
    const season: CampSeason = sq.major!.round === 1 ? "winter" : "summer";
    state.pending = { type: "camp", season };
    addLog(state, `${CAMP_NAMES[season]}に出発する。ポジションごとの練習方針を決めよう。`, "info");
  } else if (kind === "scoutReply") {
    resolveScoutReply(state, rng);
    state.pending = { type: "scoutReply" };
  } else if (kind === "graduation") {
    state.pending = { type: "graduation" };
  } else if (kind === "yearEnd") {
    state.pending = { type: "yearEnd" };
  }
  return null;
}

/** 練習試合の相手：基本はランクが近い学校。2〜3 回に 1 回はランクが 1〜2 段階上の学校 */
export function pickPracticeOpponent(state: GameState, rng: Rng): School {
  const me = playerSchool(state);
  const myRank = rankIndex(me.rank);
  const pref = ownPrefecture(state);
  const cpus = pref.schoolIds.filter((id) => id !== me.id).map((id) => state.schools[id]);
  state.competitions.practiceMatchCount++;
  const stronger = rng.chance(PRACTICE_MATCH.strongerChance);
  const fits = (s: School) => {
    const d = rankIndex(s.rank) - myRank;
    return stronger ? d >= 1 && d <= 2 : Math.abs(d) <= 1;
  };
  let pool = cpus.filter(fits);
  if (pool.length === 0) {
    // 条件に合う学校がなければ、ランクが一番近い学校から選ぶ
    const target = stronger ? myRank + 1 : myRank;
    const best = Math.min(...cpus.map((s) => Math.abs(rankIndex(s.rank) - target)));
    pool = cpus.filter((s) => Math.abs(rankIndex(s.rank) - target) === best);
  }
  return rng.pick(pool);
}

// ================= 大会の本戦の連戦（P2c） =================

/** 本戦の途中か（連戦の疲労を持ち越す大会で、自校が初戦を終えて勝ち残っている間）。この間はカードを使わない */
export function inTournamentRun(state: GameState): boolean {
  return !!tournamentRunBracket(state);
}

function tournamentRunBracket(state: GameState): Bracket | undefined {
  const me = state.playerSchoolId;
  for (const kind of CARRY_FATIGUE_KINDS) {
    const b = bracketOf(state, kind);
    if (!b || isFinished(b) || !isAlive(b, me)) continue;
    const played = b.rounds.some((round) => round.some((m) => (m.a === me || m.b === me) && m.a !== null && m.b !== null && m.winner !== undefined));
    if (played && b.roundDays[b.roundsDone] > state.calendar.position) return b;
  }
  return undefined;
}

/** 本戦の次の試合の日 */
export function nextTournamentMatchDay(state: GameState): number | null {
  const b = tournamentRunBracket(state);
  return b ? b.roundDays[b.roundsDone] : null;
}

/** 本戦の間：「次の試合へ」。試合のない日は調整日（練習なし・回復だけ）にして、次の試合の日まで進む */
export function advanceToNextMatch(state: GameState): CardResult | null {
  if (state.pending || state.activeMatch) return null;
  const target = nextTournamentMatchDay(state);
  if (target === null) return null;
  return withRng(state, (rng) => {
    const cal = state.calendar;
    const from = cal.position;
    const school = playerSchool(state);
    const recovery = ADJUST_DAY_RECOVERY * playerRecoveryMult(state);
    let to = from;
    let stoppedAt: MajorKind | undefined;
    const outcomes: EventOutcome[] = [];
    for (let d = from + 1; d <= target; d++) {
      startSchoolDay(state, d);
      const hurt = school.players.filter((p) => p.injuryDays > 0).map((p) => p.id);
      const mood = captainConditionMults(school);
      idleDay(rng, school.players, recovery, { conditionDownMult: mood.down, conditionUpMult: mood.up });
      markHealed(state, hurt, d);
      outcomes.push(...endOfSchoolDay(state, rng, d));
      cal.position = d;
      to = d;
      outcomes.push(...processWorldDay(state, rng, d));
      const sq = cal.squares[d];
      const stopMajor = !!sq.major && isStopSquare(state, sq);
      if (stopMajor || monthlyDue(state, d)) {
        if (stopMajor) stoppedAt = sq.major!.kind;
        const o = stopForDay(state, rng, d);
        if (o) outcomes.push(o);
        break;
      }
    }
    updatePlayerRank(state);
    return { from, to, days: to - from, practice: "調整", outcomes, stoppedAt, injured: [] };
  });
}

// ================= 世界の進行（CPU の試合など） =================

function processWorldDay(state: GameState, rng: Rng, day: number): EventOutcome[] {
  const news: EventOutcome[] = [];
  const offer = deliverOffer(state, rng, day + PRACTICE_OFFER_DAYS);
  if (offer) news.push(offer);
  if (day === dateToDay(...CPU_GROWTH.autumnDate)) {
    for (const s of Object.values(state.schools)) if (!s.isPlayer) autumnCpuGrowth(rng, s);
  }
  if (day === dateToDay(...STAFF_LIFE.poachDate)) checkPoaching(state, rng);
  if (day === dateToDay(...SCOUT.start)) beginScout(state, rng);
  const sc = state.scout;
  if (sc && !sc.replied && sc.cardDays.includes(day) && sc.cardsDelivered < sc.cardsTotal) {
    sc.cards++;
    sc.cardsDelivered++;
    addLog(state, `スカウトカードが届いた（残り${sc.cards}枚）。候補の中学生を訪ねよう。`, "info");
  }
  if (day === dateToDay(...ROOKIE_PREF_SETUP_DATE)) setupRookiePref(state, rng);
  processLeagueDay(state, rng, day);
  const c = state.competitions;
  for (const kind of COMPETITION_KINDS) {
    const b = c[kind];
    if (!b || isFinished(b)) continue;
    const r = b.roundsDone;
    if (b.roundDays[r] !== day) continue;
    // プレイヤー校の試合が残っているラウンドは、プレイヤーの試合の後でまとめて計算する
    const mine = findMatch(b, r, state.playerSchoolId);
    if (mine && mine.winner === undefined) continue;
    simulateRemainingRound(state, rng, b);
  }
  return news;
}

function rulesFor(b: Bracket, round: number): MatchRules {
  return WINTER_KINDS.includes(b.kind) ? winterRulesForRound(totalRounds(b), round) : summerRulesForRound(totalRounds(b), round);
}

/** 大舞台（全国大会と、県予選の決勝。SPEC 7.5・7.7） */
export function isBigStage(b: Bracket, round: number): boolean {
  if (b.kind === "national" || b.kind === "summerNational") return true;
  return (b.kind === "prefQualifier" || b.kind === "summerQualifier") && round === totalRounds(b) - 1;
}

function simulateRemainingRound(state: GameState, rng: Rng, b: Bracket) {
  const r = b.roundsDone;
  const opts = { bigStage: isBigStage(b, r), maxGrade: isRookieKind(b.kind) ? 2 : undefined, carryDay: isCarryKind(b.kind) ? b.roundDays[r] : undefined };
  for (const m of b.rounds[r]) {
    if (m.winner !== undefined || !m.a || !m.b) continue;
    recordResult(m, simulateCpuMatch(rng.fork(m.id), state.schools[m.a], state.schools[m.b], rulesFor(b, r), opts));
  }
  advanceRound(b, rng);
  if (isFinished(b)) onBracketFinished(state, rng, b);
}

function onBracketFinished(state: GameState, rng: Rng, b: Bracket) {
  const qualified = b.qualifiedIds ?? [];
  const names = qualified.map((id) => state.schools[id].name).join("・");
  const mine = qualified.includes(state.playerSchoolId);
  const name = competitionName(state, b.kind);
  addLog(state, `${name}は${names}が${qualified.length > 1 ? "代表になった" : "優勝した"}。`, mine ? "good" : "info");
  if (b.kind === "prefQualifier") setupNational(state, rng, qualified);
  else if (b.kind === "summerQualifier") setupSummerNational(state, rng, qualified);
  else if (b.kind === "rookiePref") {
    const standings = bracketStandings(state, b);
    state.competitions.rookieSeeds = standings.slice(0, SUMMER.rookieSeedCount);
    setupRookieRegion(state, rng, standings);
  }
  if (isCarryKind(b.kind)) {
    for (const round of b.rounds) for (const m of round) for (const id of [m.a, m.b]) if (id) delete state.schools[id].carryFitness;
  }
}

/** 勝ち上がった順（同じラウンドで負けた学校はチーム力順） */
export function bracketStandings(state: GameState, b: Bracket): string[] {
  const ids = new Set<string>();
  for (const m of b.rounds[0]) for (const id of [m.a, m.b]) if (id) ids.add(id);
  const depth = (id: string) => (b.championId === id ? 99 : reachedRound(b, id));
  return [...ids].sort((x, y) => depth(y) - depth(x) || teamStrength(state.schools[y].players) - teamStrength(state.schools[x].players));
}

/** 表示しない予選（他県。同じ試合エンジンで計算）で代表を決める */
function runHiddenQualifier(state: GameState, rng: Rng, schoolIds: string[], reps: number, rules: (total: number, round: number) => MatchRules = winterRulesForRound, maxGrade?: number): string[] {
  const squad = (id: string) => (maxGrade ? state.schools[id].players.filter((p) => p.grade <= maxGrade) : state.schools[id].players);
  const ids = [...schoolIds].sort((a, b) => teamStrength(squad(b)) - teamStrength(squad(a)));
  if (ids.length <= reps) return ids;
  const mini = createBracket("prefQualifier", ids, [0, 0, 0, 0, 0], rng, reps);
  while (!isFinished(mini)) {
    const r = mini.roundsDone;
    for (const m of mini.rounds[r]) {
      if (m.winner !== undefined || !m.a || !m.b) continue;
      recordResult(m, simulateCpuMatch(rng.fork(m.id), state.schools[m.a], state.schools[m.b], rules(totalRounds(mini), r), { maxGrade }));
    }
    advanceRound(mini, rng);
  }
  return mini.qualifiedIds ?? [];
}

/** 他県の代表を決めて、冬の全国大会（48 校）の組み合わせを作る */
function setupNational(state: GameState, rng: Rng, ownReps: string[]) {
  const reps: string[] = [...ownReps];
  for (const pref of state.prefectures) {
    if (pref.isPlayerPref) continue;
    reps.push(...runHiddenQualifier(state, rng, pref.schoolIds, pref.reps));
  }
  rng.shuffle(reps);
  state.competitions.national = createBracket("national", reps, nationalDays(roundsFor(reps.length)), rng);
  if (ownReps.includes(state.playerSchoolId)) addLog(state, `${COMPETITION_NAMES.national}への出場が決まった！`, "good");
}

/** 他県の代表を決めて、夏の全国大会（51 校）の組み合わせを作る。同じ県の 2 校は別のブロック（左右の半分）に入れる */
function setupSummerNational(state: GameState, rng: Rng, ownReps: string[]) {
  const prefOf = new Map<string, string>();
  const own = ownPrefecture(state);
  for (const id of ownReps) prefOf.set(id, own.id);
  const reps: string[] = [...ownReps];
  for (const pref of state.prefectures) {
    if (pref.isPlayerPref) continue;
    const q = runHiddenQualifier(state, rng, pref.schoolIds, pref.summerReps, summerRulesForRound);
    for (const id of q) prefOf.set(id, pref.id);
    reps.push(...q);
  }
  rng.shuffle(reps);
  separateSamePref(rng, reps, (id) => prefOf.get(id) ?? "");
  state.competitions.summerNational = createBracket("summerNational", reps, competitionDays("summerNational", roundsFor(reps.length)), rng);
  if (ownReps.includes(state.playerSchoolId)) addLog(state, `${COMPETITION_NAMES.summerNational}への出場が決まった！`, "good");
}

/** シード順の並び（ids）で、同じ県の 2 校が同じ半分に入らないように入れ替える */
export function separateSamePref(rng: Rng, ids: string[], prefOf: (id: string) => string) {
  const size = 1 << roundsFor(ids.length);
  const order = seedOrder(size);
  const half = (k: number) => (order.indexOf(k) < size / 2 ? 0 : 1);
  const byPref = new Map<string, number[]>();
  ids.forEach((id, k) => byPref.set(prefOf(id), [...(byPref.get(prefOf(id)) ?? []), k]));
  for (const ks of byPref.values()) {
    if (ks.length < 2 || half(ks[0]) !== half(ks[1])) continue;
    const target = 1 - half(ks[0]);
    const swaps = ids.map((_, k) => k).filter((k) => half(k) === target && (byPref.get(prefOf(ids[k]))?.length ?? 0) === 1);
    if (swaps.length === 0) continue;
    const k3 = rng.pick(swaps);
    [ids[ks[1]], ids[k3]] = [ids[k3], ids[ks[1]]];
  }
}

/** 新人戦の県大会（1・2 年生のみ。チーム力順のシード） */
function setupRookiePref(state: GameState, rng: Rng) {
  const pref = ownPrefecture(state);
  const squad = (id: string) => state.schools[id].players.filter((p) => p.grade <= 2 && p.status === "active");
  const ids = [...pref.schoolIds].map((id) => ({ id, s: teamStrength(squad(id)) + rng.normal(0, 1.5) })).sort((a, b) => b.s - a.s).map((x) => x.id);
  state.competitions.rookiePref = createBracket("rookiePref", ids, competitionDays("rookiePref", roundsFor(ids.length)), rng);
  addLog(state, `${competitionName(state, "rookiePref")}の組み合わせが決まった。`, "info");
}

/** 新人戦の地域大会：各県 2 校（自県は県大会の決勝の 2 校）。1 道だけの地域は県大会の上位 8 校 */
function setupRookieRegion(state: GameState, rng: Rng, standings: string[]) {
  const prefs = regionPrefectures(state);
  let teams: string[];
  if (prefs.length === 1) teams = standings.slice(0, ROOKIE_REGION.singlePrefTeams);
  else {
    teams = standings.slice(0, ROOKIE_REGION.repsPerPref);
    for (const pref of prefs) {
      if (pref.isPlayerPref) continue;
      teams.push(...runHiddenQualifier(state, rng, pref.schoolIds, ROOKIE_REGION.repsPerPref, summerRulesForRound, 2));
    }
  }
  rng.shuffle(teams);
  state.competitions.rookieRegion = createBracket("rookieRegion", teams, competitionDays("rookieRegion", roundsFor(teams.length)), rng);
  if (teams.includes(state.playerSchoolId)) addLog(state, `${competitionName(state, "rookieRegion")}への出場が決まった！`, "good");
}

// ================= 合宿・分岐・スカウト（P2c） =================

/** 合宿を行う（方針を決めると、合宿の日数分を自動で進める） */
export function confirmCamp(state: GameState, policy: CampPolicy): CampResult | null {
  const p = state.pending;
  if (p?.type !== "camp" || !isValidCampPolicy(policy)) return null;
  return withRng(state, (rng) => {
    const school = playerSchool(state);
    const days = campDays(p.season);
    const cal = state.calendar;
    const base = practiceOptions(state, school, (pl) => policy[positionGroup(pl.mainPosition)]);
    const head = staffByRole(state.staff, "head");
    const result = runCamp(rng, school.players, p.season, policy, days.length, {
      ...base,
      learnMult: campLearnMult(state.facilities.ground, head?.abilities.coaching ?? 0),
      onDay: (i) => {
        cal.position = days[i];
        processWorldDay(state, rng, days[i]);
      },
    });
    for (const name of result.injured) addLog(state, `${name}が合宿中にケガをした`, "bad");
    for (const l of result.learned) addLog(state, `${l.name}が${CAMP_NAMES[p.season]}で「${SKILL_NAMES[l.skill]}」を身につけた！`, "good");
    addLog(state, `${CAMP_NAMES[p.season]}を終えた（${days.length}日間）。`, "good");
    state.campPolicy = { ...policy };
    state.pending = undefined;
    updatePlayerRank(state);
    // 合宿の最後の夜（選択肢のあるイベント。R2）
    startChoiceById(state, rng, "campNight");
    return result;
  });
}

/** 分岐マスで道を選ぶ */
export function chooseBranch(state: GameState, index: number): string | null {
  const p = state.pending;
  if (p?.type !== "branch") return "道を選ぶ時期ではありません";
  if (!chooseBranchPath(state.calendar, p.day, index)) return "その道は選べません";
  const b = state.calendar.branches!.find((x) => x.day === p.day)!;
  addLog(state, `${BRANCH_THEME_NAMES[b.paths[index].theme]}を進むことにした。`, "info");
  state.pending = undefined;
  return null;
}

/** 11/1：候補リストを作る */
function beginScout(state: GameState, rng: Rng) {
  const t = REPUTATION_TABLE[state.reputation.level];
  const ctx = scoutContext(state, analystScouting(state.staff));
  state.scout = startScoutSeason(rng, ctx, scoutCardDays(t.scoutCards, dateToDay(...SCOUT.start), dateToDay(...SCOUT.lastCard)));
  addLog(state, `特待生スカウトの期間が始まった。候補は${state.scout.candidates.length}人。`, "info");
}

/** スカウトカードを使って候補を訪問する（1 日進む。その日は練習しない） */
export function visitScout(state: GameState, candidateId: string): { visit: VisitResult; card: CardResult } | null {
  const sc = state.scout;
  if (!sc || sc.replied || sc.cards <= 0 || state.pending || state.activeMatch || inTournamentRun(state)) return null;
  return withRng(state, (rng) => {
    const visit = visitCandidate(rng, sc, scoutContext(state, analystScouting(state.staff)), candidateId);
    if (!visit) return null;
    sc.cards--;
    const c = visit.candidate;
    addLog(state, `${c.player.name}（${state.prefectures.find((p) => p.id === c.prefectureId)?.name ?? ""}）を訪ねた。${visit.improved ? "反応が良くなった。" : ""}`, visit.improved ? "good" : "info");
    const card = moveDays(state, rng, 1, null);
    return { visit, card };
  });
}

/** 勧誘中の候補の優先順を変える */
export function setScoutPriority(state: GameState, ids: string[]) {
  const sc = state.scout;
  if (!sc) return;
  const courting = new Set(sc.candidates.filter((c) => c.status === "courting").map((c) => c.id));
  sc.priority = [...ids.filter((id) => courting.has(id)), ...sc.priority.filter((id) => !ids.includes(id))];
}

function resolveScoutReply(state: GameState, rng: Rng): ReplyResult | null {
  const sc = state.scout;
  if (!sc || sc.replied) return null;
  const r = resolveReplies(rng, sc, REPUTATION_TABLE[state.reputation.level].scholarshipSlots);
  for (const c of r.joined) addLog(state, `${c.player.name}が特待生として入部することになった！`, "good");
  for (const c of r.lost) addLog(state, `${c.player.name}は${c.lostTo === "youth" ? YOUTH_TEAM_NAME : (state.schools[c.lostTo!]?.name ?? "他校")}に進むことになった。`, "bad");
  if (r.joined.length + r.lost.length + r.declined.length === 0) addLog(state, "今年は特待生の勧誘をしなかった。", "info");
  return r;
}

/** スカウトの返事を確かめた */
export function confirmScoutReply(state: GameState) {
  if (state.pending?.type === "scoutReply") state.pending = undefined;
}

// ================= 試合 =================

function pendingBracket(state: GameState): Bracket | undefined {
  const p = state.pending;
  if (p?.type !== "match" || p.kind === "practice" || p.kind === "league") return undefined;
  return bracketOf(state, p.kind);
}

export function pendingMatchRules(state: GameState): MatchRules | null {
  const p = state.pending;
  if (!p || p.type !== "match") return null;
  if (p.kind === "practice") return PRACTICE_RULES;
  if (p.kind === "league") return LEAGUE_RULES;
  return rulesFor(pendingBracket(state)!, p.round ?? 0);
}

export function pendingMatchLabel(state: GameState): string {
  const p = state.pending;
  if (!p || p.type !== "match") return "";
  if (p.kind === "practice") return COMPETITION_NAMES.practice;
  if (p.kind === "league") return `${playerLeagueName(state)} 第${(p.round ?? 0) + 1}節`;
  const b = pendingBracket(state)!;
  return `${competitionName(state, p.kind)} ${roundLabel(totalRounds(b), p.round ?? 0, b.qualifiers)}`;
}

/** 試合前の画面の初期値（前回の采配をもとに、出られる選手でベストの並び） */
export function defaultSetup(state: GameState): TeamSetup {
  const school = playerSchool(state);
  const rules = pendingMatchRules(state) ?? PRACTICE_RULES;
  return autoSetup(eligiblePlayers(state), school.formation, school.tactics, rules.benchSize);
}

/** 次の試合が大舞台か（全国大会・県予選の決勝） */
export function pendingIsBigStage(state: GameState): boolean {
  const p = state.pending;
  const b = pendingBracket(state);
  return !!b && p?.type === "match" && p.round !== undefined && isBigStage(b, p.round);
}

/** 次の試合が公式戦か */
export function pendingIsOfficial(state: GameState): boolean {
  return state.pending?.type === "match" && state.pending.kind !== "practice";
}

/** 次の試合に出られる部員（公式戦では出場停止の選手を除く。新人戦は 1・2 年生だけ） */
export function eligiblePlayers(state: GameState): Player[] {
  const p = state.pending;
  let players = playerSchool(state).players;
  if (p?.type === "match" && isRookieKind(p.kind)) players = players.filter((x) => x.grade <= 2);
  return pendingIsOfficial(state) ? players.filter((x) => x.suspended <= 0) : players;
}

/** その試合で「結果のみ」を選べるか（練習試合と県リーグ。トーナメントは観戦のみ） */
export function canSkipWatching(state: GameState): boolean {
  return state.pending?.type === "match" && (state.pending.kind === "practice" || state.pending.kind === "league");
}

/**
 * 試合を始める（試合前の画面で決めた采配を使う）。
 * mode = "auto"（結果のみ）は練習試合と県リーグだけ。AI の監督が采配し、最後まで計算してから返す。
 */
export function startPlayerMatch(state: GameState, setup: TeamSetup, mode: "watch" | "auto" = "watch", noteId?: string | null): ActiveMatch | null {
  const p = state.pending;
  if (!p || p.type !== "match" || state.activeMatch) return null;
  if (mode === "auto" && !canSkipWatching(state)) return null;
  const rules = pendingMatchRules(state)!;
  const school = playerSchool(state);
  school.formation = setup.formation;
  school.tactics = { ...setup.tactics };
  const opp = state.schools[p.opponentId];
  const players = eligiblePlayers(state);
  const ok = new Set(players.filter((x) => x.status === "active").map((x) => x.id));
  // 出場停止などで出られない選手が入っていれば、並びを組み直す
  if (setup.lineup.length !== 11 || setup.lineup.some((id) => !ok.has(id))) setup = autoSetup(players, setup.formation, setup.tactics, rules.benchSize);
  else setup = { ...setup, bench: setup.bench.filter((id) => ok.has(id)) };
  if (noteId !== undefined) state.selectedNoteId = noteId ?? undefined;
  const note = noteId ? state.notes.find((n) => n.id === noteId) : undefined;
  const day = state.calendar.position;
  const carry = isCarryKind(p.kind);
  return withRng(state, (rng) => {
    const home = {
      ...schoolTeamInput(school, rules, true),
      players,
      setup,
      scouting: analystScouting(state.staff),
      aiQuality: headAiQuality(state.staff),
      injuryMult: injuryMult(state.staff) * facilityInjuryMult(state.facilities),
      note: note ? { noteName: note.name, rules: note.rules.map((r) => ({ ...r })), kind: p.kind } : undefined,
      // リーグ戦・練習試合の采配ありは、采配が試合前とハーフタイムだけ（SPEC 10.4）
      breaksOnly: canSkipWatching(state),
    };
    const away = schoolTeamInput(opp, rules, false, rng, { maxGrade: isRookieKind(p.kind) ? 2 : undefined, carryDay: carry ? day : undefined });
    const match: ActiveMatch = {
      kind: p.kind,
      round: p.round,
      bracketMatchId: p.bracketMatchId,
      userSide: 0,
      opponentId: opp.id,
      state: createMatch(rules, rng, home, away, p.kind, pendingIsBigStage(state)),
      started: true,
      mode,
    };
    // 表示用の情報（ユニフォーム・会場・見た目の写し。P4。乱数は使わない）
    decorateMatch(state, match);
    if (mode === "auto") {
      match.state.teams[0].isUser = false;
      simulateToEnd(match.state);
    }
    // 相手の CPU 校の、試合の前の体力を記録しておく（本戦。試合の後で消耗を引く）
    if (carry) opp.carryFitness = { day, fit: Object.fromEntries(away.players.map((x) => [x.id, x.fitness])) };
    state.activeMatch = match;
    return match;
  });
}

/**
 * 采配ありで観戦している途中から「結果のみ」に切り替える（リーグ戦・練習試合。P3 計画 Q4）。
 * 残りは AI の監督（ヘッドコーチの戦術眼）と作戦ノートが采配し、最後まで計算する。逆はできない
 */
export function switchToAuto(state: GameState): boolean {
  const am = state.activeMatch;
  if (!am || am.mode === "auto" || !canSkipWatching(state)) return false;
  am.mode = "auto";
  am.state.teams[am.userSide].isUser = false;
  simulateToEnd(am.state);
  return true;
}

export interface MatchSummary {
  kind: MatchKind;
  label: string;
  opponentName: string;
  score: [number, number];
  pk?: [number, number];
  result: "win" | "draw" | "loss";
  reputationDelta: number;
  levelChange: -1 | 0 | 1;
  eliminated: boolean;
  champion: boolean;
  qualifiedNational: boolean;
  /** 相手とのランク差（相手 − 自校。試合時点） */
  rankDiff: number;
  /** 得点の記録（結果のみの画面などで使う） */
  goals: { minute: number; mine: boolean; name: string; pk: boolean }[];
  /** 試合での成果で習得した・段階が上がった特殊能力 */
  learned: LearnEvent[];
  /** シュート（枠内）と支配率（自校, 相手。P3：結果の画面用） */
  stats: { shots: [number, number]; onTarget: [number, number]; possession: [number, number] };
  /** リーグ戦の試合なら、試合の後の順位（P3） */
  league?: { level: number; position: number; size: number; points: number; finished: boolean };
}

function leagueSummary(state: GameState): MatchSummary["league"] {
  const d = state.league ? divisionOf(state.league, state.playerSchoolId) : undefined;
  if (!d) return undefined;
  const table = standings(d);
  const i = table.findIndex((r) => r.schoolId === state.playerSchoolId);
  return { level: d.level, position: i + 1, size: table.length, points: table[i].points, finished: !!state.league?.final };
}

/** 大会ごとの成績の文字列を入れる */
function setResult(state: GameState, kind: CompetitionKind, text: string) {
  const c = state.competitions;
  if (WINTER_KINDS.includes(kind)) c.winterResult = text;
  else if (kind === "summerQualifier" || kind === "summerNational") c.summerResult = text;
  else c.rookieResult = text;
}

/** 大会で勝ち進んだときの評判のボーナス */
function competitionBonus(kind: CompetitionKind, won: boolean, champion: boolean): number {
  const B = REPUTATION_GAUGE.bonus;
  switch (kind) {
    case "prefQualifier":
      return champion ? B.prefChampion : 0;
    case "national":
      return (won ? B.nationalWinPerRound : 0) + (champion ? B.nationalChampion : 0);
    case "summerQualifier":
      return champion ? B.summerPrefChampion : 0;
    case "summerNational":
      return (won ? B.summerNationalWinPerRound : 0) + (champion ? B.summerNationalChampion : 0);
    case "rookiePref":
      return champion ? B.rookiePrefChampion : 0;
    case "rookieRegion":
      return champion ? B.rookieRegionChampion : 0;
  }
}

/** 試合終了後の処理（評判・トーナメントの進行・引退） */
export function finishPlayerMatch(state: GameState): MatchSummary | null {
  const am = state.activeMatch;
  if (!am || am.state.phase !== "END") return null;
  const ms = am.state;
  const label = pendingMatchLabel(state);
  return withRng(state, (rng) => {
    const school = playerSchool(state);
    const opp = state.schools[am.opponentId];
    const me = ms.teams[am.userSide];
    const official = am.kind !== "practice";
    const bracket = am.kind !== "practice" && am.kind !== "league" ? bracketOf(state, am.kind) : undefined;
    // 出場停止は公式戦 1 試合で消化する（この試合の退場は次の公式戦から）
    if (official) for (const pl of school.players) if (pl.suspended > 0) pl.suspended--;
    const myScore = ms.score[am.userSide];
    const oppScore = ms.score[am.userSide === 0 ? 1 : 0];
    const won = ms.winner === am.userSide;
    const result: MatchSummary["result"] = ms.winner === null || ms.winner === undefined ? "draw" : won ? "win" : "loss";
    // 冬の全国大会の決勝の決勝点（相手の得点 + 1 点目）
    const isNationalFinal = am.kind === "national" && am.round !== undefined && !!bracket && am.round === totalRounds(bracket) - 1;
    const winnerGoal = isNationalFinal && won && !ms.pk ? ms.events.filter((e) => e.side === am.userSide && (e.type === "goal" || e.type === "pkGoal"))[oppScore] : undefined;
    const learned: LearnEvent[] = [];
    const fullMinutes = ms.rules.halfMinutes * 2;
    const injuryDaysScale = injuryDaysMult(state.facilities);
    // 試合に出た選手：体力の消耗・成績・退場・ケガ
    for (const id of [...me.onPitch, ...me.subbedOff]) {
      const pl = school.players.find((x) => x.id === id);
      const mp = me.players[id];
      if (!pl || !mp) continue;
      // 試合経験点・熟練度（出場時間で按分。P2b）
      const share = Math.min(1.5, (mp.minutes ?? fullMinutes) / fullMinutes);
      giveMatchExp(pl, share);
      gainProficiency(pl, (official ? PROFICIENCY.perOfficialMatch : PROFICIENCY.perMatch) * share);
      // 試合での成果
      learned.push(...applyMatchFeats(rng, pl, mp, { official, nationalFinalWinner: winnerGoal?.players?.[0] === id }));
      // 負けず嫌い：負けた後に調子を落とすことがある
      if (result === "loss" && pl.personality === "competitive" && rng.chance(PERSONALITY_MATCH.competitiveLossSlumpChance)) pl.condition = Math.max(-2, pl.condition - 1) as Player["condition"];
      pl.fitness = Math.max(0, pl.fitness - matchFatigueDrop(mp.stamina));
      pl.record.apps++;
      pl.record.goals += mp.goals;
      if (official) {
        pl.record.officialApps++;
        pl.record.officialGoals += mp.goals;
      }
      if (mp.sentOff) {
        pl.suspended = Math.max(pl.suspended, 1);
        addLog(state, `${pl.name}は退場のため、次の公式戦に出場停止。`, "bad");
      }
      if (mp.injury) {
        const [lo, hi] = MATCH.injury.days[mp.injury.severity];
        const days = Math.max(1, Math.round(rng.int(lo, hi) * injuryDaysScale));
        pl.injuryDays = Math.max(pl.injuryDays, days);
        state.staff.season.injuryDays += days;
        addLog(state, `${pl.name}が試合中のケガで離脱（全治${days}日）`, "bad");
      }
    }
    // 相手の体力を持ち越す（本戦）
    const oc = opp.carryFitness;
    if (oc && bracket && isCarryKind(am.kind)) {
      const team = ms.teams[am.userSide === 0 ? 1 : 0];
      for (const id of [...team.onPitch, ...team.subbedOff]) {
        const mp = team.players[id];
        if (mp && oc.fit[id] !== undefined) oc.fit[id] = Math.max(0, oc.fit[id] - matchFatigueDrop(mp.stamina));
      }
    }
    // スタッフの成果の記録
    const season = state.staff.season;
    if (official) {
      season.officialMatches++;
      season.goalsAgainst += oppScore;
      if (won) season.officialWins++;
    }
    if (ms.pk) {
      season.pkShootouts++;
      if (won) season.pkShootoutWins++;
    }
    season.inMatchPkGood += ms.events.filter((e) => e.side === am.userSide && (e.type === "pkGoal" || e.type === "pkSaved")).length;
    for (const l of learned) addLog(state, learnLog(l), "good");
    const viaPk = !!ms.pk;
    updatePlayerRank(state);
    const levelBefore = state.reputation.level;
    let delta = matchReputationDelta(state.reputation.level, am.kind, school.rank, opp.rank, result, viaPk);
    let eliminated = false;
    let champion = false;
    let qualifiedNational = false;

    if (am.kind === "league" && state.league) {
      const f = findFixture(state.league, am.bracketMatchId!);
      if (f) f.score = f.home === state.playerSchoolId ? [myScore, oppScore] : [oppScore, myScore];
    }
    if (bracket) {
      const b = bracket;
      const found = findMatchById(b, am.bracketMatchId!)!;
      const m = found.match;
      const aIsMe = m.a === state.playerSchoolId;
      recordResult(m, {
        winner: won ? state.playerSchoolId : opp.id,
        score: aIsMe ? [myScore, oppScore] : [oppScore, myScore],
        pk: ms.pk ? (aIsMe ? [ms.pk.score[am.userSide], ms.pk.score[1 - am.userSide]] : [ms.pk.score[1 - am.userSide], ms.pk.score[am.userSide]]) : undefined,
      });
      // 同じラウンドの残りの試合を計算する
      if (b.roundDays[b.roundsDone] <= state.calendar.position) simulateRemainingRound(state, rng, b);
      const isChampion = won && !!b.qualifiedIds?.includes(state.playerSchoolId);
      delta += competitionBonus(b.kind, won, isChampion);
      const name = competitionName(state, b.kind);
      if (!won) {
        eliminated = true;
        setResult(state, b.kind, `${label}敗退`);
        // 3 年生は冬の大会で負けたら引退する（夏・新人戦では引退しない）
        if (WINTER_KINDS.includes(b.kind)) {
          retireThirdYears(state);
          state.competitions.retiredDay = state.calendar.position;
        }
      } else if (isChampion) {
        champion = true;
        if (b.kind === "prefQualifier" || b.kind === "summerQualifier") {
          qualifiedNational = true;
          setResult(state, b.kind, `${ownPrefecture(state).name}代表`);
        } else if (b.kind === "rookiePref") {
          setResult(state, b.kind, `${name} 優勝`);
        } else {
          setResult(state, b.kind, `${name} 優勝`);
          if (b.kind === "national") retireThirdYears(state);
        }
      } else if ((b.qualifiers ?? 1) > 1 && b.qualifiedIds?.includes(state.playerSchoolId)) {
        // 代表 2 校の県（決勝なし）
        qualifiedNational = true;
        setResult(state, b.kind, `${ownPrefecture(state).name}代表`);
      }
      // 新人戦の県大会で決勝まで進めば、地域大会に出られる
      if (b.kind === "rookiePref" && !won && found.round === totalRounds(b) - 1) setResult(state, b.kind, `${name} 準優勝`);
    }
    const change = addGauge(state.reputation, delta);
    if (am.kind === "league") checkLeagueEnd(state);
    const resultText = result === "win" ? "勝利" : result === "draw" ? "引き分け" : "敗戦";
    const pkText = ms.pk ? `（PK ${ms.pk.score[am.userSide]}-${ms.pk.score[1 - am.userSide]}）` : "";
    addLog(state, `${label} vs ${opp.name}：${myScore}-${oppScore}${pkText} ${resultText}`, result === "win" ? "good" : result === "loss" ? "bad" : "info");
    if (change.levelChange !== 0) {
      addLog(
        state,
        `評判が「${REPUTATION_NAMES[levelBefore]}」から「${REPUTATION_NAMES[state.reputation.level]}」に${change.levelChange > 0 ? "上がった" : "下がった"}。`,
        change.levelChange > 0 ? "good" : "bad",
      );
      refillHand(rng, state.calendar, handSize(state.reputation));
    }
    grantFacilitiesForReputation(state);
    if (official) resolvePromises(state, new Set([...me.onPitch, ...me.subbedOff]), result);
    state.activeMatch = undefined;
    state.pending = undefined;
    // 3 年生の引退でキャプテンがいなくなったら、新しいキャプテンを指名する
    if (!captainOf(school) && school.players.some((x) => x.status === "active")) {
      autoCaptain(school);
      state.pending = { type: "captain" };
    }
    return {
      kind: am.kind,
      label,
      opponentName: opp.name,
      score: [myScore, oppScore],
      pk: ms.pk ? [ms.pk.score[am.userSide], ms.pk.score[1 - am.userSide]] : undefined,
      result,
      reputationDelta: Math.round(delta * 10) / 10,
      levelChange: change.levelChange,
      eliminated,
      champion,
      qualifiedNational,
      rankDiff: rankIndex(opp.rank) - rankIndex(school.rank),
      goals: ms.events
        .filter((e) => e.type === "goal" || e.type === "pkGoal")
        .map((e) => ({
          minute: e.minute,
          mine: e.side === am.userSide,
          name: ms.teams[e.side].players[e.players![0]]?.name ?? "",
          pk: e.type === "pkGoal",
        })),
      learned,
      stats: (() => {
        const t = [me, ms.teams[1 - am.userSide]];
        const pos = me.stats.segments > 0 ? Math.round((me.stats.possessionSum / me.stats.segments) * 100) : 50;
        return {
          shots: [t[0].stats.shots, t[1].stats.shots] as [number, number],
          onTarget: [t[0].stats.onTarget, t[1].stats.onTarget] as [number, number],
          possession: [pos, 100 - pos] as [number, number],
        };
      })(),
      league: am.kind === "league" ? leagueSummary(state) : undefined,
    };
  });
}

/** 試合経験点：出場した選手のポジションに合う能力に入る（負けず嫌いは多い。SPEC 7.5） */
function giveMatchExp(p: Player, share: number) {
  const w = POSITION_RATING_WEIGHTS[p.mainPosition];
  const total = Object.values(w).reduce((a, b) => a + (b ?? 0), 0);
  const amount = MATCH_EXP.perFullMatch * share * (p.personality === "competitive" ? MATCH_EXP.competitiveMult : 1);
  for (const [k, v] of Object.entries(w) as [keyof typeof w, number][]) addExp(p, k, (amount * v) / total);
}

function learnLog(l: LearnEvent): string {
  return l.kind === "remove" ? `${l.name}の「${SKILL_NAMES[l.skill]}」が消えた。` : `${l.name}が試合での活躍から「${SKILL_NAMES[l.skill]}」を身につけた！`;
}

// ================= キャプテン（UI から呼ぶ） =================

/** キャプテン指名の画面で決める（年度初め・3 年生の引退後） */
export function confirmCaptain(state: GameState, playerId: string): string | null {
  if (state.pending?.type !== "captain") return "キャプテンを選ぶ時期ではありません";
  const school = playerSchool(state);
  const before = school.captainId;
  if (!appointCaptain(school, playerId)) return "在籍している部員から選んでください";
  const p = captainOf(school)!;
  // キャプテンに指名されると、監督への信頼度が上がる（R2）
  if (before !== p.id || state.calendar.position === 0) addTrust(p, CAPTAIN_TRUST);
  addLog(state, `${p.name}（${p.grade}年）をキャプテンに指名した。`, "info");
  state.pending = undefined;
  // 年度の初め（4/1）：キャプテンの指名の後に、月初の指示
  resumeDay(state);
  return null;
}

// ================= 月初の指示・選択肢のあるイベント（R2。UI から呼ぶ） =================

/** キャプテンに指名されたときの信頼度の上がり方 */
const CAPTAIN_TRUST = 10;

/** 待っている操作が無くなったとき、その日にまだ残っている予定（月初の指示・同じ日の大マス）を出す */
function resumeDay(state: GameState) {
  if (state.pending || state.activeMatch) return;
  const day = state.calendar.position;
  const after = state.monthly?.after;
  if (state.monthly) delete state.monthly.after;
  if (monthlyDue(state, day)) {
    withRng(state, (rng) => beginMonthly(state, rng, day));
    return;
  }
  if (after === "major") {
    const sq = state.calendar.squares[day];
    if (sq.major && isStopSquare(state, sq)) return withRng(state, (rng) => setPendingForMajor(state, rng, sq)) ?? undefined;
  }
}

/** 月初の指示を決めて閉じる。同じ日に大マス（試合など）があれば、続けてそれを出す。行事の結果があれば返す */
export function confirmMonthly(state: GameState): EventOutcome | null {
  if (!finishMonthly(state)) return null;
  const day = state.calendar.position;
  const after = state.monthly?.after;
  if (state.monthly) delete state.monthly.after;
  if (after !== "major") return null;
  const sq = state.calendar.squares[day];
  if (!sq.major || !isStopSquare(state, sq)) return null;
  return withRng(state, (rng) => setPendingForMajor(state, rng, sq));
}

/** 1 人の重点を決める（null でおまかせ） */
export function setPlayerFocus(state: GameState, playerId: string, stats: StatKey[] | null): string | null {
  const p = playerSchool(state).players.find((x) => x.id === playerId && x.status === "active");
  if (!p) return "在籍している部員ではありません";
  if (!setFocus(p, stats)) return "重点は1〜2個まで選べます";
  if (stats === null && state.pending?.type === "monthly") withRng(state, (rng) => (p.autoFocus = chooseAutoFocus(rng, p, headFocusQuality(state))));
  return null;
}

/** 今の選択肢の場面（地の文・最初のせりふ・選択肢） */
export function pendingChoice(state: GameState): ChoiceView | null {
  const p = state.pending;
  return p?.type === "choice" ? choiceView(state, p.eventId, p.cast) : null;
}

/** 選択肢を選ぶ。効果を適用し、結果の場面（地の文・反応のせりふ・結果の札）を返す */
export function confirmChoice(state: GameState, index: number): EventOutcome | null {
  const p = state.pending;
  if (p?.type !== "choice") return null;
  const def = choiceDef(p.eventId);
  if (!def) {
    state.pending = undefined;
    return null;
  }
  return withRng(state, (rng) => {
    const cast = decodeCast(state, p.cast);
    const sq = state.calendar.squares[state.calendar.position];
    const relay = { done: false, won: false };
    const env = {
      state,
      rng,
      cast,
      addReputation: (d: number) => void changeReputation(state, d),
      setTestPrep: (policy: Parameters<typeof setTestPrep>[2]) => setTestPrep(state, sq.major?.round ?? 0, policy),
    };
    const out = resolveChoice(env, def, index, (e) => {
      if (e.t !== "relay") return null;
      const r = runRelay(state, rng, env.addReputation);
      relay.done = true;
      relay.won = r.won;
      return r.badges;
    });
    if (!out) return null;
    if (relay.done && cast.lead && out.lines && out.lines.length > 1) {
      out.lines[0] = { speaker: null, text: relay.won ? "サッカー部が、陸上部をかわして1着でゴールした！" : "最後の直線で抜かれ、サッカー部は2着に終わった。" };
      out.lines[1] = { speaker: out.lines[1].speaker, text: relayLine(cast.lead, relay.won) };
      out.text = out.lines[0].text;
      out.tone = relay.won ? "good" : "info";
    }
    state.pending = undefined;
    addLog(state, `${out.title}：${out.text}`, out.tone);
    if (def.id === "testPrep") runDeferredPrepPractice(state, rng);
    updatePlayerRank(state);
    resumeDay(state);
    return out;
  });
}

/** テスト前の初日の練習を、方針を決めた後で行う */
function runDeferredPrepPractice(state: GameState, rng: Rng) {
  const dp = state.school?.prepDayPractice;
  if (!dp) return;
  delete state.school!.prepDayPractice;
  if (dp.day !== state.calendar.position) return;
  const school = playerSchool(state);
  const opts = practiceOptions(state, school, () => dp.practice);
  const hurt = school.players.filter((p) => p.injuryDays > 0).map((p) => p.id);
  if (noPracticeDay(state, dp.day)) idleDay(rng, school.players, NON_TARGET_FITNESS + DAILY_RECOVERY * opts.recoveryMult, opts);
  else {
    const pm = prepPracticeMults(state, dp.day);
    const r = runPractice(rng, school.players, dp.practice, 1, 1, { ...opts, playerExpMult: () => pm.exp, playerFitnessCostMult: () => pm.fitness });
    state.calendar.lastGain = { practice: dp.practice, perPlayer: r.gains };
    for (const p of r.injured) {
      addLog(state, `${p.name}が練習中にケガをした（全治${p.injuryDays}日）`, "bad");
      state.staff.season.injuryDays += p.injuryDays;
    }
  }
  markHealed(state, hurt, dp.day);
}

/** 約束（「次の公式戦で使う」「次の公式戦で結果を出す」）を、公式戦の後に確かめる */
function resolvePromises(state: GameState, played: Set<string>, result: "win" | "draw" | "loss") {
  const list = state.promises;
  if (!list || list.length === 0) return;
  const school = playerSchool(state);
  const keep: typeof list = [];
  for (const pr of list) {
    if (pr.kind === "playNextOfficial") {
      const p = school.players.find((x) => x.id === pr.playerId && x.status === "active");
      if (!p) continue;
      if (played.has(p.id)) {
        addTrust(p, CHOICE.promiseKept);
        addLog(state, `約束どおり、${p.name}を公式戦で使った。`, "good");
      } else if (p.injuryDays > 0) keep.push(pr);
      else {
        addTrust(p, CHOICE.promiseBroken);
        addLog(state, `${p.name}を公式戦で使う約束を守れなかった。信頼を失ったようだ。`, "bad");
      }
    } else if (result !== "draw") {
      for (const p of school.players) if (p.status === "active") addTrust(p, result === "win" ? CHOICE.winPromiseWin : CHOICE.winPromiseLoss);
      addLog(state, result === "win" ? "公式戦で結果を出し、部員たちの信頼を取り戻した。" : "公式戦で結果を出せず、部員たちの不満が強まった。", result === "win" ? "good" : "bad");
    } else keep.push(pr);
  }
  state.promises = keep;
}

// ================= プレースタイル（UI から呼ぶ） =================

/** スタイルを変える（試合中は変えられない。熟練度は 0 に戻る） */
export function setPlayStyle(state: GameState, playerId: string, style: PlayStyle): string | null {
  if (state.activeMatch) return "試合中はスタイルを変えられません";
  const p = playerSchool(state).players.find((x) => x.id === playerId && x.status === "active");
  if (!p) return "在籍している部員ではありません";
  if (!changePlayStyle(p, style)) return "このスタイルは選べません";
  addLog(state, `${p.name}のプレースタイルを「${PLAY_STYLE_NAMES[style]}」に変えた。`, "info");
  return null;
}

// ================= 卒業・年度替わり =================

export function confirmGraduation(state: GameState): Alumnus[] {
  if (state.pending?.type !== "graduation") return [];
  const alumni = withRng(state, (rng) => graduate(state, rng));
  addLog(state, `${MAJOR_NAMES.graduation}。${alumni.length}人の3年生が巣立っていった。`, "info");
  state.pending = undefined;
  updatePlayerRank(state);
  // 3/1：卒業式の後に月初の指示（卒業した 3 年生は出ない）
  resumeDay(state);
  return alumni;
}

/** 今年の全国大会の成績（設備の整備の判定用） */
export function yearResults(state: GameState): YearResults {
  const me = state.playerSchoolId;
  const c = state.competitions;
  const nats = [c.national, c.summerNational].filter((b): b is Bracket => !!b && b.rounds[0].some((m) => m.a === me || m.b === me));
  return {
    nationalAppearance: nats.length > 0,
    nationalTop4: nats.some((b) => b.championId === me || reachedRound(b, me) >= totalRounds(b) - 2),
    nationalChampion: nats.some((b) => b.championId === me),
    rookieRegionChampion: c.rookieRegion?.championId === me,
    leagueTopChampion: state.league?.final?.playerLevel === 1 && state.league.final.position === 1,
  };
}

export function confirmYearEnd(state: GameState): Player[] {
  if (state.pending?.type !== "yearEnd") return [];
  return withRng(state, (rng) => {
    staffYearEnd(state, rng);
    updatePlayerRank(state);
    // 大会の成績による設備の整備（SPEC 15章）
    const holder = { year: state.year, facilities: state.facilities, facilityLog: state.facilityLog, facilityGrantedLevel: state.facilityGrantedLevel };
    const fe = resultFacilities(holder, rng, yearResults(state));
    if (fe) addLog(state, `大会の成績が認められた：${facilityLogText(fe)}`, "good");
    const c = state.competitions;
    // 県リーグ：終わっていなければ（自校の試合が残ったなど）ここで締める
    if (state.league?.active && !state.league.final) {
      for (const d of state.league.divisions) for (const r of d.fixtures) for (const f of r) f.score ??= [0, 0];
      checkLeagueEnd(state);
    }
    const lgFinal = state.league?.final;
    state.history.push({
      year: state.year,
      reputationLevel: state.reputation.level,
      rank: playerSchool(state).rank,
      winterResult: c.winterResult ?? "—",
      summerResult: c.summerResult ?? "—",
      rookieResult: c.rookieResult ?? "—",
      ...(lgFinal && lgFinal.playerLevel > 0
        ? {
            league: {
              level: lgFinal.playerLevel,
              position: lgFinal.position,
              size: lgFinal.size,
              promoted: lgFinal.promoted,
              relegated: lgFinal.relegated,
              retiredBeforeEnd: c.retiredDay !== undefined && c.retiredDay < Math.max(...(divisionOf(state.league!, state.playerSchoolId)?.days ?? [0])),
            },
          }
        : {}),
    });
    // スカウトの返事がまだなら、ここで決める
    if (state.scout && !state.scout.replied) resolveScoutReply(state, rng);
    const scholars = state.scout?.committed ?? [];
    const incoming: Record<string, Player[]> = {};
    for (const t of state.scout?.toCpu ?? []) (incoming[t.schoolId] ??= []).push(t.player);
    state.scout = undefined;
    state.year++;
    const freshmen = rolloverPlayerSchool(state, rng, scholars);
    rolloverCpuSchools(state, rng, incoming);
    for (const s of Object.values(state.schools)) {
      if (s.isPlayer) continue;
      if (s.cpuStaff) driftCpuStaff(rng, s.cpuStaff);
      else s.cpuStaff = generateCpuStaff(rng, s.prestige);
      s.cpuStaff.conditioning ??= cpuConditioning(rng, s.prestige);
      if (s.cpuFacilities) raiseCpuFacilities(s.cpuFacilities, s.prestige);
      else s.cpuFacilities = cpuFacilities(rng, s.prestige);
      delete s.carryFitness;
    }
    state.pending = undefined;
    startYear(state, rng);
    const nSch = freshmen.filter((p) => p.admission === "scholarship").length;
    addLog(state, `${freshmen.length}人の新入生が入部した${nSch > 0 ? `（うち特待生${nSch}人）` : ""}。`, "good");
    // 年度初めのスタッフ編成（枠が減っていれば、誰を残すか選ぶまで進めない）
    state.pending = { type: "staff" };
    return freshmen;
  });
}

// ================= スタッフ（UI から呼ぶ） =================

export function hire(state: GameState, alumnusId: string, role: StaffRole): string | null {
  return withRng(state, (rng) => hireStaff(state, rng, alumnusId, role));
}

export function dismiss(state: GameState, memberId: string): string | null {
  return withRng(state, (rng) => dismissStaff(state, rng, memberId));
}

export function release(state: GameState, memberId: string): string | null {
  return withRng(state, (rng) => releaseStaff(state, rng, memberId));
}

export function changeRole(state: GameState, memberId: string, role: StaffRole): string | null {
  return changeStaffRole(state, memberId, role);
}

/** スタッフの編成を終える（ゲーム開始時・年度初め） */
export function finishStaff(state: GameState): string | null {
  const wasPending = state.pending?.type === "staff";
  return withRng(state, (rng) => {
    ensureHeadCoach(state, rng);
    const err = finishStaffReview(state, rng);
    // 年度初めの編成の後に、キャプテンを指名する
    if (!err && wasPending) state.pending = { type: "captain" };
    return err;
  });
}

// ================= 作戦ノート（UI から呼ぶ） =================

/** ノートを作る（上限なら null）。fromTemplates なら 4 つのテンプレートを入れる */
export function addNote(state: GameState, name: string, fromTemplates = false): TacticsNote | null {
  return withRng(state, (rng) => createNote(state, rng, name, fromTemplates));
}

/** 新しいルール（空、またはテンプレートから） */
export function newRule(state: GameState, template?: NoteTemplateId): NoteRule {
  return withRng(state, (rng) => {
    const id = rng.id("nr");
    return template ? templateRule(template, id) : { id, name: "新しいルール", enabled: true, conditions: [], actions: [] };
  });
}

// ================= 表示用 =================

export function dateLabel(state: GameState): string {
  return formatDay(state.calendar.position);
}

export function opponentOf(state: GameState): School | undefined {
  const p = state.pending;
  return p && p.type === "match" ? state.schools[p.opponentId] : undefined;
}

export function isPlayerAlive(state: GameState, b: Bracket | undefined): boolean {
  return !!b && isAlive(b, state.playerSchoolId);
}

/** 前の段階の大会（ここで勝ち抜くと出られる） */
const PARENT_KIND: Partial<Record<CompetitionKind, CompetitionKind>> = { national: "prefQualifier", summerNational: "summerQualifier", rookieRegion: "rookiePref" };

const MAJOR_LABELS: Record<MajorKind, string> = {
  entrance: "入学式",
  practiceMatch: "練習試合",
  prefQualifier: "予選",
  national: "全国",
  summerQualifier: "夏予選",
  summerNational: "夏全国",
  rookiePref: "新人戦",
  rookieRegion: "新人戦",
  league: "リーグ",
  camp: "合宿",
  scoutReply: "スカウト",
  graduation: "卒業式",
  yearEnd: "年度末",
  school: "行事",
};

/** カレンダーの表示用：マスの見た目（大会の大マスは、まだ勝ち残っていれば表示する） */
export function squareDisplay(state: GameState, sq: Square): { type: Square["baseType"] | "major"; label?: string } {
  const m = sq.major;
  if (!m) {
    if (sq.baseType === "training") return { type: "training", label: "特訓" };
    if (sq.baseType === "branch") return { type: "branch", label: "分岐" };
    return { type: sq.baseType };
  }
  const me = state.playerSchoolId;
  const c = state.competitions;
  const kind = m.kind;
  if (isCompetitionKind(kind)) {
    const b = c[kind];
    const round = m.round ?? 0;
    let shown: boolean;
    if (!b) {
      const parent = PARENT_KIND[kind];
      const pb = parent ? c[parent] : undefined;
      shown = parent ? !!pb && isAlive(pb, me) && !(kind === "national" && c.winterDone) : round === 0;
    } else if (!isAlive(b, me)) shown = false;
    else if (round < b.rounds.length) shown = !!findMatch(b, round, me);
    else shown = true;
    if (!shown) return { type: sq.baseType };
    return { type: "major", label: MAJOR_LABELS[kind] };
  }
  if (kind === "school") return { type: "major", label: m.event ? SCHOOL_EVENT_LABELS[m.event] : MAJOR_LABELS.school };
  if (kind === "scoutReply" && !state.scout) return { type: sq.baseType };
  if (kind === "league" && !(state.league?.active && fixtureOn(state.league, me, sq.day))) return { type: sq.baseType };
  return { type: "major", label: MAJOR_LABELS[kind] };
}
