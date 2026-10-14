"use client";

import { useEffect, useState } from "react";
import { KIT_PALETTE } from "@/engine/config/look";
import { POSITION_NAMES } from "@/engine/config/names";
import { pendingMatchLabel } from "@/engine/game";
import { stepPk } from "@/engine/match/engine";
import { autoPkOrder, setPkOrder } from "@/engine/match/pk";
import type { MatchState, PkKick, Side } from "@/engine/match/types";
import { useGameStore } from "@/store/gameStore";
import { Icon } from "../icons";
import { PlayerFace } from "../look/Figure";
import { usePortrait } from "../shell/usePortrait";
import { Button, IconButton, Label, Screen } from "../ui";
import { visibleScore } from "./broadcast";

/** 1 本ずつの結果の印（○ 成功・× 失敗。まだなら空き） */
function KickRow({ ms, side }: { ms: MatchState; side: Side }) {
  const pk = ms.pk!;
  const kicks = pk.kicks.filter((k) => k.side === side);
  const cells = Math.max(5, kicks.length);
  const kit = ms.view?.kits[side];
  return (
    <div className="flex min-w-0 items-center gap-2 bg-panel px-2 py-1">
      <span className="h-4 w-1.5 shrink-0" style={{ background: kit ? KIT_PALETTE[kit.main] : side === 0 ? "#f2c21b" : "#7cc8ff" }} />
      <span className="w-[8.5rem] shrink-0 truncate text-[0.8125rem] font-black">{ms.teams[side].name}</span>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: cells }, (_, i) => kicks[i]).map((k, i) => (
          <span
            key={i}
            className={`font-num flex h-6 w-6 shrink-0 -skew-x-12 items-center justify-center text-[0.875rem] ${!k ? "bg-panel-3 text-text-3" : k.scored ? "bg-good text-ink" : "bg-red text-white"}`}
          >
            <span className={`skew-x-12 ${k ? "font-body text-[1rem] font-black" : ""}`}>{k ? (k.scored ? "○" : "×") : i + 1}</span>
          </span>
        ))}
      </div>
      <span className="font-num w-7 text-right text-[1.375rem] text-yellow">{pk.score[side]}</span>
    </div>
  );
}

/** ゴールの絵と、直前の 1 本の結果 */
function GoalView({ ms, last }: { ms: MatchState; last: PkKick | null }) {
  const p = last ? ms.teams[last.side].players[last.kickerId] : undefined;
  const kit = last ? ms.view?.kits[last.side] : undefined;
  const text = last ? (last.result === "goal" ? (last.kickerWonRead ? "GKの逆を突いて成功" : "読まれたが決めた") : last.result === "saved" ? "GKが止めた" : "枠を外した") : "";
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-panel">
      <svg viewBox="0 0 300 130" className="absolute inset-x-0 top-2 mx-auto h-[55%] w-auto" aria-hidden>
        <rect x={0} y={110} width={300} height={20} fill="#22442f" />
        <g stroke="rgba(246,243,234,0.25)" strokeWidth={1}>
          {Array.from({ length: 23 }, (_, i) => (
            <line key={`v${i}`} x1={40 + i * 10} y1={22} x2={40 + i * 10} y2={110} />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`h${i}`} x1={40} y1={22 + i * 10} x2={260} y2={22 + i * 10} />
          ))}
        </g>
        <path d="M36 112V18h228v94" fill="none" stroke="#f6f3ea" strokeWidth={7} strokeLinejoin="miter" />
        {last && <circle key={ms.pk!.kicks.length} className="anim-pop" cx={last.result === "miss" ? 278 : last.scored ? (ms.pk!.kicks.length % 2 ? 80 : 220) : 150} cy={last.result === "miss" ? 12 : 60} r={9} fill="#ffffff" stroke="#0f1512" strokeWidth={2} />}
      </svg>
      <div className="relative mt-auto flex w-full flex-col items-center pb-3">
        {last ? (
          <div key={ms.pk!.kicks.length} className="flex flex-col items-center">
            <div className="flex items-center gap-2 bg-panel/90 px-3 py-1">
              {p?.look && <PlayerFace look={p.look} kit={kit} size={34} expr={last.scored ? "joy" : "sad"} />}
              <span className="min-w-0">
                <span className="block truncate text-[0.75rem] font-bold text-text-3">{ms.teams[last.side].name}</span>
                <span className="block truncate text-[1rem] font-black">{p?.name}</span>
              </span>
            </div>
            <div className={`cut-lr font-head anim-band-in mt-1 px-8 py-1 text-[1.375rem] ${last.scored ? "bg-yellow text-ink" : "bg-red text-white"}`}>{text}</div>
          </div>
        ) : (
          <p className="bg-panel px-3 py-1 text-[0.875rem] font-bold text-text-2">1人目のキッカーが向かう…</p>
        )}
      </div>
    </div>
  );
}

