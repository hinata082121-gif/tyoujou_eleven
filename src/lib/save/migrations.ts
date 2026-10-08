/**
 * セーブデータのマイグレーション（SPEC 12章）。
 * スキーマを変えたら SCHEMA_VERSION を上げ、MIGRATIONS[旧バージョン] に変換関数を足す。
 */
export const SCHEMA_VERSION = 1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawSave = { schemaVersion: number; [key: string]: any };
export type Migration = (data: RawSave) => RawSave;

/** MIGRATIONS[n] は バージョン n → n+1 の変換 */
export const MIGRATIONS: Record<number, Migration> = {
  // 例：1: (d) => ({ ...d, schemaVersion: 2, game: { ...d.game, newField: 0 } }),
};

export class SaveVersionError extends Error {}

export function migrateSave(data: RawSave, migrations: Record<number, Migration> = MIGRATIONS, target = SCHEMA_VERSION): RawSave {
  if (typeof data?.schemaVersion !== "number") throw new SaveVersionError("セーブデータの形式が正しくありません");
  if (data.schemaVersion > target) throw new SaveVersionError("新しいバージョンのセーブデータです。ゲームを更新してください");
  let d = data;
  while (d.schemaVersion < target) {
    const m = migrations[d.schemaVersion];
    if (!m) throw new SaveVersionError(`バージョン${d.schemaVersion}のセーブデータは読み込めません`);
    const next = m(d);
    if (next.schemaVersion !== d.schemaVersion + 1) throw new SaveVersionError("マイグレーションの結果が不正です");
    d = next;
  }
  return d;
}
