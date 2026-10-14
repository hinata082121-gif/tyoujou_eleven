/**
 * 台本の再生（P4。計画 4.1・5.1）：演出タイムライン（2D と同じ frameAt）の位置へ選手をばねで寄せ、
 * 速さから歩く・走るを選び、その上に台本の動き（キック・GK の動きなど）を重ねる。ボールには高さを足す。
 * 試合の結果には関わらない（表示だけ）
 */
import * as THREE from "three";
import { bodyScale, gkKit } from "@/engine/look";
import type { MatchState, Side } from "@/engine/match/types";
import { buildTimeline, frameAt, type ReplayFrame, type ReplayTimeline } from "@/engine/replay";
import { activeCues, ballHeightAt, buildMotionScript, shotAt, type CameraShot, type Cue, type MotionScript } from "@/engine/replay/motion";
import type { Kit } from "@/engine/types";
import { applyPose, buildCharacter, type Character } from "./character";
import { blendPose, copyPose, FOOT_MOTIONS, locomotion, REST, samplePose, type Pose } from "./poses";
import { PITCH_L, toWorldX, toWorldZ } from "./stage";
import { ballTexture } from "./textures";
import { MOTION_TIMING } from "@/engine/config/replay";

interface Actor {
  c: Character;
  side: Side;
  gk: boolean;
  left: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  phase: number;
  stance: number;
  visible: boolean;
}

const KICKS = new Set(["pass", "longKick", "shot", "cross", "setKick", "gkKick"]);
const angleLerp = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

export interface AnimatorOptions {
  ms: MatchState;
  kits: [Kit, Kit];
  gk: [number, number];
  shadows: boolean;
}

export class Animator {
  readonly group = new THREE.Group();
  readonly ball: THREE.Mesh;
  readonly ballPos = new THREE.Vector3(0, MOTION_TIMING.ball.radius, 0);
  private actors = new Map<string, Actor>();
  private tl!: ReplayTimeline;
  private script!: MotionScript;
  private eventCount = -1;
  private cues = new Map<string, Cue>();
  private shadow: THREE.InstancedMesh;
  private tmpLoco: Pose = copyPose({} as Pose, REST);
  private tmpMotion: Pose = copyPose({} as Pose, REST);
  private tmpOut: Pose = copyPose({} as Pose, REST);
  private m4 = new THREE.Matrix4();
  private first = true;
  private idleT = 0;

