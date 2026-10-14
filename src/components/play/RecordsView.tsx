"use client";

import { useState } from "react";
import { dayToDate } from "@/engine/calendar";
import { CAREER_NAMES, POSITION_NAMES, REPUTATION_NAMES, yearLabel } from "@/engine/config/names";
import { divisionOf, standings } from "@/engine/league";
import { playerSchool } from "@/engine/season";
import { useGameStore } from "@/store/gameStore";
import { Band, RankBadge, Segmented } from "../ui";
import { statRank } from "@/engine/player/rank";
import type { Alumnus, GameState, SeasonRecord } from "@/engine/types";
import { casualColor } from "../look/casual";
import { PlayerFace } from "../look/Figure";
import { AlumnusSheet } from "../staff/StaffView";

/** 表示用の 1 年分（記録 ＋ 今年の途中の成績） */
type YearView = SeasonRecord & { current?: boolean; leagueText?: string };

function leagueText(l: SeasonRecord["league"]): string | undefined {
  if (!l) return undefined;
  return `${l.level}部 ${l.position}位（${l.size}校）${l.promoted ? "・昇格" : l.relegated ? "・降格" : ""}`;
}

/** 今年の途中の成績（表示だけ） */
function currentYear(game: GameState): YearView {
  const c = game.competitions;
  const fin = game.league?.final;
  let lt: string | undefined;
  if (fin && fin.playerLevel > 0) {
    lt = `${fin.playerLevel}部 ${fin.position}位（${fin.size}校）${fin.promoted ? "・昇格" : fin.relegated ? "・降格" : ""}`;
  } else if (game.league?.active) {
    const d = divisionOf(game.league, game.playerSchoolId);
    if (d) {
      const table = standings(d);
      const i = table.findIndex((r) => r.schoolId === game.playerSchoolId);
      if (i >= 0) lt = `${d.level}部 ${i + 1}位（${table.length}校）・途中`;
    }
  }
  return {
    year: game.year,
    reputationLevel: game.reputation.level,
    rank: playerSchool(game).rank,
    winterResult: c.winterResult ?? "—",
    summerResult: c.summerResult ?? "—",
    rookieResult: c.rookieResult ?? "—",
    current: true,
    leagueText: lt,
  };
}

