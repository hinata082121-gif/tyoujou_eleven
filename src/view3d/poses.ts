/**
 * 姿勢とモーション（P4。計画 5 章）：体の部品の回転を「姿勢」として持ち、モーションは姿勢のキーフレームの並びで書く。
 * 歩く・走るは速さから計算で作る。外部のアニメーションファイルは使わない
 */
import type { MotionId } from "@/engine/replay/motion";

/** 姿勢（どれも「前・外・右」が正の向き。character.ts で部品の回転に直す） */
export interface Pose {
  /** 体全体の上下（腰の高さからのずれ） */
  y: number;
  /** 体全体の横・前へのずれ（GK が横へ跳ぶなど） */
  x: number;
  z: number;
  /** 前へ傾く（後ろは負） */
  lean: number;
  /** 右へ傾く */
  roll: number;
  /** 上体のひねり */
  twist: number;
  /** 首（前へうなずく） */
  head: number;
  legLF: number;
  legLO: number;
  legRF: number;
  legRO: number;
  armLF: number;
  armLO: number;
  armRF: number;
  armRO: number;
}

export const REST: Pose = { y: 0, x: 0, z: 0, lean: 0, roll: 0, twist: 0, head: 0, legLF: 0, legLO: 0.02, legRF: 0, legRO: 0.02, armLF: 0, armLO: 0.28, armRF: 0, armRO: 0.28 };
const KEYS = Object.keys(REST) as (keyof Pose)[];

export const copyPose = (out: Pose, p: Pose) => {
  for (const k of KEYS) out[k] = p[k];
  return out;
};

type Key = [number, Partial<Pose>];

/** キック系（右足）。back：振りかぶり、fwd：振り抜き */
const kick = (back: number, fwd: number, lean: number, arms: number, roll = 0): Key[] => [
  [0, {}],
  [0.3, { legRF: -back, legLF: 0.15, armLF: 0.3, armLO: arms, armRO: arms * 0.7, lean: 0.12, roll: roll * 0.5, y: -0.03 }],
  [0.5, { legRF: fwd * 0.75, legLF: -0.1, armLO: arms, armRO: arms * 0.6, lean: lean, roll, twist: roll * 0.6, y: -0.05 }],
  [0.72, { legRF: fwd, legLF: -0.15, armLO: arms * 0.7, armRO: arms * 0.5, lean: lean * 0.6, roll: roll * 0.5 }],
  [1, {}],
];

/** GK が横へ跳ぶ（右へ。左は鏡に映す） */
const dive: Key[] = [
  [0, {}],
  [0.2, { y: -0.25, legLF: 0.4, legRF: 0.4, armLF: 0.6, armRF: 0.6, lean: 0.2 }],
  [0.4, { y: 0.45, x: 1.6, roll: 1.25, armLO: 2.7, armRO: 2.7, legLO: 0.3, legRO: 0.1, lean: 0 }],
  [0.62, { y: -0.35, x: 2.2, roll: 1.5, armLO: 2.6, armRO: 2.8, legLO: 0.2 }],
  [0.85, { y: -0.3, x: 2.2, roll: 1.45, armLO: 1.2, armRO: 1.4 }],
  [1, { x: 2.2 }],
];

