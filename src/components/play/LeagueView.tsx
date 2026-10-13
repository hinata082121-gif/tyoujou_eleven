"use client";

import { useState } from "react";
import { formatDay } from "@/engine/calendar";
import { LEAGUE } from "@/engine/config/league";
import { leagueName } from "@/engine/config/names";
import { divisionOf, standings } from "@/engine/league";
import type { LeagueDivision } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { RankBadge, Segmented } from "../ui";

/** 県リーグ（P3）：順位表と日程・結果 */
export function LeagueView() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const league = game.league;
  const pref = game.prefectures.find((p) => p.isPlayerPref)!;
  const mine = league ? divisionOf(league, game.playerSchoolId) : undefined;
  const [level, setLevel] = useState(mine?.level ?? 1);
  const [tab, setTab] = useState<"table" | "fixtures">("table");
  if (!league || league.divisions.length === 0) return <p className="text-sm text-gray-500">県リーグの組み分けはまだありません。</p>;
  const division = league.divisions.find((d) => d.level === level) ?? league.divisions[0];
  const levels = league.divisions.map((d) => String(d.level));

  return (
    <div className="flex flex-col gap-3">
      {!league.active && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">県リーグは来年度（4月）から始まります。下は、評判をもとに決めた最初の組み分けです。</p>
      )}
      {league.final && (
        <p className="rounded-lg bg-green-50 p-2 text-sm font-bold text-pitch-dark">
          今年の成績：{league.final.playerLevel}部 {league.final.position}位（{league.final.size}校）
          {league.final.promoted ? "・昇格" : league.final.relegated ? "・降格" : ""}
        </p>
      )}
      {levels.length > 1 && <Segmented options={levels} value={String(division.level)} onChange={(v) => setLevel(Number(v))} labels={Object.fromEntries(levels.map((l) => [l, `${l}部`]))} />}
      <h2 className="text-sm font-black">
        {leagueName(pref.name, division.level)}（{division.schoolIds.length}校・{division.doubleRound ? "2回総当たり" : "1回総当たり"}）
      </h2>
      <p className="text-[11px] text-gray-500">
        勝ち3・分け1。上位{LEAGUE.promote}校は上の部へ、下位{LEAGUE.promote}校は下の部へ（1部の上位と最下部の下位はそのまま）。
      </p>
      {league.active && <Segmented options={["table", "fixtures"] as const} value={tab} onChange={setTab} labels={{ table: "順位表", fixtures: "日程・結果" }} />}
      {(tab === "table" || !league.active) && <Table division={division} bottom={division.level === league.divisions.length} />}
      {tab === "fixtures" && league.active && <Fixtures division={division} />}
    </div>
  );
}

function Table({ division, bottom }: { division: LeagueDivision; bottom: boolean }) {
  const game = useGameStore((s) => s.game)!;
  const me = game.playerSchoolId;
  const rows = standings(division);
  const k = LEAGUE.promote;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] text-gray-500">
          <th className="w-6 text-right">位</th>
          <th className="pl-2 text-left">学校</th>
          <th className="w-6">試</th>
          <th className="w-10">勝分敗</th>
          <th className="w-8">差</th>
          <th className="w-7">点</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const s = game.schools[r.schoolId];
          const up = division.level > 1 && i < k;
          const down = !bottom && i >= rows.length - k;
          return (
            <tr key={r.schoolId} className={`border-b border-gray-100 ${r.schoolId === me ? "bg-green-50 font-black" : ""}`}>
              <td className={`text-right font-mono ${up ? "text-emerald-700" : down ? "text-red-700" : ""}`}>{i + 1}</td>
              <td className="py-1.5 pl-2">
                <div className="flex min-w-0 items-center gap-1">
                  <RankBadge rank={s.rank} size="sm" />
                  <span className="truncate">{s.name}</span>
                </div>
              </td>
              <td className="text-center font-mono">{r.played}</td>
              <td className="text-center font-mono text-[10px]">
                {r.won}-{r.drawn}-{r.lost}
              </td>
              <td className="text-center font-mono">{r.goalsFor - r.goalsAgainst > 0 ? `+${r.goalsFor - r.goalsAgainst}` : r.goalsFor - r.goalsAgainst}</td>
              <td className="text-center font-mono font-bold">{r.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Fixtures({ division }: { division: LeagueDivision }) {
  const game = useGameStore((s) => s.game)!;
  const me = game.playerSchoolId;
  const name = (id: string) => game.schools[id].name;
  return (
    <div className="flex flex-col gap-3">
      {division.fixtures.map((round, r) => {
        const rest = division.schoolIds.filter((id) => !round.some((f) => f.home === id || f.away === id));
        return (
          <section key={r}>
            <h3 className="mb-1 flex items-baseline gap-2 text-xs font-black text-gray-600">
              第{r + 1}節<span className="font-normal text-gray-400">{formatDay(division.days[r])}</span>
            </h3>
            <ul className="flex flex-col gap-1">
              {round.map((f) => {
                const mine = f.home === me || f.away === me;
                return (
                  <li key={f.id} className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs ${mine ? "bg-green-50 ring-1 ring-pitch/40" : "bg-gray-50"}`}>
                    <span className={`flex-1 truncate text-right ${f.home === me ? "font-black text-pitch-dark" : ""}`}>{name(f.home)}</span>
                    <span className="w-12 shrink-0 text-center font-mono font-bold">{f.score ? `${f.score[0]}-${f.score[1]}` : "vs"}</span>
                    <span className={`flex-1 truncate ${f.away === me ? "font-black text-pitch-dark" : ""}`}>{name(f.away)}</span>
                  </li>
                );
              })}
              {rest.length > 0 && <li className="text-[11px] text-gray-400">休み：{rest.map(name).join("、")}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
