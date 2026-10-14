"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SLOT_COUNT, type SlotSummary } from "@/lib/save";
import { loadSummaries, saveManager, useGameStore } from "@/store/gameStore";
import { Icon } from "../icons";
import { Button, Screen } from "../ui";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** セーブ枠：3 枠を横に並べる */
export function SlotsScreen() {
  const goto = useGameStore((s) => s.goto);
  const loadSlot = useGameStore((s) => s.loadSlot);
  const [summaries, setSummaries] = useState<(SlotSummary | null)[]>(Array(SLOT_COUNT).fill(null));
  const [message, setMessage] = useState<string | null>(null);
  const [importSlot, setImportSlot] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => loadSummaries().then(setSummaries), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const startNew = (slot: number) => {
    if (summaries[slot] && !window.confirm(`セーブ枠${slot + 1}を上書きして、新しく始めますか？`)) return;
    useGameStore.setState({ slot });
    goto("new");
  };

  const exportSlot = async (slot: number) => {
    const json = await saveManager().exportJson(slot);
    if (json) downloadText(`tyoujou-eleven-slot${slot + 1}.json`, json);
  };

  const remove = async (slot: number) => {
    if (!window.confirm(`セーブ枠${slot + 1}を削除しますか？（元に戻せません）`)) return;
    await saveManager().remove(slot);
    refresh();
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file || importSlot === null) return;
    try {
      const text = await file.text();
      await saveManager().importJson(importSlot, text);
      setMessage(`セーブ枠${importSlot + 1}に読み込みました`);
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setImportSlot(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Screen title="セーブデータ" onBack={() => goto("title")}>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
        {summaries.map((s, i) => (
          <section key={i} className={`flex min-h-0 min-w-0 flex-col border-t-4 bg-panel ${s ? "border-yellow" : "border-line-2"}`}>
            <div className="flex shrink-0 items-center gap-2 bg-panel-2 py-1 pr-2">
              <span className={`cut-r py-0.5 pl-2 pr-5 text-[0.8125rem] font-black ${s ? "bg-yellow text-ink" : "bg-panel-3 text-text-2"}`}>
                セーブ枠<span className="font-num ml-0.5 text-[0.9375rem]">{i + 1}</span>
              </span>
            </div>
            <div className="scroll-y flex min-h-0 flex-1 flex-col justify-center gap-1 px-3 py-2">
              {s ? (
                <>
                  <div className="font-head truncate text-[1.25rem] leading-tight">{s.schoolName}</div>
                  <div className="font-num text-[0.875rem] text-text-2">{s.dateLabel}</div>
                  <div className="flex items-center gap-1.5 text-[0.8125rem]">
                    <Icon name="reputation" size={14} className="text-yellow" />
                    <span className="text-text-3">評判</span>
                    <span className="font-black">{s.reputation}</span>
                  </div>
                  <div className="font-num mt-1 text-[0.75rem] text-text-3">{new Date(s.savedAt).toLocaleString("ja-JP")}</div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-text-3">
                  <Icon name="save" size={28} />
                  <span className="text-[0.8125rem] font-bold">データなし</span>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 p-2">
              {s && (
                <Button icon="play" cut onClick={() => loadSlot(i).catch((e: Error) => setMessage(e.message))}>
                  続きから
                </Button>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <Button variant={s ? "secondary" : "primary"} icon="plus" small={!!s} onClick={() => startNew(i)} className={s ? "" : "col-span-2"}>
                  {s ? "最初から" : "新しく始める"}
                </Button>
                {s && (
                  <Button variant="danger" small icon="trash" onClick={() => remove(i)}>
                    削除
                  </Button>
                )}
                <Button
                  variant="ghost"
                  small
                  icon="importFile"
                  onClick={() => {
                    setImportSlot(i);
                    fileRef.current?.click();
                  }}
                  className={s ? "" : "col-span-2"}
                >
                  {s ? "読み込み" : "JSON読み込み"}
                </Button>
                {s && (
                  <Button variant="ghost" small icon="exportFile" onClick={() => exportSlot(i)}>
                    書き出し
                  </Button>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-2 flex shrink-0 flex-col gap-1">
        {message && <p className="border-l-4 border-yellow bg-panel px-2 py-1 text-[0.8125rem] font-bold text-warn">{message}</p>}
        <p className="bg-panel/90 px-2 py-1 text-[0.75rem] leading-snug text-text-3">
          日付が進むたび・試合の途中（5分ごと）・試合が終わるたびに自動で保存されます。ブラウザのデータを消すとセーブも消えるので、ときどき「書き出し」で JSON のファイルに保存しておくと安心です。
        </p>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onImportFile(e.target.files?.[0])} />
    </Screen>
  );
}
