"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { dayToDate } from "@/engine/calendar";
import { currentMonthIndex, yearSchedule, type ScheduleItem, type ScheduleKind } from "@/engine/game/board";
import { useGameStore } from "@/store/gameStore";

const KIND_CLS: Record<ScheduleKind, string> = {
  competition: "bg-red text-white",
  league: "bg-yellow text-ink",
  school: "bg-telop text-ink",
  practice: "border border-yellow text-yellow",
  camp: "bg-panel-3 text-text",
  other: "bg-panel-3 text-text",
  monthly: "bg-telop text-ink",
};
const LEGEND: [ScheduleKind, string][] = [
  ["competition", "大会"],
  ["league", "リーグ"],
  ["school", "行事"],
  ["practice", "練習試合"],
  ["other", "そのほか"],
];
const STATUS_MARK: Partial<Record<ScheduleItem["status"], string>> = { won: "勝", lost: "負", today: "今日" };

/**
 * 年間の予定表（R2。「大会」の画面の「予定」タブ・試作 06）。月ごとの行に、大会・リーグ戦・練習試合（申し込みが届いたもの）・
 * 学校行事・合宿などを並べる。すごろく上では試合の日が分からないので、日程はここで確かめる
 */
export function ScheduleView({ top }: { top: ReactNode }) {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const months = yearSchedule(game);
  const cur = currentMonthIndex(game);
  const curRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    curRef.current?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-2">
        {top}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[0.6875rem] font-bold text-text-2">
          {LEGEND.map(([k, label]) => (
            <span key={k} className="flex items-center gap-1">
              <i className={`h-2.5 w-4 -skew-x-12 ${KIND_CLS[k]}`} />
              {label}
            </span>
          ))}
        </span>
      </div>
      <div className="scroll-y min-h-0 flex-1 bg-panel">
        {months.map((m) => {
          const items = m.items.filter((it) => it.kind !== "monthly");
          const monthly = m.items.find((it) => it.kind === "monthly");
          return (
            <div key={m.index} ref={m.index === cur ? curRef : undefined} className={`grid grid-cols-[3.25rem_3.5rem_1fr] items-center gap-2 border-b border-line px-2 py-1 ${m.index === cur ? "bg-panel-3" : ""}`}>
              <span className={`font-num text-[1.125rem] font-bold ${m.index === cur ? "text-yellow" : ""}`}>{m.month}月</span>
              <span className={`whitespace-nowrap bg-telop px-1 text-center text-[0.625rem] font-black text-ink ${monthly?.status === "done" ? "opacity-40" : ""}`}>1日 指示</span>
              <span className="flex flex-wrap gap-1">
                {items.map((it, i) => (
                  <span
                    key={i}
                    title={it.detail}
                    className={`flex items-center gap-1 px-1.5 py-px text-[0.6875rem] font-black ${KIND_CLS[it.kind]} ${it.status === "done" || it.status === "out" || it.status === "won" || it.status === "lost" ? "opacity-45" : ""} ${it.status === "out" ? "line-through" : ""}`}
                  >
                    <b className="font-num text-[0.75rem]">{dayToDate(it.day)[1]}</b>
                    {it.label}
                    {it.detail && it.status !== "out" && <span className="font-bold opacity-80">{it.detail}</span>}
                    {STATUS_MARK[it.status] && <span className="bg-ink px-1 text-[0.625rem] text-telop">{STATUS_MARK[it.status]}</span>}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
