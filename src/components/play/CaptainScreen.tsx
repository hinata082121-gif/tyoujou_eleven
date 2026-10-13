"use client";

/**
 * キャプテン指名（SPEC 7.8、PLAN 7.4）。
 * 年度初め（スタッフの編成の後）と、3 年生の引退でキャプテンがいなくなったときに出す。決めるまで先に進めない。
 * メニューの「チーム」からはいつでも見られるが、変えられるのは指名の時期だけ。
 */
import { useState } from "react";
import { CAPTAIN_EFFECT_TEXTS, PERSONALITY_NAMES, POSITION_NAMES, SKILL_NAMES } from "@/engine/config/names";
import { captainCandidates } from "@/engine/captain";
import { skillInLine } from "@/engine/skills";
import { playerSchool } from "@/engine/season";
import { useGameStore } from "@/store/gameStore";
import { Button, Header, RankBadge } from "../ui";
import { overallRank, overallValue } from "./format";

export function CaptainScreen({ viewOnly = false }: { viewOnly?: boolean }) {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const confirmCaptain = useGameStore((s) => s.confirmCaptain);
  const setTeamOpen = useGameStore((s) => s.setTeamOpen);
  const selectPlayer = useGameStore((s) => s.selectPlayer);
  const school = playerSchool(game);
  const cands = captainCandidates(school);
  const [pick, setPick] = useState<string | null>(school.captainId ?? cands[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const chosen = cands.find((p) => p.id === pick);
  const list = viewOnly ? cands.filter((p) => p.id === school.captainId) : cands;
  return (
    <main className="flex flex-1 flex-col">
      <Header title={viewOnly ? "チーム" : "キャプテン指名"} onBack={viewOnly ? () => setTeamOpen(false) : undefined} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        {viewOnly ? (
          <p className="text-xs text-gray-600">キャプテンは年度初めと、3年生の引退の後に選び直せます。</p>
        ) : (
          <p className="text-sm">
            チームをまとめるキャプテンを選んでください。学年は問いません。キャプテンの性格でチームへの効果が変わります。
            <span className="mt-1 block text-[11px] text-gray-500">試合に出ていないときは、試合中の効果が半分になります。おすすめ順に並んでいます。</span>
          </p>
        )}
        {chosen && (
          <div className="rounded-xl border-2 border-pitch bg-green-50 p-3 text-sm">
            <div className="flex items-center gap-1.5 font-black">
              <span className="rounded bg-pitch-dark px-1.5 text-xs text-white">C</span>
              {chosen.name}（{chosen.grade}年・{PERSONALITY_NAMES[chosen.personality]}）
            </div>
            <p className="mt-1 text-xs text-gray-700">{CAPTAIN_EFFECT_TEXTS[chosen.personality]}</p>
            {skillInLine(chosen, "captaincy") && <p className="mt-0.5 text-xs text-emerald-700">さらに「{SKILL_NAMES[skillInLine(chosen, "captaincy")!]}」でチーム全体が少し力を出せる。</p>}
          </div>
        )}
        <ul className="flex flex-col divide-y divide-gray-100">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1">
              <button
                type="button"
                disabled={viewOnly}
                onClick={() => setPick(p.id)}
                className={`flex min-h-12 flex-1 items-center gap-2 rounded-lg px-1 text-left ${pick === p.id && !viewOnly ? "bg-green-100" : ""}`}
              >
                <RankBadge rank={overallRank(p)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {p.name}
                    {skillInLine(p, "captaincy") && <span className="ml-1 rounded bg-emerald-600 px-1 text-[10px] text-white">{SKILL_NAMES[skillInLine(p, "captaincy")!]}</span>}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {p.grade}年・{POSITION_NAMES[p.mainPosition]}・{PERSONALITY_NAMES[p.personality]}
                  </span>
                </span>
                <span className="w-7 text-right text-sm font-black text-gray-700">{overallValue(p)}</span>
              </button>
              <button type="button" onClick={() => selectPlayer(p.id)} className="min-h-11 min-w-11 rounded-lg text-xs text-gray-500" aria-label="詳細">
                詳細
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="text-xs text-red-700">{error}</p>}
        <div className="flex-1" />
        {!viewOnly && (
          <Button className="sticky bottom-3" disabled={!pick} onClick={() => pick && setError(confirmCaptain(pick))}>
            {chosen ? `${chosen.name}をキャプテンにする` : "キャプテンを選ぶ"}
          </Button>
        )}
      </div>
    </main>
  );
}
