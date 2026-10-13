import { describe, expect, it } from "vitest";
import { WINTER_RULES } from "../config/competitions";
import { CAPTAIN } from "../config/captain";
import { FORMATIONS } from "../config/formations";
import { SKILL_EFFECTS } from "../config/skills";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import type { Player } from "../types";
import { createMatch, simulateToEnd, type TeamInput } from "./engine";
import { effectiveMovement, laneAffinity } from "./lanes";
import { autoSetup, DEFAULT_TACTICS } from "./lineup";
import { describeEvent } from "./text";
import { captainEffect, goldPresence, NEUTRAL_ENV, playerTraitMult, teamTraitMult } from "./traits";
import type { MatchPlayer, MatchTeamState } from "./types";

const team = (seed: string, prep?: (players: Player[], lineup: string[]) => void, extra: Partial<TeamInput> = {}): TeamInput => {
  const players = generateCpuRoster(Rng.fromSeed(seed), 3, 1);
  const setup = autoSetup(players, "4-4-2", { ...DEFAULT_TACTICS });
  prep?.(players, setup.lineup);
  return { schoolId: seed, name: seed, rank: "C", isUser: false, players, setup, ...extra };
};

describe("動きの範囲（レーンへの関わりやすさ）", () => {
  it("定位置は担当のレーンにほぼ限られ、大外のみは中央に入らない。右の枠は左右反転", () => {
    expect(laneAffinity("L", "fixed").C).toBeLessThan(0.1);
    expect(laneAffinity("C", "fixed").L).toBeLessThan(0.1);
    expect(laneAffinity("L", "wideOnly")).toEqual({ L: 1, C: 0, R: 0 });
    expect(laneAffinity("R", "wideOnly")).toEqual({ L: 0, C: 0, R: 1 });
    // 中央の枠の大外のみ：利き足の側
    expect(laneAffinity("C", "wideOnly", "R").R).toBe(1);
    expect(laneAffinity("C", "wideOnly", "L").L).toBe(1);
    // 自由は P2a までの重み（同じレーン 1・中央 約 0.5）に近い
    expect(laneAffinity("L", "free").C).toBeGreaterThan(0.4);
  });

  it("枠のポジションがスタイルの区分に入らなければ「自由」として扱う", () => {
    expect(effectiveMovement("crosser", { pos: "WG" })).toBe("wideOnly");
    expect(effectiveMovement("crosser", { pos: "CB" })).toBe("wideOnly");
    expect(effectiveMovement("crosser", { pos: "CF" })).toBe("free");
    expect(effectiveMovement("anchor", { pos: "CB" })).toBe("free");
  });

  it("定位置・大外のみの選手は、担当のゾーン以外にほとんど関わらない（関与の 1 割未満）", () => {
    const slots = FORMATIONS["4-4-2"];
    const wgIdx = slots.findIndex((s) => s.pos === "WG" && s.lane === "L");
    const cmfIdx = slots.findIndex((s) => s.pos === "CMF");
    let wideOut = 0;
    let wideAll = 0;
    let fixedOut = 0;
    let fixedAll = 0;
    for (let i = 0; i < 40; i++) {
      let wg = "";
      let cm = "";
      const home = team(`H${i}`, (players, lineup) => {
        wg = lineup[wgIdx];
        cm = lineup[cmfIdx];
        const w = players.find((p) => p.id === wg)!;
        w.playStyle = "crosser";
        w.styleProficiency = 100;
        const c = players.find((p) => p.id === cm)!;
        c.playStyle = "anchor";
        c.styleProficiency = 100;
      });
      const s = simulateToEnd(createMatch(WINTER_RULES.early, Rng.fromSeed(`z${i}`), home, team(`A${i}`)));
      const t = s.teams[0].players;
      const [l, c, r] = t[wg].ms!.laneTouches;
      wideAll += l + c + r;
      wideOut += c + r;
      const [fl, fc, fr] = t[cm].ms!.laneTouches;
      fixedAll += fl + fc + fr;
      fixedOut += fl + fr;
    }
    expect(wideAll).toBeGreaterThan(40);
    expect(fixedAll).toBeGreaterThan(40);
    expect(wideOut / wideAll).toBeLessThan(0.1);
    expect(fixedOut / fixedAll).toBeLessThan(0.1);
  });
});

