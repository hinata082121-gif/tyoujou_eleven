"use client";

import { useEffect, useRef, useState } from "react";
import { formatDay } from "@/engine/calendar";
import { LEAGUE } from "@/engine/config/league";
import { leagueName } from "@/engine/config/names";
import { divisionOf, standings } from "@/engine/league";
import type { LeagueDivision } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Icon } from "../icons";
import { Band, RankBadge, Segmented } from "../ui";

const TABLE_COLS = "grid-cols-[1.75rem_minmax(0,1fr)_1.75rem_4.25rem_2.25rem_2rem]";

/** 県リーグ（P3）：左に順位表、右に日程と結果 */
export function LeagueView() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const league = game.league;
  const pref = game.prefectures.find((p) => p.isPlayerPref)!;
  const mine = league ? divisionOf(league, game.playerSchoolId) : undefined;
  const [level, setLevel] = useState(mine?.level ?? 1);
  if (!league || league.divisions.length === 0) return <p className="bg-panel p-3 text-[0.8125rem] text-text-3">県リーグの組み分けはまだありません。</p>;
  const division = league.divisions.find((d) => d.level === level) ?? league.divisions[0];
  const levels = league.divisions.map((d) => String(d.level));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {!league.active && (
        <p className="flex shrink-0 items-center gap-2 border-l-4 border-warn bg-panel px-2 py-1 text-[0.75rem] font-bold text-warn">
          <Icon name="info" size={14} />
          県リーグは来年度（4月）から始まります。下は、評判をもとに決めた最初の組み分けです。
        </p>
      )}
      {league.final && (
        <p className="cut-r shrink-0 self-start bg-yellow py-0.5 pl-2 pr-6 text-[0.8125rem] font-black text-ink">
          今年の成績：{league.final.playerLevel}部 {league.final.position}位（{league.final.size}校）
          {league.final.promoted ? "・昇格" : league.final.relegated ? "・降格" : ""}
        </p>
      )}
      <div className="flex min-h-0 flex-1 gap-2">
        <section className="flex min-h-0 min-w-0 flex-[1.15] flex-col gap-1">
          <div className="flex shrink-0 items-center gap-2">
            {levels.length > 1 && (
              <Segmented options={levels} value={String(division.level)} onChange={(v) => setLevel(Number(v))} labels={Object.fromEntries(levels.map((l) => [l, `${l}部`]))} className="w-auto shrink-0" />
            )}
            <h2 className="min-w-0 truncate bg-panel px-2 py-1 text-[0.8125rem] font-black">
              {leagueName(pref.name, division.level)}
              <span className="ml-1 text-[0.75rem] font-bold text-text-3">
                {division.schoolIds.length}校・{division.doubleRound ? "2回総当たり" : "1回総当たり"}
              </span>
            </h2>
          </div>
          <Table division={division} bottom={division.level === league.divisions.length} />
          <p className="shrink-0 bg-panel px-2 py-1 text-[0.75rem] leading-snug text-text-3">
            勝ち3・分け1。上位{LEAGUE.promote}校は上の部へ、下位{LEAGUE.promote}校は下の部へ（1部の上位と最下部の下位はそのまま）。
          </p>
        </section>
        {league.active && (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
            <Band className="shrink-0">日程・結果</Band>
            <Fixtures key={division.level} division={division} />
          </section>
        )}
      </div>
    </div>
  );
}

