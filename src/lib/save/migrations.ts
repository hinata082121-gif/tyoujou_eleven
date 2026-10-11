/**
 * セーブデータのマイグレーション（SPEC 12章）。
 * スキーマを変えたら SCHEMA_VERSION を上げ、MIGRATIONS[旧バージョン] に変換関数を足す。
 * 公開前の古い形式（v1：架空の県の世界）は読み込まない。
 */
import { autoCaptain } from "@/engine/captain";
import { PERSONALITY_TEACHING } from "@/engine/config/personality";
import { FOOT_WEIGHTS } from "@/engine/config/player";
import { PROFICIENCY } from "@/engine/config/playStyle";
import { SKILL_LEARN } from "@/engine/config/skills";
import { assignPlayStyle, randomFavoritePractice, randomPersonality } from "@/engine/player/traits";
import { Rng } from "@/engine/rng";
import { catchUpSkills, initialSkills } from "@/engine/skills/learn";
import { emptyStaffState, generateCpuStaff, generateFictionalAlumni, makeStaffProfile, makeTemporaryCoach } from "@/engine/staff";
import { PERSONALITIES, type Alumnus, type Career, type LogEntry, type Personality, type Player, type Position, type School, type SeasonRecord, type Stats } from "@/engine/types";
import { packGame, packTraits, unpackGame, unpackPlayer, type PackedPlayer, type PackedTraits } from "./codec";
import { upgradeToPhase2c } from "@/engine/game";

export const SCHEMA_VERSION = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawSave = { schemaVersion: number; [key: string]: any };
export type Migration = (data: RawSave) => RawSave;

type OldAlumnus = { id: string; name: string; graduatedYear: number; position: Position; overall: number; career: Career; stats: Stats };

/**
 * v2（Phase 1）→ v3（Phase 2a）：スタッフ・作戦ノート・OB の素質と成績・部員の出場停止と成績・CPU 校のスタッフ。
 * 乱数はゲームの seed から作った専用の乱数を使う（同じセーブからは毎回同じ OB が生まれる）。
 * 部員の圧縮形式の追加の欄（出場停止・成績）は、無ければ 0 として読む（codec）。
 */
export function migrateV2toV3(data: RawSave): RawSave {
  const game = structuredClone(data.game);
  const rng = Rng.fromSeed(`${game.seed}:migrate-v3`);
  const year: number = game.year;
  const history: SeasonRecord[] = game.history ?? [];
  // 既存の OB：その年の卒業生で総合が最も高い人を主将とみなす
  const old: OldAlumnus[] = game.alumni ?? [];
  const topByYear = new Map<number, OldAlumnus>();
  for (const a of old) {
    const t = topByYear.get(a.graduatedYear);
    if (!t || a.overall > t.overall) topByYear.set(a.graduatedYear, a);
  }
  // 性格・スタイル・特殊能力は v3 → v4 で付ける
  const alumni: Omit<Alumnus, "personality" | "playStyle" | "skills">[] = old.map((a) => {
    const wasCaptain = topByYear.get(a.graduatedYear) === a;
    return {
      ...a,
      wasCaptain,
      record: {
        apps: 0,
        goals: 0,
        officialApps: 0,
        officialGoals: 0,
        winterResults: history.filter((h) => h.year >= a.graduatedYear - 2 && h.year <= a.graduatedYear).map((h) => h.winterResult),
      },
      staffProfile: makeStaffProfile(rng, { ...a, wasCaptain, personality: randomPersonality(rng) }),
    };
  });
  alumni.push(...generateFictionalAlumni(rng, year));
  game.alumni = alumni;
  game.staff = emptyStaffState();
  game.staff.members.push(makeTemporaryCoach(rng, year));
  game.notes = [];
  for (const s of Object.values(game.schools) as { isPlayer: boolean; prestige: number; cpuStaff?: unknown }[]) {
    if (!s.isPlayer) s.cpuStaff = generateCpuStaff(rng, s.prestige);
  }
  const log: LogEntry[] = game.log ?? [];
  log.push({ day: game.calendar?.position ?? 0, year, text: "スタッフ制度が始まった。OB からヘッドコーチを選べます（スタッフ画面）。", tone: "info" });
  game.log = log;
  return { ...data, schemaVersion: 3, game };
}

/** 指導の素質に最も近い性格（P2a の OB は、教え方の素質がすでに決まっているので、それに合う性格にする） */
export function personalityForTalent(talent: number): Personality {
  return PERSONALITIES.reduce((b, k) => (Math.abs(PERSONALITY_TEACHING[k].talent - talent) < Math.abs(PERSONALITY_TEACHING[b].talent - talent) ? k : b), PERSONALITIES[0]);
}

