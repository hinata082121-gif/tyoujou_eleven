/**
 * セーブ（SPEC 12章）：3 枠・オートセーブ・スキーマのバージョン・JSON の書き出し/読み込み。
 * 保存時は圧縮形式（codec）にしたうえで LZ 圧縮する。書き出しは読みやすい JSON。
 */
import { compressToUTF16, decompressFromUTF16 } from "lz-string";
import { REPUTATION_NAMES, yearLabel } from "@/engine/config/names";
import { formatDay } from "@/engine/calendar";
import type { GameState } from "@/engine/types";
import { packGame, unpackGame, type PackedGameState } from "./codec";
import { migrateSave, SCHEMA_VERSION, SaveVersionError, type RawSave } from "./migrations";
import { LocalStorageAdapter, type StorageAdapter } from "./storage";

export { SCHEMA_VERSION, SaveVersionError, migrateSave } from "./migrations";
export type { StorageAdapter } from "./storage";
export { LocalStorageAdapter, MemoryStorageAdapter } from "./storage";

export const SLOT_COUNT = 3;
const KEY_PREFIX = "tyoujou-eleven:slot:";
/** CPU 校（容量が大きく、年に数回しか変わらない）は別のキーに分けて、変わったときだけ書き込む */
const WORLD_PREFIX = "tyoujou-eleven:world:";
const SUMMARY_PREFIX = "tyoujou-eleven:summary:";

export interface SlotSummary {
  schoolName: string;
  year: number;
  dateLabel: string;
  reputation: string;
  savedAt: string;
}

export interface SaveData {
  schemaVersion: number;
  savedAt: string;
  summary: SlotSummary;
  game: PackedGameState;
}

export function summarize(state: GameState, savedAt: string): SlotSummary {
  return {
    schoolName: state.schools[state.playerSchoolId].name,
    year: state.year,
    dateLabel: `${yearLabel(state.year)} ${formatDay(state.calendar.position)}`,
    reputation: REPUTATION_NAMES[state.reputation.level],
    savedAt,
  };
}

export function toSaveData(state: GameState, now = new Date().toISOString()): SaveData {
  return { schemaVersion: SCHEMA_VERSION, savedAt: now, summary: summarize(state, now), game: packGame(state) };
}

/** 生のデータ（JSON を parse したもの）からゲームを復元する。古いバージョンはマイグレーションする */
export function fromRawSave(raw: RawSave): GameState {
  const data = migrateSave(raw) as unknown as SaveData;
  if (!data.game || !data.game.schools) throw new SaveVersionError("セーブデータの形式が正しくありません");
  return unpackGame(data.game);
}

export class SaveManager {
  /** 枠ごとに、最後に書き込んだ CPU 校のデータ */
  private lastWorld = new Map<number, string>();

  constructor(private storage: StorageAdapter = new LocalStorageAdapter()) {}

  async save(slot: number, state: GameState): Promise<SlotSummary> {
    const data = toSaveData(state);
    const cpuSchools: PackedGameState["schools"] = {};
    const mainSchools: PackedGameState["schools"] = {};
    for (const [id, s] of Object.entries(data.game.schools)) (s.isPlayer ? mainSchools : cpuSchools)[id] = s;
    const worldJson = JSON.stringify(cpuSchools);
    if (this.lastWorld.get(slot) !== worldJson) {
      await this.storage.set(WORLD_PREFIX + slot, compressToUTF16(worldJson));
      this.lastWorld.set(slot, worldJson);
    }
    const main: SaveData = { ...data, game: { ...data.game, schools: mainSchools } };
    await this.storage.set(KEY_PREFIX + slot, compressToUTF16(JSON.stringify(main)));
    await this.storage.set(SUMMARY_PREFIX + slot, JSON.stringify(data.summary));
    return data.summary;
  }

  private async readJson(key: string) {
    const raw = await this.storage.get(key);
    if (!raw) return null;
    const json = decompressFromUTF16(raw);
    if (!json) throw new SaveVersionError("セーブデータが壊れています");
    return json;
  }

  async load(slot: number): Promise<GameState | null> {
    const mainJson = await this.readJson(KEY_PREFIX + slot);
    if (!mainJson) return null;
    const worldJson = await this.readJson(WORLD_PREFIX + slot);
    const main = JSON.parse(mainJson) as SaveData;
    if (worldJson && main.game?.schools) {
      main.game.schools = { ...JSON.parse(worldJson), ...main.game.schools };
      this.lastWorld.set(slot, worldJson);
    }
    return fromRawSave(main as unknown as RawSave);
  }

  async summary(slot: number): Promise<SlotSummary | null> {
    const raw = await this.storage.get(SUMMARY_PREFIX + slot);
    return raw ? (JSON.parse(raw) as SlotSummary) : null;
  }

  async remove(slot: number) {
    this.lastWorld.delete(slot);
    await this.storage.remove(WORLD_PREFIX + slot);
    await this.storage.remove(KEY_PREFIX + slot);
    await this.storage.remove(SUMMARY_PREFIX + slot);
  }

  /** JSON の書き出し（ブラウザのデータ消去への対策） */
  async exportJson(slot: number): Promise<string | null> {
    const state = await this.load(slot);
    return state ? JSON.stringify(toSaveData(state)) : null;
  }

  /** JSON の読み込み。読み込めたらその枠に保存する */
  async importJson(slot: number, json: string): Promise<SlotSummary> {
    let raw: RawSave;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new SaveVersionError("JSON として読み込めません");
    }
    const state = fromRawSave(raw);
    return this.save(slot, state);
  }
}