function Table({ division, bottom }: { division: LeagueDivision; bottom: boolean }) {
  const game = useGameStore((s) => s.game)!;
  const me = game.playerSchoolId;
  const rows = standings(division);
  const k = LEAGUE.promote;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className={`grid shrink-0 ${TABLE_COLS} items-center gap-1.5 border-b-2 border-line-2 px-2 py-1 text-[0.6875rem] font-black text-text-3`}>
        <span className="text-right">位</span>
        <span>学校</span>
        <span className="text-center">試</span>
        <span className="text-center">勝-分-敗</span>
        <span className="text-center">差</span>
        <span className="text-right">点</span>
      </div>
      <ol className="scroll-y min-h-0 flex-1">
        {rows.map((r, i) => {
          const s = game.schools[r.schoolId];
          const up = division.level > 1 && i < k;
          const down = !bottom && i >= rows.length - k;
          const diff = r.goalsFor - r.goalsAgainst;
          const isMe = r.schoolId === me;
          return (
            <li
              key={r.schoolId}
              className={`grid min-h-9 ${TABLE_COLS} items-center gap-1.5 border-b border-l-[3px] border-b-line px-2 text-[0.8125rem] ${up ? "border-l-good" : down ? "border-l-bad" : "border-l-transparent"} ${isMe ? "bg-panel-3" : ""}`}
            >
              <span className={`font-num text-right font-bold ${up ? "text-good" : down ? "text-bad" : ""}`}>{i + 1}</span>
              <span className="flex min-w-0 items-center gap-1">
                <RankBadge rank={s.rank} size="sm" />
                <span className={`truncate ${isMe ? "font-black text-yellow" : ""}`}>{s.name}</span>
              </span>
              <span className="font-num text-center text-text-2">{r.played}</span>
              <span className="font-num text-center text-[0.75rem] text-text-2">
                {r.won}-{r.drawn}-{r.lost}
              </span>
              <span className="font-num text-center text-text-2">{diff > 0 ? `+${diff}` : diff}</span>
              <span className="font-num text-right text-[0.9375rem] font-bold">{r.points}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Fixtures({ division }: { division: LeagueDivision }) {
  const game = useGameStore((s) => s.game)!;
  const me = game.playerSchoolId;
  const name = (id: string) => game.schools[id].name;
  const boxRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLElement>(null);
  // まだ終わっていない節（なければ最後の節）
  const next = Math.max(
    0,
    division.fixtures.findIndex((round) => round.some((f) => !f.score)),
  );

  // 開いたときは、次の節を上に出す
  useEffect(() => {
    const box = boxRef.current;
    const el = nextRef.current;
    if (!box || !el) return;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top;
  }, [division]);

  return (
    <div ref={boxRef} className="scroll-y min-h-0 flex-1 bg-panel px-2 pb-2">
      {division.fixtures.map((round, r) => {
        const rest = division.schoolIds.filter((id) => !round.some((f) => f.home === id || f.away === id));
        return (
          <section key={r} ref={r === next ? nextRef : undefined} className="pt-1.5">
            <h3 className="mb-1 flex items-baseline gap-2 border-b border-line pb-0.5">
              <span className={`text-[0.75rem] font-black ${r === next ? "text-yellow" : "text-text-2"}`}>第{r + 1}節</span>
              <span className="font-num text-[0.75rem] text-text-3">{formatDay(division.days[r])}</span>
            </h3>
            <ul className="flex flex-col gap-0.5">
              {round.map((f) => {
                const mine = f.home === me || f.away === me;
                return (
                  <li key={f.id} className={`flex min-h-7 items-center gap-1 px-1.5 text-[0.75rem] ${mine ? "border border-yellow bg-panel-3" : "bg-panel-2"}`}>
                    <span className={`flex-1 truncate text-right ${f.home === me ? "font-black text-yellow" : ""}`}>{name(f.home)}</span>
                    <span className={`font-num w-12 shrink-0 text-center text-[0.875rem] font-bold ${f.score ? "" : "text-text-3"}`}>{f.score ? `${f.score[0]}-${f.score[1]}` : "vs"}</span>
                    <span className={`flex-1 truncate ${f.away === me ? "font-black text-yellow" : ""}`}>{name(f.away)}</span>
                  </li>
                );
              })}
              {rest.length > 0 && <li className="px-1.5 text-[0.75rem] text-text-3">休み：{rest.map(name).join("、")}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