/** 蹴る順番の一覧（蹴った人には結果の印） */
function OrderList({ ms, side, title }: { ms: MatchState; side: Side; title: string }) {
  const pk = ms.pk!;
  const kicks = pk.kicks.filter((k) => k.side === side);
  const kit = ms.view?.kits[side];
  const next = kicks.length % Math.max(1, pk.order[side].length);
  return (
    <section className="flex min-h-0 w-[13rem] shrink-0 flex-col bg-panel">
      <Label className="!mb-0 px-2 pt-1">{title}</Label>
      <ol className="scroll-y min-h-0 flex-1">
        {pk.order[side].map((id, i) => {
          const p = ms.teams[side].players[id];
          const done = kicks.filter((k) => k.kickerId === id);
          const lastKick = done.at(-1);
          return (
            <li key={id} className={`flex min-h-8 items-center gap-1.5 border-b border-line px-1.5 ${!pk.done && i === next ? "bg-panel-3" : ""}`}>
              <span className="font-num w-4 text-center text-[0.8125rem] text-yellow">{i + 1}</span>
              {p?.look && <PlayerFace look={p.look} kit={kit} size={22} />}
              <span className="min-w-0 flex-1 truncate text-[0.75rem] font-bold">{p?.name}</span>
              {lastKick && <span className={`text-[0.875rem] font-black ${lastKick.scored ? "text-good" : "text-bad"}`}>{lastKick.scored ? "○" : "×"}</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** PK 戦：プレイヤーが決められるのはキッカーの順番だけ（SPEC 10.6）。中央にゴールと結果、左右に両チームの順番 */
export function PkScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const touch = useGameStore((s) => s.touch);
  const finishMatch = useGameStore((s) => s.finishMatch);
  const speed = useGameStore((s) => s.settings.matchSpeed);
  const portrait = usePortrait();
  const am = game.activeMatch!;
  const ms = am.state;
  const pk = ms.pk!;
  const side = am.userSide;
  const opp: Side = side === 0 ? 1 : 0;
  const team = ms.teams[side];
  const ordered = pk.order[side].length > 0;
  const [order, setOrder] = useState<string[]>(() => (ordered ? pk.order[side] : autoPkOrder(team)));
  const [last, setLast] = useState<PkKick | null>(null);
  const label = pendingMatchLabel(game);

  // 1 本ずつ蹴って結果を演出する（縦に持っている間は止める）
  useEffect(() => {
    if (!ordered || pk.done || portrait) return;
    const id = setTimeout(() => {
      const kick = stepPk(ms);
      setLast(kick);
      touch(true);
    }, 1600 / speed);
    return () => clearTimeout(id);
  }, [ordered, pk.done, pk.kicks.length, ms, speed, touch, portrait]);

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

  const kit = ms.view?.kits[side];

  if (!ordered)
    return (
      <Screen
        title="PK戦"
        sub={label}
        right={
          <Button icon="whistle" cut onClick={start}>
            PK戦を始める
          </Button>
        }
      >
        <div className="flex min-h-0 flex-1 gap-2">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-panel">
            <Label className="!mb-0 px-2 pt-1">キッカーの順番（ピッチにいる11人）</Label>
            <ol className="scroll-y grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-2 p-1">
              {order.map((id, i) => {
                const p = team.players[id];
                return (
                  <li key={id} className="flex min-h-11 items-center gap-1.5 border-b border-line">
                    <span className="font-num w-5 text-center text-[1rem] text-yellow">{i + 1}</span>
                    {p.look && <PlayerFace look={p.look} kit={kit} size={28} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-bold">{p.name}</span>
                      <span className="block text-[0.6875rem] text-text-3">
                        {POSITION_NAMES[p.mainPosition]}・PK <b className="font-num text-text">{p.stats.pkSkill}</b>
                      </span>
                    </span>
                    <IconButton name="up" label="上へ" className="!min-h-10 !min-w-9" disabled={i === 0} onClick={() => move(i, -1)} />
                    <IconButton name="down" label="下へ" className="!min-h-10 !min-w-9" disabled={i === order.length - 1} onClick={() => move(i, 1)} />
                  </li>
                );
              })}
            </ol>
          </section>
          <aside className="flex w-[15rem] shrink-0 flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              {([0, 1] as Side[]).map((sd) => (
                <div key={sd} className="flex items-center gap-2 bg-panel px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-black">{ms.teams[sd].name}</span>
                  <span className="font-num text-[1.125rem] text-yellow">{visibleScore(ms, ms.minute)[sd]}</span>
                </div>
              ))}
              <p className="bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-bold text-text-3">{ms.rules.halfMinutes * 2}分{ms.rules.extraTimeHalfMinutes ? "と延長" : ""}で決着せず</p>
            </div>
            <p className="bg-panel p-2 text-[0.8125rem] leading-relaxed text-text-2">
              <Icon name="pk" size={16} className="mr-1 align-[-3px] text-yellow" />
              5人ずつ蹴って、決着しなければ6人目からサドンデス。順番は上下のボタンで入れ替えます。最初の並びは PK のうまい順です。
            </p>
          </aside>
        </div>
      </Screen>
    );

  return (
    <Screen
      title="PK戦"
      sub={label}
      right={
        pk.done ? (
          <Button icon="next" cut onClick={finishMatch}>
            結果へ
          </Button>
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <KickRow ms={ms} side={0} />
          <KickRow ms={ms} side={1} />
        </div>
        <div className="flex min-h-0 flex-1 gap-1.5">
          <OrderList ms={ms} side={side} title={`${ms.teams[side].name}の順番`} />
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <GoalView ms={ms} last={last} />
            {pk.done && (
              <div className={`cut-lr font-head anim-band-in absolute inset-x-6 top-1/3 py-2 text-center text-[1.75rem] ${pk.winner === side ? "bg-yellow text-ink" : "bg-red text-white"}`}>
                {pk.winner === side ? "PK戦に勝利" : "PK戦で敗れた"}
              </div>
            )}
          </div>
          <OrderList ms={ms} side={opp} title={`${ms.teams[opp].name}の順番`} />
        </div>
      </div>
    </Screen>
  );
}
