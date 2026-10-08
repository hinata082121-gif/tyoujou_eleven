"use client";

import { useEffect, useState } from "react";
import { stepPk } from "@/engine/match/engine";
import { autoPkOrder, setPkOrder } from "@/engine/match/pk";
import type { PkKick, Side } from "@/engine/match/types";
import { useGameStore } from "@/store/gameStore";
import { Button, Header } from "../ui";

/** PK 戦：プレイヤーが決められるのはキッカーの順番だけ（SPEC 10.6） */
export function PkScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const touch = useGameStore((s) => s.touch);
  const finishMatch = useGameStore((s) => s.finishMatch);
  const speed = useGameStore((s) => s.settings.matchSpeed);
  const am = game.activeMatch!;
  const ms = am.state;
  const pk = ms.pk!;
  const side = am.userSide;
  const team = ms.teams[side];
  const ordered = pk.order[side].length > 0;
  const [order, setOrder] = useState<string[]>(() => (ordered ? pk.order[side] : autoPkOrder(team)));
  const [last, setLast] = useState<PkKick | null>(null);

  // 1 本ずつ蹴って結果を演出する
  useEffect(() => {
    if (!ordered || pk.done) return;
    const id = setTimeout(() => {
      const kick = stepPk(ms);
      setLast(kick);
      touch(true);
    }, 1600 / speed);
    return () => clearTimeout(id);
  }, [ordered, pk.done, pk.kicks.length, ms, speed, touch]);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const start = () => {
    if (setPkOrder(ms, side, order) === null) touch(true);
  };

  const name = (s: Side, id: string) => ms.teams[s].players[id]?.name ?? "";
  const row = (s: Side) => {
    const kicks = pk.kicks.filter((k) => k.side === s);
    const cells = Math.max(5, kicks.length);
    return Array.from({ length: cells }, (_, i) => kicks[i]);
  };

  return (
    <main className="flex h-dvh flex-col">
      <Header title="PK戦" />
      <div className="flex flex-col gap-3 p-3">
        <div className="rounded-xl bg-pitch-dark p-3 text-white">
          {([0, 1] as Side[]).map((s) => (
            <div key={s} className="flex items-center gap-2 py-1">
              <span className="w-24 truncate text-xs font-bold">{ms.teams[s].name}</span>
              <div className="flex flex-1 gap-1">
                {row(s).map((k, i) => (
                  <span
                    key={i}
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-black ${!k ? "bg-white/15" : k.scored ? "bg-emerald-400 text-emerald-950" : "bg-red-400 text-red-950"}`}
                  >
                    {k ? (k.scored ? "○" : "×") : ""}
                  </span>
                ))}
              </div>
              <span className="w-6 text-right font-mono text-xl font-black">{pk.score[s]}</span>
            </div>
          ))}
        </div>

        {!ordered ? (
          <>
            <p className="text-sm">
              キッカーの順番を決めてください（ピッチにいる11人。5人ずつ蹴って決着しなければサドンデス）。
            </p>
            <ol className="flex flex-col gap-1">
              {order.map((id, i) => {
                const p = team.players[id];
                return (
                  <li key={id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2">
                    <span className="w-6 text-center font-black text-pitch-dark">{i + 1}</span>
                    <span className="flex-1 truncate text-sm font-bold">{p.name}</span>
                    <span className="text-[10px] text-gray-500">PK {p.stats.pkSkill}</span>
                    <button type="button" className="min-h-10 min-w-10 text-lg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上へ">
                      ↑
                    </button>
                    <button type="button" className="min-h-10 min-w-10 text-lg disabled:opacity-30" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="下へ">
                      ↓
                    </button>
                  </li>
                );
              })}
            </ol>
            <Button onClick={start}>PK戦を始める</Button>
          </>
        ) : (
          <div className="rounded-xl border border-gray-200 p-4 text-center">
            {last ? (
              <>
                <p className="text-xs text-gray-500">{ms.teams[last.side].name}</p>
                <p className="text-lg font-black">{name(last.side, last.kickerId)}</p>
                <p className={`mt-1 text-2xl font-black ${last.scored ? "text-emerald-600" : "text-red-600"}`}>
                  {last.result === "goal" ? (last.kickerWonRead ? "GKの逆を突いて成功！" : "読まれたが決めた！") : last.result === "saved" ? "GKが止めた！" : "枠を外した…"}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">1人目のキッカーが向かう…</p>
            )}
          </div>
        )}

        {pk.done && (
          <>
            <p className="text-center text-xl font-black">{pk.winner === side ? "PK戦に勝利！" : "PK戦で敗れた…"}</p>
            <Button onClick={finishMatch}>結果へ</Button>
          </>
        )}
      </div>
    </main>
  );
}
