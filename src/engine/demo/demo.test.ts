import { describe, expect, it } from "vitest";
import { buildDemoMatch, DEMO_KINDS, demoRounds, demoWorld } from ".";
import { kitsClash } from "../look";
import { SCHOOL_RANKS, type SchoolRank } from "../types";

const fingerprint = (d: ReturnType<typeof buildDemoMatch>) => JSON.stringify({ score: d.ms.score, events: d.ms.events, teams: d.ms.teams.map((t) => t.schoolId) });

describe("3D 観戦のデモの試合", () => {
  it("同じ入力なら同じ試合になる", () => {
    const a = buildDemoMatch({ kind: "national", fromEnd: 1, ranks: ["A", "B"] });
    const b = buildDemoMatch({ kind: "national", fromEnd: 1, ranks: ["A", "B"] });
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.ms.view).toEqual(b.ms.view);
  });

  it("最後まで計算してあり、PK 戦はしない", () => {
    for (const kind of DEMO_KINDS) {
      const d = buildDemoMatch({ kind, fromEnd: 0, ranks: ["C", "C"] });
      expect(d.ms.phase).toBe("END");
      expect(d.ms.pk).toBeUndefined();
      expect(d.ms.events.at(-1)?.type).toBe("fullTime");
    }
  });

  it("ランクの指定が効く（世界にあるランクの中で、いちばん近い学校を選ぶ）", () => {
    const world = demoWorld();
    const have = new Set(Object.values(world.schools).filter((s) => !s.isPlayer).map((s) => s.rank));
    const nearest = (r: SchoolRank) => Math.min(...[...have].map((h) => Math.abs(SCHOOL_RANKS.indexOf(h) - SCHOOL_RANKS.indexOf(r))));
    for (const [h, a] of [
      ["S", "E"],
      ["E", "S"],
      ["B", "C"],
    ] as [SchoolRank, SchoolRank][]) {
      const d = buildDemoMatch({ kind: "practice", ranks: [h, a] });
      expect(Math.abs(SCHOOL_RANKS.indexOf(d.ms.teams[0].rank) - SCHOOL_RANKS.indexOf(h))).toBe(nearest(h));
      expect(Math.abs(SCHOOL_RANKS.indexOf(d.ms.teams[1].rank) - SCHOOL_RANKS.indexOf(a))).toBe(nearest(a));
      expect(d.ms.teams[0].schoolId).not.toBe(d.ms.teams[1].schoolId);
      // 自校（プレイヤー校）は出ない
      expect(d.ms.teams.some((t) => t.schoolId === world.playerSchoolId)).toBe(false);
    }
  });

  it("会場の段階：自動は大会とラウンドから決まり、上書きもでき、試合の中身は変わらない", () => {
    const auto = buildDemoMatch({ kind: "national", fromEnd: 0 });
    expect(auto.ms.view?.venue).toBe(4);
    const early = buildDemoMatch({ kind: "rookiePref", fromEnd: 4 });
    expect(early.ms.view?.venue).toBe(1);
    for (const v of [1, 2, 3, 4] as const) {
      const d = buildDemoMatch({ kind: "national", fromEnd: 0, venue: v });
      expect(d.ms.view?.venue).toBe(v);
      expect(fingerprint(d)).toBe(fingerprint(auto));
    }
    expect(buildDemoMatch({ kind: "league" }).ms.view?.venue).toBeUndefined();
    expect(buildDemoMatch({ kind: "practice", venue: 2 }).ms.view?.venue).toBe(2);
  });

  it("色かぶりを起こしても、着るユニフォームは自動でかぶらない組み合わせになる", () => {
    for (const ranks of [
      ["A", "B"],
      ["S", "E"],
      ["C", "D"],
    ] as [SchoolRank, SchoolRank][]) {
      const d = buildDemoMatch({ kind: "summerNational", fromEnd: 0, ranks, kits: "clash" });
      expect(d.clashed).toBe(true);
      expect(d.kitChoice).not.toEqual(["first", "first"]);
      expect(kitsClash(d.ms.view!.kits[0], d.ms.view!.kits[1])).toBe(false);
      // ユニフォームを変えても試合の中身は同じ
      expect(fingerprint(d)).toBe(fingerprint(buildDemoMatch({ kind: "summerNational", fromEnd: 0, ranks })));
    }
  });

  it("選手に見た目と背番号を付ける", () => {
    const d = buildDemoMatch({ kind: "prefQualifier", fromEnd: 0, ranks: ["A", "A"] });
    for (const t of d.ms.teams)
      for (const p of Object.values(t.players)) {
        expect(p.look).toBeDefined();
        expect(p.num).toBeGreaterThan(0);
      }
  });

  it("新人戦は 1・2 年生だけが出る", () => {
    const d = buildDemoMatch({ kind: "rookieRegion", fromEnd: 0, ranks: ["B", "B"] });
    const world = demoWorld();
    for (const t of d.ms.teams) {
      const grade = new Map(world.schools[t.schoolId].players.map((p) => [p.id, p.grade]));
      for (const id of Object.keys(t.players)) expect(grade.get(id)).toBeLessThanOrEqual(2);
    }
  });

  it("表示用のラベルと大舞台、ルール", () => {
    const fin = buildDemoMatch({ kind: "national", fromEnd: 0 });
    expect(fin.labels.round).toBe("決勝");
    expect(fin.labels.title).toContain(fin.labels.competition);
    expect(fin.bigStage).toBe(true);
    expect(fin.ms.rules.extraTimeHalfMinutes).toBe(10);
    const rounds = demoRounds("national");
    expect(rounds[0]).toEqual({ fromEnd: 0, label: "決勝", venue: 4 });
    expect(rounds[1].label).toBe("準決勝");
    // 範囲外のラウンドは収める
    expect(buildDemoMatch({ kind: "national", fromEnd: 99 }).labels.round).toBe(rounds.at(-1)!.label);
    expect(buildDemoMatch({ kind: "summerQualifier", fromEnd: 1 }).bigStage).toBe(false);
    expect(buildDemoMatch({ kind: "practice" }).labels.round).toBe("");
    expect(buildDemoMatch({ kind: "practice" }).ms.rules.halfMinutes).toBe(35);
    expect(demoRounds("league")).toEqual([]);
  });
});
