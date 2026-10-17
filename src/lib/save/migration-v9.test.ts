import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decompressFromBase64 } from "lz-string";
import { describe, expect, it } from "vitest";
import { autoplayYears } from "@/engine/game/autoplay";
import { focusStreaks } from "@/engine/monthly";
import { playerSchool } from "@/engine/season";
import { fromRawSave, SCHEMA_VERSION, toSaveData } from ".";

/** R2（スキーマ 8）のセーブ：1 年目の 2 月 */
const loadFixture = () => JSON.parse(decompressFromBase64(readFileSync(join(__dirname, "fixtures/v8-r2-save.lz.txt"), "utf8"))!);

describe("R2 のセーブの移行（v8 → v9）", () => {
  it("重点の累計の記録は空で始まり（遡らない）、次の月初の指示から数え始める。遊び続けられる", () => {
    const raw = loadFixture();
    expect(raw.schemaVersion).toBe(8);
    const s = fromRawSave(raw);
    expect(SCHEMA_VERSION).toBe(9);
    expect(s.monthly?.focusLog).toBeUndefined();
    // 記録が無い間は「今月から」
    for (const p of playerSchool(s).players.filter((x) => x.status === "active")) for (const f of focusStreaks(s, p)) expect(f.months).toBe(0);
    autoplayYears(s, 1, "skilled", {}, 400);
    expect(Object.keys(s.monthly?.focusLog ?? {}).length).toBeGreaterThan(5);
    // 保存し直しても記録が残る
    const again = fromRawSave(JSON.parse(JSON.stringify(toSaveData(s))));
    expect(again.monthly?.focusLog).toEqual(s.monthly?.focusLog);
  }, 120000);
});
