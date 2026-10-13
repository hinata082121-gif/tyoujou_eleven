/**
 * 選手の見た目・背番号・ユニフォーム（SPEC 17章。P4）。
 *
 * 見た目とユニフォームは、ゲームの乱数とは別の系統の乱数（ゲームのシードと ID から作る）で生成する。
 * ゲームの乱数を 1 つも消費しないので、新入生の能力など、ゲームの結果は P3 と同じになる。
 * 同じシードと ID なら、何度生成しても同じ見た目になる。
 */
import { FORMATIONS } from "../config/formations";
import { BODY, CPU_TEMPLATE_WEIGHTS, KIT, KIT_PALETTE, KIT_TEMPLATES, LOOK_OPTIONS, LOOK_PARTS, SHIRT_NUMBERS, VENUE_RULES, type LookOption, type VenueStage } from "../config/look";
import { pickBestEleven } from "../match/lineup";
import { overall } from "../player/rating";
import { Rng } from "../rng";
import type { CompetitionKind, GameState, Kit, Look, Player, School, SchoolKits } from "../types";

// ================= 見た目 =================

/** 出やすさで種類の番号を選ぶ（出やすさ 0 の種類を後ろに足しても、選ばれる番号は変わらない） */
export const pickIndex = (rng: Rng, options: readonly LookOption[]) => {
  const idx = options.map((_, i) => i);
  return rng.weighted(idx, (i) => options[i].weight);
};

/** 見た目を生成する（同じシードと ID なら同じ見た目） */
export function generateLook(seed: string, id: string): Look {
  const rng = Rng.fromSeed(`${seed}:look:${id}`);
  const look = {} as Look;
  for (const part of LOOK_PARTS) look[part] = pickIndex(rng, LOOK_OPTIONS[part]);
  return look;
}

/** 見た目の値を一覧の範囲に収める（壊れたセーブや、要素が足りない古い形式への備え） */
export function normalizeLook(look: Partial<Look> | undefined): Look {
  const out = {} as Look;
  for (const part of LOOK_PARTS) {
    const v = look?.[part] ?? 0;
    out[part] = Number.isInteger(v) && v >= 0 && v < LOOK_OPTIONS[part].length ? v : 0;
  }
  return out;
}

/** 見た目をセーブ用の数の配列にする（要素の並びは LOOK_PARTS） */
export const packLook = (look: Look): number[] => LOOK_PARTS.map((p) => look[p]);
export const unpackLook = (a: number[]): Look => normalizeLook(Object.fromEntries(LOOK_PARTS.map((p, i) => [p, a[i] ?? 0])) as Partial<Look>);

/** 身長とフィジカルから体型の倍率を出す（表示用） */
export function bodyScale(heightCm: number, physical: number): { height: number; build: number } {
  const lerp = (v: number, a: number, b: number, x: number, y: number) => x + (y - x) * Math.max(0, Math.min(1, (v - a) / (b - a)));
  return {
    height: lerp(heightCm, BODY.heightCm.min, BODY.heightCm.max, BODY.heightScale.min, BODY.heightScale.max),
    build: lerp(physical, BODY.physical.min, BODY.physical.max, BODY.buildScale.min, BODY.buildScale.max),
  };
}

// ================= 背番号 =================

/**
 * 背番号を付け直す（年度の初め）：GK の一番手が 1、今のフォーメーションの先発が列に合わせて 2〜11、
 * 総合値の最も高い MF・FW に 10、残りは 12 から学年（上から）と総合値の順に空いている番号。
 * 引退した 3 年生（卒業まで名簿に残る）には付けない
 */
