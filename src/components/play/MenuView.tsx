"use client";

import { useState, type ReactNode } from "react";
import { GAME_TITLE } from "@/engine/config/names";
import { saveManager, useGameStore } from "@/store/gameStore";
import { Icon, type IconName } from "../icons";
import { Band, Button, Segmented, Toggle } from "../ui";

type Section = "team" | "settings" | "data";
const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: "team", label: "チームの運営", icon: "school" },
  { id: "settings", label: "設定", icon: "gear" },
  { id: "data", label: "保存・データ", icon: "save" },
];

/** メニュー：左に項目の一覧、右にその内容（入口・設定・保存） */
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
  const [section, setSection] = useState<Section>("team");
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

  const entries: { icon: IconName; label: string; sub: string; open: () => void; primary?: boolean }[] = [
    { icon: "note", label: "作戦ノート", sub: "試合中の動きのルールを決める", open: () => setNotesOpen(true), primary: true },
    { icon: "book", label: "特殊能力図鑑", sub: "特殊能力の効果と、持っている部員", open: () => setSkillBookOpen(true) },
    { icon: "captain", label: "チーム（キャプテン）", sub: "キャプテンとチームの様子", open: () => setTeamOpen(true) },
    { icon: "facility", label: "設備", sub: "設備の段階と、次の段階の条件", open: () => setFacilitiesOpen(true) },
    { icon: "uniform", label: "ユニフォーム", sub: "1st・2nd の柄と色", open: () => setUniformOpen(true) },
    { icon: "scout", label: "特待生スカウト", sub: "中学生の候補を探して訪ねる", open: () => setScoutOpen(true) },
  ];

  return (
    <div className="flex min-h-0 flex-1 gap-2">
      {/* 左：項目の一覧 */}
      <nav className="flex w-[12rem] shrink-0 flex-col bg-panel">
        <div className="shrink-0 border-b-2 border-line-2 px-2 py-1.5 text-[0.75rem] font-black text-yellow">{GAME_TITLE}</div>
        <ul className="min-h-0 flex-1">
          {SECTIONS.map((s) => {
            const active = s.id === section;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSection(s.id)}
                  aria-pressed={active}
                  className={`pressable flex min-h-12 w-full items-center gap-2 border-b border-l-[3px] border-b-line px-2.5 text-left text-[0.875rem] font-black ${active ? "border-l-yellow bg-panel-3 text-text" : "border-l-transparent text-text-2"}`}
                >
                  <Icon name={s.icon} size={18} className={active ? "text-yellow" : "text-text-3"} />
                  <span className="flex-1">{s.label}</span>
                  <Icon name="next" size={14} className="text-text-3" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="shrink-0 border-t border-line p-1.5">
          <Button
            variant="ghost"
            small
            icon="back"
            className="w-full"
            onClick={async () => {
              await save();
              goto("title");
            }}
          >
            タイトルに戻る
          </Button>
        </div>
      </nav>

      {/* 右：内容 */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
        <Band className="shrink-0">{SECTIONS.find((s) => s.id === section)?.label}</Band>
        <div className="scroll-y min-h-0 flex-1 bg-panel p-2">
          {section === "team" && (
            <ul className="grid grid-cols-2 gap-1.5">
              {entries.map((e) => (
                <li key={e.label}>
                  <button
                    type="button"
                    onClick={e.open}
                    className={`pressable flex min-h-14 w-full items-center gap-2.5 px-2.5 py-1.5 text-left ${e.primary ? "bg-yellow text-ink shadow-hard" : "border border-line-2 bg-panel-2 text-text"}`}
                  >
                    <Icon name={e.icon} size={22} className={e.primary ? "" : "text-yellow"} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.875rem] font-black leading-tight">{e.label}</span>
                      <span className={`block truncate text-[0.75rem] ${e.primary ? "text-ink-2" : "text-text-3"}`}>{e.sub}</span>
                    </span>
                    <Icon name="next" size={14} className={e.primary ? "" : "text-text-3"} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {section === "settings" && (
            <div className="flex flex-col gap-2">
              <Toggle checked={settings.skipMove} onChange={(v) => updateSettings({ skipMove: v })} label="すごろくの移動演出をスキップ" />
              <Setting label="イベントの場面" note="場面で見る：出来事ごとに、立ち絵とせりふの枠で見せる。文章だけ：ホームの右に出来事の文章を並べる">
                <Segmented options={["scene", "text"] as const} value={settings.eventView} onChange={(v) => updateSettings({ eventView: v })} labels={{ scene: "場面で見る", text: "文章だけ" }} />
              </Setting>
              <Setting label="リーグ戦・練習試合の試合（試合前に初めに選ばれる方）">
                <Segmented options={["manage", "auto"] as const} value={settings.leagueMode} onChange={(v) => updateSettings({ leagueMode: v })} labels={{ manage: "采配あり", auto: "結果のみ" }} />
              </Setting>
              <Setting label="トーナメントの観戦の表示" note="動作が重いときは、画質を「軽量」にするか、「2D＋速報」にしてください。">
                <Segmented options={["3d", "2d", "text"] as const} value={settings.tournamentView} onChange={(v) => updateSettings({ tournamentView: v })} labels={{ "3d": "3D", "2d": "2D＋速報", text: "テキストのみ" }} />
                {settings.tournamentView === "3d" && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="shrink-0 text-[0.75rem] font-bold text-text-2">3D の画質</span>
                    <Segmented options={["standard", "light"] as const} value={settings.quality3d} onChange={(v) => updateSettings({ quality3d: v })} labels={{ standard: "標準", light: "軽量" }} className="min-w-0 flex-1" />
                  </div>
                )}
              </Setting>
              <Setting label="リーグ戦・練習試合の観戦の表示" note="動作が重いときは「テキストのみ」にしてください。">
                <Segmented options={["2d", "text"] as const} value={settings.matchView} onChange={(v) => updateSettings({ matchView: v })} labels={{ "2d": "2D＋速報", text: "テキストのみ" }} />
              </Setting>
            </div>
          )}

          {section === "data" && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  icon="save"
                  onClick={async () => {
                    await save();
                    setMsg("保存しました");
                  }}
                >
                  今すぐ保存（セーブ枠{(slot ?? 0) + 1}）
                </Button>
                <Button variant="secondary" icon="exportFile" onClick={exportJson}>
                  セーブデータをJSONで書き出す
                </Button>
              </div>
              {msg && (
                <p className="flex items-center gap-1.5 bg-panel-2 px-2 py-1.5 text-[0.8125rem] font-bold text-good">
                  <Icon name="check" size={14} />
                  {msg}
                </p>
              )}
              <p className="text-[0.75rem] leading-relaxed text-text-3">日付が進むたび・試合中（5分ごと）・試合が終わるたびに自動で保存されます。</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** 設定の 1 項目（見出し・切り替え・補足） */
function Setting({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-panel-2 p-2">
      <span className="text-[0.8125rem] font-bold">{label}</span>
      {children}
      {note && <span className="text-[0.75rem] leading-snug text-text-3">{note}</span>}
    </div>
  );
}
