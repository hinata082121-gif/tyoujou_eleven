"use client";

import { useEffect, useState } from "react";
import { GAME_SUBTITLE, GAME_TITLE } from "@/engine/config/names";
import { lastSlot, loadSummaries, useGameStore } from "@/store/gameStore";
import type { SlotSummary } from "@/lib/save";
import { Button } from "../ui";

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
    <main className="flex flex-1 flex-col items-center justify-between bg-gradient-to-b from-pitch-dark to-pitch px-6 py-16 text-white">
      <div className="mt-10 text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/80 text-5xl">⚽</div>
        <h1 className="text-4xl font-black tracking-widest">{GAME_TITLE}</h1>
        <p className="mt-3 text-sm text-white/80">{GAME_SUBTITLE}</p>
      </div>
      <div className="flex w-full flex-col gap-3">
        {resume && (
          <Button
            className="!bg-white !text-pitch-dark"
            onClick={() => loadSlot(resume.slot).catch((e: Error) => setError(e.message))}
          >
            続きから（{resume.summary.schoolName}・{resume.summary.dateLabel}）
          </Button>
        )}
        <Button className="border border-white/70 !bg-transparent" onClick={() => goto("slots")}>
          セーブデータを選ぶ
        </Button>
        {error && <p className="text-center text-xs text-red-200">{error}</p>}
      </div>
    </main>
  );
}
