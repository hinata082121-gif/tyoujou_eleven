"use client";

import { useMemo } from "react";
import { buildTimeline, frameAt } from "@/engine/replay";
import type { MatchState, Side } from "@/engine/match/types";

/** ピッチの大きさ（SVG の座標。縦長） */
const W = 68;
const H = 105;

/**
 * 簡易2D（P3）：演出タイムラインを上から見たピッチで再生する。自校は下から上へ攻める。
 * 選手は丸と番号だけ（独自デザインのキャラクターは P4）
 */
export function Pitch2D({ ms, display, userSide }: { ms: MatchState; display: number; userSide: Side }) {
  // イベントが増えたとき（区間を計算したとき）だけ作り直す
  const count = ms.events.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tl = useMemo(() => buildTimeline(ms), [ms, count]);
  const f = frameAt(ms, tl, display);
  const flip = userSide === 1;
  const px = (x: number) => (flip ? 1 - x : x) * W;
  const py = (y: number) => (flip ? 1 - y : y) * H;
  const move = { transition: "transform 110ms linear" } as const;

  return (
    <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="h-full w-full" role="img" aria-label="試合の2D表示">
      <rect x={-2} y={-2} width={W + 4} height={H + 4} className="fill-pitch" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={0} y={(i * H) / 7} width={W} height={H / 14} fill="rgba(255,255,255,0.04)" />
      ))}
      <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={0.35}>
        <rect x={0} y={0} width={W} height={H} />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} />
        <circle cx={W / 2} cy={H / 2} r={9.15} />
        <rect x={W / 2 - 20.16} y={0} width={40.32} height={16.5} />
        <rect x={W / 2 - 20.16} y={H - 16.5} width={40.32} height={16.5} />
        <rect x={W / 2 - 9.16} y={0} width={18.32} height={5.5} />
        <rect x={W / 2 - 9.16} y={H - 5.5} width={18.32} height={5.5} />
        <rect x={W / 2 - 3.66} y={-1.5} width={7.32} height={1.5} />
        <rect x={W / 2 - 3.66} y={H} width={7.32} height={1.5} />
      </g>
      {f.flight && <line x1={px(f.flight.from.x)} y1={py(f.flight.from.y)} x2={px(f.flight.to.x)} y2={py(f.flight.to.y)} stroke="rgba(255,255,255,0.6)" strokeWidth={0.4} strokeDasharray="1.2 1.2" />}
      {f.dots.map((d) => {
        const mine = d.side === userSide;
        return (
          <g key={d.id} style={{ ...move, transform: `translate(${px(d.x)}px, ${py(d.y)}px)` }}>
            <circle r={2.1} className={mine ? (d.gk ? "fill-amber-600" : "fill-amber-300") : d.gk ? "fill-sky-700" : "fill-sky-300"} stroke="rgba(0,0,0,0.45)" strokeWidth={0.3} />
            <text y={0.95} textAnchor="middle" fontSize={2.6} fontWeight={700} className="fill-gray-900">
              {d.num}
            </text>
          </g>
        );
      })}
      <g style={{ ...move, transform: `translate(${px(f.ball.x)}px, ${py(f.ball.y)}px)` }}>
        <circle r={1.05} fill="#fff" stroke="#111" strokeWidth={0.3} />
      </g>
    </svg>
  );
}