export function assignShirtNumbers(school: School) {
  const active = school.players.filter((p) => p.status === "active");
  for (const p of school.players) if (p.status !== "active") delete p.shirtNumber;
  if (active.length === 0) return;
  // ケガ・出場停止は気にせずに先発を選ぶ（その年の背番号なので）
  const healthy = active.map((p) => ({ ...p, injuryDays: 0 }));
  const lineup = pickBestEleven(healthy, school.formation);
  const slots = FORMATIONS[school.formation];
  const byId = new Map(active.map((p) => [p.id, p]));
  const used = new Set<number>();
  const give = (p: Player, n: number) => {
    p.shirtNumber = n;
    used.add(n);
  };
  const starters = lineup.map((id, i) => ({ p: byId.get(id), line: slots[i]?.line })).filter((x): x is { p: Player; line: "GK" | "DF" | "MF" | "FW" } => !!x.p && !!x.line);
  const gk = starters.find((x) => x.line === "GK");
  if (gk) give(gk.p, SHIRT_NUMBERS.gk);
  const attackers = starters.filter((x) => x.line === "MF" || x.line === "FW").sort((a, b) => overall(b.p) - overall(a.p));
  if (attackers[0]) give(attackers[0].p, SHIRT_NUMBERS.ace);
  const leftovers: Player[] = [];
  for (const x of starters) {
    if (x === gk || x === attackers[0]) continue;
    if (x.line === "GK") {
      leftovers.push(x.p);
      continue;
    }
    const n = SHIRT_NUMBERS.byLine[x.line].find((v) => !used.has(v));
    if (n !== undefined) give(x.p, n);
    else leftovers.push(x.p);
  }
  const starterIds = new Set(starters.map((x) => x.p.id));
  const rest = active.filter((p) => !starterIds.has(p.id)).sort((a, b) => b.grade - a.grade || overall(b) - overall(a));
  // 1〜11 で空いた番号（4-4-2 で 11 が空くなど）は、先発に入れなかった人へ回さず、12 から続ける
  let next = SHIRT_NUMBERS.restFrom;
  for (const p of [...leftovers, ...rest]) {
    while (used.has(next)) next++;
    give(p, next);
  }
}

/** 背番号の無い選手（年度の途中に入った人など）に、空いている番号を付ける */
export function fillShirtNumbers(school: School) {
  const active = school.players.filter((p) => p.status === "active");
  if (active.every((p) => p.shirtNumber !== undefined)) return;
  if (active.every((p) => p.shirtNumber === undefined)) return assignShirtNumbers(school);
  const used = new Set(active.map((p) => p.shirtNumber).filter((n): n is number => n !== undefined));
  let next = SHIRT_NUMBERS.restFrom;
  for (const p of active) {
    if (p.shirtNumber !== undefined) continue;
    while (used.has(next)) next++;
    p.shirtNumber = next;
    used.add(next);
  }
}

// ================= ユニフォーム =================

/** sRGB の #rrggbb → CIELAB（D65） */
export function hexToLab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = lin((n >> 16) & 255),
    g = lin((n >> 8) & 255),
    b = lin(n & 255);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27) * t / 116 + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** パレットの 2 色の色差（ΔE76） */
