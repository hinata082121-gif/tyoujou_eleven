"use client";

import { useId } from "react";
import { BROWS, EYES, HAIR_COLORS, HAIR_STYLES, KIT_PALETTE, KIT_TEMPLATES, MOUTHS, SKIN_TONES } from "@/engine/config/look";
import { gkKit, numberColor } from "@/engine/look";
import type { Kit, Look } from "@/engine/types";

/**
 * 選手の顔・全身とユニフォームの絵（SVG。P4）。3D と同じ形・柄・色にする。
 * 3D のコード（three）は使わない（選手の詳細・ユニフォームの設定・学校作成で使うため）
 */

export type Expression = "normal" | "focus" | "joy" | "sad";

const col = (c: number) => KIT_PALETTE[c] ?? KIT_PALETTE[0];
const pick = <T extends { id: string }>(list: readonly T[], i: number) => (list[i] ?? list[0]).id;
const hex = (list: readonly { hex: string }[], i: number) => (list[i] ?? list[0]).hex;

const DEFAULT_LOOK: Look = { hair: 0, hairColor: 0, skin: 2, eyes: 1, brows: 0, mouth: 1 };

/** 顔のパーツ（頭の中心 cx, cy、半径 r に合わせて描く） */
function Face({ look, expr, cx, cy, r }: { look: Look; expr: Expression; cx: number; cy: number; r: number }) {
  const s = r / 28;
  const ink = "#2a1d18";
  const eyeY = cy + 4 * s;
  const eye = expr === "joy" ? "smile" : expr === "sad" ? "sad" : pick(EYES, look.eyes);
  const brow = pick(BROWS, look.brows);
  const tilt = expr === "sad" ? -4 : expr === "focus" ? 4 : brow === "up" ? 3 : brow === "worried" ? -3 : 0;
  const bw = brow === "thick" ? 3 : brow === "thin" ? 1.2 : 2;
  const mouth = expr === "joy" ? "open" : expr === "sad" ? "frown" : expr === "focus" ? "flat" : pick(MOUTHS, look.mouth);
  const my = cy + 17 * s;
  return (
    <g stroke={ink} fill={ink} strokeLinecap="round">
      <ellipse cx={cx - 13 * s} cy={cy + 12 * s} rx={4 * s} ry={2.4 * s} fill="rgba(240,120,110,0.3)" stroke="none" />
      <ellipse cx={cx + 13 * s} cy={cy + 12 * s} rx={4 * s} ry={2.4 * s} fill="rgba(240,120,110,0.3)" stroke="none" />
      {[-1, 1].map((d) => {
        const ex = cx + d * 9 * s;
        switch (eye) {
          case "dot":
            return <circle key={d} cx={ex} cy={eyeY} r={2 * s} stroke="none" />;
          case "oval":
            return (
              <g key={d} stroke="none">
                <ellipse cx={ex} cy={eyeY} rx={2.2 * s} ry={3.4 * s} />
                <circle cx={ex + 0.7 * s} cy={eyeY - 1.3 * s} r={0.8 * s} fill="#fff" />
              </g>
            );
          case "round":
            return (
              <g key={d} stroke="none">
                <circle cx={ex} cy={eyeY} r={3.2 * s} />
                <circle cx={ex + 1 * s} cy={eyeY - 1.3 * s} r={1.1 * s} fill="#fff" />
              </g>
            );
          case "narrow":
            return <line key={d} x1={ex - 3 * s} y1={eyeY} x2={ex + 3 * s} y2={eyeY} strokeWidth={1.6 * s} />;
          case "droopy":
            return <ellipse key={d} cx={ex} cy={eyeY + 0.6 * s} rx={2.2 * s} ry={2.8 * s} transform={`rotate(${d * 20} ${ex} ${eyeY})`} stroke="none" />;
          case "sharp":
            return <ellipse key={d} cx={ex} cy={eyeY} rx={2.6 * s} ry={2 * s} transform={`rotate(${-d * 18} ${ex} ${eyeY})`} stroke="none" />;
          case "smile":
            return <path key={d} d={`M${ex - 3 * s},${eyeY + 1 * s} Q${ex},${eyeY - 3 * s} ${ex + 3 * s},${eyeY + 1 * s}`} fill="none" strokeWidth={1.6 * s} />;
          default:
            return <path key={d} d={`M${ex - 3 * s},${eyeY - 1 * s} Q${ex},${eyeY + 3 * s} ${ex + 3 * s},${eyeY - 1 * s}`} fill="none" strokeWidth={1.6 * s} />;
        }
      })}
      {[-1, 1].map((d) => {
        const bx = cx + d * 9 * s;
        const by = cy - 4 * s;
        return <line key={`b${d}`} x1={bx - d * 4 * s} y1={by + tilt * 0.2 * s} x2={bx + d * 4 * s} y2={by - tilt * s} strokeWidth={bw * s} />;
      })}
      {mouth === "flat" && <line x1={cx - 3 * s} y1={my} x2={cx + 3 * s} y2={my} strokeWidth={1.4 * s} />}
      {mouth === "smallSmile" && <path d={`M${cx - 3 * s},${my - 1 * s} Q${cx},${my + 2 * s} ${cx + 3 * s},${my - 1 * s}`} fill="none" strokeWidth={1.4 * s} />}
      {mouth === "wide" && <path d={`M${cx - 5 * s},${my - 1.5 * s} Q${cx},${my + 3 * s} ${cx + 5 * s},${my - 1.5 * s}`} fill="none" strokeWidth={1.4 * s} />}
      {mouth === "o" && <ellipse cx={cx} cy={my} rx={1.6 * s} ry={2 * s} fill="none" strokeWidth={1.3 * s} />}
      {mouth === "open" && <path d={`M${cx - 4.5 * s},${my - 1.5 * s} Q${cx},${my + 6 * s} ${cx + 4.5 * s},${my - 1.5 * s} Z`} fill="#7a2a2a" stroke="none" />}
      {mouth === "frown" && <path d={`M${cx - 3.5 * s},${my + 1.5 * s} Q${cx},${my - 2 * s} ${cx + 3.5 * s},${my + 1.5 * s}`} fill="none" strokeWidth={1.4 * s} />}
    </g>
  );
}

