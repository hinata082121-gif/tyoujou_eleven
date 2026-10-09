"use client";

import { useEffect, useRef, useState } from "react";
import { dayToDate } from "@/engine/calendar";
import { PRACTICES } from "@/engine/config/practice";
import { PRACTICE_NAMES } from "@/engine/config/names";
import { squareDisplay } from "@/engine/game";
import { playerSchool } from "@/engine/season";
import type { PracticeKind, Square } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Bar, Button, fitnessColor } from "../ui";

const SQUARE_STYLE: Record<string, string> = {
  blue: "bg-sky-400 text-white",
  red: "bg-red-400 text-white",
  white: "bg-white text-gray-600 border border-gray-300",
  green: "bg-emerald-400 text-white",
  yellow: "bg-yellow-300 text-yellow-900",
  major: "bg-violet-700 text-white",
};

const PRACTICE_ICON: Record<PracticeKind, string> = {
  shoot: "🥅",
  pass: "🎯",
  dribble: "💨",
  defense: "🛡️",
  physical: "💪",
  run: "🏃",
  tactics: "📋",
  gk: "🧤",
  pk: "⚽",
  setPiece: "🚩",
  rest: "😴",
};

const TARGET_LABEL = { all: "全員", field: "フィールド", gk: "GKのみ" } as const;

export function HomeView() {
  const game = useGameStore((s) => s.game)!;
  const playCard = useGameStore((s) => s.playCard);
  const lastCard = useGameStore((s) => s.lastCard);
  const moving = useGameStore((s) => s.moving);
  const setMoving = useGameStore((s) => s.setMoving);
  const skipMove = useGameStore((s) => s.settings.skipMove);
  const cal = game.calendar;
  const [animPos, setAnimPos] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 移動の演出（スキップ可能）
  useEffect(() => {
    if (!moving || !lastCard) return;
    let pos = lastCard.from;
    timer.current = setInterval(() => {
      pos++;
      setAnimPos(pos);
      if (pos >= lastCard.to) {
        if (timer.current) clearInterval(timer.current);
        setTimeout(() => {
          setAnimPos(null);
          setMoving(false);
        }, 250);
      }
    }, 130);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [moving, lastCard, setMoving]);

  const skip = () => {
    if (timer.current) clearInterval(timer.current);
    setAnimPos(null);
    setMoving(false);
  };

  const position = moving && lastCard ? (animPos ?? lastCard.from) : cal.position;
  const start = Math.max(0, Math.min(cal.position - 3, cal.squares.length - 28));
  const window = cal.squares.slice(start, start + 28);
  const school = playerSchool(game);
  const active = school.players.filter((p) => p.status === "active");
  const avgFit = active.reduce((s, p) => s + p.fitness, 0) / Math.max(1, active.length);
  const injured = active.filter((p) => p.injuryDays > 0);
  const recentLog = game.log.slice(-6).reverse();

  return (
    <div className="flex flex-col gap-3 p-3">
      <section>
        <div className="grid grid-cols-7 gap-1">
          {window.map((sq) => (
            <SquareCell key={sq.day} sq={sq} display={squareDisplay(game, sq)} current={sq.day === position} passed={sq.day < position} />
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
          <span><i className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-sky-400" />良い</span>
          <span><i className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-red-400" />悪い</span>
          <span><i className="mr-0.5 inline-block h-2 w-2 rounded-sm border border-gray-400 bg-white" />どちらか</span>
          <span><i className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-emerald-400" />体力回復</span>
          <span><i className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-yellow-300" />練習効率UP</span>
          <span><i className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-violet-700" />必ず止まる</span>
        </div>
      </section>

      {moving ? (
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 text-sm">
          <span>
            {lastCard?.practice}：{lastCard?.days}日間
          </span>
          <Button variant="secondary" onClick={skip} className="!min-h-9">
            スキップ
          </Button>
        </div>
      ) : (
        lastCard && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
            <div className="font-bold">
              {lastCard.practice}を{lastCard.days}日間
              {cal.nextPracticeMult !== 1 && <span className="ml-2 text-xs text-amber-700">次の練習効率 ×{cal.nextPracticeMult}</span>}
            </div>
            {lastCard.outcomes.map((o, i) => (
              <p key={i} className={`mt-1 ${o.tone === "good" ? "text-emerald-700" : o.tone === "bad" ? "text-red-700" : "text-gray-700"}`}>
                【{o.title}】{o.text}
              </p>
            ))}
            {lastCard.injured.length > 0 && <p className="mt-1 text-red-700">練習中のケガ：{lastCard.injured.join("、")}</p>}
          </div>
        )
      )}

      <section>
        <h2 className="mb-2 text-sm font-black">手札（タップで使う）</h2>
        <div className="grid grid-cols-4 gap-2">
          {cal.hand.map((c) => {
            const def = PRACTICES[c.practice];
            return (
              <button
                key={c.id}
                type="button"
                disabled={moving}
                onClick={() => playCard(c.id)}
                className="flex min-h-24 flex-col items-center justify-between rounded-xl border-2 border-pitch/30 bg-gradient-to-b from-white to-green-50 p-1.5 shadow-sm active:scale-95 disabled:opacity-50"
              >
                <span className="text-3xl font-black leading-none text-pitch-dark">{c.value}</span>
                <span className="text-lg leading-none">{PRACTICE_ICON[c.practice]}</span>
                <span className="text-center text-[10px] font-bold leading-tight">{PRACTICE_NAMES[c.practice]}</span>
                <span className="text-[9px] text-gray-500">{TARGET_LABEL[def.target]}</span>
              </button>
            );
          })}
        </div>
        {skipMove && <p className="mt-1 text-[10px] text-gray-400">移動の演出はオフ（メニューで変更）</p>}
      </section>

      <section className="rounded-xl border border-gray-200 p-3">
        <div className="mb-1 flex justify-between text-xs">
          <span className="font-bold">部の平均体力</span>
          <span>{Math.round(avgFit)}</span>
        </div>
        <Bar value={avgFit} color={fitnessColor(avgFit)} />
        <div className="mt-2 text-xs text-gray-600">
          部員 {active.length}人{school.players.length > active.length && `（引退済み${school.players.length - active.length}人）`}
          {injured.length > 0 && <span className="ml-2 text-red-700">ケガ {injured.map((p) => `${p.name}（残り${p.injuryDays}日）`).join("、")}</span>}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-black">最近の出来事</h2>
        <ul className="flex flex-col gap-1 text-xs">
          {recentLog.map((l, i) => (
            <li key={i} className={l.tone === "good" ? "text-emerald-700" : l.tone === "bad" ? "text-red-700" : "text-gray-700"}>
              <span className="mr-1 text-gray-400">{dayToDate(l.day).join("/")}</span>
              {l.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SquareCell({ sq, display, current, passed }: { sq: Square; display: ReturnType<typeof squareDisplay>; current: boolean; passed: boolean }) {
  const [m, d] = dayToDate(sq.day);
  return (
    <div
      className={`relative flex h-12 flex-col items-center justify-center rounded-md text-[10px] leading-tight ${SQUARE_STYLE[display.type]} ${passed ? "opacity-35" : ""} ${current ? "ring-3 ring-amber-500 ring-offset-1" : ""}`}
    >
      <span className="font-bold">{d === 1 ? `${m}/${d}` : d}</span>
      {display.label && <span className="text-[9px] font-bold">{display.label}</span>}
      {current && <span className="absolute -top-2 -right-1 text-sm">⚽</span>}
    </div>
  );
}
