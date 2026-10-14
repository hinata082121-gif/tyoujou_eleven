/**
 * イベントの場面の背景の絵（SVG。外の素材は使わず、コードで描く）。
 * 出来事の種類から選ぶ（eventScenes.ts の BG_FOR_KIND）。どれも 960×540 の絵を、画面いっぱいに切り取って敷く。
 * 人物を手前に立たせるので、絵の下の 3 分の 1 は込み入らせない。
 */
import type { ReactNode } from "react";

export type SceneBg = "ground" | "groundDusk" | "groundNight" | "rain" | "clubroom" | "classroom" | "gate" | "infirmary" | "meeting";

export const SCENE_BG_NAMES: Record<SceneBg, string> = {
  ground: "グラウンド",
  groundDusk: "夕方のグラウンド",
  groundNight: "夜のグラウンド",
  rain: "雨のグラウンド",
  clubroom: "部室",
  classroom: "教室",
  gate: "校門",
  infirmary: "保健室",
  meeting: "ミーティングルーム",
};

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

// ---------- 屋外 ----------

/** 校舎のシルエット（窓の並び） */
function SchoolBuilding({ x, y, w, h, wall, win, lit = false }: { x: number; y: number; w: number; h: number; wall: string; win: string; lit?: boolean }) {
  const cols = Math.floor(w / 46);
  const rows = Math.floor((h - 30) / 44);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={wall} />
      <rect x={x} y={y - 8} width={w} height={10} fill={wall} opacity={0.85} />
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <rect key={`${r}-${c}`} x={x + 14 + c * 46} y={y + 18 + r * 44} width={28} height={22} fill={lit && (r * 7 + c * 3) % 5 === 0 ? "#f7d774" : win} />
        )),
      )}
      {/* 時計 */}
      <circle cx={x + w / 2} cy={y - 20} r={16} fill={wall} />
      <circle cx={x + w / 2} cy={y - 20} r={11} fill="#f1efe6" />
      <path d={`M${x + w / 2},${y - 20} v-8 M${x + w / 2},${y - 20} h6`} stroke="#2a2f2c" strokeWidth={2} />
    </g>
  );
}

/** フェンス（細い縦線の並び） */
function Fence({ y, color }: { y: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={2}>
      <line x1={0} y1={y} x2={960} y2={y} />
      <line x1={0} y1={y + 60} x2={960} y2={y + 60} />
      {Array.from({ length: 49 }, (_, i) => (
        <line key={i} x1={i * 20} y1={y} x2={i * 20} y2={y + 60} />
      ))}
    </g>
  );
}

/** 木の並び */
function Trees({ y, color, seed = 0 }: { y: number; color: string; seed?: number }) {
  return (
    <g fill={color}>
      {Array.from({ length: 14 }, (_, i) => {
        const r = 34 + ((i * 37 + seed) % 23);
        return <circle key={i} cx={i * 72 + ((i * 13 + seed) % 30)} cy={y - r * 0.4} r={r} />;
      })}
      <rect x={0} y={y - 10} width={960} height={40} />
    </g>
  );
}

/** ピッチ（奥行きのある芝と白線、ゴール） */
function Pitch({ top, a, b, line }: { top: number; a: string; b: string; line: string }) {
  return (
    <g>
      <rect x={0} y={top} width={960} height={540 - top} fill={a} />
      {Array.from({ length: 6 }, (_, i) => {
        const y0 = top + ((540 - top) * i) / 6;
        const y1 = top + ((540 - top) * (i + 0.5)) / 6;
        return <rect key={i} x={0} y={y0} width={960} height={y1 - y0} fill={b} />;
      })}
      <path d={`M-40,540 L180,${top + 16} L780,${top + 16} L1000,540`} fill="none" stroke={line} strokeWidth={4} opacity={0.75} />
      <path d={`M360,${top + 16} L330,${top + 58} L630,${top + 58} L600,${top + 16}`} fill="none" stroke={line} strokeWidth={3} opacity={0.7} />
      {/* ゴール */}
      <g stroke="#f4f4f2" strokeWidth={4} fill="none">
        <path d={`M420,${top + 16} V${top - 34} H540 V${top + 16}`} />
      </g>
      <g stroke="#f4f4f2" strokeWidth={1} opacity={0.5}>
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={420 + i * 15} y1={top - 34} x2={428 + i * 15} y2={top + 10} />
        ))}
      </g>
    </g>
  );
}