/** 記録：左に年度の一覧、右にその年の成績。OB・出来事はタブで切り替える */
export function RecordsView() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const [tab, setTab] = useState<"history" | "alumni" | "log">("history");
  const [ob, setOb] = useState<Alumnus | null>(null);
  const years: YearView[] = [currentYear(game), ...[...game.history].reverse().map((h) => ({ ...h, leagueText: leagueText(h.league) }))];
  const [picked, setPicked] = useState<number>(game.history.length > 0 ? game.history[game.history.length - 1].year : game.year);
  const sel = years.find((y) => y.year === picked) ?? years[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <Segmented options={["history", "alumni", "log"] as const} value={tab} onChange={setTab} labels={{ history: "歴代成績", alumni: "OB", log: "出来事" }} className="w-[20rem] shrink-0" />

      {tab === "history" && (
        <div className="flex min-h-0 flex-1 gap-2">
          <div className="flex w-[14rem] shrink-0 flex-col bg-panel">
            <div className="shrink-0 border-b-2 border-line-2 px-2 py-1 text-[0.6875rem] font-black text-text-3">年度</div>
            <ul className="scroll-y min-h-0 flex-1">
              {years.map((y) => {
                const active = y.year === sel.year;
                return (
                  <li key={y.year}>
                    <button
                      type="button"
                      onClick={() => setPicked(y.year)}
                      aria-pressed={active}
                      className={`pressable flex min-h-11 w-full items-center gap-2 border-b border-l-[3px] border-b-line px-2 text-left ${active ? "border-l-yellow bg-panel-3" : "border-l-transparent"}`}
                    >
                      <span className="w-14 shrink-0 text-[0.8125rem] font-black">{yearLabel(y.year)}</span>
                      <RankBadge rank={y.rank} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[0.75rem] text-text-2">{y.current ? "今年（途中）" : y.winterResult}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {game.history.length === 0 && <p className="shrink-0 border-t border-line p-2 text-[0.75rem] leading-snug text-text-3">まだ記録はありません。1年目が終わると、ここに成績が残ります。</p>}
          </div>
          <YearDetail y={sel} onAlumnus={setOb} />
        </div>
      )}

      {tab === "alumni" &&
        (game.alumni.length === 0 ? (
          <p className="bg-panel p-3 text-[0.8125rem] text-text-3">まだ卒業生はいません。</p>
        ) : (
          <ul className="scroll-y grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-3 bg-panel px-2">
            {[...game.alumni].reverse().map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => setOb(a)} className="pressable flex min-h-12 w-full items-center gap-2 border-b border-line py-1 text-left">
                  <PlayerFace look={a.look} size={34} shirt={casualColor(a.id)} />
                  <RankBadge rank={statRank(a.overall)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-bold">{a.name}</span>
                    <span className="block truncate text-[0.75rem] text-text-3">
                      {a.fictional ? "昔の卒業生" : `${yearLabel(a.graduatedYear)}卒`}・{POSITION_NAMES[a.position]}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[0.75rem] font-bold text-text-2">{CAREER_NAMES[a.career]}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {tab === "log" && (
        <ul className="scroll-y min-h-0 flex-1 bg-panel px-2 py-1">
          {[...game.log].reverse().map((l, i) => (
            <li key={i} className="flex gap-2 border-b border-line py-1 text-[0.75rem] leading-snug">
              <span className="font-num w-[5.5rem] shrink-0 text-text-3">
                {yearLabel(l.year)} {dayToDate(l.day).join("/")}
              </span>
              <span className={l.tone === "good" ? "text-good" : l.tone === "bad" ? "text-bad" : "text-text-2"}>{l.text}</span>
            </li>
          ))}
        </ul>
      )}

      {ob && <AlumnusSheet alumnus={ob} onClose={() => setOb(null)} />}
    </div>
  );
}

/** 右の枠：その年のランク・評判・大会の結果・卒業生 */
function YearDetail({ y, onAlumnus }: { y: YearView; onAlumnus: (a: Alumnus) => void }) {
  const game = useGameStore((s) => s.game)!;
  const graduates = y.current ? [] : game.alumni.filter((a) => !a.fictional && a.graduatedYear === y.year);
  const rows: [string, string | undefined][] = [
    ["冬の大会", y.winterResult],
    ["夏の大会", y.summerResult],
    ["新人戦", y.rookieResult],
    ["県リーグ", y.leagueText],
  ];
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
      <Band className="shrink-0" sub={y.current ? "途中" : undefined}>
        {yearLabel(y.year)}の成績
      </Band>
      <div className="scroll-y min-h-0 flex-1 bg-panel p-2">
        <div className="mb-2 flex gap-2">
          <div className="bg-panel-2 px-3 py-1">
            <div className="text-[0.6875rem] font-bold text-text-3">ランク</div>
            <div className="py-0.5">
              <RankBadge rank={y.rank} size="lg" />
            </div>
          </div>
          <div className="min-w-0 flex-1 bg-panel-2 px-3 py-1">
            <div className="text-[0.6875rem] font-bold text-text-3">評判</div>
            <div className="font-head text-[1.25rem] leading-tight">{REPUTATION_NAMES[y.reputationLevel]}</div>
          </div>
        </div>
        <ul className="mb-2">
          {rows.map(([label, text]) => (
            <li key={label} className="flex min-h-10 items-center gap-2 border-b border-line">
              <span className="cut-r w-[6rem] shrink-0 bg-telop py-0.5 pl-2 pr-4 text-[0.75rem] font-black text-ink">{label}</span>
              <span className={`min-w-0 flex-1 text-[0.875rem] font-bold ${!text || text === "—" ? "text-text-3" : ""}`}>{text ?? "—"}</span>
            </li>
          ))}
        </ul>
        {graduates.length > 0 && (
          <>
            <h3 className="mb-1 text-[0.6875rem] font-black tracking-wider text-yellow">この年の卒業生（{graduates.length}人）</h3>
            <ul className="grid grid-cols-2 gap-x-3">
              {graduates.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onAlumnus(a)} className="pressable flex min-h-11 w-full items-center gap-2 border-b border-line text-left">
                    <PlayerFace look={a.look} size={30} shirt={casualColor(a.id)} />
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold">{a.name}</span>
                    <span className="shrink-0 text-[0.75rem] text-text-3">
                      {POSITION_NAMES[a.position]}・{CAREER_NAMES[a.career]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
