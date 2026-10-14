/**
 * 会場（P4。計画 6.1）：段階 1 学校のグラウンド、2 小さな競技場（片側にスタンド）、3 競技場（両側）、4 大きなスタジアム（4 面・屋根・照明塔）。
 * 形はコードで作る（外部の 3D 素材は使わない）。動かないものは形をまとめて描画の回数を減らす
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { VenueStage } from "@/engine/config/look";
import { buildCrowd, hash01, type Seat } from "./crowd";
import type { QualitySettings } from "./quality";
import { netTexture, pitchTexture } from "./textures";

export const PITCH_L = 105;
export const PITCH_W = 68;
/** ゴールは選手（約 1.6 倍）に合わせて約 1.45 倍の大きさで描く */
export const GOAL = { w: 7.32 * 1.45, h: 2.44 * 1.45, depth: 2.9 };

/** 演出タイムラインの座標（0〜1）→ 3D の位置 */
export const toWorldX = (x: number) => (x - 0.5) * PITCH_W;
export const toWorldZ = (y: number) => (y - 0.5) * PITCH_L;

export interface Stage {
  group: THREE.Group;
  crowd?: THREE.InstancedMesh;
  sky: THREE.Color;
  dispose: () => void;
}

const VENUE_LOOK: Record<VenueStage, { sky: string; apron: string; stand: string; fill: number; rows: number; sides: [number, number][] }> = {
  1: { sky: "#bcd8ee", apron: "#a88f6a", stand: "#9aa0a8", fill: 0, rows: 0, sides: [] },
  2: { sky: "#bcd8ee", apron: "#3a7a35", stand: "#9aa0a8", fill: 0.3, rows: 8, sides: [[1, 0]] },
  3: { sky: "#b4d2ee", apron: "#3a7a35", stand: "#8c939c", fill: 0.6, rows: 12, sides: [[1, 0], [-1, 0]] },
  4: { sky: "#9ec4e8", apron: "#3a7a35", stand: "#6c7480", fill: 0.92, rows: 20, sides: [[1, 0], [-1, 0], [0, 1], [0, -1]] },
};

