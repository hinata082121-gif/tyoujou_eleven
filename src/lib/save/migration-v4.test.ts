import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decompressFromBase64 } from "lz-string";
import { describe, expect, it } from "vitest";
import { autoplayYears } from "@/engine/game/autoplay";
import { goldCount, isGold, plusCount } from "@/engine/skills";
import { styleOptions } from "@/engine/player/traits";
import { PROFICIENCY } from "@/engine/config/playStyle";
import { fromRawSave, SCHEMA_VERSION, toSaveData } from ".";
import { packPlayer, unpackPlayer } from "./codec";
import { personalityForTalent } from "./migrations";

/** Phase 2a（スキーマ 3）のセーブ。6 年目の秋 */
const loadFixture = () => JSON.parse(decompressFromBase64(readFileSync(join(__dirname, "fixtures/v3-phase2a-save.lz.txt"), "utf8"))!);

describe("Phase 2a のセーブの移行（v3 → v4）", () => {
  it("全員に性格・スタイル・熟練度（学年に応じて）・特殊能力が付き、両足の選手は右足か左足になる", () => {
    const raw = loadFixture();
    expect(raw.schemaVersion).toBe(3);
    const bothBefore = new Set(Object.values(raw.game.schools as Record<string, { players: unknown[][] }>).flatMap((s) => s.players.filter((p) => p[8] === "B").map((p) => p[0] as string)));
    expect(bothBefore.size).toBeGreaterThan(0);
    const s = fromRawSave(raw);
    const all = Object.values(s.schools).flatMap((x) => x.players);
    for (const p of all) {
      expect(["R", "L"]).toContain(p.foot);
      expect(p.personality).toBeDefined();
      expect(p.playStyle).toBeDefined();
      const [lo, hi] = PROFICIENCY.migrationByGrade[p.grade];
      expect(p.styleProficiency).toBeGreaterThanOrEqual(lo);
      expect(p.styleProficiency).toBeLessThanOrEqual(hi);
      // 金色は付けない。両足だった選手には逆足× を付けない
      expect(goldCount(p)).toBe(0);
      if (bothBefore.has(p.id)) expect(p.skills).not.toContain("footX");
      // スタイルは主ポジションで選べるもの
      expect(styleOptions(p)).toContain(p.playStyle);
    }
    // 3 年生はおよそ 1 つ、1 年生はほとんど持たない
    const avg = (g: number) => {
      const ps = all.filter((p) => p.grade === g);
      return ps.reduce((a, p) => a + plusCount(p), 0) / ps.length;
    };
    expect(avg(3)).toBeGreaterThan(0.7);
    expect(avg(3)).toBeLessThan(1.5);
    expect(avg(1)).toBeLessThan(0.15);
    expect(all.some((p) => p.skills.some(isGold))).toBe(false);
  });

  it("OB にも性格・スタイル・特殊能力が付き、スタッフとしての値は変わらない", () => {
    const raw = loadFixture();
    const before = raw.game.alumni.map((a: { staffProfile: unknown }) => JSON.stringify(a.staffProfile));
    const s = fromRawSave(raw);
    expect(s.alumni.map((a) => JSON.stringify(a.staffProfile))).toEqual(before);
    for (const a of s.alumni) {
      expect(a.personality).toBeDefined();
      expect(a.playStyle).toBeDefined();
      expect(Array.isArray(a.skills)).toBe(true);
    }
    expect(personalityForTalent(0.2)).toBe("inspired");
    expect(personalityForTalent(0.72)).toBe("diligent");
  });

  it("CPU 校にもキャプテンがいて、自校のキャプテンはそのまま。ログで知らせる", () => {
    const raw = loadFixture();
    const mine = raw.game.schools[raw.game.playerSchoolId].captainId;
    const s = fromRawSave(raw);
    expect(s.schools[s.playerSchoolId].captainId).toBe(mine);
    for (const x of Object.values(s.schools)) if (x.players.some((p) => p.status === "active")) expect(x.captainId).toBeDefined();
    expect(s.log.some((l) => l.text.includes("特殊能力が加わった"))).toBe(true);
  });

  it("同じセーブからは毎回同じ結果になり、移行後も 1 年遊び続けられる", () => {
    const a = fromRawSave(loadFixture());
    const b = fromRawSave(loadFixture());
    expect(JSON.stringify(toSaveData(a, "t"))).toBe(JSON.stringify(toSaveData(b, "t")));
    const year = a.year;
    autoplayYears(a, 1);
    expect(a.year).toBeGreaterThan(year);
    const again = fromRawSave(JSON.parse(JSON.stringify(toSaveData(a))));
    expect(again.year).toBe(a.year);
    expect(toSaveData(a).schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe("部員の圧縮形式（v4 で増えた項目）", () => {
  it("性格・スタイル・熟練度・特殊能力・得意な練習・成果を元に戻せる", () => {
    const s = fromRawSave(loadFixture());
    const p = s.schools[s.playerSchoolId].players[0];
    p.personality = "craftsman";
    p.favoritePractice = "setPiece";
    p.playStyle = styleOptions(p)[0];
    p.styleProficiency = 42.3;
    p.skills = ["fkMaster", "pk2"];
    p.feats = { oneOnOneGoals: 1, headerGoals: 2, fkGoals: 3, cornerAssists: 0, crossAssists: 4, feedAssists: 0, duelWins: 5, aerialWins: 6, gkOneOnOneStops: 0, pkStreak: 7, goldReady: ["pkG"] };
    const back = unpackPlayer(JSON.parse(JSON.stringify(packPlayer(p))));
    expect(back.personality).toBe("craftsman");
    expect(back.favoritePractice).toBe("setPiece");
    expect(back.playStyle).toBe(p.playStyle);
    expect(back.styleProficiency).toBe(42.3);
    expect(back.skills).toEqual(["fkMaster", "pk2"]);
    expect(back.feats).toEqual(p.feats);
  });
});
