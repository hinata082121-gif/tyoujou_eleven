import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decompressFromBase64 } from "lz-string";
import { describe, expect, it } from "vitest";
import { autoplayYears } from "@/engine/game/autoplay";
import { dateToDay } from "@/engine/calendar";
import { facilitiesForReputation } from "@/engine/facilities";
import { TIER_SETTINGS } from "@/engine/config/school";
import { fromRawSave, SCHEMA_VERSION, toSaveData } from ".";
import { packPlayer, unpackPlayer } from "./codec";

/** Phase 2b（スキーマ 4）のセーブ。5 年目の 11 月 20 日、評判は 3 */
const loadFixture = () => JSON.parse(decompressFromBase64(readFileSync(join(__dirname, "fixtures/v4-phase2b-save.lz.txt"), "utf8"))!);

describe("Phase 2b のセーブの移行（v4 → v5）", () => {
  it("設備は評判に応じて整い、CPU 校にも設備とコンディショニングが付く。小さな県は 3 校以上になる", () => {
    const raw = loadFixture();
    expect(raw.schemaVersion).toBe(4);
    const s = fromRawSave(raw);
    expect(s.facilities).toEqual(facilitiesForReputation(s.reputation.level));
    expect(s.facilityGrantedLevel).toBe(s.reputation.level);
    for (const x of Object.values(s.schools)) {
      if (x.isPlayer) continue;
      expect(x.cpuFacilities).toBeDefined();
      expect(x.cpuStaff?.conditioning).toBeGreaterThanOrEqual(0);
    }
    for (const p of s.prefectures) if (!p.isPlayerPref) expect(p.schoolIds.length).toBeGreaterThanOrEqual(TIER_SETTINGS[p.tier].otherPrefSchools);
    // 部員は全員一般入部
    expect(Object.values(s.schools).every((x) => x.players.every((p) => p.admission === "general"))).toBe(true);
    expect(s.competitions.summerHostPrefId).toBeDefined();
  });

  it("これから先の日程だけに新しい大マスが入り、11 月のスカウトは残りの期間で始まる", () => {
    const raw = loadFixture();
    const before = fromRawSave({ ...raw, schemaVersion: 4 });
    const pos = raw.game.calendar.position as number;
    const oldSquares = raw.game.calendar.squares as { baseType: string; major?: { kind: string } }[];
    const s = before;
    for (let d = 0; d <= pos; d++) expect(s.calendar.squares[d].baseType).toBe(oldSquares[d].baseType);
    const later = s.calendar.squares.slice(pos + 1).map((q) => q.major?.kind);
    expect(later).toContain("camp");
    expect(later).toContain("rookiePref");
    expect(later).toContain("scoutReply");
    expect((s.calendar.branches ?? []).every((b) => b.day > pos)).toBe(true);
    expect(s.scout).toBeDefined();
    expect(s.scout!.cardDays.every((d) => d > pos && d <= dateToDay(2, 20))).toBe(true);
  });

  it("同じセーブからは毎回同じ結果になり、移行後も 1 年遊び続けられる。特待生の印は保存し直しても残る", () => {
    const a = fromRawSave(loadFixture());
    const b = fromRawSave(loadFixture());
    expect(JSON.stringify(toSaveData(a, "t"))).toBe(JSON.stringify(toSaveData(b, "t")));
    const year = a.year;
    autoplayYears(a, 1, "skilled");
    expect(a.year).toBeGreaterThan(year);
    const again = fromRawSave(JSON.parse(JSON.stringify(toSaveData(a))));
    expect(again.year).toBe(a.year);
    expect(toSaveData(a).schemaVersion).toBe(SCHEMA_VERSION);
    const p = { ...a.schools[a.playerSchoolId].players[0], admission: "scholarship" as const };
    expect(unpackPlayer(JSON.parse(JSON.stringify(packPlayer(p)))).admission).toBe("scholarship");
  });
});
