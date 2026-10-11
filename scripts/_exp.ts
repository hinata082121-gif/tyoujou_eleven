import { PREFECTURES } from "../src/engine/config/names";
import { CAMP } from "../src/engine/config/camp";
import { newGame } from "../src/engine/game";
import * as auto from "../src/engine/game/autoplay";
import { plusCount, goldCount } from "../src/engine/skills";
import { BRANCH } from "../src/engine/config/calendar";
const v = process.argv[2];
if (v.includes("nocampexp")) (CAMP as { expMult: number }).expMult = 1;
if (v.includes("nocamplearn")) (CAMP as { learnBaseMult: number }).learnBaseMult = 0;
if (v.includes("nobranch")) (BRANCH as { perYear: number }).perYear = 0;
const games = Number(process.argv[3] ?? 6), years = Number(process.argv[4] ?? 7);
const xs: number[] = []; let plus = 0, gold = 0;
for (let g = 0; g < games; g++) {
  const s = newGame(`exp-${g}`, "検証高校", PREFECTURES[(g * 7) % PREFECTURES.length].id);
  auto.autoplayYears(s, years, "skilled");
  for (const a of s.alumni) if (!a.fictional && a.graduatedYear >= 4 && !a.scholarship) { xs.push(a.overall); plus += plusCount(a); gold += goldCount(a) > 0 ? 1 : 0; }
}
const n = xs.length;
console.log(v, `n=${n} avg=${(xs.reduce((a, b) => a + b, 0) / n).toFixed(1)} B+=${((xs.filter((x) => x >= 70).length / n) * 100).toFixed(1)}% plus=${(plus / n).toFixed(2)} gold=${((gold / n) * 100).toFixed(1)}%`);
