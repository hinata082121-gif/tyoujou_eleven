/**
 * イベントの場面の背景の絵（SVG。外の素材は使わず、コードで描く）。
 * 出来事の種類から選ぶ（eventScenes.ts の BG_FOR_KIND）。どれも 960×540 の絵を、画面いっぱいに切り取って敷く。
 * 人物を手前に立たせるので、絵の下の 3 分の 1 は込み入らせない。
 */
import type { ReactNode } from "react";

export type SceneBg = "ground" | "groundDusk" | "groundNight" | "rain" | "clubroom" | "classroom" | "gate" | "infirmary" | "meeting" | "sportsDay" | "festival" | "exam" | "entrance" | "gym" | "trip";

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
  sportsDay: "体育祭のグラウンド",
  festival: "文化祭の教室",
  exam: "試験の教室",
  entrance: "桜の校門",
  gym: "体育館（式典）",
  trip: "旅先の町並み",
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

const PENNANT = ["#d6372b", "#f2c21b", "#3b8fd0", "#f3f0e6", "#55b865"];

// ---------- 学校行事（R2） ----------

/** 体育祭：校舎・テント・三角の小旗・白線のトラック */
export function SportsDayBg() {
  return (
    <Frame label="体育祭のグラウンド">
      <defs>
        <linearGradient id="sd-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6fb6e6" />
          <stop offset="1" stopColor="#d3ebf6" />
        </linearGradient>
      </defs>
      <rect width={960} height={540} fill="url(#sd-sky)" />
      <g fill="#ffffff" opacity={0.85}>
        <ellipse cx={180} cy={60} rx={70} ry={16} />
        <ellipse cx={700} cy={46} rx={80} ry={18} />
      </g>
      {/* 校舎 */}
      <rect x={120} y={110} width={720} height={150} fill="#e8e2d2" />
      {Array.from({ length: 3 }, (_, r) =>
        Array.from({ length: 15 }, (_, c) => <rect key={`${r}-${c}`} x={136 + c * 47} y={124 + r * 42} width={28} height={22} fill="#93b7ca" />),
      )}
      <circle cx={480} cy={96} r={17} fill="#e8e2d2" />
      <circle cx={480} cy={96} r={11} fill="#f6f4ec" />
      {/* 地面（土のグラウンド） */}
      <rect y={260} width={960} height={280} fill="#c9a777" />
      <rect y={260} width={960} height={14} fill="#b8946a" />
      {/* トラックの白線 */}
      <g fill="none" stroke="#f6f4ec" strokeWidth={4} opacity={0.9}>
        <path d="M-20,540 Q480,300 980,540" />
        <path d="M60,540 Q480,340 900,540" />
        <path d="M140,540 Q480,380 820,540" />
      </g>
      {/* テント（左右） */}
      {[40, 700].map((x, i) => (
        <g key={i}>
          <path d={`M${x},250 L${x + 110},214 L${x + 220},250 Z`} fill={i ? "#3b8fd0" : "#d6372b"} />
          <rect x={x} y={250} width={220} height={10} fill="#f3f0e6" />
          <rect x={x + 6} y={260} width={6} height={60} fill="#7d8681" />
          <rect x={x + 208} y={260} width={6} height={60} fill="#7d8681" />
          <rect x={x + 30} y={300} width={160} height={14} fill="#a8b2ad" />
        </g>
      ))}
      {/* 三角の小旗 */}
      {[
        [0, 150, 480, 196],
        [480, 196, 960, 150],
      ].map(([x1, y1, x2, y2], j) => (
        <g key={j}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5a625e" strokeWidth={2} />
          {Array.from({ length: 12 }, (_, i) => {
            const t = (i + 0.5) / 12;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            return <path key={i} d={`M${x - 12},${y} L${x + 12},${y} L${x},${y + 26} Z`} fill={PENNANT[(i + j * 2) % PENNANT.length]} />;
          })}
        </g>
      ))}
    </Frame>
  );
}

