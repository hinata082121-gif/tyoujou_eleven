"use client";

import { useState } from "react";
import { DEFAULT_PREFECTURE_ID, PLAYER_SCHOOL_DEFAULT_NAME, PREF_TIER_NAMES, PREFECTURES, REGIONS } from "@/engine/config/names";
import { prefReps, prefTier, TIER_SETTINGS } from "@/engine/config/school";
import { generateKits } from "@/engine/look";
import { useGameStore } from "@/store/gameStore";
import { Icon } from "../icons";
import { KitFigure } from "../look/Figure";
import { UniformEditor } from "../look/UniformEditor";
import { Button, Label, Screen } from "../ui";

/** 学校作成：左に学校名・県の入力、右に説明とユニフォームの絵。次の段でユニフォームを選ぶ */
export function NewGameScreen() {
  const goto = useGameStore((s) => s.goto);
  const slot = useGameStore((s) => s.slot) ?? 0;
  const createGame = useGameStore((s) => s.createGame);
  const [name, setName] = useState(PLAYER_SCHOOL_DEFAULT_NAME);
  const [pref, setPref] = useState(DEFAULT_PREFECTURE_ID);
  const [busy, setBusy] = useState(false);
  // P4：学校名・県の次に、ユニフォームを選ぶ
  const [step, setStep] = useState<"school" | "uniform">("school");
  const [kitSeed] = useState(() => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0].toString(36);
  });
  const [kits, setKits] = useState(() => generateKits(kitSeed, "player"));
  const trimmed = name.trim();
  const tier = prefTier(pref);
  const schools = TIER_SETTINGS[tier].playerPrefSchools;

  const create = async () => {
    if (!trimmed) return;
    setBusy(true);
    // 描画を先に済ませてから生成する（生成に少し時間がかかるため）
    await new Promise((r) => setTimeout(r, 30));
    await createGame(slot, trimmed, pref, kits);
  };

  if (step === "uniform")
    return (
      <Screen
        title="ユニフォームを選ぶ"
        sub={trimmed}
        onBack={() => setStep("school")}
        right={
          <Button icon="check" cut onClick={create} disabled={!trimmed || busy}>
            {busy ? "学校を作っています…" : "この学校で始める"}
          </Button>
        }
        bodyClassName="gap-1.5"
      >
        <p className="flex shrink-0 items-center gap-1.5 self-start bg-panel px-2 py-1 text-[0.75rem] text-text-2">
          <Icon name="info" size={14} className="text-info" />
          あとからメニューの「ユニフォーム」でも変えられます。
        </p>
        <UniformEditor value={kits} onChange={setKits} seed={kitSeed} />
      </Screen>
    );

  return (
    <Screen
      title="学校を作る"
      sub={`セーブ枠${slot + 1}`}
      onBack={() => goto("slots")}
      right={
        <Button icon="next" cut onClick={() => setStep("uniform")} disabled={!trimmed}>
          次へ（ユニフォームを選ぶ）
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 左：学校名・県 */}
        <div className="scroll-y flex min-h-0 min-w-0 flex-1 flex-col gap-3 bg-panel p-3">
          <label className="flex flex-col gap-1">
            <Label className="!mb-0">学校名</Label>
            <input
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 border-2 border-line-2 bg-panel-2 px-3 text-[1.125rem] font-bold text-text focus:border-yellow focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <Label className="!mb-0">都道府県</Label>
            <span className="relative flex items-center">
              <select
                value={pref}
                onChange={(e) => setPref(e.target.value)}
                className="min-h-11 w-full appearance-none border-2 border-line-2 bg-panel-2 pl-3 pr-8 text-[1.125rem] font-bold text-text focus:border-yellow focus:outline-none"
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
              <Icon name="down" size={14} className="pointer-events-none absolute right-2.5 text-text-3" />
            </span>
            <span className="bg-panel-2 px-2 py-1 text-[0.75rem] text-text-2">
              区分：<b className="text-text">{PREF_TIER_NAMES[tier]}</b>（予選の参加 <span className="font-num">{schools.min}〜{schools.max}</span>校）
              {prefReps(pref) > 1 && `・全国大会の代表は${prefReps(pref)}校`}
            </span>
          </label>
        </div>

        {/* 右：説明とユニフォーム */}
        <div className="flex min-h-0 w-[min(26rem,52%)] shrink-0 flex-col gap-1">
          <div className="flex min-h-0 flex-1 gap-2 bg-panel p-3">
            <div className="scroll-y min-h-0 min-w-0 flex-1">
              <p className="cut-r mb-2 inline-block bg-yellow py-0.5 pl-2 pr-6 text-[0.875rem] font-black text-ink">あなたは、この高校サッカー部の新しい監督です。</p>
              <ul className="flex flex-col gap-1.5 text-[0.8125rem] leading-snug text-text-2">
                {["評判は「弱小」からのスタート。1〜3年生がそろっています。", "すごろくで練習とイベントを進め、冬の全国大会で頂点を目指しましょう。", "自校以外の学校名と、県ごとの強さの傾向は架空のものです。"].map((t) => (
                  <li key={t} className="flex gap-1.5">
                    <span className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 -skew-x-12 bg-yellow" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-pitch-stripes flex w-[6.5rem] shrink-0 flex-col items-center justify-end overflow-hidden border border-line-2">
              <KitFigure kit={kits.first} number={10} size={150} />
              <span className="w-full truncate bg-panel px-1 py-0.5 text-center text-[0.75rem] font-bold">{trimmed || "　"}</span>
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
}