function buildGoal(z: number, dir: number, net: THREE.Texture, disposables: { dispose: () => void }[]): THREE.Group {
  const grp = new THREE.Group();
  const { w, h, depth } = GOAL;
  const posts: THREE.BufferGeometry[] = [];
  for (const x of [-w / 2, w / 2]) {
    const p = new THREE.CylinderGeometry(0.1, 0.1, h, 8);
    p.translate(x, h / 2, 0);
    posts.push(p);
  }
  const bar = new THREE.CylinderGeometry(0.1, 0.1, w, 8);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, h, 0);
  posts.push(bar);
  const postGeo = mergeGeometries(posts)!;
  posts.forEach((g) => g.dispose());
  const postMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  disposables.push(postGeo, postMat);
  grp.add(new THREE.Mesh(postGeo, postMat));
  // ネット（裏・上・横の板を 1 つにまとめる）
  const planes: THREE.BufferGeometry[] = [];
  const back = new THREE.PlaneGeometry(w, h);
  back.translate(0, h / 2, -depth * dir);
  planes.push(back);
  const top = new THREE.PlaneGeometry(w, depth);
  top.rotateX(Math.PI / 2);
  top.translate(0, h, (-depth / 2) * dir);
  planes.push(top);
  for (const x of [-w / 2, w / 2]) {
    const sd = new THREE.PlaneGeometry(depth, h);
    sd.rotateY(Math.PI / 2);
    sd.translate(x, h / 2, (-depth / 2) * dir);
    planes.push(sd);
  }
  // 網目の大きさをそろえる（uv を m 単位に）
  for (const g of planes) {
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    g.computeBoundingBox();
    const s = g.boundingBox!.getSize(new THREE.Vector3());
    const [a, b] = s.x < 0.01 ? [s.z, s.y] : s.y < 0.01 ? [s.x, s.z] : [s.x, s.y];
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * a * 2.2, uv.getY(i) * b * 2.2);
  }
  const netGeo = mergeGeometries(planes)!;
  planes.forEach((g) => g.dispose());
  const netMat = new THREE.MeshBasicMaterial({ map: net, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  disposables.push(netGeo, netMat);
  grp.add(new THREE.Mesh(netGeo, netMat));
  grp.position.z = z;
  return grp;
}

/** 会場を作る。home は自校の応援の色 */
export function buildStage(venue: VenueStage, homeMain: string, homeSub: string, q: QualitySettings): Stage {
  const look = VENUE_LOOK[venue];
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    disposables.push(geo, mat);
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    return m;
  };

  // ピッチと外側
  const margin = 5;
  const tex = pitchTexture(PITCH_L, PITCH_W, margin, q.pitchTexScale);
  disposables.push(tex);
  const ground = add(new THREE.PlaneGeometry(PITCH_W + margin * 2, PITCH_L + margin * 2), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  const apron = add(new THREE.PlaneGeometry(PITCH_W + 160, PITCH_L + 160), new THREE.MeshLambertMaterial({ color: look.apron }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.4;

  const net = netTexture();
  disposables.push(net);
  group.add(buildGoal(-PITCH_L / 2, -1, net, disposables));
  group.add(buildGoal(PITCH_L / 2, 1, net, disposables));

  const seats: Seat[] = [];
  const thin = q.crowdDensity;
  if (venue === 1) {
    // 学校のグラウンド：柵・校舎・ベンチ、立ち見がまばら
    const fence: THREE.BufferGeometry[] = [];
    for (const x of [-(PITCH_W / 2 + 7), PITCH_W / 2 + 7]) {
      const f = new THREE.BoxGeometry(0.15, 1.4, PITCH_L + 14);
      f.translate(x, 0.7, 0);
      fence.push(f);
    }
    for (const z of [-(PITCH_L / 2 + 8), PITCH_L / 2 + 8]) {
      const f = new THREE.BoxGeometry(PITCH_W + 14, 1.4, 0.15);
      f.translate(0, 0.7, z);
      fence.push(f);
    }
    for (const s of [-1, 1]) {
      const bench = new THREE.BoxGeometry(0.8, 1.2, 6);
      bench.translate(-(PITCH_W / 2 + 4), 0.6, s * 8);
      fence.push(bench);
    }
    add(mergeGeometries(fence)!, new THREE.MeshLambertMaterial({ color: "#5a6b5a" }));
    const school = add(new THREE.BoxGeometry(90, 16, 12), new THREE.MeshLambertMaterial({ color: "#e8e2d6" }));
    school.position.set(0, 8, -(PITCH_L / 2 + 30));
    const windows: THREE.BufferGeometry[] = [];
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 11; i++) {
        const w = new THREE.PlaneGeometry(4.5, 2.6);
        w.translate(-40 + i * 8, 5 + r * 6, -(PITCH_L / 2 + 23.9));
        windows.push(w);
      }
    add(mergeGeometries(windows)!, new THREE.MeshLambertMaterial({ color: "#7aa0c0" }));
    const n = Math.round(70 * thin);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? -1 : 1;
      seats.push({ x: side * (PITCH_W / 2 + 8.5 + hash01(i, 1) * 3), y: 0, z: -45 + hash01(i, 2) * 90, home: side > 0 && hash01(i, 4) < 0.5 });
    }
  } else {
    // 競技場（段階 2・3）は陸上のトラックで囲む。スタンドはトラックの外
    const track = venue === 2 || venue === 3;
    const d0 = track ? 15 : 9;
    if (track) {
      const t = add(new THREE.PlaneGeometry(PITCH_W + 28, PITCH_L + 36), new THREE.MeshLambertMaterial({ color: "#a85a3c" }));
      t.rotation.x = -Math.PI / 2;
      t.position.y = -0.2;
    }
    // ピッチの周りの低い板（広告は入れない）
    const boards: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const b = new THREE.BoxGeometry(0.2, 0.9, PITCH_L + 12);
      b.translate(sx * (PITCH_W / 2 + 5), 0.45, 0);
      boards.push(b);
    }
    for (const sz of [-1, 1])
      for (const sx of [-1, 1]) {
        // ゴールの裏は真ん中をあける
        const b = new THREE.BoxGeometry(PITCH_W / 2 - 5, 0.9, 0.2);
        b.translate(sx * (PITCH_W / 4 + 5), 0.45, sz * (PITCH_L / 2 + 6));
        boards.push(b);
      }
    add(mergeGeometries(boards)!, new THREE.MeshLambertMaterial({ color: "#1f3a6b" }));
    const steps: THREE.BufferGeometry[] = [];
    for (const [sx, sz] of look.sides) {
      const len = sx ? PITCH_L + 8 : PITCH_W + 8;
      for (let r = 0; r < look.rows; r++) {
        const d = d0 + r * 1.0,
          h = 0.6 + r * 0.55;
        const step = new THREE.BoxGeometry(sx ? 1.0 : len, h, sx ? len : 1.0);
        step.translate(sx * (PITCH_W / 2 + d), h / 2, sz * (PITCH_L / 2 + d));
        steps.push(step);
        const per = Math.floor((len / 0.9) * thin);
        for (let k = 0; k < per; k++) {
          const id = r * 1000 + k + (sx + 2) * 100000 + (sz + 2) * 400000;
          if (hash01(id, 7) > look.fill) continue;
          const along = -len / 2 + (k + 0.5) * (len / per);
          // 自校の応援席：右側（+x）のスタンドの中央
          const home = sx > 0 && Math.abs(along) < 20;
          seats.push({ x: sx ? sx * (PITCH_W / 2 + d) : along, y: h, z: sx ? along : sz * (PITCH_L / 2 + d), home });
        }
      }
    }
    add(mergeGeometries(steps)!, new THREE.MeshLambertMaterial({ color: look.stand }));
    steps.forEach((g) => g.dispose());
    if (venue === 4) {
      const roof = add(new THREE.BoxGeometry(12, 0.5, PITCH_L + 20), new THREE.MeshLambertMaterial({ color: "#cfd4da" }));
      roof.position.set(-(PITCH_W / 2 + 9 + look.rows - 5), look.rows * 0.55 + 6, 0);
      roof.rotation.z = -0.12;
      const towers: THREE.BufferGeometry[] = [];
      const lamps: THREE.BufferGeometry[] = [];
      for (const [x, z] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const t = new THREE.CylinderGeometry(0.5, 0.7, 40, 6);
        t.translate(x * (PITCH_W / 2 + 34), 20, z * (PITCH_L / 2 + 30));
        towers.push(t);
        const l = new THREE.BoxGeometry(7, 4, 0.8);
        l.lookAt(new THREE.Vector3(-x, -0.6, -z));
        l.translate(x * (PITCH_W / 2 + 34), 40, z * (PITCH_L / 2 + 30));
        lamps.push(l);
      }
      add(mergeGeometries(towers)!, new THREE.MeshLambertMaterial({ color: "#999999" }));
      add(mergeGeometries(lamps)!, new THREE.MeshBasicMaterial({ color: "#fffbe0" }));
    }
  }
  let crowd: THREE.InstancedMesh | undefined;
  if (seats.length) {
    crowd = buildCrowd(seats, homeMain, homeSub);
    disposables.push(crowd.geometry, crowd.material as THREE.Material, (crowd.material as THREE.MeshBasicMaterial).map!);
    group.add(crowd);
  }
  return { group, crowd, sky: new THREE.Color(look.sky), dispose: () => disposables.forEach((d) => d.dispose()) };
}
