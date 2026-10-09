import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decompressFromBase64 } from "lz-string";
import { describe, expect, it } from "vitest";
import { confirmYearEnd, finishStaff, hire } from "@/engine/game";
import { autoplayYears } from "@/engine/game/autoplay";
import { headCoach } from "@/engine/staff";
import { fromRawSave, SCHEMA_VERSION, toSaveData } from ".";
import { packPlayer, unpackPlayer } from "./codec";

/** Phase 1（スキーマ 2）の実際のセーブ。4 年遊んだ 5 年目 */
const loadFixture = () => JSON.parse(decompressFromBase64(readFileSync(join(__dirname, "fixtures/v2-phase1-save.lz.txt"), "utf8"))!);

describe("Phase 1 のセーブの移行（v2 → v3）", () => {
  it("架空の OB が加わり、臨時コーチがいて、作戦ノートは空で読み込める", () => {
    const raw = loadFixture();
    expect(raw.schemaVersion).toBe(2);
    const s = fromRawSave(raw);
    const fictional = s.alumni.filter((a) => a.fictional);
    expect(fictional.length).toBeGreaterThanOrEqual(5);
    expect(s.alumni.length).toBeGreaterThan(fictional.length);
    // 実在の卒業生にもスタッフとしての素地と記録が付く。主将は卒業年度ごとに 1 人
    for (const a of s.alumni) {
      expect(a.staffProfile).toBeDefined();
      expect(a.record).toBeDefined();
    }
    const real = s.alumni.filter((a) => !a.fictional);
    const captains = real.filter((a) => a.wasCaptain);
    expect(new Set(captains.map((a) => a.graduatedYear)).size).toBe(captains.length);
    expect(headCoach(s.staff)?.temporary).toBe(true);
    expect(s.notes).toEqual([]);
    expect(Object.values(s.schools).filter((x) => x.id !== s.playerSchoolId).every((x) => x.cpuStaff)).toBe(true);
    expect(s.log.some((l) => l.text.includes("スタッフ制度"))).toBe(true);
    for (const p of s.schools[s.playerSchoolId].players) {
      expect(p.suspended).toBe(0);
      expect(p.record).toBeDefined();
    }
  });

  it("移行したセーブで OB を雇い、1 年遊び続けられる。保存し直すと v3 になる", () => {
    const s = fromRawSave(loadFixture());
    const year = s.year;
    const ob = s.alumni.find((a) => a.fictional && a.career === "coach")!;
    // 年度の途中でも臨時コーチは欠員扱いなので入れ替えられる
    expect(hire(s, ob.id, "head")).toBeNull();
    autoplayYears(s, 1);
    if (s.pending?.type === "yearEnd") confirmYearEnd(s);
    if (s.pending?.type === "staff") finishStaff(s);
    expect(s.year).toBeGreaterThan(year);
    const again = fromRawSave(JSON.parse(JSON.stringify(toSaveData(s))));
    expect(again.year).toBe(s.year);
    expect(toSaveData(s).schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe("部員の圧縮形式（v3 で増えた項目）", () => {
  it("出場停止と出場・得点の記録も元に戻せる", () => {
    const s = fromRawSave(loadFixture());
    const p = s.schools[s.playerSchoolId].players[0];
    p.suspended = 1;
    p.record = { apps: 12, goals: 3, officialApps: 4, officialGoals: 1 };
    const back = unpackPlayer(JSON.parse(JSON.stringify(packPlayer(p))));
    expect(back.suspended).toBe(1);
    expect(back.record).toEqual(p.record);
    const plain = s.schools[s.playerSchoolId].players[1];
    plain.suspended = 0;
    plain.record = { apps: 0, goals: 0, officialApps: 0, officialGoals: 0 };
    const packed = packPlayer(plain);
    expect(packed.length).toBeLessThanOrEqual(16);
    expect(unpackPlayer(packed).record).toEqual(plain.record);
  });
});