/** 髪（前から。頭の中心 cx, cy、半径 r） */
function Hair({ look, cx, cy, r, back = false }: { look: Look; cx: number; cy: number; r: number; back?: boolean }) {
  const c = hex(HAIR_COLORS, look.hairColor);
  const style = pick(HAIR_STYLES, look.hair);
  const s = r / 28;
  const top = cy - r - 2 * s;
  if (back) {
    // 後ろから：頭のほとんどが髪
    const low = style === "long" ? cy + r * 0.85 : style === "buzz" ? cy + r * 0.55 : cy + r * 0.62;
    return <path d={`M${cx - r - 1 * s},${cy} A${r + 1 * s},${r + 1 * s} 0 0 1 ${cx + r + 1 * s},${cy} L${cx + r * 0.9},${low} Q${cx},${low + 6 * s} ${cx - r * 0.9},${low} Z`} fill={c} opacity={style === "buzz" ? 0.8 : 1} />;
  }
  const cap = (fringeY: number, w = 1.06) => `M${cx - r * w},${cy + 2 * s} C${cx - r * w},${top - 4 * s} ${cx + r * w},${top - 4 * s} ${cx + r * w},${cy + 2 * s} L${cx + r * 0.8},${fringeY} Q${cx},${fringeY - 5 * s} ${cx - r * 0.8},${fringeY} Z`;
  switch (style) {
    case "buzz":
      return <path d={cap(cy - 12 * s, 1.0)} fill={c} opacity={0.75} />;
    case "long":
      return (
        <g fill={c}>
          <path d={cap(cy - 8 * s, 1.1)} />
          <path d={`M${cx - r * 1.1},${cy} L${cx - r * 1.05},${cy + r * 0.75} L${cx - r * 0.78},${cy + r * 0.6} L${cx - r * 0.8},${cy - 4 * s} Z`} />
          <path d={`M${cx + r * 1.1},${cy} L${cx + r * 1.05},${cy + r * 0.75} L${cx + r * 0.78},${cy + r * 0.6} L${cx + r * 0.8},${cy - 4 * s} Z`} />
        </g>
      );
    case "twoBlock":
      return (
        <g>
          <path d={cap(cy - 6 * s, 1.02)} fill="#9a9a9a" opacity={0.55} />
          <path d={`M${cx - r * 0.95},${cy - 10 * s} C${cx - r},${top - 8 * s} ${cx + r},${top - 8 * s} ${cx + r * 0.95},${cy - 10 * s} Q${cx},${cy - 18 * s} ${cx - r * 0.95},${cy - 10 * s} Z`} fill={c} />
        </g>
      );
    case "curly":
      return (
        <g fill={c}>
          <path d={cap(cy - 9 * s, 1.06)} />
          {Array.from({ length: 9 }, (_, i) => {
            const a = Math.PI * (1.05 + (i / 8) * 0.9);
            return <circle key={i} cx={cx + Math.cos(a) * r * 1.0} cy={cy - 2 * s + Math.sin(a) * r * 1.0} r={6.5 * s} />;
          })}
        </g>
      );
    case "spiky":
      return (
        <g fill={c}>
          <path d={cap(cy - 9 * s, 1.05)} />
          {Array.from({ length: 7 }, (_, i) => {
            const a = Math.PI * (1.1 + (i / 6) * 0.8);
            const bx = cx + Math.cos(a) * r * 0.95,
              by = cy + Math.sin(a) * r * 0.95;
            const tx = cx + Math.cos(a) * r * 1.35,
              ty = cy + Math.sin(a) * r * 1.35;
            const nx = -Math.sin(a) * 5 * s,
              ny = Math.cos(a) * 5 * s;
            return <path key={i} d={`M${bx + nx},${by + ny} L${tx},${ty} L${bx - nx},${by - ny} Z`} />;
          })}
        </g>
      );
    case "bowl":
      return <path d={`M${cx - r * 1.1},${cy + 4 * s} C${cx - r * 1.1},${top - 5 * s} ${cx + r * 1.1},${top - 5 * s} ${cx + r * 1.1},${cy + 4 * s} L${cx + r * 0.85},${cy - 5 * s} L${cx - r * 0.85},${cy - 5 * s} Z`} fill={c} />;
    case "centerPart":
      return (
        <g fill={c}>
          <path d={`M${cx - r * 1.08},${cy + 4 * s} C${cx - r * 1.08},${top - 4 * s} ${cx - 2 * s},${top - 6 * s} ${cx - 1 * s},${top + 2 * s} Q${cx - r * 0.5},${cy - 14 * s} ${cx - r * 0.82},${cy - 2 * s} Z`} />
          <path d={`M${cx + r * 1.08},${cy + 4 * s} C${cx + r * 1.08},${top - 4 * s} ${cx + 2 * s},${top - 6 * s} ${cx + 1 * s},${top + 2 * s} Q${cx + r * 0.5},${cy - 14 * s} ${cx + r * 0.82},${cy - 2 * s} Z`} />
        </g>
      );
    default:
      return <path d={cap(cy - 10 * s)} fill={c} />;
  }
}

