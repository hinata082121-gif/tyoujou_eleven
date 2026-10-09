"use client";

import { useState } from "react";
import { POSITION_NAMES } from "@/engine/config/names";
import { playerSchool } from "@/engine/season";
import { POSITIONS, type Player, type Position } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Bar, fitnessColor, RankBadge, Segmented } from "../ui";
import { StaffList } from "../staff/StaffView";
import { CONDITION_COLOR, CONDITION_ICON, overallRank, overallValue } from "./format";

type SortKey = "overall" | "grade" | "position" | "fitness" | "height";
const SORT_LABELS: Record<SortKey, string> = { overall: "総合", grade: "学年", position: "ポジ", fitness: "体力", height: "身長" };
type Filter = "all" | Position;

export function SquadView() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const selectPlayer = useGameStore((s) => s.selectPlayer);
  const [tab, setTab] = useState<"players" | "staff">("players");
  const [sort, setSort] = useState<SortKey>("overall");
  const [filter, setFilter] = useState<Filter>("all");
  const players = playerSchool(game).players;

  const filtered = players.filter((p) => filter === "all" || p.mainPosition === filter || p.aptitude[filter] >= 2);
  const cmp: Record<SortKey, (a: Player, b: Player) => number> = {
      overall: (a, b) => overallValue(b) - overallValue(a),
      grade: (a, b) => b.grade - a.grade || overallValue(b) - overallValue(a),
      position: (a, b) => POSITIONS.indexOf(a.mainPosition) - POSITIONS.indexOf(b.mainPosition) || overallValue(b) - overallValue(a),
      fitness: (a, b) => b.fitness - a.fitness,
      height: (a, b) => b.heightCm - a.heightCm,
    };
  const list = [...filtered].sort(cmp[sort]);

  if (tab === "staff")
    return (
      <div className="flex flex-col gap-2 p-3">
        <Segmented options={["players", "staff"] as const} value={tab} onChange={setTab} labels={{ players: "部員", staff: "スタッフ" }} />
        <StaffList />
      </div>
    );

  return (
    <div className="flex flex-col gap-2 p-3">
      <Segmented options={["players", "staff"] as const} value={tab} onChange={setTab} labels={{ players: "部員", staff: "スタッフ" }} />
      <Segmented options={Object.keys(SORT_LABELS) as SortKey[]} value={sort} onChange={setSort} labels={SORT_LABELS} />
      <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3">
        {(["all", ...POSITIONS] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-bold ${filter === f ? "bg-pitch text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {f === "all" ? "全員" : POSITION_NAMES[f]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">
        {list.length}人{filter !== "all" && "（適性○以上を含む）"}
      </p>
      <ul className="flex flex-col divide-y divide-gray-100">
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => selectPlayer(p.id)} className="flex min-h-14 w-full items-center gap-2 py-1.5 text-left">
              <RankBadge rank={overallRank(p)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold">{p.name}</span>
                  <span className="text-[11px] text-gray-500">{p.grade}年</span>
                  {p.status === "retired" && <span className="rounded bg-gray-200 px-1 text-[10px]">引退</span>}
                  {p.suspended > 0 && <span className="rounded bg-red-600 px-1 text-[10px] text-white">出場停止</span>}
                  {p.injuryDays > 0 && <span className="rounded bg-red-100 px-1 text-[10px] text-red-700">ケガ{p.injuryDays}日</span>}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <span className="w-9 font-bold text-pitch-dark">{POSITION_NAMES[p.mainPosition]}</span>
                  <span>{p.heightCm}cm</span>
                  <span className={CONDITION_COLOR[p.condition]}>{CONDITION_ICON[p.condition]}</span>
                  <Bar value={p.fitness} color={fitnessColor(p.fitness)} className="!h-1.5 max-w-20" />
                </div>
              </div>
              <span className="w-8 text-right text-sm font-black text-gray-700">{overallValue(p)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
