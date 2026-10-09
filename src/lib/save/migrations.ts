/**
 * セーブデータのマイグレーション（SPEC 12章）。
 * スキーマを変えたら SCHEMA_VERSION を上げ、MIGRATIONS[旧バージョン] に変換関数を足す。
 * 公開前の古い形式（v1：架空の県の世界）は読み込まない。
 */
export const SCHEMA_VERSION = 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawSave = { schemaVersion: number; [key: string]: any };
export type Migration = (data: RawSave) => RawSave;

/** MIGRATIONS[n] は バージョン n → n+1 の変換（公開後に使う） */
export const MIGRATIONS: Record<number, Migration> = {};

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
