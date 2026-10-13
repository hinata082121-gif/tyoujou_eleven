"use client";

import { useState } from "react";
import { GAME_TITLE } from "@/engine/config/names";
import { saveManager, useGameStore } from "@/store/gameStore";
import { Button, Segmented } from "../ui";

export function MenuView() {
  const slot = useGameStore((s) => s.slot);
  const save = useGameStore((s) => s.save);
  const goto = useGameStore((s) => s.goto);
  const settings = useGameStore((s) => s.settings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const setNotesOpen = useGameStore((s) => s.setNotesOpen);
  const setSkillBookOpen = useGameStore((s) => s.setSkillBookOpen);
  const setTeamOpen = useGameStore((s) => s.setTeamOpen);
  const setScoutOpen = useGameStore((s) => s.setScoutOpen);
  const setFacilitiesOpen = useGameStore((s) => s.setFacilitiesOpen);
  const setUniformOpen = useGameStore((s) => s.setUniformOpen);
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
      <Button variant="secondary" onClick={() => setSkillBookOpen(true)}>
        📘 特殊能力図鑑
      </Button>
      <Button variant="secondary" onClick={() => setTeamOpen(true)}>
        🅲 チーム（キャプテン）
      </Button>
      <Button variant="secondary" onClick={() => setFacilitiesOpen(true)}>
        🏟️ 設備
      </Button>
      <Button variant="secondary" onClick={() => setUniformOpen(true)}>
        👕 ユニフォーム
      </Button>
      <Button variant="secondary" onClick={() => setScoutOpen(true)}>
        🎓 特待生スカウト
      </Button>
      <label className="flex min-h-12 items-center justify-between rounded-xl border border-gray-200 px-3">
        <span className="text-sm">すごろくの移動演出をスキップ</span>
        <input type="checkbox" className="h-5 w-5 accent-pitch" checked={settings.skipMove} onChange={(e) => updateSettings({ skipMove: e.target.checked })} />
      </label>
      <div className="flex flex-col gap-1 rounded-xl border border-gray-200 p-3">
        <span className="text-sm">リーグ戦・練習試合の試合（試合前に初めに選ばれる方）</span>
        <Segmented options={["manage", "auto"] as const} value={settings.leagueMode} onChange={(v) => updateSettings({ leagueMode: v })} labels={{ manage: "采配あり", auto: "結果のみ" }} />
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-gray-200 p-3">
        <span className="text-sm">トーナメントの観戦の表示</span>
        <Segmented options={["3d", "2d", "text"] as const} value={settings.tournamentView} onChange={(v) => updateSettings({ tournamentView: v })} labels={{ "3d": "3D", "2d": "2D＋速報", text: "テキストのみ" }} />
        {settings.tournamentView === "3d" && (
          <>
            <span className="mt-1 text-xs text-gray-600">3D の画質</span>
            <Segmented options={["standard", "light"] as const} value={settings.quality3d} onChange={(v) => updateSettings({ quality3d: v })} labels={{ standard: "標準", light: "軽量" }} />
          </>
        )}
        <span className="text-[11px] text-gray-500">動作が重いときは、画質を「軽量」にするか、「2D＋速報」にしてください。</span>
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-gray-200 p-3">
        <span className="text-sm">リーグ戦・練習試合の観戦の表示</span>
        <Segmented options={["2d", "text"] as const} value={settings.matchView} onChange={(v) => updateSettings({ matchView: v })} labels={{ "2d": "2D＋速報", text: "テキストのみ" }} />
        <span className="text-[11px] text-gray-500">動作が重いときは「テキストのみ」にしてください。</span>
      </div>
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
