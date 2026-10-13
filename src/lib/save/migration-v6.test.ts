import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decompressFromBase64 } from "lz-string";
import { describe, expect, it } from "vitest";
import { autoplayYears } from "@/engine/game/autoplay";
import { divisionOf } from "@/engine/league";
import { fromRawSave, SCHEMA_VERSION, toSaveData } from ".";

/** Phase 2c（スキーマ 5）のセーブ。5 年目の 10 月 23 日、評判は 2（中堅） */
const loadFixture = () => JSON.parse(decompressFromBase64(readFileSync(join(__dirname, "fixtures/v5-phase2c-save.lz.txt"), "utf8"))!);

describe("Phase 2c のセーブの移行（v5 → v6）", () => {
  it("自県の全校が部に分かれ、自校は評判に応じた部に入る。その年のリーグ戦はない", () => {
    const raw = loadFixture();
    expect(raw.schemaVersion).toBe(5);
    const s = fromRawSave(raw);
    const lg = s.league!;
    expect(lg.active).toBe(false);
    const pref = s.prefectures.find((p) => p.isPlayerPref)!;
    expect(lg.divisions.flatMap((d) => d.schoolIds).sort()).toEqual([...pref.schoolIds].sort());
    const my = divisionOf(lg, s.playerSchoolId)!;
    // 中堅：最下部より上、1 部より下（部が 3 つ以上なら）
    if (lg.divisions.length >= 3) expect(my.level).toBeGreaterThan(1);
    expect(s.calendar.squares.some((q) => q.major?.kind === "league")).toBe(false);
  });

  it("次の年度から県リーグが始まり、保存し直しても続けられる", () => {
    const s = fromRawSave(loadFixture());
    const level = divisionOf(s.league!, s.playerSchoolId)!.level;
    autoplayYears(s, 1, "skilled");
    expect(s.league!.active).toBe(true);
    expect(divisionOf(s.league!, s.playerSchoolId)!.level).toBe(level);
    expect(s.calendar.squares.some((q) => q.major?.kind === "league")).toBe(true);
    const again = fromRawSave(JSON.parse(JSON.stringify(toSaveData(s))));
    expect(toSaveData(again).schemaVersion).toBe(SCHEMA_VERSION);
    autoplayYears(again, 1, "skilled");
    expect(again.history.at(-1)!.league).toBeDefined();
  }, 120000);
});