/** 顔だけ（選手の一覧・詳細など） */
export function PlayerFace({ look = DEFAULT_LOOK, expr = "normal", size = 48, kit }: { look?: Look; expr?: Expression; size?: number; kit?: Kit }) {
  const skin = hex(SKIN_TONES, look.skin);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="選手の顔">
      {kit && <path d="M10,64 Q12,50 32,50 Q52,50 54,64 Z" fill={col(kit.main)} />}
      <circle cx={10} cy={33} r={4.5} fill={skin} />
      <circle cx={54} cy={33} r={4.5} fill={skin} />
      <ellipse cx={32} cy={30} rx={22} ry={21} fill={skin} />
      <Face look={look} expr={expr} cx={32} cy={30} r={22} />
      <Hair look={look} cx={32} cy={30} r={22} />
    </svg>
  );
}

/** 胴の柄（胴の領域に描く。back は後ろから見た絵なので左右が逆） */
function Pattern({ kit, back, x, y, w, h }: { kit: Kit; back: boolean; x: number; y: number; w: number; h: number }) {
  const t = KIT_TEMPLATES[kit.template] ?? "solid";
  const sub = col(kit.sub);
  switch (t) {
    case "vstripe":
      return <g fill={sub}>{Array.from({ length: 4 }, (_, i) => <rect key={i} x={x + w * (0.1 + i * 0.22)} y={y} width={w * 0.11} height={h} />)}</g>;
    case "pinstripe":
      return <g fill={sub}>{Array.from({ length: 12 }, (_, i) => <rect key={i} x={x + w * (0.04 + i * 0.083)} y={y} width={w * 0.018} height={h} />)}</g>;
    case "hoop":
      return <g fill={sub}>{Array.from({ length: 4 }, (_, i) => <rect key={i} x={x} y={y + h * (0.12 + i * 0.24)} width={w} height={h * 0.12} />)}</g>;
    case "half":
      return <rect x={back ? x + w / 2 : x} y={y} width={w / 2} height={h} fill={sub} />;
    case "sash":
      return back ? (
        <path d={`M${x},${y} L${x + w * 0.2},${y} L${x + w},${y + h * 0.85} L${x + w},${y + h} L${x + w * 0.8},${y + h} L${x},${y + h * 0.15} Z`} fill={sub} />
      ) : (
        <path d={`M${x + w},${y} L${x + w * 0.8},${y} L${x},${y + h * 0.85} L${x},${y + h} L${x + w * 0.2},${y + h} L${x + w},${y + h * 0.15} Z`} fill={sub} />
      );
    case "shoulder":
      return <rect x={x} y={y} width={w} height={h * 0.22} fill={sub} />;
    case "chestBand":
      return <rect x={x} y={y + h * 0.28} width={w} height={h * 0.2} fill={sub} />;
    default:
      return null;
  }
}

