/**
 * セーブデータのマイグレーション（SPEC 12章）。
 * スキーマを変えたら SCHEMA_VERSION を上げ、MIGRATIONS[旧バージョン] に変換関数を足す。
 * 公開前の古い形式（v1：架空の県の世界）は読み込まない。
 */
import { Rng } from "@/engine/rng";
import { emptyStaffState, generateCpuStaff, generateFictionalAlumni, makeStaffProfile, makeTemporaryCoach } from "@/engine/staff";
import type { Alumnus, Career, LogEntry, Position, SeasonRecord, Stats } from "@/engine/types";

export const SCHEMA_VERSION = 3;

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
  const alumni: Alumnus[] = old.map((a) => {
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
      staffProfile: makeStaffProfile(rng, { ...a, wasCaptain }),
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

/** MIGRATIONS[n] は バージョン n → n+1 の変換 */
export const MIGRATIONS: Record<number, Migration> = {
  2: migrateV2toV3,
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
