"use client";

import { useState } from "react";
import { DEFAULT_PREFECTURE_ID, PLAYER_SCHOOL_DEFAULT_NAME, PREF_TIER_NAMES, PREFECTURES, REGIONS } from "@/engine/config/names";
import { prefReps, prefTier, TIER_SETTINGS } from "@/engine/config/school";
import { useGameStore } from "@/store/gameStore";
import { Button, Header } from "../ui";

export function NewGameScreen() {
  const goto = useGameStore((s) => s.goto);
  const slot = useGameStore((s) => s.slot) ?? 0;
  const createGame = useGameStore((s) => s.createGame);
  const [name, setName] = useState(PLAYER_SCHOOL_DEFAULT_NAME);
  const [pref, setPref] = useState(DEFAULT_PREFECTURE_ID);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const tier = prefTier(pref);
  const schools = TIER_SETTINGS[tier].playerPrefSchools;

  const create = async () => {
    if (!trimmed) return;
    setBusy(true);
    // 描画を先に済ませてから生成する（生成に少し時間がかかるため）
    await new Promise((r) => setTimeout(r, 30));
    await createGame(slot, trimmed, pref);
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
        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold">都道府県</span>
          <select
            value={pref}
            onChange={(e) => setPref(e.target.value)}
            className="min-h-12 rounded-xl border border-gray-300 bg-white px-3 text-lg focus:border-pitch focus:outline-none"
          >
            {REGIONS.map((r) => (
              <optgroup key={r.id} label={r.name}>
                {PREFECTURES.filter((p) => p.region === r.id).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="text-xs text-gray-600">
            区分：{PREF_TIER_NAMES[tier]}（予選の参加 {schools.min}〜{schools.max}校）
            {prefReps(pref) > 1 && `・全国大会の代表は${prefReps(pref)}校`}
          </span>
        </label>
        <div className="rounded-xl bg-green-50 p-4 text-sm leading-relaxed text-green-950">
          <p className="font-bold">あなたは、この高校サッカー部の新しい監督です。</p>
          <ul className="mt-2 list-disc pl-5 text-[13px]">
            <li>評判は「弱小」からのスタート。1〜3年生がそろっています。</li>
            <li>すごろくで練習とイベントを進め、冬の全国大会で頂点を目指しましょう。</li>
            <li>自校以外の学校名と、県ごとの強さの傾向は架空のものです。</li>
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