/** 試験の教室：黒板・机の列・答案 */
export function ExamRoomBg() {
  return (
    <Frame label="試験の教室">
      <rect width={960} height={540} fill="#e6dcc4" />
      <rect width={960} height={28} fill="#d3c8ad" />
      <rect x={210} y={52} width={540} height={200} fill="#7a5a3a" />
      <rect x={222} y={64} width={516} height={176} fill="#2f5a45" />
      <g stroke="#f0eee2" strokeWidth={3} opacity={0.85} fill="none">
        <path d="M262,104 h170 M262,140 h120 M262,176 h200" />
        <rect x={560} y={96} width={130} height={110} />
        <path d="M580,130 h90 M580,160 h70 M580,186 h80" />
      </g>
      <rect x={222} y={240} width={516} height={10} fill="#8b6b4a" />
      {/* 時計 */}
      <circle cx={850} cy={90} r={30} fill="#f6f4ec" stroke="#5a5048" strokeWidth={5} />
      <path d="M850,90 v-18 M850,90 h14" stroke="#2a2f2c" strokeWidth={3} />
      {/* 床と机（答案を載せた机の列） */}
      <rect y={300} width={960} height={240} fill="#b48f68" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} y={300 + i * 40} width={960} height={2} fill="#a07c57" />
      ))}
      {[0, 1, 2].map((r) =>
        Array.from({ length: 7 }, (_, i) => {
          const x = 20 + i * 135 + (r % 2) * 40;
          const y = 320 + r * 70;
          return (
            <g key={`${r}-${i}`}>
              <rect x={x} y={y} width={100} height={14} fill="#c99c60" />
              <rect x={x + 30} y={y - 6} width={40} height={10} fill="#f8f6ee" />
              <rect x={x + 6} y={y + 14} width={7} height={36} fill="#6f7a76" />
              <rect x={x + 87} y={y + 14} width={7} height={36} fill="#6f7a76" />
            </g>
          );
        }),
      )}
    </Frame>
  );
}

/** 文化祭：飾り付けた教室（輪飾り・紙の花・模造紙の看板・模擬店の台） */
export function FestivalBg() {
  return (
    <Frame label="文化祭の教室">
      <rect width={960} height={540} fill="#ece2c8" />
      <rect y={0} width={960} height={30} fill="#d6ccb1" />
      {/* 黒板に模造紙の看板（文字は書かない） */}
      <rect x={250} y={60} width={460} height={190} fill="#7a5a3a" />
      <rect x={262} y={72} width={436} height={166} fill="#2f5a45" />
      <rect x={300} y={92} width={360} height={120} fill="#f8f3e2" />
      <g fill="#d6372b">
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={326 + i * 64} y={118} width={44} height={44} transform={`rotate(${i % 2 ? 6 : -6} ${348 + i * 64} 140)`} fill={["#d6372b", "#f2c21b", "#3b8fd0", "#55b865", "#e07a2e"][i]} />
        ))}
      </g>
      <rect x={330} y={178} width={300} height={10} fill="#c9bf9f" />
      <Window x={30} y={70} w={180} h={200} sky="#b9def0" />
      <Window x={750} y={70} w={180} h={200} sky="#b9def0" />
      {/* 輪飾り（天井から垂れる） */}
      {[
        [0, 40, 480, 70],
        [480, 70, 960, 40],
      ].map(([x1, y1, x2, y2], j) => (
        <g key={j}>
          {Array.from({ length: 16 }, (_, i) => {
            const t = (i + 0.5) / 16;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * 26;
            return <ellipse key={i} cx={x} cy={y} rx={13} ry={8} fill="none" stroke={["#d6372b", "#f2c21b", "#3b8fd0", "#55b865"][(i + j) % 4]} strokeWidth={5} />;
          })}
        </g>
      ))}
      {/* 紙の花 */}
      {[
        [232, 110],
        [728, 110],
        [232, 230],
        [728, 230],
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={20} fill={i % 2 ? "#f2c4cf" : "#f6e08a"} />
          <circle cx={x} cy={y} r={7} fill="#f8f6ee" />
        </g>
      ))}
      <Floor y={330} a="#b89570" b="#a5845f" />
      {/* 模擬店の台（布をかけた机を寄せたもの） */}
      <rect x={120} y={360} width={720} height={70} fill="#d6372b" />
      <g fill="#f3f0e6">
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x={120 + i * 60} y={360} width={30} height={70} />
        ))}
      </g>
      <rect x={110} y={350} width={740} height={14} fill="#c99c60" />
      {[220, 400, 580, 740].map((x) => (
        <g key={x}>
          <rect x={x} y={318} width={46} height={32} fill="#f8f6ee" />
          <rect x={x + 6} y={310} width={34} height={10} fill="#e07a2e" />
        </g>
      ))}
    </Frame>
  );
}

