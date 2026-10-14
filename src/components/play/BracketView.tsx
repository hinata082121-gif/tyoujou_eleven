"use client";

import { useEffect, useRef, useState } from "react";
import { formatDay } from "@/engine/calendar";
import { roundLabel } from "@/engine/config/names";
import { competitionName, nationalSize, rookieRegionSize, summerNationalSize } from "@/engine/game";
import { totalRounds } from "@/engine/competition/bracket";
import type { Bracket, BracketMatch, CompetitionKind } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Icon } from "../icons";
import { RankBadge, Segmented } from "../ui";
import { LeagueView } from "./LeagueView";
import { ScheduleView } from "./ScheduleView";

type Season = "winter" | "summer" | "rookie";
type Tab = Season | "league" | "plan";
const SEASON_KINDS: Record<Season, [CompetitionKind, CompetitionKind]> = {
  winter: ["prefQualifier", "national"],
  summer: ["summerQualifier", "summerNational"],
  rookie: ["rookiePref", "rookieRegion"],
};

/** 大会：上に大会の切り替えと説明、下にトーナメント表（回戦を横に並べ、枠の中だけスクロール） */
export function BracketView() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const c = game.competitions;
  // 開いたときは、いま進んでいる大会
  const initial = (): [Tab, 0 | 1] => {
    const pos = game.calendar.position;
    for (const [season, kinds] of Object.entries(SEASON_KINDS) as [Season, [CompetitionKind, CompetitionKind]][]) {
      for (const [i, k] of kinds.entries()) {
        const b = c[k];
        if (b && !b.championId && !b.qualifiedIds && b.roundDays[0] <= pos + 30) return [season, i as 0 | 1];
      }
    }
    // 大会が近くなければ、県リーグ（P3）
    if (game.league?.active && !game.league.final) return ["league", 0];
    return ["winter", c.national ? 1 : 0];
  };
  const [init] = useState(initial);
  const bracketTab = useGameStore((s) => s.bracketTab);
  const [tab, setTab] = useState<Tab>(bracketTab === "plan" ? "plan" : init[0]);
  const season: Season = tab === "league" || tab === "plan" ? "winter" : tab;
  const [stage, setStage] = useState<0 | 1>(init[1]);
  const kind = SEASON_KINDS[season][stage];
  const tabs = game.league ? (["plan", "league", "summer", "winter", "rookie"] as const) : (["plan", "summer", "winter", "rookie"] as const);
  const top = <Segmented options={tabs} value={tab} onChange={(v) => setTab(v)} labels={{ plan: "予定", league: "リーグ", summer: "夏", winter: "冬", rookie: "新人戦" }} className="w-[21rem] shrink-0" />;
  if (tab === "plan") return <ScheduleView top={top} />;
  if (tab === "league")
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex shrink-0 items-center gap-2">{top}</div>
        <LeagueView />
      </div>
    );
  const b = c[kind];
  const pref = game.prefectures.find((p) => p.isPlayerPref)!;
  const region = game.regions.find((r) => r.id === pref.regionId)?.name ?? "";
  const result = season === "winter" ? c.winterResult : season === "summer" ? c.summerResult : c.rookieResult;
  const reps = kind === "summerQualifier" ? pref.summerReps : pref.reps;
  const size = kind === "national" ? nationalSize(game) : kind === "summerNational" ? summerNationalSize(game) : kind === "rookieRegion" ? rookieRegionSize(game) : pref.schoolIds.length;
  const host = game.prefectures.find((p) => p.id === c.summerHostPrefId);
  const stageLabels: Record<Season, { 0: string; 1: string }> = {
    winter: { 0: `${pref.name}予選`, 1: "全国大会" },
    summer: { 0: `${pref.name}予選`, 1: "全国大会" },
    rookie: { 0: `${pref.name}大会`, 1: region ? `${region}大会` : "地域大会" },
  };
  const notes = [
    season === "summer" && host ? `今年の開催県：${host.name}（開催県は 2 校が出場）` : null,
    season === "rookie" ? "1・2年生だけで戦う。県大会の上位 8 校は、次の夏の県予選のシードになる。" : null,
    stage === 0 && reps > 1 && season !== "rookie" ? `代表決定戦に勝った${reps}校が全国大会に出場します。` : null,
  ].filter((n): n is string => !!n);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex shrink-0 items-center gap-2">
        {top}
        <Segmented
          options={["0", "1"] as const}
          value={String(stage) as "0" | "1"}
          onChange={(v) => setStage(Number(v) as 0 | 1)}
          labels={{ "0": stageLabels[season][0], "1": stageLabels[season][1] }}
          className="min-w-0 flex-1"
        />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-panel px-2 py-1">
        <h2 className="text-[0.875rem] font-black">
          {competitionName(game, kind)}
          <span className="font-num ml-1 text-[0.75rem] font-bold text-text-3">{size}校</span>
        </h2>
        {result && (
          <span className="cut-r bg-yellow py-0.5 pl-2 pr-5 text-[0.75rem] font-black text-ink">今年の成績：{result}</span>
        )}
        {b?.qualifiedIds && (
          <span className="flex items-center gap-1 text-[0.75rem] font-black text-yellow">
            <Icon name="cup" size={14} />
            {b.qualifiedIds.length > 1 ? "代表" : "優勝"}：{b.qualifiedIds.map((id) => game.schools[id].name).join("・")}
          </span>
        )}
        {notes.map((n) => (
          <span key={n} className="text-[0.75rem] text-text-3">
            {n}
          </span>
        ))}
      </div>
      {!b ? (
        <p className="bg-panel p-3 text-[0.8125rem] text-text-3">{stage === 0 ? "組み合わせはまだ決まっていません。" : `前の大会が終わると、組み合わせ（${size}校）が決まります。`}</p>
      ) : (
        <BracketTree key={kind} bracket={b} />
      )}
    </div>
  );
}

