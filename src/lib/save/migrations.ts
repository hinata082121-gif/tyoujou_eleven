/**
 * セーブデータのマイグレーション（SPEC 12章）。
 * スキーマを変えたら SCHEMA_VERSION を上げ、MIGRATIONS[旧バージョン] に変換関数を足す。
 */
import { PREFECTURES, REGIONS } from "@/engine/config/names";
import { prefTier } from "@/engine/config/school";

export const SCHEMA_VERSION = 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawSave = { schemaVersion: number; [key: string]: any };
export type Migration = (data: RawSave) => RawSave;

/** MIGRATIONS[n] は バージョン n → n+1 の変換 */
export const MIGRATIONS: Record<number, Migration> = {
  /**
   * v1 → v2：架空の県（32）から実在の都道府県へ。
   * 県の ID（学校が参照している）はそのままにして、名前・地域・区分を実在のものに置き換える。
   * v1 のデータは県が 32 しかないので、全国大会は 32 校のまま続く。
   */
  1: (d) => {
    const candidates = PREFECTURES.filter((p) => p.id !== "tokyo");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prefectures = (d.game?.prefectures ?? []).map((p: any, i: number) => {
      const real = candidates[i % candidates.length];
      return { ...p, name: real.name, regionId: real.region, tier: prefTier(real.id), reps: 1 };
    });
    const regions = REGIONS.map((r) => ({ id: r.id, name: r.name }));
    return { ...d, schemaVersion: 2, game: { ...d.game, prefectures, regions } };
  },
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
