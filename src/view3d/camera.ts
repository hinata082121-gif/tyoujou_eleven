/**
 * カメラ（R3。SPEC 10.8・計画 3.1）：タッチラインの外の斜め上から見る中継の向き。自校が画面の右へ攻める。
 * ボールを横（ピッチの長さの向き）にしっかり追い、奥行き（幅の向き）は少しだけ追う。ゴール前・セットプレーでは少し寄る。
 * PK 戦（pk）は、これまでどおりゴールの後ろから
 */
import * as THREE from "three";
import type { CameraShot } from "@/engine/replay/motion";
import { PITCH_L } from "./stage";

/** 場面ごとのカメラの距離（m） */
const DIST: Record<CameraShot, number> = { follow: 74, wide: 84, near: 60, box: 64, corner: 64, goal: 52, pk: 30 };
/** 見下ろす角度 */
const ELEVATION = (27 * Math.PI) / 180;
const FOV = 30;
/** PK 戦：ゴールの後ろの斜め上（P4 のまま） */
const PK_ELEVATION = (36 * Math.PI) / 180;

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private focus = new THREE.Vector3(0, 0, 0);
  private dist = DIST.wide;
  private pk = false;
  /** 自校が攻める向き（-1：z が小さい方へ攻める） */
  private readonly attack: 1 | -1;
  /** カメラのいるタッチラインの側（+1：x が大きい側） */
  readonly sideX: 1 | -1;

  constructor(aspect: number, attack: 1 | -1) {
    this.camera = new THREE.PerspectiveCamera(FOV, aspect, 2, 700);
    this.attack = attack;
    // 自校が z の小さい方へ攻める（attack = -1）なら、x が大きい側から見ると右へ攻める
    this.sideX = attack === -1 ? 1 : -1;
    this.place();
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** dt は現実の秒。ball は 3D の位置 */
  update(dt: number, ball: THREE.Vector3, shot: CameraShot) {
    this.pk = shot === "pk";
    const kz = 1 - Math.exp(-dt * 1.4);
    const kx = 1 - Math.exp(-dt * 0.8);
    const nearGoal = Math.abs(ball.z) > PITCH_L / 2 - 20;
    const base = DIST[shot === "follow" && nearGoal ? "box" : shot];
    // 縦に近い画面では横が狭く見えるので、少し引く
    const narrow = Math.min(1.35, Math.max(1, 1.5 / this.camera.aspect));
    this.dist += (base * narrow - this.dist) * (1 - Math.exp(-dt * 1.0));
    const limit = PITCH_L / 2 - 18;
    this.focus.z += (Math.max(-limit, Math.min(limit, ball.z)) - this.focus.z) * kz;
    this.focus.x += (ball.x * (this.pk ? 0.55 : 0.35) - this.focus.x) * kx;
    this.place();
  }

  /** すぐにボールの位置へ合わせる（始めたとき） */
  snap(ball: THREE.Vector3, shot: CameraShot) {
    this.pk = shot === "pk";
    this.focus.set(ball.x * 0.35, 0, ball.z);
    this.dist = DIST[shot] * Math.min(1.35, Math.max(1, 1.5 / this.camera.aspect));
    this.place();
  }

  private place() {
    if (this.pk) {
      const back = -this.attack;
      this.camera.position.set(this.focus.x, Math.sin(PK_ELEVATION) * this.dist, this.focus.z + back * Math.cos(PK_ELEVATION) * this.dist);
    } else {
      this.camera.position.set(this.focus.x + this.sideX * Math.cos(ELEVATION) * this.dist, Math.sin(ELEVATION) * this.dist, this.focus.z);
    }
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
  }

  /** 3D の位置 → 画面の位置（0〜1。左上が 0。速報が手前のプレーを隠さないかを見る） */
  project(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(p).project(this.camera);
    out.set((out.x + 1) / 2, (1 - out.y) / 2, out.z);
    return out;
  }
}
