"use client";

import { useState } from "react";
import { PLAYER_SCHOOL_DEFAULT_NAME } from "@/engine/config/names";
import { useGameStore } from "@/store/gameStore";
import { Button, Header } from "../ui";

export function NewGameScreen() {
  const goto = useGameStore((s) => s.goto);
  const slot = useGameStore((s) => s.slot) ?? 0;
  const createGame = useGameStore((s) => s.createGame);
  const [name, setName] = useState(PLAYER_SCHOOL_DEFAULT_NAME);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const create = async () => {
    if (!trimmed) return;
    setBusy(true);
    // 描画を先に済ませてから生成する（生成に少し時間がかかるため）
    await new Promise((r) => setTimeout(r, 30));
    await createGame(slot, trimmed);
  };

  return (
    <main className="flex flex-1 flex-col">
      <Header title={`学校を作る（セーブ枠${slot + 1}）`} onBack={() => goto("slots")} />
      <div className="flex flex-1 flex-col gap-5 p-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold">学校名</span>
          <input
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            className="min-h-12 rounded-xl border border-gray-300 px-3 text-lg focus:border-pitch focus:outline-none"
          />
        </label>
        <div className="rounded-xl bg-green-50 p-4 text-sm leading-relaxed text-green-950">
          <p className="font-bold">あなたは、この高校サッカー部の新しい監督です。</p>
          <ul className="mt-2 list-disc pl-5 text-[13px]">
            <li>評判は「弱小」からのスタート。1〜3年生がそろっています。</li>
            <li>すごろくで練習とイベントを進め、冬の選手権で全国の頂点を目指しましょう。</li>
            <li>県と全国の学校は、架空のものが自動で作られます。</li>
          </ul>
        </div>
        <div className="flex-1" />
        <Button onClick={create} disabled={!trimmed || busy}>
          {busy ? "学校を作っています…" : "この学校で始める"}
        </Button>
      </div>
    </main>
  );
}
