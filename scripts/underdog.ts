import { WINTER_RULES } from "../src/engine/config/competitions";
import { PRESTIGE_LEVEL_BASE } from "../src/engine/config/school";
import { STYLE_WEIGHTS, TACTIC_STYLE_IDS, TACTIC_STYLES } from "../src/engine/config/tactics";
import { createMatch, simulateToEnd } from "../src/engine/match/engine";
import { autoSetup } from "../src/engine/match/lineup";
import { Rng } from "../src/engine/rng";
import { generateCpuRoster } from "../src/engine/school/generate";
import { rankFromStrength, rankIndex, teamStrength } from "../src/engine/school/strength";
import { SCHOOL_RANKS, type Player, type SchoolRank } from "../src/engine/types";

/**
 * 格上（ランク 2 段階上）と戦うときの、型ごとの成績（堅守速攻の「番狂わせ」補正の確認）。
 * 相手の型は CPU と同じくランダム。
 */
export function underdogTable(n: number, seed = "underdog") {
  const rng = Rng.fromSeed(seed);
  const pool = new Map<SchoolRank, Player[][]>(SCHOOL_RANKS.map((r) => [r, []]));
  for (let p = 0; p < PRESTIGE_LEVEL_BASE.length; p++)
    for (let i = 0; i < 40; i++) {
      const players = generateCpuRoster(rng, p, 1);
      pool.get(rankFromStrength(teamStrength(players)))!.push(players);
    }
  const pairs = SCHOOL_RANKS.filter((r) => SCHOOL_RANKS[rankIndex(r) + 2] && pool.get(r)!.length && pool.get(SCHOOL_RANKS[rankIndex(r) + 2])!.length).map(
    (r) => [r, SCHOOL_RANKS[rankIndex(r) + 2]] as const,
  );
  console.log(`\n=== ランクが2段階上の相手と戦うときの、自分の型ごとの成績（各 ${n} 試合。相手の型はランダム） ===`);
  console.log("| 自分の型 | 勝 | 分 | 負 | 勝ち上がり（PK戦込み） |");
  console.log("|---|---|---|---|---|");
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  for (const id of TACTIC_STYLE_IDS) {
    let w = 0, d = 0, l = 0, adv = 0;
    for (let i = 0; i < n; i++) {
      const [ra, rb] = pairs[i % pairs.length];
      const a = rng.pick(pool.get(ra)!);
      const b = rng.pick(pool.get(rb)!);
      const mine = TACTIC_STYLES[id];
      const theirs = TACTIC_STYLES[rng.weighted(TACTIC_STYLE_IDS, (s) => STYLE_WEIGHTS[s])];
      const s = simulateToEnd(
        createMatch(
          WINTER_RULES.early,
          rng,
          { schoolId: "a", name: "A", rank: ra, isUser: false, players: a, setup: autoSetup(a, rng.pick(mine.formations), { ...mine.tactics }) },
          { schoolId: "b", name: "B", rank: rb, isUser: false, players: b, setup: autoSetup(b, rng.pick(theirs.formations), { ...theirs.tactics }) },
        ),
      );
      if (s.score[0] > s.score[1]) w++;
      else if (s.score[0] < s.score[1]) l++;
      else d++;
      if (s.winner === 0) adv++;
    }
    console.log(`| ${TACTIC_STYLES[id].name} | ${pct(w / n)} | ${pct(d / n)} | ${pct(l / n)} | ${pct(adv / n)} |`);
  }
}