/** 照明の柱 */
function Floodlight({ x, on }: { x: number; on: boolean }) {
  return (
    <g>
      {on && <path d={`M${x - 30},70 L${x - 260},540 L${x + 260},540 L${x + 30},70 Z`} fill="#fff6d0" opacity={0.07} />}
      <rect x={x - 4} y={70} width={8} height={230} fill="#38403c" />
      <rect x={x - 34} y={44} width={68} height={30} fill="#38403c" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={x - 30 + (i % 3) * 21} y={47 + Math.floor(i / 3) * 13} width={17} height={10} fill={on ? "#fffbe6" : "#6f7873"} />
      ))}
    </g>
  );
}

function GroundBase({ sky, sky2, sun, building, win, trees, fence, a, b, lit = false, lights = false }: { sky: string; sky2: string; sun?: { x: number; y: number; r: number; c: string }; building: string; win: string; trees: string; fence: string; a: string; b: string; lit?: boolean; lights?: boolean }) {
  return (
    <>
      <defs>
        <linearGradient id="bg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky} />
          <stop offset="1" stopColor={sky2} />
        </linearGradient>
      </defs>
      <rect width={960} height={300} fill="url(#bg-sky)" />
      {sun && <circle cx={sun.x} cy={sun.y} r={sun.r} fill={sun.c} />}
      <Trees y={215} color={trees} seed={5} />
      <SchoolBuilding x={560} y={110} w={340} h={130} wall={building} win={win} lit={lit} />
      <Floodlight x={120} on={lights} />
      <Floodlight x={860} on={lights} />
      <Fence y={190} color={fence} />
      <Pitch top={250} a={a} b={b} line="#f4f4f2" />
    </>
  );
}

export function GroundBg() {
  return (
    <Frame label="グラウンド">
      <GroundBase sky="#7fc0e8" sky2="#d5ecf5" sun={{ x: 220, y: 70, r: 34, c: "#fff7d6" }} building="#e6e1d3" win="#8fb3c7" trees="#3f7a4a" fence="#6c7a72" a="#3f9a4d" b="#46a656" />
      <g fill="#ffffff" opacity={0.85}>
        <ellipse cx={420} cy={60} rx={70} ry={18} />
        <ellipse cx={470} cy={52} rx={50} ry={16} />
        <ellipse cx={760} cy={40} rx={60} ry={14} />
      </g>
    </Frame>
  );
}

export function GroundDuskBg() {
  return (
    <Frame label="夕方のグラウンド">
      <GroundBase sky="#f08a4b" sky2="#ffd59a" sun={{ x: 300, y: 190, r: 46, c: "#ffe7a8" }} building="#9a6a55" win="#5b4038" trees="#4b4a33" fence="#5a4b40" a="#5f8a3d" b="#6a9446" lit />
    </Frame>
  );
}

export function GroundNightBg() {
  return (
    <Frame label="夜のグラウンド">
      <GroundBase sky="#0d1a2c" sky2="#23405a" building="#2a3640" win="#1a232a" trees="#14261c" fence="#3a4a44" a="#2d6b3a" b="#327541" lit lights />
      <g fill="#ffffff">
        {[
          [80, 40],
          [240, 90],
          [400, 30],
          [520, 70],
          [700, 25],
          [900, 60],
        ].map(([x, y]) => (
          <rect key={x} x={x} y={y} width={3} height={3} />
        ))}
      </g>
      <circle cx={760} cy={70} r={22} fill="#f3efd8" />
    </Frame>
  );
}

export function RainBg() {
  return (
    <Frame label="雨のグラウンド">
      <GroundBase sky="#5c6a72" sky2="#8b979c" building="#9aa09c" win="#5c6a72" trees="#37503f" fence="#56605b" a="#3d6b45" b="#41724a" />
      {/* 水たまり */}
      <g fill="#9fb4bd" opacity={0.55}>
        <ellipse cx={260} cy={420} rx={110} ry={14} />
        <ellipse cx={700} cy={470} rx={140} ry={16} />
        <ellipse cx={520} cy={360} rx={70} ry={8} />
      </g>
      {/* 雨の線 */}
      <g stroke="#dfe8ec" strokeWidth={2} opacity={0.55}>
        {Array.from({ length: 70 }, (_, i) => {
          const x = (i * 97) % 980;
          const y = (i * 53) % 520;
          return <line key={i} x1={x} y1={y} x2={x - 10} y2={y + 34} />;
        })}
      </g>
    </Frame>
  );
}

