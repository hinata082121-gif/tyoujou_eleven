"use client";

import { useEffect, useState } from "react";
import { GAME_SUBTITLE, GAME_TITLE } from "@/engine/config/names";
import { lastSlot, loadSummaries, useGameStore } from "@/store/gameStore";
import type { SlotSummary } from "@/lib/save";
import { Icon } from "../icons";
import { Button } from "../ui";

/** タイトル：芝の上に斜めの帯（黄・赤）とタイトル、右に「続きから」「セーブデータを選ぶ」 */
export function TitleScreen() {
  const goto = useGameStore((s) => s.goto);
  const loadSlot = useGameStore((s) => s.loadSlot);
  const [resume, setResume] = useState<{ slot: number; summary: SlotSummary } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const slot = lastSlot();
    if (slot === null) return;
    loadSummaries().then((list) => {
      const summary = list[slot];
      if (summary) setResume({ slot, summary });
    });
  }, []);

  return (
    <main className="bg-pitch-stripes fixed inset-0 overflow-hidden">
      {/* 斜めの帯 */}
      <div className="absolute -left-20 -right-20 bottom-[6%] h-[11%] -rotate-[8deg] bg-yellow" aria-hidden />
      <div className="absolute -left-20 -right-20 bottom-[1%] h-[3.5%] -rotate-[8deg] bg-red" aria-hidden />
      <div className="font-head pointer-events-none absolute -right-6 -top-10 select-none text-[16rem] leading-none text-white/[0.06]" aria-hidden>
        頂
      </div>

      <div className="relative flex h-full items-center justify-between gap-6 pb-[max(1rem,var(--safe-b))] pl-[max(1.5rem,var(--safe-l))] pr-[max(1.5rem,var(--safe-r))] pt-[max(1rem,var(--safe-t))]">
        <div className="min-w-0">
          <div className="anim-band-in cut-r inline-block bg-ink py-1 pl-3 pr-8 text-[0.8125rem] font-black tracking-wider text-yellow">{GAME_SUBTITLE}</div>
          <h1 className="font-head anim-fade-up mt-2 text-[3.5rem] leading-none tracking-wide text-text [text-shadow:4px_4px_0_rgb(0_0_0/0.55)]">{GAME_TITLE}</h1>
          <p className="mt-3 flex items-center gap-2 text-[0.8125rem] font-bold text-text-2">
            <Icon name="cup" size={16} className="text-yellow" />3 年で入れ替わる部員と、全国の頂点へ
          </p>
        </div>
        <div className="flex w-[17rem] shrink-0 flex-col gap-2.5">
          {resume && (
            <Button className="w-full !justify-start" icon="play" cut onClick={() => loadSlot(resume.slot).catch((e: Error) => setError(e.message))}>
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span className="text-[1rem]">続きから</span>
                <span className="truncate text-[0.75rem] font-bold">
                  {resume.summary.schoolName}・{resume.summary.dateLabel}
                </span>
              </span>
            </Button>
          )}
          <Button variant="secondary" className="w-full !justify-start" icon="save" cut onClick={() => goto("slots")}>
            セーブデータを選ぶ
          </Button>
          {error && <p className="bg-panel p-2 text-[0.75rem] font-bold text-bad">{error}</p>}
        </div>
      </div>
    </main>
  );
}
