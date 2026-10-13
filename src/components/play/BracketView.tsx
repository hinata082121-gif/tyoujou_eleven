"use client";

import { useState } from "react";
import { formatDay } from "@/engine/calendar";
import { roundLabel } from "@/engine/config/names";
import { competitionName, nationalSize, rookieRegionSize, summerNationalSize } from "@/engine/game";
import { totalRounds } from "@/engine/competition/bracket";
import type { Bracket, BracketMatch, CompetitionKind } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { RankBadge, Segmented } from "../ui";
import { LeagueView } from "./LeagueView";

type Season = "winter" | "summer" | "rookie";
type Tab = Season | "league";
const SEASON_KINDS: Record<Season, [CompetitionKind, CompetitionKind]> = {
  winter: ["prefQualifier", "national"],
  summer: ["summerQualifier", "summerNational"],
  rookie: ["rookiePref", "rookieRegion"],
};

export function BracketView() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const c = game.competitions;
  // 開いたときは、いま進んでいる大会
  const initial = (): [Tab, 0 | 1] => {
    const pos = game.calendar.position;
    for (const [season, kinds] of Object.entries(SEASON_KINDS) as [Season, [CompetitionKind, CompetitionKind]][]) {
      for (const [i, k] of kinds.entries()) {
        const b = c[k];
        if (b && !b.championId && !b.qualifiedIds && b.roundDays[0] <= pos + 30) return [season, i as 0 | 1];
      }
    }
    // 大会が近くなければ、県リーグ（P3）
    if (game.league?.active && !game.league.final) return ["league", 0];
    return ["winter", c.national ? 1 : 0];
  };
  const [init] = useState(initial);
  const [tab, setTab] = useState<Tab>(init[0]);
  const season: Season = tab === "league" ? "winter" : tab;
  const [stage, setStage] = useState<0 | 1>(init[1]);
  const kind = SEASON_KINDS[season][stage];
  const tabs = game.league ? (["league", "summer", "winter", "rookie"] as const) : (["summer", "winter", "rookie"] as const);
  const top = <Segmented options={tabs} value={tab} onChange={(v) => setTab(v)} labels={{ league: "リーグ", summer: "夏", winter: "冬", rookie: "新人戦" }} />;
  if (tab === "league")
    return (
      <div className="flex flex-col gap-3 p-3">
        {top}
        <LeagueView />
      </div>
    );
  const b = c[kind];
  const pref = game.prefectures.find((p) => p.isPlayerPref)!;
  const region = game.regions.find((r) => r.id === pref.regionId)?.name ?? "";
  const result = season === "winter" ? c.winterResult : season === "summer" ? c.summerResult : c.rookieResult;
  const reps = kind === "summerQualifier" ? pref.summerReps : pref.reps;
  const size = kind === "national" ? nationalSize(game) : kind === "summerNational" ? summerNationalSize(game) : kind === "rookieRegion" ? rookieRegionSize(game) : pref.schoolIds.length;
  const host = game.prefectures.find((p) => p.id === c.summerHostPrefId);
  const stageLabels: Record<Season, { 0: string; 1: string }> = {
    winter: { 0: `${pref.name}予選`, 1: "全国大会" },
    summer: { 0: `${pref.name}予選`, 1: "全国大会" },
    rookie: { 0: `${pref.name}大会`, 1: region ? `${region}大会` : "地域大会" },
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {top}
      <Segmented options={["0", "1"] as const} value={String(stage) as "0" | "1"} onChange={(v) => setStage(Number(v) as 0 | 1)} labels={{ "0": stageLabels[season][0], "1": stageLabels[season][1] }} />
      <h2 className="text-sm font-black">
        {competitionName(game, kind)}（{size}校）
      </h2>
      {season === "summer" && host && <p className="text-xs text-gray-500">今年の開催県：{host.name}（開催県は 2 校が出場）</p>}
      {season === "rookie" && <p className="text-xs text-gray-500">1・2年生だけで戦う。県大会の上位 8 校は、次の夏の県予選のシードになる。</p>}
      {stage === 0 && reps > 1 && season !== "rookie" && <p className="text-xs text-gray-500">代表決定戦に勝った{reps}校が全国大会に出場します。</p>}
      {result && <p className="rounded-lg bg-green-50 p-2 text-sm font-bold text-pitch-dark">今年の成績：{result}</p>}
      {!b ? (
        <p className="text-sm text-gray-500">{stage === 0 ? "組み合わせはまだ決まっていません。" : `前の大会が終わると、組み合わせ（${size}校）が決まります。`}</p>
      ) : (
        <BracketRounds bracket={b} />
      )}
    </div>
  );
}

function BracketRounds({ bracket }: { bracket: Bracket }) {
  const game = useGameStore((s) => s.game)!;
  const total = totalRounds(bracket);
  const rounds = Array.from({ length: total }, (_, r) => bracket.rounds[r]);
  return (
    <div className="flex flex-col gap-4">
      {bracket.qualifiedIds && (
        <div className="rounded-xl bg-amber-100 p-3 text-center text-sm font-black text-amber-900">
          🏆 {bracket.qualifiedIds.length > 1 ? "代表" : "優勝"}：{bracket.qualifiedIds.map((id) => game.schools[id].name).join("・")}
        </div>
      )}
      {rounds.map((matches, r) => (
        <section key={r}>
          <h3 className="mb-1 flex items-baseline gap-2 text-xs font-black text-gray-600">
            {roundLabel(total, r, bracket.qualifiers)}
            <span className="font-normal text-gray-400">{formatDay(bracket.roundDays[r])}</span>
          </h3>
          {!matches ? (
            <p className="text-xs text-gray-400">組み合わせ未定</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {matches
                .filter((m) => m.a && m.b)
                .map((m) => (
                  <MatchRow key={m.id} m={m} />
                ))}
              {matches.some((m) => !m.a || !m.b) && (
                <li className="text-[11px] text-gray-400">シード：{matches.filter((m) => (m.a && !m.b) || (!m.a && m.b)).map((m) => game.schools[(m.a ?? m.b)!].name).join("、")}</li>
              )}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function MatchRow({ m }: { m: BracketMatch }) {
  const game = useGameStore((s) => s.game)!;
  const me = game.playerSchoolId;
  const mine = m.a === me || m.b === me;
  const side = (id: string, i: 0 | 1) => {
    const s = game.schools[id];
    const won = m.winner === id;
    const lost = m.winner !== undefined && m.winner !== id;
    return (
      <div className={`flex min-w-0 flex-1 items-center gap-1 ${i === 1 ? "flex-row-reverse text-right" : ""}`}>
        <RankBadge rank={s.rank} size="sm" />
        <span className={`truncate text-xs ${won ? "font-black" : ""} ${lost ? "text-gray-400" : ""} ${id === me ? "text-pitch-dark underline" : ""}`}>{s.name}</span>
      </div>
    );
  };
  return (
    <li className={`flex items-center gap-1 rounded-lg px-2 py-1.5 ${mine ? "bg-green-50 ring-1 ring-pitch/40" : "bg-gray-50"}`}>
      {side(m.a!, 0)}
      <span className="w-14 shrink-0 text-center font-mono text-xs font-bold">
        {m.score ? `${m.score[0]}-${m.score[1]}` : "vs"}
        {m.pk && <span className="block text-[9px] font-normal text-gray-500">PK{m.pk[0]}-{m.pk[1]}</span>}
      </span>
      {side(m.b!, 1)}
    </li>
  );
}