/** 1 試合の枠の高さ（rem）。どの回戦も、1 回戦の数 × これ の高さにそろえて、勝ち上がりの線を合わせる */
const CELL_REM = 3.5;

/** トーナメント表：回戦を横に並べる。r 回戦の 2j・2j+1 試合の勝者が、r+1 回戦の j 試合に進む */
function BracketTree({ bracket }: { bracket: Bracket }) {
  const game = useGameStore((s) => s.game)!;
  const me = game.playerSchoolId;
  const total = totalRounds(bracket);
  const first = bracket.rounds[0].length;
  const boxRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  // 自校のいちばん新しい試合を、枠の真ん中に持ってくる
  useEffect(() => {
    const box = boxRef.current;
    const el = focusRef.current;
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    box.scrollTop += e.top - b.top - (box.clientHeight - e.height) / 2;
    box.scrollLeft += e.left - b.left - (box.clientWidth - e.width) / 2;
  }, [bracket]);

  let focusId: string | undefined;
  for (const round of bracket.rounds) for (const m of round) if (m.a === me || m.b === me) focusId = m.id;

  const columns = Array.from({ length: total }, (_, r) => {
    const count = Math.max(1, first >> r);
    const matches = bracket.rounds[r];
    return Array.from({ length: count }, (_, j) => matches?.[j]);
  });

  return (
    <div ref={boxRef} className="scroll-x scroll-y min-h-0 flex-1 bg-panel">
      <div className="flex min-w-max gap-6 px-2 pb-2">
        {columns.map((cells, r) => {
          const last = r === total - 1;
          return (
            <div key={r} className="flex w-[11.5rem] shrink-0 flex-col">
              <div className="sticky top-0 z-10 -mx-1 mb-1 flex items-baseline gap-2 bg-panel px-1 pb-1 pt-1.5">
                <span className={`cut-r py-0.5 pl-2 pr-5 text-[0.75rem] font-black ${last ? "bg-red text-white" : "bg-telop text-ink"}`}>{roundLabel(total, r, bracket.qualifiers)}</span>
                <span className="font-num text-[0.75rem] text-text-3">{formatDay(bracket.roundDays[r])}</span>
              </div>
              <div className="flex flex-col" style={{ height: `${first * CELL_REM}rem` }}>
                {pairs(cells).map((pair, j) => (
                  <div key={j} className="relative flex flex-1 flex-col">
                    {pair.map((m, k) => {
                      const won = !!m && m.winner === me && (m.a === me || m.b === me);
                      return (
                        <div key={k} className="relative flex flex-1 items-center">
                          <div ref={m && m.id === focusId ? focusRef : undefined} className="w-full">
                            <MatchCell m={m} me={me} r={r} />
                          </div>
                          {!last && (
                            <span
                              aria-hidden
                              className={`absolute left-full w-3 border-r-2 ${k === 0 ? "top-1/2 h-1/2 border-t-2" : "bottom-1/2 h-1/2 border-b-2"} ${won ? "z-[1] border-yellow" : "border-line-2"}`}
                            />
                          )}
                        </div>
                      );
                    })}
                    {!last && pair.length === 2 && (
                      <span aria-hidden className={`absolute left-[calc(100%+0.75rem)] top-1/2 w-3 border-t-2 ${pair.some((m) => m && m.winner === me && (m.a === me || m.b === me)) ? "border-yellow" : "border-line-2"}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function pairs<T>(list: T[]): T[][] {
  if (list.length === 1) return [list];
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

/** 1 試合の枠（上下に 2 校。自校は黄色） */
function MatchCell({ m, me, r }: { m: BracketMatch | undefined; me: string; r: number }) {
  if (!m) {
    return (
      <div className="border border-dashed border-line bg-panel-2/60">
        <div className="h-[1.375rem] border-b border-line" />
        <div className="h-[1.375rem]" />
      </div>
    );
  }
  // 1 回戦の不戦勝（シード）
  if (r === 0 && (!m.a || !m.b)) {
    const id = m.a ?? m.b;
    if (!id) return null;
    return (
      <div className="border border-line">
        <Side id={id} me={me} m={m} bye />
      </div>
    );
  }
  return (
    <div className={`border ${m.a === me || m.b === me ? "border-yellow" : "border-line-2"}`}>
      <Side id={m.a} me={me} m={m} i={0} />
      <div className="border-t border-line" />
      <Side id={m.b} me={me} m={m} i={1} />
    </div>
  );
}

function Side({ id, me, m, i = 0, bye }: { id: string | null; me: string; m: BracketMatch; i?: 0 | 1; bye?: boolean }) {
  const game = useGameStore((s) => s.game)!;
  if (!id) return <div className="flex h-[1.375rem] items-center bg-panel-2 px-1.5 text-[0.75rem] text-text-3">—</div>;
  const s = game.schools[id];
  const mine = id === me;
  const decided = m.winner !== undefined && !bye;
  const won = decided && m.winner === id;
  const lost = decided && m.winner !== id;
  return (
    <div className={`flex h-[1.375rem] items-center gap-1 pl-1 pr-1.5 text-[0.75rem] ${mine ? "bg-yellow text-ink" : "bg-panel-2"} ${lost && !mine ? "text-text-3" : ""}`}>
      <RankBadge rank={s.rank} size="sm" />
      <span className={`min-w-0 flex-1 truncate ${won || mine ? "font-black" : ""}`}>{s.name}</span>
      {bye ? (
        <span className={`shrink-0 text-[0.6875rem] font-bold ${mine ? "text-ink-2" : "text-text-3"}`}>シード</span>
      ) : (
        m.score && (
          <span className="font-num shrink-0 text-[0.8125rem] font-bold">
            {m.score[i]}
            {m.pk && <span className="ml-0.5 text-[0.6875rem] font-medium">({m.pk[i]})</span>}
          </span>
        )
      )}
    </div>
  );
}
