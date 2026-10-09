"use client";

import { useState } from "react";
import { GAME_TITLE } from "@/engine/config/names";
import { saveManager, useGameStore } from "@/store/gameStore";
import { Button } from "../ui";

export function MenuView() {
  const slot = useGameStore((s) => s.slot);
  const save = useGameStore((s) => s.save);
  const goto = useGameStore((s) => s.goto);
  const settings = useGameStore((s) => s.settings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const setNotesOpen = useGameStore((s) => s.setNotesOpen);
  const [msg, setMsg] = useState<string | null>(null);

  const exportJson = async () => {
    if (slot === null) return;
    await save();
    const json = await saveManager().exportJson(slot);
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tyoujou-eleven-slot${slot + 1}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg("書き出しました");
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-black">{GAME_TITLE}</h2>
      <Button onClick={() => setNotesOpen(true)}>📒 作戦ノート</Button>
      <label className="flex min-h-12 items-center justify-between rounded-xl border border-gray-200 px-3">
        <span className="text-sm">すごろくの移動演出をスキップ</span>
        <input type="checkbox" className="h-5 w-5 accent-pitch" checked={settings.skipMove} onChange={(e) => updateSettings({ skipMove: e.target.checked })} />
      </label>
      <Button
        variant="secondary"
        onClick={async () => {
          await save();
          setMsg("保存しました");
        }}
      >
        今すぐ保存（セーブ枠{(slot ?? 0) + 1}）
      </Button>
      <Button variant="secondary" onClick={exportJson}>
        セーブデータをJSONで書き出す
      </Button>
      <Button
        variant="ghost"
        onClick={async () => {
          await save();
          goto("title");
        }}
      >
        タイトルに戻る
      </Button>
      {msg && <p className="text-center text-xs text-gray-500">{msg}</p>}
      <p className="text-[11px] leading-relaxed text-gray-400">日付が進むたび・試合中（5分ごと）・試合が終わるたびに自動で保存されます。</p>
    </div>
  );
}
