/** 1 試合あたりのファウル・カード・ケガ（SPEC 10.2 の目安：イエロー両チーム合計 2〜3 枚、レッドは数十試合に 1 枚） */
import { WINTER_RULES } from "../src/engine/config/competitions";
import { createMatch, simulateToEnd } from "../src/engine/match/engine";
import { autoSetup } from "../src/engine/match/lineup";
import { STYLE_WEIGHTS, TACTIC_STYLE_IDS, TACTIC_STYLES } from "../src/engine/config/tactics";
import { Rng } from "../src/engine/rng";
import { generateCpuRoster } from "../src/engine/school/generate";
import { rankFromStrength, teamStrength } from "../src/engine/school/strength";

export interface CardStats {
  n: number;
  fouls: number;
  yellows: number;
  reds: number;
  injuries: number;
  shortHanded: number;
}

export function cardStats(n: number, seed = "cards"): CardStats {
  const rng = Rng.fromSeed(seed);
  const r: CardStats = { n: 0, fouls: 0, yellows: 0, reds: 0, injuries: 0, shortHanded: 0 };
  const style = () => TACTIC_STYLES[rng.weighted(TACTIC_STYLE_IDS, (id) => STYLE_WEIGHTS[id])];
  for (let i = 0; i < n; i++) {
    const prestige = rng.int(0, 5);
    const team = (id: string) => {
      const players = generateCpuRoster(rng, prestige, 1);
      const st = style();
      return { schoolId: id, name: id, rank: rankFromStrength(teamStrength(players)), isUser: false, players, setup: autoSetup(players, rng.pick(st.formations), { ...st.tactics }) };
    };
    const s = simulateToEnd(createMatch(WINTER_RULES.early, rng, team("a"), team("b")));
    r.n++;
    for (const t of s.teams) {
      r.fouls += t.stats.fouls ?? 0;
      r.yellows += t.stats.yellows ?? 0;
      r.reds += t.stats.reds ?? 0;
      r.injuries += t.stats.injuries ?? 0;
    }
    r.shortHanded += s.events.filter((e) => e.type === "shortHanded").length;
  }
  return r;
}

if (process.argv[1]?.endsWith("cards.ts")) {
  const r = cardStats(Number(process.argv[2] ?? 2000));
  console.log(`試合 ${r.n}：ファウル ${(r.fouls / r.n).toFixed(1)} / イエロー ${(r.yellows / r.n).toFixed(2)} / レッド ${(r.reds / r.n).toFixed(3)}（${(r.n / Math.max(1, r.reds)).toFixed(0)}試合に1枚）/ ケガ ${(r.injuries / r.n).toFixed(3)}（${(r.n / Math.max(1, r.injuries)).toFixed(1)}試合に1件）`);
}
