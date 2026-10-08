import { describe, expect, it } from "vitest";
import { newGame, playCard } from "@/engine/game";
import { autoplayYears } from "@/engine/game/autoplay";
import { MemoryStorageAdapter, SaveManager, SaveVersionError, migrateSave, toSaveData } from ".";
import { packPlayer, unpackPlayer } from "./codec";

describe("セーブ", () => {
  it("部員の圧縮形式は元に戻せる", () => {
    const s = newGame("codec", "A高校");
    for (const school of Object.values(s.schools).slice(0, 5)) {
      for (const p of school.players) {
        const back = unpackPlayer(JSON.parse(JSON.stringify(packPlayer(p))));
        expect(back.stats).toEqual(p.stats);
        expect(back.aptitude).toEqual(p.aptitude);
        expect(back.name).toBe(p.name);
        expect(back.potential).toBe(p.potential);
      }
    }
  });

  it("保存して読み込むと、乱数を含めて同じ続きになる", async () => {
    const mgr = new SaveManager(new MemoryStorageAdapter());
    const s = newGame("save", "B高校");
    autoplayYears(s, 0);
    playCard(s, s.calendar.hand[0].id);
    await mgr.save(1, s);
    const loaded = (await mgr.load(1))!;
    expect(loaded.rng).toEqual(s.rng);
    expect(loaded.calendar.position).toBe(s.calendar.position);
    // 同じカードを使うと同じ結果になる
    playCard(s, s.calendar.hand[0].id);
    playCard(loaded, loaded.calendar.hand[0].id);
    expect(loaded.rng).toEqual(s.rng);
    expect(loaded.calendar.position).toBe(s.calendar.position);
    const summary = await mgr.summary(1);
    expect(summary?.schoolName).toBe("B高校");
    expect(await mgr.load(0)).toBeNull();
  });

  it("1 枠の保存サイズは localStorage に 3 枠入る大きさ", async () => {
    const storage = new MemoryStorageAdapter();
    const mgr = new SaveManager(storage);
    const s = newGame("size", "C高校");
    autoplayYears(s, 2);
    await mgr.save(0, s);
    const chars = [...storage.data.values()].reduce((n, v) => n + v.length, 0);
    // 3 枠で 5MB（UTF-16 で 250 万文字）を十分下回る
    expect(chars * 3).toBeLessThan(2_500_000);
  });

  it("JSON で書き出して、別の枠に読み込める", async () => {
    const mgr = new SaveManager(new MemoryStorageAdapter());
    const s = newGame("json", "D高校");
    await mgr.save(0, s);
    const json = (await mgr.exportJson(0))!;
    await mgr.importJson(2, json);
    const loaded = (await mgr.load(2))!;
    expect(loaded.schools[loaded.playerSchoolId].name).toBe("D高校");
    await expect(mgr.importJson(1, "{broken")).rejects.toThrow(SaveVersionError);
    await expect(mgr.importJson(1, JSON.stringify({ foo: 1 }))).rejects.toThrow(SaveVersionError);
  });

  it("v1（架空の県）のセーブデータを v2（実在の都道府県）に移して、続きが遊べる", async () => {
    const s = newGame("v1", "旧高校");
    const data = JSON.parse(JSON.stringify(toSaveData(s)));
    // v1 の形に戻す（32 の架空の県、区分なし）
    data.schemaVersion = 1;
    data.game.prefectures = data.game.prefectures.slice(0, 32).map((p: Record<string, unknown>, i: number) => {
      const { tier: _t, reps: _r, ...rest } = p;
      void _t;
      void _r;
      return { ...rest, name: `架空${i}`, regionId: `r${i % 8}` };
    });
    data.game.regions = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, name: `地域${i}` }));
    const mgr = new SaveManager(new MemoryStorageAdapter());
    await mgr.importJson(0, JSON.stringify(data));
    const loaded = (await mgr.load(0))!;
    expect(loaded.prefectures.every((p) => p.name.match(/[都道府県]$/) && p.tier && p.reps === 1)).toBe(true);
    expect(loaded.regions).toHaveLength(9);
    expect(playCard(loaded, loaded.calendar.hand[0].id)).not.toBeNull();
  });

  it("古いバージョンのセーブデータはマイグレーションで新しくなる", () => {
    const migrations = {
      1: (d: { schemaVersion: number; [k: string]: unknown }) => ({ ...d, schemaVersion: 2, added: "v2" }),
      2: (d: { schemaVersion: number; [k: string]: unknown }) => ({ ...d, schemaVersion: 3, added: `${d.added}->v3` }),
    };
    const out = migrateSave({ schemaVersion: 1, game: {} }, migrations as never, 3);
    expect(out.schemaVersion).toBe(3);
    expect(out.added).toBe("v2->v3");
    expect(() => migrateSave({ schemaVersion: 4 }, migrations as never, 3)).toThrow(SaveVersionError);
    expect(() => migrateSave({ schemaVersion: 0 }, migrations as never, 3)).toThrow(SaveVersionError);
    // 現在のバージョンはそのまま
    const s = newGame("mig", "E高校");
    const data = JSON.parse(JSON.stringify(toSaveData(s)));
    expect(migrateSave(data)).toEqual(data);
  });
});