/** 既存の選手に、性格・スタイル・熟練度（学年に応じて）・特殊能力（学年に応じて。金色は付けない）を付ける */
export function addTraits(rng: Rng, p: Player, wasBothFeet = false) {
  // 両足（P2a まで）は右足か左足に振り分ける。逆足× は付けない
  if ((p.foot as string) === "B") {
    p.foot = rng.weighted(["R", "L"] as const, (f) => FOOT_WEIGHTS[f]);
    wasBothFeet = true;
  }
  p.personality = randomPersonality(rng);
  if (p.personality === "craftsman") p.favoritePractice = randomFavoritePractice(rng, p.mainPosition);
  else delete p.favoritePractice;
  p.playStyle = assignPlayStyle(rng, p);
  const [lo, hi] = PROFICIENCY.migrationByGrade[p.grade];
  p.styleProficiency = Math.round(rng.range(lo, hi));
  p.skills = [];
  initialSkills(rng, p);
  catchUpSkills(rng, p, SKILL_LEARN.migrationRollsByGrade[p.grade]);
  if (wasBothFeet) p.skills = p.skills.filter((s) => s !== "footX");
}

/**
 * v3（Phase 2a）→ v4（Phase 2b）：性格・プレースタイル・熟練度・特殊能力・キャプテン。
 * - 部員の圧縮形式の 17 番目に traits を差し込む（CPU 校の部員も同じく付ける）
 * - 利き足の「両足」は右足か左足に振り分ける
 * - OB には性格（教え方の素質に最も近いもの）・スタイル・特殊能力を付ける。スタッフとしての値は変えない
 * - CPU 校のキャプテンを自動で決める。自校のキャプテンはそのまま
 */
export function migrateV3toV4(data: RawSave): RawSave {
  const game = structuredClone(data.game);
  const rng = Rng.fromSeed(`${game.seed}:migrate-v4`);
  for (const school of Object.values(game.schools) as { isPlayer: boolean; captainId?: string; players: PackedPlayer[] }[]) {
    school.players = school.players.map((a) => {
      const head = a.slice(0, 16);
      const tail = a.slice(16) as [number?, number[]?];
      const wasBoth = (head[8] as string) === "B";
      if (wasBoth) head[8] = rng.weighted(["R", "L"] as const, (f) => FOOT_WEIGHTS[f]);
      // 仮の traits で一度ほどいて、学年と能力から traits を決める
      const tmp: PackedTraits = [0, 0, 0, [], -1];
      const p = unpackPlayer([...head, tmp] as unknown as PackedPlayer);
      addTraits(rng, p, wasBoth);
      return [...head, packTraits(p), ...tail] as unknown as PackedPlayer;
    });
    if (!school.isPlayer) {
      const s = { ...(school as unknown as School), players: school.players.map(unpackPlayer) };
      autoCaptain(s);
      school.captainId = s.captainId;
    }
  }
  const alumni: (Alumnus & { personality?: Personality })[] = game.alumni ?? [];
  for (const a of alumni) {
    if (a.personality) continue;
    a.personality = personalityForTalent(a.staffProfile.teachingTalent);
    const pseudo = { mainPosition: a.position, stats: a.stats, skills: [] as Player["skills"], personality: a.personality, playStyle: "striker" as Player["playStyle"] };
    a.playStyle = assignPlayStyle(rng, pseudo);
    pseudo.playStyle = a.playStyle;
    catchUpSkills(rng, pseudo as unknown as Player, SKILL_LEARN.migrationRollsByGrade[3]);
    a.skills = pseudo.skills;
  }
  game.alumni = alumni;
  const log: LogEntry[] = game.log ?? [];
  log.push({
    day: game.calendar?.position ?? 0,
    year: game.year,
    text: "性格・プレースタイル・特殊能力が加わった。選手の詳細で確かめられます。キャプテンはひとまず自動で選んだ。年度初めに選び直せます。",
    tone: "info",
  });
  game.log = log;
  return { ...data, schemaVersion: 4, game };
}

/**
 * v4（Phase 2b）→ v5（Phase 2c）：設備（評判に応じて）・CPU 校の設備とコンディショニング・小さな県の CPU 校の追加・
 * 夏の全国大会の開催県・これから先の日程への新しい大会や合宿や分岐マス・途中からのスカウト。
 * 部員は全員「一般入部」として読む（codec の最後の欄が無ければ一般入部）。
 */
export function migrateV4toV5(data: RawSave): RawSave {
  const state = unpackGame(structuredClone(data.game));
  upgradeToPhase2c(state, Rng.fromSeed(`${state.seed}:migrate-v5`));
  return { ...data, schemaVersion: 5, game: packGame(state) };
}

/** MIGRATIONS[n] は バージョン n → n+1 の変換 */
export const MIGRATIONS: Record<number, Migration> = {
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
};

export const OLD_FORMAT_MESSAGE = "このセーブは古い形式のため読み込めません";

export class SaveVersionError extends Error {}

export function migrateSave(data: RawSave, migrations: Record<number, Migration> = MIGRATIONS, target = SCHEMA_VERSION): RawSave {
  if (typeof data?.schemaVersion !== "number") throw new SaveVersionError("セーブデータの形式が正しくありません");
  if (data.schemaVersion > target) throw new SaveVersionError("新しいバージョンのセーブデータです。ゲームを更新してください");
  let d = data;
  while (d.schemaVersion < target) {
    const m = migrations[d.schemaVersion];
    if (!m) throw new SaveVersionError(OLD_FORMAT_MESSAGE);
    const next = m(d);
    if (next.schemaVersion !== d.schemaVersion + 1) throw new SaveVersionError("マイグレーションの結果が不正です");
    d = next;
  }
  return d;
}
