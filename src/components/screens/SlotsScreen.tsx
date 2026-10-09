"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SLOT_COUNT, type SlotSummary } from "@/lib/save";
import { loadSummaries, saveManager, useGameStore } from "@/store/gameStore";
import { Button, Header } from "../ui";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
    <main className="flex flex-1 flex-col">
      <Header title="セーブデータ" onBack={() => goto("title")} />
      <div className="flex flex-col gap-3 p-4">
        {summaries.map((s, i) => (
          <div key={i} className="rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-bold text-gray-500">セーブ枠{i + 1}</span>
              {s && <span className="text-[11px] text-gray-400">{new Date(s.savedAt).toLocaleString("ja-JP")}</span>}
            </div>
            {s ? (
              <div className="mb-3">
                <div className="text-lg font-black">{s.schoolName}</div>
                <div className="text-sm text-gray-600">
                  {s.dateLabel}・評判「{s.reputation}」
                </div>
              </div>
            ) : (
              <div className="mb-3 text-sm text-gray-400">データなし</div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {s && (
                <Button onClick={() => loadSlot(i).catch((e: Error) => setMessage(e.message))} className="col-span-2">
                  続きから
                </Button>
              )}
              <Button variant="secondary" onClick={() => startNew(i)}>
                新しく始める
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setImportSlot(i);
                  fileRef.current?.click();
                }}
              >
                JSON読み込み
              </Button>
              {s && (
                <>
                  <Button variant="secondary" onClick={() => exportSlot(i)}>
                    JSON書き出し
                  </Button>
                  <Button variant="danger" onClick={() => remove(i)}>
                    削除
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {message && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
        <p className="text-xs leading-relaxed text-gray-500">
          日付が進むたび・試合の途中（5分ごと）・試合が終わるたびに自動で保存されます。ブラウザのデータを消すとセーブも消えるので、ときどき「JSON書き出し」で保存しておくと安心です。
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onImportFile(e.target.files?.[0])} />
      </div>
    </main>
  );
}