describe("性格・特殊能力・キャプテンの補正", () => {
  const mp = (patch: Partial<MatchPlayer>): MatchPlayer => ({
    id: "x",
    name: "x",
    mainPosition: "CF",
    stats: {} as MatchPlayer["stats"],
    aptitude: {} as MatchPlayer["aptitude"],
    heightCm: 175,
    condition: 0,
    stamina: 100,
    goals: 0,
    ...patch,
  });

  it("情熱家は終盤、負けず嫌いは格上相手、慎重派は大舞台で実効能力が変わる", () => {
    expect(playerTraitMult(mp({ personality: "passionate" }), { ...NEUTRAL_ENV, late: true })).toBeGreaterThan(1);
    expect(playerTraitMult(mp({ personality: "passionate" }), NEUTRAL_ENV)).toBe(1);
    expect(playerTraitMult(mp({ personality: "competitive" }), { ...NEUTRAL_ENV, underdog: true })).toBeGreaterThan(1);
    expect(playerTraitMult(mp({ personality: "cautious" }), { ...NEUTRAL_ENV, bigStage: true })).toBeLessThan(1);
    expect(playerTraitMult(mp({ skills: ["bigStage2"] }), { ...NEUTRAL_ENV, bigStage: true })).toBeCloseTo(1.04, 5);
    expect(playerTraitMult(mp({ skills: ["bigStageX"] }), { ...NEUTRAL_ENV, bigStage: true })).toBeLessThan(1);
    expect(playerTraitMult(mp({ skills: ["adversity1"] }), { ...NEUTRAL_ENV, behind: true })).toBeGreaterThan(1);
  });

  it("金色の存在感は、その金色に関係するプレーだけに効く", () => {
    expect(playerTraitMult(mp({ skills: ["duelG"] }), NEUTRAL_ENV)).toBe(1);
    expect(goldPresence(mp({ skills: ["duel2"] }))).toBeNull();
    expect([...goldPresence(mp({ skills: ["duelG"] }))!.plays]).toEqual(["defense"]);
    expect([...goldPresence(mp({ skills: ["headingG"] }))!.plays]).toEqual(["shoot"]);
    expect([...goldPresence(mp({ skills: ["crossMaster"] }))!.plays]).toEqual(["pass"]);
    const gk = goldPresence(mp({ skills: ["feedG"], mainPosition: "GK" }))!;
    expect([...gk.plays]).toEqual(["gk"]);
    expect(gk.mult).toBe(SKILL_EFFECTS.goldPresenceGk);
  });

  it("キャプテンの効果は試合に出ていないと半分。キャプテンシーはキャプテンのときだけ", () => {
    const players: Record<string, MatchPlayer> = { c: mp({ id: "c", personality: "passionate", skills: ["captaincy2"] }), o: mp({ id: "o" }) };
    const t = { players, onPitch: ["c", "o"], captainId: "c" } as unknown as MatchTeamState;
    const on = captainEffect(t)!;
    expect(on.share).toBe(1);
    const behind = { ...NEUTRAL_ENV, behind: true };
    expect(teamTraitMult(on, behind)).toBeCloseTo(SKILL_EFFECTS.captaincy.double * CAPTAIN.passionateBehind, 5);
    const off = captainEffect({ ...t, onPitch: ["o"] } as MatchTeamState)!;
    expect(off.share).toBe(CAPTAIN.offPitchShare);
    expect(teamTraitMult(off, behind)).toBeLessThan(teamTraitMult(on, behind));
    expect(captainEffect({ ...t, captainId: undefined } as MatchTeamState)).toBeNull();
  });

  it("特殊能力が効いた場面は、イベントに記録して速報に短く出る。P2a の試合（性格などが無い選手）もそのまま計算できる", () => {
    const all = (players: Player[]) => {
      for (const p of players) p.skills = p.mainPosition === "GK" ? ["gkOneOnOne2", "pkStopper"] : ["doubleTouch", "roulette", "uraKaido", "chopTouch", "scissors", "duel2", "heading2", "interception"];
    };
    let withSkill = 0;
    for (let i = 0; i < 10; i++) {
      const s = simulateToEnd(createMatch(WINTER_RULES.early, Rng.fromSeed(`k${i}`), team(`S${i}`, all), team(`T${i}`, all)));
      for (const e of s.events) {
        if (!e.skill) continue;
        withSkill++;
        expect(describeEvent(s, e)).toMatch(/（.+）|〔.+〕/);
      }
    }
    expect(withSkill).toBeGreaterThan(20);
    // 性格・スタイル・特殊能力の無い選手（P2a の進行中の試合）
    const old = createMatch(WINTER_RULES.early, Rng.fromSeed("old"), team("O1"), team("O2"));
    for (const t of old.teams)
      for (const p of Object.values(t.players)) {
        delete p.personality;
        delete p.playStyle;
        delete p.skills;
        delete p.ms;
        delete p.minutes;
      }
    expect(simulateToEnd(old).phase).toBe("END");
  });
});
