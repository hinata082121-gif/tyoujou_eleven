/**
 * ゲーム用に描いたアイコン（SVG。24×24 の線と面）。絵文字の代わりに使う（docs/DESIGN.md）。
 * 線は角を立てた太めの線（square・miter）。fill を持つ部分は "F:" で始める。
 */
import type { CSSProperties } from "react";

/** 線で描く部分。"F:" で始まるものは塗る */
const ICONS = {
  // ---- 練習 ----
  shoot: ["M2 19V6h14v13", "M2 10h14", "M6 6v13", "M11 6v13", "F:M20.5 15a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"],
  pass: ["F:M4 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4z", "M6.5 15.5L18 8.5", "M13 8l5.5.2-2 5"],
  dribble: ["F:M15 11a4 4 0 1 1 0 8 4 4 0 0 1 0-8z", "M2 7h7", "M2 11h5", "M3 15h4", "M11 4l3 3-3 3"],
  defense: ["M12 2.5l8 3v6c0 5-3.5 8.5-8 10.5-4.5-2-8-5.5-8-10.5v-6z", "M12 7v10", "M8 11h8"],
  physical: ["M2 12h20", "M5 7.5v9", "M8.5 5v14", "M15.5 5v14", "M19 7.5v9"],
  run: ["M3 7h8", "M2 12h8", "M4 17h7", "M13 5l7 7-7 7"],
  tactics: ["M5 4h14v18H5z", "M9 2h6v4H9z", "M8 10l3 3", "M11 10l-3 3", "M15 16a1.8 1.8 0 1 0 0 .01", "M10 18l3.5-4.5"],
  gk: ["M6 22v-9.5L4 8.5", "M6 13V5a1.5 1.5 0 0 1 3 0v6", "M9 10.5V3.5a1.5 1.5 0 0 1 3 0V10", "M12 10V4a1.5 1.5 0 0 1 3 0v6", "M15 10V6.5a1.5 1.5 0 0 1 3 0V14c0 4.5-3 8-7.5 8H6"],
  pk: ["M3 13V4h18v9", "M3 7.5h18", "F:M12 15.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z", "M6 22.5h12"],
  setPiece: ["M5 22V2", "F:M5 3l12 4-12 4z", "M2 22h9"],
  rest: ["F:M19.5 15.5A8.5 8.5 0 1 1 9 3.5a6.8 6.8 0 0 0 10.5 12z"],
  // ---- メニュー ----
  dice: ["M3 3h18v18H3z", "F:M6.5 6.5h3v3h-3z", "F:M14.5 6.5h3v3h-3z", "F:M10.5 10.5h3v3h-3z", "F:M6.5 14.5h3v3h-3z", "F:M14.5 14.5h3v3h-3z"],
  squad: ["F:M8 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z", "F:M1.5 21c0-4.5 3-7 6.5-7s6.5 2.5 6.5 7z", "F:M17 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6z", "M16 14.2c3.8 0 6.5 2.2 6.5 6.3"],
  cup: ["M7 3h10v6.5a5 5 0 0 1-10 0z", "M7 5.5H3.5c0 3.5 1.5 5 3.7 5.3", "M17 5.5h3.5c0 3.5-1.5 5-3.7 5.3", "M12 14.5v4", "M7 21.5h10", "M9 18.5h6"],
  book: ["M3 4h7a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H3z", "M21 4h-7a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h7z"],
  menu: ["M3 6h18", "M3 12h18", "M3 18h18"],
  // ---- 試合 ----
  ball: ["M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z", "F:M12 7.5l3.3 2.4-1.3 3.9h-4l-1.3-3.9z", "M12 7.5V3", "M15.3 9.9l4-1.6", "M14 13.8l2.5 3.7", "M10 13.8l-2.5 3.7", "M8.7 9.9l-4-1.6"],
  goal: ["M2 20V5h20v15", "M2 9h20", "M2 14h20", "M7 5v15", "M12 5v15", "M17 5v15"],
  card: ["F:M7 3h10v18H7z"],
  injury: ["F:M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"],
  suspend: ["M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z", "M5.6 5.6l12.8 12.8"],
  sub: ["M4 8h14", "M14 4l4 4-4 4", "M20 16H6", "M10 12l-4 4 4 4"],
  whistle: ["M3 13a5 5 0 1 0 10 0 5 5 0 1 0-10 0", "M12 9.5h9v4.5h-7", "M8 8V3", "M5 4.5l1.5 2.5"],
  pause: ["F:M6 4h4v16H6z", "F:M14 4h4v16h-4z"],
  play: ["F:M7 4l13 8-13 8z"],
  speed: ["F:M3 5l9 7-9 7z", "F:M12 5l9 7-9 7z"],
  // ---- 矢印 ----
  back: ["M15 4l-8 8 8 8"],
  next: ["M9 4l8 8-8 8"],
  up: ["M4 15l8-8 8 8"],
  down: ["M4 9l8 8 8-8"],
  sort: ["M7 3v18", "M3 7l4-4 4 4", "M17 21V3", "M13 17l4 4 4-4"],
  swap: ["M4 8h14", "M14 4l4 4-4 4", "M20 16H6", "M10 12l-4 4 4 4"],
  // 調子（5 段）
  cond2: ["M12 21V4", "M5 11l7-7 7 7", "M5 17l7-7 7 7"],
  cond1: ["M5 19L18 6", "M8 6h10v10"],
  cond0: ["M3 12h17", "M13 5l7 7-7 7"],
  condM1: ["M5 5l13 13", "M8 18h10V8"],
  condM2: ["M12 3v17", "M5 13l7 7 7-7", "M5 7l7 7 7-7"],
  // ---- 操作 ----
  close: ["M5 5l14 14", "M19 5L5 19"],
  check: ["M4 12.5l5 5L20 6.5"],
  plus: ["M12 4v16", "M4 12h16"],
  minus: ["M4 12h16"],
  trash: ["M4 6h16", "M9 6V3h6v3", "M6 6l1 15h10l1-15", "M10 10v8", "M14 10v8"],
  gear: ["M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z", "M12 2v3", "M12 19v3", "M2 12h3", "M19 12h3", "M4.9 4.9l2.1 2.1", "M17 17l2.1 2.1", "M4.9 19.1L7 17", "M17 7l2.1-2.1"],
  save: ["M4 3h13l3 3v15H4z", "M8 3v5h8V3", "M7 13h10v8H7z"],
  exportFile: ["M12 15V3", "M7 8l5-5 5 5", "M4 13v8h16v-8"],
  importFile: ["M12 3v12", "M7 10l5 5 5-5", "M4 13v8h16v-8"],
  info: ["M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z", "M12 10.5V17", "F:M10.8 6h2.4v2.4h-2.4z"],
  warning: ["M12 3l10 18H2z", "M12 10v5", "F:M10.8 16.8h2.4v2.4h-2.4z"],
  star: ["F:M12 2l3 7 7.5.6-5.7 4.8 1.8 7.4L12 18l-6.6 3.8 1.8-7.4L1.5 9.6 9 9z"],
  lock: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"],
  rotate: ["M2 7h9v15H2z", "M5 19h3", "M13 3.5a8 8 0 0 1 7.5 7.5", "M17.5 8.5l3 3 3-3"],
  // ---- 画面 ----
  uniform: ["M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 2-2 3-4 3s-3.5-1-4-3z"],
  facility: ["M3 21V9l9-6 9 6v12", "M9 21v-7h6v7", "M2 21h20"],
  scout: ["M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14z", "M15 15l6 6", "F:M10 6.5l1.2 2.5 2.7.3-2 1.8.6 2.6-2.5-1.4-2.5 1.4.6-2.6-2-1.8 2.7-.3z"],
  note: ["M5 3h13v18H5z", "M9 3v18", "M12 8h4", "M12 12h4"],
  captain: ["M3 7h18v10H3z", "M14.5 10a3 3 0 1 0 0 4"],
  staff: ["F:M12 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z", "M5 21v-3c0-3 3-5 7-5s7 2 7 5v3", "M12 13v4", "M10 15l2 2 2-2"],
  school: ["M3 21V10h18v11", "M2 21h20", "M12 10V3", "F:M12 3h6v4h-6z", "M10 21v-5h4v5", "M6 13h2", "M16 13h2"],
  camp: ["M12 3L2 21h20z", "M12 3v18", "M9 21l3-6 3 6"],
  branch: ["M12 22v-8", "M12 14L5 6", "M12 14l7-8", "M5 6V2", "M2 4.5L5 2l3 2.5", "M19 6V2", "M16 4.5L19 2l3 2.5"],
  alumni: ["F:M12 3L1 8l11 5 11-5z", "M5 10.5V16c2 2 4.5 3 7 3s5-1 7-3v-5.5", "M22 8v6"],
  calendar: ["M3 5h18v16H3z", "M3 10h18", "M8 2v5", "M16 2v5"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "F:M3 4.5h3v3H3z", "F:M3 10.5h3v3H3z", "F:M3 16.5h3v3H3z"],
  reputation: ["F:M3 20h4v-6H3z", "F:M10 20h4V9h-4z", "F:M17 20h4V4h-4z"],
  title: ["M3 10h18v11H3z", "M12 3l9 7H3z"],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20, className = "", stroke = 2.4, style, title }: { name: IconName; size?: number; className?: string; stroke?: number; style?: CSSProperties; title?: string }) {
  const parts = ICONS[name];
  const rem = `${size / 16}rem`;
  return (
    <svg
      viewBox="0 0 24 24"
      width={rem}
      height={rem}
      className={`inline-block shrink-0 ${className}`}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {parts.map((d, i) => (d.startsWith("F:") ? <path key={i} d={d.slice(2)} fill="currentColor" stroke="none" /> : <path key={i} d={d} />))}
    </svg>
  );
}

/** 調子（-2〜2）のアイコン */
export const CONDITION_ICONS: Record<number, IconName> = { [-2]: "condM2", [-1]: "condM1", 0: "cond0", 1: "cond1", 2: "cond2" };
/** 調子の色（文字の色のクラス） */
export const CONDITION_TEXT: Record<number, string> = { [-2]: "text-info", [-1]: "text-info", 0: "text-text-3", 1: "text-warn", 2: "text-bad" };

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
