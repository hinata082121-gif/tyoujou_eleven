/**
 * カメラ（P4。計画 7.1）：自校が下から上へ攻める向きで、斜め上から見下ろす。ボールの位置を、ばねで遅れて追う。
 * 横の動きは少しだけ、縦の動きはしっかり追う。相手のゴール前では少し寄る
 */
import * as THREE from "three";
import type { CameraShot } from "@/engine/replay/motion";
import { PITCH_L } from "./stage";

const DIST: Record<CameraShot, number> = { follow: 54, wide: 66, near: 42, box: 46, corner: 46, goal: 36, pk: 30 };
const ELEVATION = (36 * Math.PI) / 180;

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private focus = new THREE.Vector3(0, 0, 0);
  private dist = DIST.wide;
  /** 自校が攻める向き（-1：z が小さい方へ攻める） */
  private readonly attack: 1 | -1;

  constructor(aspect: number, attack: 1 | -1) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 2, 700);
    this.attack = attack;
    this.place();
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** dt は現実の秒。ball は 3D の位置 */
  update(dt: number, ball: THREE.Vector3, shot: CameraShot) {
    const kx = 1 - Math.exp(-dt * 0.9);
    const kz = 1 - Math.exp(-dt * 1.3);
    // ボールが相手のゴール前（自校から見て奥）にあるときは少し寄る
    const nearGoal = Math.abs(ball.z) > PITCH_L / 2 - 22;
    const base = DIST[shot === "follow" && nearGoal ? "box" : shot];
    // 縦長の画面では横が狭く見えるので、少し引く
    const narrow = Math.min(1.35, Math.max(1, 0.8 / this.camera.aspect));
    this.dist += (base * narrow - this.dist) * (1 - Math.exp(-dt * 1.2));
    this.focus.x += (ball.x * 0.55 - this.focus.x) * kx;
    const limit = PITCH_L / 2 - 14;
    // ボールより少し奥（ボールが画面の中央より少し下）を中心にして、ボールの先が見えるようにする
    const tz = Math.max(-limit, Math.min(limit, ball.z + this.attack * 3));
    this.focus.z += (tz - this.focus.z) * kz;
    this.place();
  }

  /** すぐにボールの位置へ合わせる（始めたとき） */
  snap(ball: THREE.Vector3, shot: CameraShot) {
    this.focus.set(ball.x * 0.55, 0, ball.z);
    this.dist = DIST[shot] * Math.min(1.35, Math.max(1, 0.8 / this.camera.aspect));
    this.place();
  }

  private place() {
    const back = -this.attack;
    this.camera.position.set(this.focus.x, this.focus.y + Math.sin(ELEVATION) * this.dist, this.focus.z + back * Math.cos(ELEVATION) * this.dist);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
  }
}
