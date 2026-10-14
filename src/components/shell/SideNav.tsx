"use client";

import type { PlayView } from "@/store/gameStore";
import { Icon, type IconName } from "../icons";

const ITEMS: { view: PlayView; label: string; icon: IconName }[] = [
  { view: "home", label: "すごろく", icon: "dice" },
  { view: "squad", label: "部員", icon: "squad" },
  { view: "bracket", label: "大会", icon: "cup" },
  { view: "records", label: "記録", icon: "book" },
  { view: "menu", label: "メニュー", icon: "menu" },
];

/** 左のメニュー（縦に 5 つ。選んでいるものは左に黄色の線） */
export function SideNav({ view, onChange }: { view: PlayView; onChange: (v: PlayView) => void }) {
  return (
    <nav className="flex w-14 shrink-0 flex-col gap-1" aria-label="メニュー">
      {ITEMS.map((t) => {
        const on = view === t.view;
        return (
          <button
            key={t.view}
            type="button"
            onClick={() => onChange(t.view)}
            aria-current={on ? "page" : undefined}
            className={`pressable flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 border-l-4 text-[0.6875rem] font-black ${on ? "border-yellow bg-panel text-yellow" : "border-transparent bg-panel/85 text-text-2"}`}
          >
            <Icon name={t.icon} size={20} />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
