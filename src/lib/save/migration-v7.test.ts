import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decompressFromBase64 } from "lz-string";
import { describe, expect, it } from "vitest";
import { autoplayYears } from "@/engine/game/autoplay";
import { fromRawSave, SCHEMA_VERSION, toSaveData } from ".";

/** Phase 3（スキーマ 6）のセーブ */
const loadFixture = () => JSON.parse(decompressFromBase64(readFileSync(join(__dirname, "fixtures/v6-phase3-save.lz.txt"), "utf8"))!);

describe("Phase 3 のセーブの移行（v6 → v7）", () => {
  it("全選手・OB に見た目、出場する選手に背番号、全校にユニフォームが付き、お知らせが出る", () => {
    const raw = loadFixture();
    expect(raw.schemaVersion).toBe(6);
    const s = fromRawSave(raw);
    for (const sc of Object.values(s.schools)) {
      expect(sc.kits?.first).toBeDefined();
      expect(sc.kits?.second).toBeDefined();
      const active = sc.players.filter((p) => p.status === "active");
      for (const p of sc.players) expect(p.look).toBeDefined();
      const nums = active.map((p) => p.shirtNumber);
      expect(nums.every((n) => n !== undefined)).toBe(true);
      expect(new Set(nums).size).toBe(nums.length);
    }
    for (const a of s.alumni) expect(a.look).toBeDefined();
    expect(s.log.some((l) => l.text.includes("ユニフォーム"))).toBe(true);
  });

  it("能力などはそのままで、2 回読み込んでも同じ見た目・背番号・ユニフォームになる", () => {
    const a = fromRawSave(loadFixture());
    const b = fromRawSave(loadFixture());
    expect(toSaveData(a, "t")).toEqual(toSaveData(b, "t"));
    const raw = loadFixture();
    const id = Object.keys(raw.game.schools)[0];
    const before = raw.game.schools[id].players[0];
    const after = a.schools[id].players.find((p) => p.id === before[0])!;
    expect(after.name).toBe(before[1]);
    expect(after.heightCm).toBe(before[6]);
  });

  it("保存し直しても見た目・背番号が残り、そのまま続けられる", () => {
    const s = fromRawSave(loadFixture());
    const again = fromRawSave(JSON.parse(JSON.stringify(toSaveData(s))));
    expect(toSaveData(again).schemaVersion).toBe(SCHEMA_VERSION);
    const me = again.schools[again.playerSchoolId];
    expect(me.players[0].look).toEqual(s.schools[s.playerSchoolId].players[0].look);
    expect(me.players[0].shirtNumber).toEqual(s.schools[s.playerSchoolId].players[0].shirtNumber);
    autoplayYears(again, 1, "skilled");
    for (const p of again.schools[again.playerSchoolId].players) expect(p.look).toBeDefined();
  }, 120000);
});