export function GateBg() {
  return (
    <Frame label="校門">
      <defs>
        <linearGradient id="bg-gate-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8cc8ec" />
          <stop offset="1" stopColor="#e3f1f6" />
        </linearGradient>
      </defs>
      <rect width={960} height={540} fill="url(#bg-gate-sky)" />
      <SchoolBuilding x={200} y={90} w={560} h={210} wall="#ebe6d8" win="#86a9bd" />
      {/* 桜の木 */}
      {[90, 870].map((x) => (
        <g key={x}>
          <rect x={x - 8} y={180} width={16} height={150} fill="#6b4a35" />
          <circle cx={x} cy={170} r={70} fill="#f2c4cf" />
          <circle cx={x - 50} cy={200} r={44} fill="#f6d3dc" />
          <circle cx={x + 48} cy={196} r={46} fill="#eebac7" />
        </g>
      ))}
      {/* 塀と門柱 */}
      <rect x={0} y={290} width={960} height={60} fill="#c9c3b3" />
      <rect x={0} y={286} width={960} height={8} fill="#b3ad9d" />
      <rect x={300} y={230} width={56} height={150} fill="#a9a393" />
      <rect x={604} y={230} width={56} height={150} fill="#a9a393" />
      <rect x={292} y={222} width={72} height={14} fill="#8f8a7b" />
      <rect x={596} y={222} width={72} height={14} fill="#8f8a7b" />
      {/* 表札（名前は書かない） */}
      <rect x={311} y={258} width={34} height={86} fill="#e9e3cf" />
      <g stroke="#7d776a" strokeWidth={3}>
        {[272, 290, 308, 326].map((y) => (
          <line key={y} x1={320} y1={y} x2={336} y2={y} />
        ))}
      </g>
      {/* 道 */}
      <path d="M356,380 L604,380 L760,540 L200,540 Z" fill="#b8b1a2" />
      <rect x={0} y={380} width={960} height={160} fill="#a7a08f" opacity={0.6} />
    </Frame>
  );
}

// ---------- 屋内 ----------

function Floor({ y, a, b }: { y: number; a: string; b: string }) {
  return (
    <g>
      <rect x={0} y={y} width={960} height={540 - y} fill={a} />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={i * 90 - 40} y1={y} x2={i * 120 - 200} y2={540} stroke={b} strokeWidth={3} />
      ))}
    </g>
  );
}

function Window({ x, y, w, h, sky }: { x: number; y: number; w: number; h: number; sky: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#e9e6dc" />
      <rect x={x + 8} y={y + 8} width={w - 16} height={h - 16} fill={sky} />
      <rect x={x + w / 2 - 3} y={y + 8} width={6} height={h - 16} fill="#e9e6dc" />
      <path d={`M${x + 20},${y + h - 30} q30,-30 60,0`} fill="none" stroke="#ffffff" strokeWidth={6} opacity={0.4} />
    </g>
  );
}

export function ClubroomBg() {
  return (
    <Frame label="部室">
      <rect width={960} height={540} fill="#d8cdb5" />
      <rect y={0} width={960} height={36} fill="#c4b89e" />
      <Window x={60} y={70} w={200} h={150} sky="#a9d3ec" />
      {/* ロッカー */}
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i}>
          <rect x={300 + i * 72} y={70} width={68} height={300} fill={i % 2 ? "#6f8a9a" : "#67828f"} />
          <rect x={312 + i * 72} y={90} width={44} height={6} fill="#4b5d67" />
          <rect x={312 + i * 72} y={102} width={44} height={6} fill="#4b5d67" />
          <rect x={354 + i * 72} y={200} width={6} height={24} fill="#c9d3d8" />
          <rect x={312 + i * 72} y={130} width={30} height={20} fill="#f2efe6" />
        </g>
      ))}
      {/* ホワイトボード（作戦の書き込み） */}
      <rect x={60} y={250} width={200} height={130} fill="#f6f6f2" stroke="#9aa09c" strokeWidth={6} />
      <g stroke="#2e5aa8" strokeWidth={3} fill="none">
        <circle cx={110} cy={300} r={8} />
        <circle cx={160} cy={330} r={8} />
        <path d="M180,290 l14,14 m0,-14 l-14,14" stroke="#c43e2c" />
        <path d="M118,304 Q140,340 152,330" />
      </g>
      <Floor y={380} a="#a58866" b="#93765a" />
      {/* ベンチとボールの袋 */}
      <rect x={340} y={400} width={420} height={18} fill="#7b5a3c" />
      <rect x={360} y={418} width={14} height={50} fill="#5e432c" />
      <rect x={726} y={418} width={14} height={50} fill="#5e432c" />
      <g>
        <path d="M820,470 Q800,380 860,370 Q920,380 900,470 Z" fill="#2f3a46" />
        {[
          [835, 395],
          [868, 388],
          [852, 420],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r={16} fill="#f4f4f2" stroke="#2a2f2c" strokeWidth={2} />
        ))}
      </g>
    </Frame>
  );
}

