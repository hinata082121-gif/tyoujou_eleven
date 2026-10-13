/**
 * 試合の結果の指紋（テスト用）：lane・zone を足しても、試合の結果と乱数の使い方が変わらないことを確かめる
 */
import { WINTER_RULES } from "../config/competitions";
import { LEAGUE_RULES } from "../config/league";
import { createMatch, simulateToEnd, type TeamInput } from "../match/engine";
import { autoSetup, DEFAULT_TACTICS } from "../match/lineup";
import { Rng } from "../rng";
import { generateCpuRoster } from "../school/generate";
import type { Tactics } from "../types";

const TACTICS: Tactics[] = [
  { ...DEFAULT_TACTICS },
  { attack: "attacking", buildUp: "long", press: "high", line: "high" },
  { attack: "defensive", buildUp: "buildUp", press: "low", line: "low" },
];

function team(seed: string, prestige: number, tactics: Tactics, formation: "4-4-2" | "4-3-3" | "3-5-2"): TeamInput {
  const players = generateCpuRoster(Rng.fromSeed(seed), prestige, 1);
  return { schoolId: seed, name: seed, rank: "C", isUser: false, players, setup: autoSetup(players, formation, tactics) };
}

/** n 試合を計算し、イベント（時刻・側・種類・選手・付加情報）と最後の乱数の状態をまとめた 32 ビットのハッシュ */
export function matchFingerprint(n: number): string {
  let h = 0x811c9dc5;
  const add = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  const forms = ["4-4-2", "4-3-3", "3-5-2"] as const;
  for (let i = 0; i < n; i++) {
    const rules = i % 2 === 0 ? WINTER_RULES.early : LEAGUE_RULES;
    const m = simulateToEnd(createMatch(rules, Rng.fromSeed(`fp${i}`), team(`a${i}`, 1 + (i % 4), TACTICS[i % 3], forms[i % 3]), team(`b${i}`, 1 + ((i + 1) % 4), TACTICS[(i + 1) % 3], forms[(i + 2) % 3]), "prefQualifier"));
    for (const e of m.events) add(`${e.minute}|${e.side}|${e.type}|${(e.players ?? []).join(",")}|${e.note ?? ""}|${e.skill ?? ""}|${e.move ?? ""}|${e.assist ?? ""};`);
    add(JSON.stringify(m.score) + JSON.stringify(m.rng));
  }
  return h.toString(16);
}