/** 散る桜の花びら */
function Petals({ n, seed }: { n: number; seed: number }) {
  return (
    <g fill="#f6cdd6">
      {Array.from({ length: n }, (_, i) => {
        const x = (i * 131 + seed * 17) % 960;
        const y = (i * 71 + seed * 29) % 500;
        return <ellipse key={i} cx={x} cy={y} rx={6} ry={3.5} transform={`rotate(${(i * 47) % 180} ${x} ${y})`} />;
      })}
    </g>
  );
}

/** 入学式：満開の桜の校門と、式の立て看板（文字は書かず、紅白の縁取りだけ） */
export function EntranceBg() {
  return (
    <Frame label="桜の校門">
      <defs>
        <linearGradient id="bg-ent-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fd0ee" />
          <stop offset="1" stopColor="#eef5f2" />
        </linearGradient>
      </defs>
      <rect width={960} height={540} fill="url(#bg-ent-sky)" />
      <SchoolBuilding x={220} y={100} w={520} h={200} wall="#ebe6d8" win="#86a9bd" />
      {/* 桜並木 */}
      {[40, 170, 790, 920].map((x, i) => (
        <g key={x}>
          <rect x={x - 9} y={170} width={18} height={170} fill="#6b4a35" />
          <circle cx={x} cy={160} r={78} fill={i % 2 ? "#f6d3dc" : "#f2c4cf"} />
          <circle cx={x - 52} cy={196} r={50} fill="#f6d3dc" />
          <circle cx={x + 50} cy={190} r={52} fill="#eebac7" />
        </g>
      ))}
      <rect x={0} y={300} width={960} height={56} fill="#c9c3b3" />
      <rect x={0} y={296} width={960} height={8} fill="#b3ad9d" />
      <rect x={300} y={236} width={56} height={150} fill="#a9a393" />
      <rect x={604} y={236} width={56} height={150} fill="#a9a393" />
      <rect x={292} y={228} width={72} height={14} fill="#8f8a7b" />
      <rect x={596} y={228} width={72} height={14} fill="#8f8a7b" />
      {/* 立て看板（紅白の縁） */}
      <rect x={650} y={250} width={70} height={140} fill="#f8f6ee" />
      <rect x={650} y={250} width={70} height={10} fill="#d6372b" />
      <rect x={650} y={380} width={70} height={10} fill="#d6372b" />
      <g stroke="#3a3f3c" strokeWidth={4}>
        {[280, 304, 328, 352].map((y) => (
          <line key={y} x1={676} y1={y} x2={694} y2={y} />
        ))}
      </g>
      <rect x={656} y={390} width={8} height={30} fill="#7d8681" />
      <rect x={706} y={390} width={8} height={30} fill="#7d8681" />
      <path d="M356,386 L604,386 L760,540 L200,540 Z" fill="#b8b1a2" />
      <rect x={0} y={386} width={960} height={154} fill="#a7a08f" opacity={0.6} />
      <Petals n={46} seed={3} />
    </Frame>
  );
}

/** 卒業式：体育館の舞台・紅白の幕・並べたいす */
export function GymBg() {
  return (
    <Frame label="体育館（式典）">
      <rect width={960} height={540} fill="#d9cdb2" />
      {/* 天井の梁と照明 */}
      <rect width={960} height={40} fill="#b9ab8c" />
      {[120, 360, 600, 840].map((x) => (
        <g key={x}>
          <rect x={x - 3} y={40} width={6} height={30} fill="#7d7464" />
          <rect x={x - 22} y={70} width={44} height={12} fill="#f8f3dc" />
        </g>
      ))}
      {/* 窓（高い位置） */}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={20 + i * 120} y={96} width={80} height={46} fill="#b9def0" stroke="#e9e6dc" strokeWidth={6} />
      ))}
      {/* 舞台 */}
      <rect x={200} y={160} width={560} height={150} fill="#5b3c2a" />
      <rect x={220} y={172} width={520} height={128} fill="#6e2a2a" />
      <rect x={430} y={196} width={100} height={40} fill="#f3e6b8" />
      <rect x={200} y={300} width={560} height={30} fill="#8b6b4a" />
      {/* 紅白の幕（舞台の下と左右の壁） */}
      <g>
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} x={i * 40} y={330} width={20} height={44} fill="#d6372b" />
        ))}
        {Array.from({ length: 24 }, (_, i) => (
          <rect key={i} x={i * 40 + 20} y={330} width={20} height={44} fill="#f6f4ec" />
        ))}
      </g>
      {/* 鉢植えの花 */}
      {[180, 780].map((x) => (
        <g key={x}>
          <rect x={x - 26} y={280} width={52} height={50} fill="#7a5a3a" />
          <circle cx={x - 16} cy={270} r={20} fill="#f2c4cf" />
          <circle cx={x + 14} cy={266} r={22} fill="#f6e08a" />
          <circle cx={x} cy={252} r={18} fill="#eebac7" />
        </g>
      ))}
      {/* 床といすの列 */}
      <rect y={374} width={960} height={166} fill="#c99c60" />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} y={374 + i * 34} width={960} height={2} fill="#b0864f" />
      ))}
      {[0, 1].map((r) =>
        Array.from({ length: 16 }, (_, i) => (
          <g key={`${r}-${i}`}>
            <rect x={14 + i * 60 + r * 20} y={392 + r * 64} width={36} height={28} fill="#5c6670" />
            <rect x={14 + i * 60 + r * 20} y={420 + r * 64} width={36} height={8} fill="#48525b" />
          </g>
        )),
      )}
    </Frame>
  );
}

