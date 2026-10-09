"use client";

import { APTITUDE_MARKS, CONDITION_NAMES, FOOT_NAMES, POSITION_NAMES } from "@/engine/config/names";
import { statRank } from "@/engine/player/rank";
import { playerSchool } from "@/engine/season";
import { POSITIONS } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Bar, Button, fitnessColor, RankBadge, Sheet } from "../ui";
import { overallRank, overallValue, statLabel, visibleStats } from "./format";

export function PlayerDetail() {
  const game = useGameStore((s) => s.game)!;
  const id = useGameStore((s) => s.selectedPlayerId);
  const selectPlayer = useGameStore((s) => s.selectPlayer);
  const p = playerSchool(game).players.find((x) => x.id === id);
  if (!p) return null;
  const close = () => selectPlayer(null);
  return (
    <Sheet onClose={close}>
      <div className="mb-3 flex items-center gap-3">
        <RankBadge rank={overallRank(p)} size="lg" />
        <div className="flex-1">
          <div className="text-lg font-black">{p.name}</div>
          <div className="text-xs text-gray-600">
            {p.grade}年・{POSITION_NAMES[p.mainPosition]}・{p.heightCm}cm・利き足 {FOOT_NAMES[p.foot]}
            {p.status === "retired" && "・引退済み"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-500">総合</div>
          <div className="text-2xl font-black">{overallValue(p)}</div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-gray-50 p-2">
          <div className="text-gray-500">体力</div>
          <div className="font-bold">{Math.round(p.fitness)}</div>
          <Bar value={p.fitness} color={fitnessColor(p.fitness)} className="mt-1" />
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <div className="text-gray-500">調子</div>
          <div className="font-bold">{CONDITION_NAMES[p.condition]}</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2">
          <div className="text-gray-500">ケガ</div>
          <div className={`font-bold ${p.injuryDays > 0 ? "text-red-600" : ""}`}>{p.injuryDays > 0 ? `残り${p.injuryDays}日` : "なし"}</div>
        </div>
      </div>

      <h3 className="mb-1 text-xs font-black text-gray-600">能力</h3>
      <ul className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1">
        {visibleStats(p).map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{statLabel(k)}</span>
            <RankBadge rank={statRank(p.stats[k])} size="sm" />
            <span className="w-7 text-right font-mono text-xs">{p.stats[k]}</span>
          </li>
        ))}
      </ul>

      <h3 className="mb-1 text-xs font-black text-gray-600">ポジション適性</h3>
      <div className="mb-4 grid grid-cols-8 gap-1 text-center">
        {POSITIONS.map((pos) => (
          <div key={pos} className={`rounded-md p-1 ${p.aptitude[pos] === 3 ? "bg-pitch text-white" : p.aptitude[pos] === 2 ? "bg-green-100" : "bg-gray-50 text-gray-400"}`}>
            <div className="text-[9px] font-bold">{POSITION_NAMES[pos]}</div>
            <div className="text-sm font-black">{APTITUDE_MARKS[p.aptitude[pos]]}</div>
          </div>
        ))}
      </div>
      <Button variant="secondary" className="w-full" onClick={close}>
        閉じる
      </Button>
    </Sheet>
  );
}