/** モーションの姿勢（4a で作るもの。無いものは歩く・走るのまま） */
export const MOTIONS: Partial<Record<MotionId, Key[]>> = {
  pass: kick(0.85, 1.05, 0.05, 0.55),
  longKick: kick(1.3, 1.6, -0.2, 0.9),
  shot: kick(1.25, 1.5, 0.15, 0.95),
  cross: kick(1.2, 1.4, -0.12, 0.9, 0.25),
  setKick: [[0, {}], [0.35, { legLF: 0.5, legRF: -0.4, armLF: -0.4, armRF: 0.4, lean: 0.15 }], ...kick(1.3, 1.6, -0.15, 0.9).slice(1).map(([t, p]) => [0.35 + t * 0.65, p] as Key)],
  gkKick: [[0, {}], [0.4, { legLF: 0.4, legRF: -0.4, armLF: -0.3, armRF: 0.3 }], ...kick(1.3, 1.7, -0.25, 1).slice(1).map(([t, p]) => [0.4 + t * 0.6, p] as Key)],
  trap: [
    [0, {}],
    [0.45, { legRF: 0.55, legRO: 0.15, y: -0.08, armLO: 0.6, armRO: 0.5, head: 0.35 }],
    [1, {}],
  ],
  chestTrap: [
    [0, {}],
    [0.45, { lean: -0.35, armLO: 0.8, armRO: 0.8, armLF: 0.3, armRF: 0.3, y: -0.06, legLF: 0.15 }],
    [1, {}],
  ],
  header: [
    [0, {}],
    [0.2, { y: -0.2, legLF: 0.35, legRF: 0.35, armLF: -0.4, armRF: -0.4 }],
    [0.4, { y: 0.75, lean: -0.3, armLO: 0.9, armRO: 0.9, legLF: 0.3, legRF: -0.2, head: -0.3 }],
    [0.52, { y: 0.85, lean: 0.35, armLO: 0.8, armRO: 0.8, legLF: 0.2, legRF: -0.3, head: 0.45 }],
    [0.8, { y: 0.05, lean: 0.1, legLF: 0.2, legRF: 0.2 }],
    [1, {}],
  ],
  gkDive: dive,
  gkCatch: [
    [0, {}],
    [0.45, { y: -0.18, lean: 0.25, armLF: 1.35, armRF: 1.35, armLO: 0.1, armRO: 0.1, legLO: 0.15, legRO: 0.15, head: 0.15 }],
    [0.7, { y: -0.1, lean: 0.15, armLF: 0.9, armRF: 0.9, armLO: -0.1, armRO: -0.1 }],
    [1, {}],
  ],
  gkHighCatch: [
    [0, {}],
    [0.25, { y: -0.2, legLF: 0.4, legRF: 0.4 }],
    [0.5, { y: 0.8, armLF: 2.8, armRF: 2.8, armLO: 0.15, armRO: 0.15, legLF: 0.5, legRF: -0.1, head: -0.3 }],
    [0.8, { y: 0, armLF: 1.2, armRF: 1.2 }],
    [1, {}],
  ],
  gkPunch: [
    [0, {}],
    [0.25, { y: -0.2, legLF: 0.4, legRF: 0.4 }],
    [0.45, { y: 0.8, armLF: 2.9, armRF: 2.4, armLO: 0.2, armRO: 0.3, legLF: 0.5, head: -0.3 }],
    [0.75, { y: 0, armLF: 1.0, armRF: 0.8 }],
    [1, {}],
  ],
};

/** 足を使う動き（左利きなら鏡に映す） */
export const FOOT_MOTIONS = new Set<MotionId>(["pass", "longKick", "shot", "cross", "setKick", "gkKick", "trap"]);

const smooth = (u: number) => u * u * (3 - 2 * u);

/** モーションの姿勢（u：0〜1）。mirror は左右を入れ替える（左足・左へ跳ぶ） */
export function samplePose(motion: MotionId, u: number, mirror: boolean, out: Pose): Pose | undefined {
  const keys = MOTIONS[motion];
  if (!keys) return undefined;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] <= u) i++;
  const [t0, p0] = keys[i];
  const [t1, p1] = keys[Math.min(i + 1, keys.length - 1)];
  const w = t1 > t0 ? smooth(Math.max(0, Math.min(1, (u - t0) / (t1 - t0)))) : 1;
  for (const k of KEYS) {
    const a = p0[k] ?? REST[k];
    const b = p1[k] ?? REST[k];
    out[k] = a + (b - a) * w;
  }
  if (mirror) {
    const swap = (a: keyof Pose, b: keyof Pose) => {
      const v = out[a];
      out[a] = out[b];
      out[b] = v;
    };
    swap("legLF", "legRF");
    swap("legLO", "legRO");
    swap("armLF", "armRF");
    swap("armLO", "armRO");
    out.roll = -out.roll;
    out.twist = -out.twist;
    out.x = -out.x;
  }
  return out;
}

/**
 * 歩く・走る・待機（速さ speed は m/s、phase は脚の振りの位相）。
 * 速さが 0.5 未満なら待機、3 未満なら歩く、それ以上は走る（計画 5.1）
 */
export function locomotion(speed: number, phase: number, idleT: number, gkStance: number, out: Pose): Pose {
  copyPose(out, REST);
  if (speed < 0.5) {
    out.y = Math.sin(idleT * 2.2) * 0.015;
    out.armLO = out.armRO = 0.28 + Math.sin(idleT * 2.2) * 0.02;
  } else {
    const run = Math.min(1, Math.max(0, (speed - 3) / 4));
    const amp = 0.35 + 0.55 * Math.min(1, speed / 7);
    const s = Math.sin(phase);
    out.legLF = s * amp;
    out.legRF = -s * amp;
    out.armLF = -s * amp * (0.6 + run * 0.4);
    out.armRF = s * amp * (0.6 + run * 0.4);
    out.armLO = out.armRO = 0.22 + run * 0.1;
    out.y = Math.abs(Math.cos(phase)) * (0.03 + run * 0.06);
    out.lean = 0.05 + run * 0.18;
  }
  if (gkStance > 0) {
    const g = gkStance * (speed < 3 ? 1 : 0.4);
    out.y += -0.14 * g;
    out.lean += 0.22 * g;
    out.armLF += 0.55 * g;
    out.armRF += 0.55 * g;
    out.armLO += 0.15 * g;
    out.armRO += 0.15 * g;
    out.legLO += 0.12 * g;
    out.legRO += 0.12 * g;
  }
  return out;
}

export function blendPose(out: Pose, a: Pose, b: Pose, w: number): Pose {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * w;
  return out;
}
