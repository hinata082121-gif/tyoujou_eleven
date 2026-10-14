"use client";

import { dayToDate } from "@/engine/calendar";
import { REPUTATION_NAMES, yearLabel } from "@/engine/config/names";
import { playerSchool } from "@/engine/season";
import type { GameState } from "@/engine/types";

/**
 * 上の帯（スコアボード風）：学校名・年度と日付・ランク・評判のゲージ（DESIGN.md 5章）
 */
export function TopBar({ game, right }: { game: GameState; right?: React.ReactNode }) {
  const school = playerSchool(game);
  const [m, d] = dayToDate(game.calendar.position);
  const rep = game.reputation;
  const leds = Math.max(1, Math.round(rep.gauge / 10));
  return (
    <header className="flex h-9 shrink-0 items-stretch pl-[max(0.5rem,var(--safe-l))] pr-[max(0.5rem,var(--safe-r))] pt-[max(0.375rem,var(--safe-t))] box-content">
      <div className="cut-r font-head flex min-w-0 max-w-[13rem] items-center bg-yellow pl-3 pr-6 text-[1.0625rem] text-ink">
        <span className="truncate">{school.name}</span>
      </div>
      <div className="cut-lr -ml-2 flex items-center gap-2 bg-panel pl-5 pr-5 text-[0.75rem] font-bold text-text-2">
        <span>{yearLabel(game.year)}</span>
        <b className="font-num text-[1.25rem] font-medium text-text">
          {m}.{String(d).padStart(2, "0")}
        </b>
      </div>
      <div className="cut-lr -ml-2 flex items-center gap-1.5 bg-telop pl-5 pr-5 text-[0.6875rem] font-black text-ink">
        ランク<b className="font-num text-[1.5rem] font-bold leading-none text-red">{school.rank}</b>
      </div>
      <div className="ml-auto flex items-center gap-2 bg-panel/90 px-3 text-[0.6875rem] font-bold text-text-2">
        評判<b className="text-[0.8125rem] text-text">{REPUTATION_NAMES[rep.level]}</b>
        <span className="flex gap-0.5" aria-label={`評判のゲージ ${rep.gauge}`}>
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} className={`h-3 w-2 -skew-x-[15deg] ${i < leds ? "bg-yellow" : "bg-panel-3"}`} />
          ))}
        </span>
      </div>
      {right}
    </header>
  );
}
