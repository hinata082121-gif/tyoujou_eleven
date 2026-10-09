"use client";

import { useState } from "react";
import { dayToDate } from "@/engine/calendar";
import { CAREER_NAMES, POSITION_NAMES, REPUTATION_NAMES, yearLabel } from "@/engine/config/names";
import { useGameStore } from "@/store/gameStore";
import { RankBadge, Segmented } from "../ui";
import { statRank } from "@/engine/player/rank";

export function RecordsView() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const [tab, setTab] = useState<"history" | "alumni" | "log">("history");
  return (
    <div className="flex flex-col gap-3 p-3">
      <Segmented options={["history", "alumni", "log"] as const} value={tab} onChange={setTab} labels={{ history: "歴代成績", alumni: "OB", log: "出来事" }} />
      {tab === "history" &&
        (game.history.length === 0 ? (
          <p className="text-sm text-gray-500">まだ記録はありません。1年目が終わると、ここに成績が残ります。</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {[...game.history].reverse().map((h) => (
              <li key={h.year} className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 text-sm">
                <span className="w-12 font-bold">{yearLabel(h.year)}</span>
                <RankBadge rank={h.rank} size="sm" />
                <span className="flex-1">{h.winterResult}</span>
                <span className="text-xs text-gray-500">{REPUTATION_NAMES[h.reputationLevel]}</span>
              </li>
            ))}
          </ul>
        ))}
      {tab === "alumni" &&
        (game.alumni.length === 0 ? (
          <p className="text-sm text-gray-500">まだ卒業生はいません。</p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-100">
            {[...game.alumni].reverse().map((a) => (
              <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
                <RankBadge rank={statRank(a.overall)} size="sm" />
                <span className="flex-1 truncate font-bold">{a.name}</span>
                <span className="text-xs text-gray-500">
                  {yearLabel(a.graduatedYear)}卒・{POSITION_NAMES[a.position]}
                </span>
                <span className="w-20 text-right text-xs">{CAREER_NAMES[a.career]}</span>
              </li>
            ))}
          </ul>
        ))}
      {tab === "log" && (
        <ul className="flex flex-col gap-1 text-xs">
          {[...game.log].reverse().map((l, i) => (
            <li key={i} className={l.tone === "good" ? "text-emerald-700" : l.tone === "bad" ? "text-red-700" : "text-gray-700"}>
              <span className="mr-1 text-gray-400">
                {yearLabel(l.year)} {dayToDate(l.day).join("/")}
              </span>
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
