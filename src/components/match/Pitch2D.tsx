"use client";

import { useMemo } from "react";
import { buildTimeline, frameAt } from "@/engine/replay";
import { KIT_PALETTE } from "@/engine/config/look";
import { gkKit, numberColor } from "@/engine/look";
import type { MatchState, Side } from "@/engine/match/types";

/** ピッチの大きさ（m。SVG の座標では横長に置く：横 = 長さ L、縦 = 幅 W） */
const W = 68;
const L = 105;

/**
 * 簡易2D（P3。R1 で横画面向けに横長にした）：演出タイムラインを上から見たピッチで再生する。自校は左から右へ攻める。
 * 選手は丸と背番号。丸はその試合のユニフォームのメインの色で塗る（P4。GK は GK の色）
 */
export function Pitch2D({ ms, display, userSide }: { ms: MatchState; display: number; userSide: Side }) {
  // イベントが増えたとき（区間を計算したとき）だけ作り直す
  const count = ms.events.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tl = useMemo(() => buildTimeline(ms), [ms, count]);
  const f = frameAt(ms, tl, display);
  const flip = userSide === 1;
  // タイムラインの座標（x：幅の向き、y：自校から見て 0 が相手のゴール）を、横長の画面の座標にする
  const sx = (_x: number, y: number) => (1 - (flip ? 1 - y : y)) * L;
  const sy = (x: number) => (flip ? 1 - x : x) * W;
  const at = (x: number, y: number) => `translate(${sx(x, y)}px, ${sy(x)}px)`;
  const move = { transition: "transform 110ms linear" } as const;

  return (
    <svg viewBox={`-3 -2 ${L + 6} ${W + 4}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img" aria-label="試合の2D表示">
      <rect x={-3} y={-2} width={L + 6} height={W + 4} fill="#1d3b2b" />
      {Array.from({ length: 10 }, (_, i) => (i % 2 ? <rect key={i} x={(i * L) / 10} y={0} width={L / 10} height={W} fill="#22442f" /> : null))}
      <g fill="none" stroke="rgba(246,243,234,0.7)" strokeWidth={0.4}>
        <rect x={0} y={0} width={L} height={W} />
        <line x1={L / 2} y1={0} x2={L / 2} y2={W} />
        <circle cx={L / 2} cy={W / 2} r={9.15} />
        <rect x={0} y={W / 2 - 20.16} width={16.5} height={40.32} />
        <rect x={L - 16.5} y={W / 2 - 20.16} width={16.5} height={40.32} />
        <rect x={0} y={W / 2 - 9.16} width={5.5} height={18.32} />
        <rect x={L - 5.5} y={W / 2 - 9.16} width={5.5} height={18.32} />
        <rect x={-1.5} y={W / 2 - 3.66} width={1.5} height={7.32} />
        <rect x={L} y={W / 2 - 3.66} width={1.5} height={7.32} />
      </g>
      {f.flight && <line x1={sx(f.flight.from.x, f.flight.from.y)} y1={sy(f.flight.from.x)} x2={sx(f.flight.to.x, f.flight.to.y)} y2={sy(f.flight.to.x)} stroke="rgba(255,255,255,0.7)" strokeWidth={0.4} strokeDasharray="1.2 1.2" />}
      {f.dots.map((d) => {
        const mine = d.side === userSide;
        const view = ms.view;
        const num = ms.teams[d.side].players[d.id]?.num ?? d.num;
        if (!view)
          return (
            <g key={d.id} style={{ ...move, transform: at(d.x, d.y) }}>
              <circle r={2.1} fill={mine ? (d.gk ? "#c99d05" : "#f2c21b") : d.gk ? "#2f6f9e" : "#7cc8ff"} stroke="rgba(0,0,0,0.45)" strokeWidth={0.3} />
              <text y={0.95} textAnchor="middle" fontSize={2.6} fontWeight={700} fill="#0f1512">
                {num}
              </text>
            </g>
          );
        const kit = d.gk ? gkKit(view.gk[d.side]) : view.kits[d.side];
        return (
          <g key={d.id} style={{ ...move, transform: at(d.x, d.y) }}>
            <circle r={2.1} fill={KIT_PALETTE[kit.main]} stroke={KIT_PALETTE[kit.sub]} strokeWidth={0.45} />
            <text y={0.95} textAnchor="middle" fontSize={2.6} fontWeight={700} fill={numberColor(kit) === 1 ? "#1c1c1e" : "#ffffff"}>
              {num}
            </text>
          </g>
        );
      })}
      <g style={{ ...move, transform: at(f.ball.x, f.ball.y) }}>
        <circle r={1.05} fill="#fff" stroke="#111" strokeWidth={0.3} />
      </g>
    </svg>
  );
}
