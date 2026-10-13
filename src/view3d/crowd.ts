/**
 * 観客（P4。計画 6.1）：人の形の板をインスタンス描画で 1 回にまとめて出す。色は人ごとに変え、自校の応援席は学校の色を多くする
 */
import * as THREE from "three";
import { crowdTexture } from "./textures";

export interface Seat {
  x: number;
  y: number;
  z: number;
  /** 自校の応援席 */
  home: boolean;
}

const OTHER_COLORS = ["#d9d9d9", "#4b5d7a", "#7a4b4b", "#3d3d3d", "#8a8a6a", "#5f7a5f", "#c7b38d", "#e8e0d0", "#55606e"];

/** 決まった散らばり（0〜1） */
export const hash01 = (i: number, k = 0) => {
  const v = Math.sin(i * 78.233 + k * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

export function buildCrowd(seats: Seat[], homeMain: string, homeSub: string): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(0.75, 1.5);
  geo.translate(0, 0.75, 0);
  const tex = crowdTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
  const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, seats.length));
  inst.count = seats.length;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const c = new THREE.Color();
  seats.forEach((s, i) => {
    e.set(0, Math.atan2(-s.x, -s.z), 0);
    q.setFromEuler(e);
    pos.set(s.x, s.y, s.z);
    m4.compose(pos, q, one);
    inst.setMatrixAt(i, m4);
    const r = hash01(i, 3);
    c.set(s.home ? (r < 0.6 ? homeMain : r < 0.85 ? homeSub : "#e8e8e8") : OTHER_COLORS[Math.floor(r * OTHER_COLORS.length)]);
    inst.setColorAt(i, c);
  });
  inst.frustumCulled = false;
  return inst;
}