export function ClassroomBg() {
  return (
    <Frame label="教室">
      <rect width={960} height={540} fill="#e9e0c9" />
      <rect y={0} width={960} height={30} fill="#d6ccb1" />
      {/* 黒板 */}
      <rect x={250} y={60} width={460} height={190} fill="#7a5a3a" />
      <rect x={262} y={72} width={436} height={166} fill="#2f5a45" />
      <g stroke="#f0eee2" strokeWidth={3} opacity={0.8} fill="none">
        <path d="M300,110 h120 M300,140 h90 M300,170 h140" />
        <path d="M520,120 q40,-30 80,0 t80,0" />
      </g>
      <rect x={262} y={236} width={436} height={10} fill="#8b6b4a" />
      <Window x={30} y={70} w={180} h={200} sky="#b9def0" />
      <Window x={750} y={70} w={180} h={200} sky="#b9def0" />
      <Floor y={330} a="#b89570" b="#a5845f" />
      {/* 机の並び */}
      {[0, 1].map((r) =>
        Array.from({ length: 6 }, (_, i) => (
          <g key={`${r}-${i}`}>
            <rect x={60 + i * 150 + r * 30} y={350 + r * 90} width={110} height={16} fill="#c79a5e" />
            <rect x={66 + i * 150 + r * 30} y={366 + r * 90} width={8} height={40} fill="#6f7a76" />
            <rect x={156 + i * 150 + r * 30} y={366 + r * 90} width={8} height={40} fill="#6f7a76" />
          </g>
        )),
      )}
    </Frame>
  );
}

export function InfirmaryBg() {
  return (
    <Frame label="保健室">
      <rect width={960} height={540} fill="#eef0ea" />
      <Window x={620} y={70} w={240} h={180} sky="#c4e4f2" />
      {/* カーテンとベッド */}
      <rect x={60} y={40} width={8} height={330} fill="#b9c0bd" />
      <path d="M68,50 h260 v300 q-30,-14 -65,0 t-65,0 t-65,0 t-65,0 z" fill="#d7eef0" />
      <rect x={120} y={310} width={360} height={60} fill="#f6f6f2" />
      <rect x={120} y={300} width={110} height={30} fill="#e6edf0" />
      <rect x={120} y={370} width={14} height={40} fill="#9aa4a0" />
      <rect x={466} y={370} width={14} height={40} fill="#9aa4a0" />
      {/* 棚と救急箱 */}
      <rect x={520} y={280} width={150} height={120} fill="#c9cfcb" />
      <rect x={540} y={300} width={110} height={40} fill="#f4f4f2" />
      <path d="M587,306 h16 v10 h10 v16 h-10 v10 h-16 v-10 h-10 v-16 h10 z" fill="#d6372b" />
      <Floor y={400} a="#c9d6cf" b="#b8c7bf" />
    </Frame>
  );
}

export function MeetingBg() {
  return (
    <Frame label="ミーティングルーム">
      <rect width={960} height={540} fill="#cfd5d2" />
      {/* ホワイトボードにフォーメーション */}
      <rect x={180} y={50} width={600} height={240} fill="#f6f6f2" stroke="#8f9792" strokeWidth={8} />
      <rect x={220} y={80} width={520} height={180} fill="none" stroke="#3f9a4d" strokeWidth={3} />
      <line x1={480} y1={80} x2={480} y2={260} stroke="#3f9a4d" strokeWidth={3} />
      <circle cx={480} cy={170} r={30} fill="none" stroke="#3f9a4d" strokeWidth={3} />
      <g fill="#2e5aa8">
        {[
          [260, 170],
          [320, 110],
          [320, 150],
          [320, 190],
          [320, 230],
          [400, 130],
          [400, 210],
          [430, 170],
          [560, 120],
          [560, 220],
          [620, 170],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={9} />
        ))}
      </g>
      <g stroke="#c43e2c" strokeWidth={4} fill="none">
        <path d="M570,128 Q640,110 690,150" />
        <path d="M680,142 l12,8 -14,4" />
      </g>
      <Floor y={360} a="#8d9a95" b="#7f8b86" />
      {/* 机 */}
      <rect x={120} y={370} width={720} height={26} fill="#5b4a3a" />
      <rect x={140} y={396} width={16} height={70} fill="#463829" />
      <rect x={804} y={396} width={16} height={70} fill="#463829" />
    </Frame>
  );
}

export const SCENE_BACKGROUNDS: Record<SceneBg, () => React.JSX.Element> = {
  ground: GroundBg,
  groundDusk: GroundDuskBg,
  groundNight: GroundNightBg,
  rain: RainBg,
  clubroom: ClubroomBg,
  classroom: ClassroomBg,
  gate: GateBg,
  infirmary: InfirmaryBg,
  meeting: MeetingBg,
};