/** 袖の色（テンプレートで変わる。side：-1 = 絵の左） */
function sleeveColor(kit: Kit, side: -1 | 1, back: boolean) {
  const t = KIT_TEMPLATES[kit.template] ?? "solid";
  if (t === "shoulder") return col(kit.sub);
  if (t === "half") return (side < 0) !== back ? col(kit.sub) : col(kit.main);
  return col(kit.main);
}

/**
 * 全身（前か後ろ）。height・build は体型の倍率（bodyScale）。number は背番号
 */
export function KitFigure({
  kit,
  number,
  back = false,
  look = DEFAULT_LOOK,
  expr = "normal",
  height = 1,
  build = 1,
  size = 120,
}: {
  kit: Kit;
  number?: number;
  back?: boolean;
  look?: Look;
  expr?: Expression;
  height?: number;
  build?: number;
  size?: number;
}) {
  const clip = useId();
  const skin = hex(SKIN_TONES, look.skin);
  // 体の寸法（頭の大きさは変えず、胴と脚を身長で伸ばす）
  const w = 40 * build;
  const cx = 50;
  const headR = 26;
  const torsoH = 42 * height;
  const legH = 30 * height;
  const torsoY = 66;
  const hipY = torsoY + torsoH;
  const legY = hipY + 12;
  const total = legY + legH + 10;
  const tx = cx - w / 2;
  const numC = numberColor(kit) === 1 ? "#1c1c1e" : "#ffffff";
  const armW = 10 * build;
  return (
    <svg viewBox={`0 0 100 ${total}`} width={(size * 100) / total} height={size} role="img" aria-label={back ? "ユニフォーム（後ろ）" : "ユニフォーム（前）"}>
      <ellipse cx={cx} cy={total - 5} rx={w * 0.55} ry={3.5} fill="rgba(0,0,0,0.18)" />
      {/* 脚（パンツの下 → 膝の肌 → ソックス）と靴 */}
      {[-1, 1].map((d) => {
        const lx = cx + d * w * 0.2 - 5.5 * build;
        return (
          <g key={d}>
            <rect x={lx} y={legY - 4} width={11 * build} height={legH + 4} rx={5 * build} fill={skin} />
            <rect x={lx} y={legY + legH * 0.38} width={11 * build} height={legH * 0.62} rx={4 * build} fill={col(kit.socks)} />
            <ellipse cx={lx + 5.5 * build} cy={legY + legH + 2} rx={7 * build} ry={4} fill="#222" />
          </g>
        );
      })}
      {/* パンツ */}
      <path d={`M${tx + 2},${hipY - 4} L${tx + w - 2},${hipY - 4} L${tx + w + 1},${legY + 2} L${cx + 1},${legY + 2} L${cx},${legY - 3} L${cx - 1},${legY + 2} L${tx - 1},${legY + 2} Z`} fill={col(kit.shorts)} />
      {/* 腕（肩で胴につながる。袖 → 肌） */}
      {([-1, 1] as const).map((d) => {
        const ax = d < 0 ? tx - armW * 0.55 : tx + w - armW * 0.45;
        const rot = d * -12;
        return (
          <g key={d} transform={`rotate(${rot} ${ax + armW / 2} ${torsoY + 6})`}>
            <rect x={ax} y={torsoY + 2} width={armW} height={torsoH * 0.85} rx={armW / 2} fill={skin} />
            <rect x={ax} y={torsoY + 2} width={armW} height={torsoH * 0.4} rx={armW / 2} fill={sleeveColor(kit, d, back)} />
          </g>
        );
      })}
      {/* 胴（丸みのある形）と柄 */}
      <clipPath id={clip}>
        <rect x={tx} y={torsoY} width={w} height={torsoH} rx={13 * build} />
      </clipPath>
      <rect x={tx} y={torsoY} width={w} height={torsoH} rx={13 * build} fill={col(kit.main)} />
      <g clipPath={`url(#${clip})`}>
        <Pattern kit={kit} back={back} x={tx} y={torsoY} w={w} h={torsoH} />
        {/* 襟 */}
        <path d={`M${cx - 8},${torsoY} Q${cx},${torsoY + (back ? 3 : 8)} ${cx + 8},${torsoY}`} fill="none" stroke={col(kit.sub === kit.main ? (kit.main === 0 ? 1 : 0) : kit.sub)} strokeWidth={2.5} />
      </g>
      {number !== undefined &&
        (back ? (
          <text x={cx} y={torsoY + torsoH * 0.62} textAnchor="middle" fontSize={torsoH * 0.48} fontWeight={900} fill={numC} stroke={numC === "#ffffff" ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.6)"} strokeWidth={1} style={{ fontFamily: "Arial Black, Arial, sans-serif" }}>
            {number}
          </text>
        ) : (
          <text x={cx + w * 0.22} y={torsoY + torsoH * 0.32} textAnchor="middle" fontSize={torsoH * 0.18} fontWeight={900} fill={numC}>
            {number}
          </text>
        ))}
      {/* 頭（首はなく胴にのせる） */}
      <circle cx={cx - headR + 1} cy={42} r={4.5} fill={skin} />
      <circle cx={cx + headR - 1} cy={42} r={4.5} fill={skin} />
      <ellipse cx={cx} cy={39} rx={headR} ry={headR * 0.95} fill={skin} />
      {!back && <Face look={look} expr={expr} cx={cx} cy={39} r={headR} />}
      <Hair look={look} cx={cx} cy={39} r={headR} back={back} />
    </svg>
  );
}

/** GK のユニフォームの絵（試合で使う色を指定） */
export const GkFigure = (props: Omit<Parameters<typeof KitFigure>[0], "kit"> & { color: number }) => <KitFigure {...props} kit={gkKit(props.color)} />;