  constructor(private o: AnimatorOptions) {
    const r = MOTION_TIMING.ball.radius;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshLambertMaterial({ map: ballTexture() }));
    this.group.add(this.ball);
    const sg = new THREE.CircleGeometry(1, 16);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: o.shadows ? 0.28 : 0.14, depthWrite: false }), 40);
    this.shadow.frustumCulled = false;
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);
    this.refresh();
  }

  /** 試合が進んで（区間を計算して）イベントが増えたら、タイムラインと台本を作り直す */
  private refresh() {
    if (this.o.ms.events.length === this.eventCount) return;
    this.eventCount = this.o.ms.events.length;
    this.tl = buildTimeline(this.o.ms);
    this.script = buildMotionScript(this.o.ms, this.tl);
  }

  private actor(id: string, side: Side, gk: boolean): Actor | undefined {
    let a = this.actors.get(id);
    if (a && a.gk !== gk) {
      // GK とフィールドが入れ替わった（ポジションの変更）：ユニフォームを作り直す
      this.group.remove(a.c.root);
      a.c.dispose();
      this.actors.delete(id);
      a = undefined;
    }
    if (a) return a;
    const mp = this.o.ms.teams[side].players[id];
    if (!mp) return undefined;
    const body = bodyScale(mp.heightCm, mp.stats.physical);
    const kit = gk ? gkKit(this.o.gk[side]) : this.o.kits[side];
    const c = buildCharacter({ look: mp.look ?? { hair: 0, hairColor: 0, skin: 2, eyes: 0, brows: 0, mouth: 0 }, kit, number: mp.num, height: body.height, build: body.build });
    this.group.add(c.root);
    a = { c, side, gk, left: mp.foot === "L", pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: side === 0 ? Math.PI : 0, phase: 0, stance: 0, visible: true };
    this.actors.set(id, a);
    return a;
  }

  /** t：試合時間（分）、dt：前のフレームからの現実の秒、speed：倍速。カメラ用の場面を返す */
  update(t: number, dt: number, speed: number): CameraShot {
    this.refresh();
    const ms = this.o.ms;
    const f: ReplayFrame = frameAt(ms, this.tl, t);
    const ahead = frameAt(ms, this.tl, t + 0.12).ball;
    activeCues(this.script, t, this.cues);
    const k = 1 - Math.exp(-dt * (4 + 2 * speed));
    this.idleT += dt;
    const bx = toWorldX(f.ball.x),
      bz = toWorldZ(f.ball.y);
    const seen = new Set<string>();
    let si = 0;

    for (const d of f.dots) {
      const a = this.actor(d.id, d.side, d.gk);
      if (!a) continue;
      seen.add(d.id);
      let tx = toWorldX(d.x),
        tz = toWorldZ(d.y);
      // ボールのすぐ近くの選手は、ボールの少し後ろ（自陣の側）に立つ（ボールと体が重ならないように）
      const dx = tx - bx,
        dz = tz - bz;
      if (dx * dx + dz * dz < 1.6) {
        const back = d.side === 0 ? 1 : -1;
        tz = bz + back * 1.0;
        tx = bx + (dx >= 0 ? 0.45 : -0.45);
      }
      if (this.first || !a.visible) {
        a.pos.set(tx, 0, tz);
        a.vel.set(0, 0, 0);
      } else {
        const nx = a.pos.x + (tx - a.pos.x) * k;
        const nz = a.pos.z + (tz - a.pos.z) * k;
        if (dt > 0) a.vel.set((nx - a.pos.x) / dt, 0, (nz - a.pos.z) / dt);
        a.pos.x = nx;
        a.pos.z = nz;
      }
      a.visible = true;
      a.c.root.visible = true;
      const v = Math.hypot(a.vel.x, a.vel.z) / Math.max(1, speed);

      // 向き：走っていれば進む向き、止まっていればボールの方
      const cue = this.cues.get(d.id);
      let face = Math.atan2(bx - a.pos.x, bz - a.pos.z);
      if (cue && KICKS.has(cue.motion)) face = Math.atan2(toWorldX(ahead.x) - a.pos.x, toWorldZ(ahead.y) - a.pos.z);
      else if (v > 1.5 && !cue) face = Math.atan2(a.vel.x, a.vel.z);
      if (Math.abs(bx - a.pos.x) + Math.abs(bz - a.pos.z) < 0.01 && v <= 1.5) face = a.yaw;
      a.yaw = angleLerp(a.yaw, face, 1 - Math.exp(-dt * (cue ? 14 : 7)));
      a.c.root.position.copy(a.pos);
      a.c.root.rotation.y = a.yaw;

      // 歩く・走る（脚の振りは進んだ距離に合わせる。速すぎるときは振りの速さに上限）
      a.phase += Math.min(16, v * 2.3 * Math.max(1, speed) ** 0.5) * dt;
      const ownGoalZ = d.side === 0 ? PITCH_L / 2 : -PITCH_L / 2;
      const wantStance = d.gk && Math.abs(bz - ownGoalZ) < 35 ? 1 : 0;
      a.stance += (wantStance - a.stance) * (1 - Math.exp(-dt * 3));
      const loco = locomotion(v, a.phase, this.idleT + si * 0.7, a.stance, this.tmpLoco);
      let pose = loco;
      if (cue) {
        const u = (t - cue.t) / cue.dur;
        const mirror = FOOT_MOTIONS.has(cue.motion) ? a.left : cue.variant === "left";
        const mp = samplePose(cue.motion, Math.max(0, Math.min(1, u)), mirror, this.tmpMotion);
        if (mp) {
          const w = Math.min(1, u / 0.12, (1 - u) / 0.15);
          pose = blendPose(this.tmpOut, loco, mp, Math.max(0, w));
          // GK が横へ跳んだ分、足元の影も動く
        }
      }
      applyPose(a.c, pose);
      if (si < 39) {
        const sx = pose.x * Math.cos(a.yaw) * 1.6,
          sz = -pose.x * Math.sin(a.yaw) * 1.6;
        this.m4.makeScale(0.75, 1, 0.75).setPosition(a.pos.x + sx, 0.02, a.pos.z + sz);
        this.shadow.setMatrixAt(si++, this.m4);
      }
    }
    // 退場・交代で出ていない選手は隠す
    for (const [id, a] of this.actors)
      if (!seen.has(id) && a.visible) {
        a.visible = false;
        a.c.root.visible = false;
      }

    // ボール：位置はタイムラインのまま（少しだけ滑らかに）、高さは台本から
    const h = ballHeightAt(this.script, t);
    const kb = this.first ? 1 : 1 - Math.exp(-dt * 16);
    const ox = this.ballPos.x,
      oz = this.ballPos.z;
    this.ballPos.x += (bx - this.ballPos.x) * kb;
    this.ballPos.z += (bz - this.ballPos.z) * kb;
    this.ballPos.y = h;
    this.ball.position.copy(this.ballPos);
    const mvx = this.ballPos.x - ox,
      mvz = this.ballPos.z - oz;
    const dist = Math.hypot(mvx, mvz);
    if (dist > 1e-4) this.ball.rotateOnWorldAxis(new THREE.Vector3(mvz / dist, 0, -mvx / dist), dist / MOTION_TIMING.ball.radius);
    const bs = Math.max(0.15, 0.4 - h * 0.02);
    this.m4.makeScale(bs, 1, bs).setPosition(this.ballPos.x, 0.025, this.ballPos.z);
    this.shadow.setMatrixAt(si++, this.m4);
    this.shadow.count = si;
    this.shadow.instanceMatrix.needsUpdate = true;
    this.first = false;
    return shotAt(this.script, t)?.camera ?? "follow";
  }

  /** ボールの位置（カメラが追う） */
  get ballWorld() {
    return this.ballPos;
  }

  dispose() {
    for (const a of this.actors.values()) a.c.dispose();
    this.ball.geometry.dispose();
    const bm = this.ball.material as THREE.MeshLambertMaterial;
    bm.map?.dispose();
    bm.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
  }
}
