"use client";

import { useState } from "react";
import { formatDay } from "@/engine/calendar";
import { COMPETITION_NAMES, prefectureLabel, roundLabel } from "@/engine/config/names";
import { totalRounds } from "@/engine/competition/bracket";
import type { Bracket, BracketMatch } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { RankBadge, Segmented } from "../ui";

export function BracketView() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const [tab, setTab] = useState<"prefQualifier" | "national">(game.competitions.national ? "national" : "prefQualifier");
  const b = tab === "prefQualifier" ? game.competitions.prefQualifier : game.competitions.national;
  const pref = game.prefectures.find((p) => p.isPlayerPref)!;

  return (
    <div className="flex flex-col gap-3 p-3">
      <Segmented
        options={["prefQualifier", "national"] as const}
        value={tab}
        onChange={setTab}
        labels={{ prefQualifier: `${prefectureLabel(pref.name)}予選`, national: "全国大会" }}
      />
      <h2 className="text-sm font-black">{COMPETITION_NAMES[tab]}</h2>
      {game.competitions.winterResult && <p className="rounded-lg bg-green-50 p-2 text-sm font-bold text-pitch-dark">今年の成績：{game.competitions.winterResult}</p>}
      {!b ? (
        <p className="text-sm text-gray-500">県予選が終わると、全国大会（{game.prefectures.length}校）の組み合わせが決まります。</p>
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
      {bracket.championId && (
        <div className="rounded-xl bg-amber-100 p-3 text-center text-sm font-black text-amber-900">🏆 優勝：{game.schools[bracket.championId].name}</div>
      )}
      {rounds.map((matches, r) => (
        <section key={r}>
          <h3 className="mb-1 flex items-baseline gap-2 text-xs font-black text-gray-600">
            {roundLabel(total, r)}
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
