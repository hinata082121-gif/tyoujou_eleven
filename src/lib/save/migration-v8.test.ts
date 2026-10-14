import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decompressFromBase64 } from "lz-string";
import { describe, expect, it } from "vitest";
import { autoplayYears } from "@/engine/game/autoplay";
import { fromRawSave, SCHEMA_VERSION, toSaveData } from ".";

/** R1（スキーマ 7）のセーブ：2 年目の 4 月下旬 */
const loadFixture = () => JSON.parse(decompressFromBase64(readFileSync(join(__dirname, "fixtures/v7-r1-save.lz.txt"), "utf8"))!);

describe("R1 のセーブの移行（v7 → v8）", () => {
  it("自校の部員に学力・信頼度が付き、これから先の日程に学校行事と人物マスが入る。すでにある大マスはそのまま", () => {
    const raw = loadFixture();
    expect(raw.schemaVersion).toBe(7);
    const s = fromRawSave(raw);
    const me = s.schools[s.playerSchoolId];
    for (const p of me.players) {
      expect(p.academic).toBeGreaterThanOrEqual(0);
      expect(p.trust).toBeGreaterThanOrEqual(0);
    }
    // CPU 校の部員は持たない
    const cpu = Object.values(s.schools).find((x) => !x.isPlayer)!;
    expect(cpu.players[0].academic).toBeUndefined();
    const pos = s.calendar.position;
    const school = s.calendar.squares.filter((q) => q.major?.kind === "school");
    expect(school.length).toBeGreaterThan(10);
    expect(school.every((q) => q.day > pos)).toBe(true);
    expect(s.calendar.squares.some((q) => q.day > pos && q.baseType === "person")).toBe(true);
    expect(s.calendar.squares.every((q) => q.day > pos || q.baseType !== "person")).toBe(true);
    // 月初の指示は次の 1 日から
    expect(s.monthly?.doneMonth).toBe(0);
    expect(s.log.some((l) => l.text.includes("学校行事"))).toBe(true);
  });

  it("2 回読み込んでも同じになり、保存し直しても学校生活の値が残って、そのまま遊び続けられる", () => {
    const a = fromRawSave(loadFixture());
    const b = fromRawSave(loadFixture());
    expect(toSaveData(a, "t")).toEqual(toSaveData(b, "t"));
    const again = fromRawSave(JSON.parse(JSON.stringify(toSaveData(a))));
    expect(toSaveData(again).schemaVersion).toBe(SCHEMA_VERSION);
    const p0 = a.schools[a.playerSchoolId].players[0];
    const p1 = again.schools[again.playerSchoolId].players[0];
    expect(p1.academic).toBe(p0.academic);
    expect(p1.trust).toBe(p0.trust);
    const stats = autoplayYears(again, 1, "skilled");
    expect(stats.monthly).toBeGreaterThanOrEqual(11);
    expect(stats.tests.length).toBeGreaterThanOrEqual(5);
  }, 120000);
});

describe("R1 のセーブの移行（v7 → v8）：大会の最中・試合の途中", () => {
  const load = (f: string) => JSON.parse(decompressFromBase64(readFileSync(join(__dirname, `fixtures/${f}`), "utf8"))!);

  it("大会の最中（夏の県予選の途中）：県予選の次の試合が行われ、1 年遊び続けられる", () => {
    const raw = load("v7-r1-cup.lz.txt");
    expect(raw.schemaVersion).toBe(7);
    const s = fromRawSave(raw);
    // 行事は今日より後で、大会・リーグなどの日とは重ならない（1 マスに大マスは 1 つ）
    const pos = s.calendar.position;
    expect(s.calendar.squares.filter((q) => q.major?.kind === "school").every((q) => q.day > pos)).toBe(true);
    const stats = autoplayYears(s, 1, "skilled");
    expect(stats.matches[0]?.kind).toBe("summerQualifier");
    expect(stats.monthly).toBeGreaterThanOrEqual(10);
  }, 120000);

  it("試合の途中：観戦中の試合が残り、終えたあとで遊び続けられる", () => {
    const s = fromRawSave(load("v7-r1-match.lz.txt"));
    expect(s.activeMatch?.kind).toBe("summerQualifier");
    const stats = autoplayYears(s, 1, "skilled");
    expect(stats.matches[0]?.kind).toBe("summerQualifier");
    expect(stats.tests.length).toBeGreaterThanOrEqual(4);
  }, 120000);
});