/** 修学旅行：架空の古い町並み（瓦屋根の木造の家・のれん・提灯・石畳・遠くの山） */
export function TripBg() {
  return (
    <Frame label="旅先の町並み">
      <defs>
        <linearGradient id="bg-trip-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1b46e" />
          <stop offset="1" stopColor="#f8e2b8" />
        </linearGradient>
      </defs>
      <rect width={960} height={540} fill="url(#bg-trip-sky)" />
      {/* 遠くの山と塔 */}
      <path d="M0,230 L160,130 L300,200 L470,110 L640,210 L800,140 L960,220 V300 H0 Z" fill="#a07a62" opacity={0.55} />
      <g fill="#6e4a3a" opacity={0.7}>
        <rect x={472} y={92} width={6} height={30} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={446 - i * 3 + 0} y={118 + i * 26} width={58 + i * 6} height={8} />
        ))}
        <rect x={460} y={118} width={30} height={110} />
      </g>
      {/* 両側の家並み（手前ほど大きく） */}
      {[
        { x: 0, w: 300, y: 170, dir: 1 },
        { x: 660, w: 300, y: 170, dir: -1 },
      ].map((h, k) => (
        <g key={k}>
          <path
            d={
              h.dir > 0
                ? `M${h.x - 20},${h.y} L${h.x + h.w + 20},${h.y + 30} L${h.x + h.w + 20},${h.y + 60} L${h.x - 20},${h.y + 50} Z`
                : `M${h.x - 20},${h.y + 30} L${h.x + h.w + 20},${h.y} L${h.x + h.w + 20},${h.y + 50} L${h.x - 20},${h.y + 60} Z`
            }
            fill="#4f5458"
          />
          <rect x={h.x} y={h.y + 46} width={h.w} height={230} fill="#7a5038" />
          {Array.from({ length: 5 }, (_, i) => (
            <rect key={i} x={h.x + 16 + i * 56} y={h.y + 70} width={42} height={70} fill="#c99c60" />
          ))}
          {Array.from({ length: 5 }, (_, i) =>
            Array.from({ length: 4 }, (_, j) => <rect key={`${i}-${j}`} x={h.x + 18 + i * 56 + j * 10} y={h.y + 72} width={3} height={66} fill="#7a5038" />),
          )}
          {/* のれん */}
          <rect x={h.x + (h.dir > 0 ? 190 : 40)} y={h.y + 160} width={70} height={46} fill="#2e4a7a" />
          <rect x={h.x + (h.dir > 0 ? 224 : 74)} y={h.y + 160} width={3} height={46} fill="#ece2c8" />
          {/* 提灯 */}
          <ellipse cx={h.x + (h.dir > 0 ? 160 : 140)} cy={h.y + 176} rx={16} ry={22} fill="#e8573a" />
          <rect x={h.x + (h.dir > 0 ? 152 : 132)} y={h.y + 152} width={16} height={6} fill="#2a2f2c" />
        </g>
      ))}
      {/* 石畳 */}
      <path d="M300,300 L660,300 L900,540 L60,540 Z" fill="#b5ad9c" />
      <g stroke="#9a927f" strokeWidth={3}>
        {[330, 370, 420, 480, 550].map((y, i) => (
          <line key={y} x1={300 - i * 50} y1={y} x2={660 + i * 50} y2={y} />
        ))}
      </g>
      <rect y={276} width={960} height={24} fill="#8f8a7b" opacity={0.5} />
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
  sportsDay: SportsDayBg,
  festival: FestivalBg,
  exam: ExamRoomBg,
  entrance: EntranceBg,
  gym: GymBg,
  trip: TripBg,
};