export function colorDistance(a: number, b: number): number {
  const la = hexToLab(KIT_PALETTE[a] ?? KIT_PALETTE[0]);
  const lb = hexToLab(KIT_PALETTE[b] ?? KIT_PALETTE[0]);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

export const colorLightness = (c: number) => hexToLab(KIT_PALETTE[c] ?? KIT_PALETTE[0])[0];

/** メインの色どうしがかぶっているか */
export const kitsClash = (a: Kit, b: Kit) => colorDistance(a.main, b.main) < KIT.clashDeltaE;

/** 背番号の文字の色（メインが明るければ黒、暗ければ白） */
export const numberColor = (kit: Kit) => (colorLightness(kit.main) >= KIT.darkNumberL ? 1 : 0);

const farthestFrom = (rng: Rng | null, candidates: readonly number[], others: number[]) => {
  let best = candidates[0];
  let bestD = -1;
  for (const c of candidates) {
    const d = Math.min(...others.map((o) => colorDistance(c, o)));
    if (d > bestD + (rng ? rng.range(-3, 3) : 0)) {
      best = c;
      bestD = d;
    }
  }
  return best;
};

/** 1st から、見分けやすい 2nd を作る（白地・紺地・黒地・1st のサブの色のうち、1st のメインから最も遠い色を地にする） */
export function secondKitFor(first: Kit): Kit {
  const main = farthestFrom(null, [0, 3, 1, first.sub], [first.main]);
  const sub = main === first.main || colorDistance(first.main, main) < KIT.clashDeltaE ? (main === 0 ? 1 : 0) : first.main;
  const sub2 = colorDistance(sub, main) < KIT.clashDeltaE ? (main === 0 ? 1 : 0) : sub;
  return { template: first.template, main, sub: sub2, shorts: main, socks: main };
}

/** CPU 校（と、作り直す前の自校）のユニフォームをランダムに作る */
export function generateKits(seed: string, schoolId: string): SchoolKits {
  const rng = Rng.fromSeed(`${seed}:kit:${schoolId}`);
  const template = KIT_TEMPLATES.indexOf(rng.weighted(KIT_TEMPLATES, (t) => CPU_TEMPLATE_WEIGHTS[t]));
  const main = rng.int(0, KIT_PALETTE.length - 1);
  // サブはメインと見分けやすい色から（白・黒が多め）
  const subPool = KIT_PALETTE.map((_, i) => i).filter((i) => colorDistance(i, main) >= KIT.clashDeltaE + 10);
  const sub = rng.chance(0.5) ? farthestFrom(null, [0, 1], [main]) : rng.pick(subPool.length > 0 ? subPool : [0]);
  const shorts = rng.chance(0.6) ? main : sub;
  const socks = rng.chance(0.7) ? main : sub;
  const first: Kit = { template, main, sub, shorts, socks };
  return { first, second: secondKitFor(first) };
}

/** おまかせ（学校作成・設定画面）：番号をずらしながら作り直す */
export function randomKits(seed: string, schoolId: string, n: number): SchoolKits {
  return generateKits(seed, `${schoolId}:${n}`);
}

export type KitChoice = "first" | "second" | "reserve";

export interface MatchKits {
  /** [ホーム, アウェー] の順ではなく、試合のチーム（side）の順 */
  kits: [Kit, Kit];
  choice: [KitChoice, KitChoice];
  /** GK の色（パレットの番号） */
  gk: [number, number];
}

/**
 * 試合で着るユニフォームを決める（SPEC 17.3）。home はホーム側のチーム（side）。
 * かぶったらアウェーが 2nd → それでもかぶればホームが 2nd → さらにかぶればアウェーが予備の無地
 */
export function kitsForMatch(kitsBySide: [SchoolKits, SchoolKits], home: 0 | 1): MatchKits {
  const away = home === 0 ? 1 : 0;
  const choice: [KitChoice, KitChoice] = ["first", "first"];
  const pick = (side: 0 | 1, c: KitChoice): Kit => {
    if (c === "reserve") return reserveKit(kitsBySide[home === side ? away : home][choice[home === side ? away : home] === "second" ? "second" : "first"]);
    return kitsBySide[side][c];
  };
  const clash = () => kitsClash(pick(0, choice[0]), pick(1, choice[1]));
  if (clash()) choice[away] = "second";
  if (clash()) {
    choice[away] = "first";
    choice[home] = "second";
  }
  if (clash()) {
    choice[home] = "first";
    choice[away] = "reserve";
  }
  const kits: [Kit, Kit] = [pick(0, choice[0]), pick(1, choice[1])];
  const field = [kits[0].main, kits[0].sub, kits[1].main, kits[1].sub];
  const gk0 = farthestFrom(null, KIT.gkColors, field);
  const gk1 = farthestFrom(
    null,
    KIT.gkColors.filter((c) => c !== gk0),
    [...field, gk0],
  );
  return { kits, choice, gk: [gk0, gk1] };
}

/** 予備の無地（白か黒のうち、相手から遠い方） */
export function reserveKit(opponent: Kit): Kit {
  const r = KIT.reserve.reduce((a, b) => (colorDistance(a.main, opponent.main) >= colorDistance(b.main, opponent.main) ? a : b));
  return { template: 0, main: r.main, sub: r.sub, shorts: r.main, socks: r.main };
}

/** GK のユニフォーム（無地） */
export const gkKit = (color: number): Kit => ({ template: 0, main: color, sub: color === 1 ? 2 : 1, shorts: color, socks: color });

// ================= ゲーム全体 =================

/** 見た目・背番号・ユニフォームが無いものに付ける（ゲーム開始・年度の初め・マイグレーション） */
export function ensureLooks(state: GameState) {
  for (const s of Object.values(state.schools)) {
    for (const p of s.players) if (!p.look) p.look = generateLook(state.seed, p.id);
    s.kits ??= generateKits(state.seed, s.id);
    fillShirtNumbers(s);
  }
  for (const a of state.alumni) if (!a.look) a.look = generateLook(state.seed, a.id);
}

/** 年度の初めの背番号の付け直し（全校） */
export function renumberAll(state: GameState) {
  for (const s of Object.values(state.schools)) assignShirtNumbers(s);
}

// ================= 会場（SPEC 10.8） =================

/** 大会とラウンド（0 始まり）・ラウンド数から会場の段階を決める */
export function venueStage(kind: CompetitionKind, round: number, totalRounds: number): VenueStage {
  const fromEnd = totalRounds - 1 - round;
  for (const r of VENUE_RULES[kind]) if (fromEnd <= r.fromEnd) return r.stage;
  return 1;
}
