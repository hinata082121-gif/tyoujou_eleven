/**
 * 台本の再生（P4・R3。計画 1 章・3 章）：選手とボールの動き（2D と同じ sim.ts）の位置にそのまま置き、
 * 速さから歩く・走るを選び、その上に台本の動き（キック・GK の動きなど）を重ねる。ボールの高さも動きから。
 * 試合の結果には関わらない（表示だけ）
 */
import * as THREE from "three";
import { bodyScale, gkKit } from "@/engine/look";
import type { MatchState, Side } from "@/engine/match/types";
import { activeCues, scriptFor, shotAt, type CameraShot, type Cue } from "@/engine/replay/motion";
import { PL, PW, replayFor, type ReplaySim } from "@/engine/replay/sim";
import type { Kit } from "@/engine/types";
import { applyPose, buildCharacter, PLAYER_SCALE, type Character } from "./character";
import { blendPose, copyPose, FOOT_MOTIONS, locomotion, REST, samplePose, type Pose } from "./poses";
import { PITCH_L, toWorldX, toWorldZ } from "./stage";
import { ballTexture } from "./textures";
import { MOTION_TIMING, MOVE } from "@/engine/config/replay";

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

const KICKS = new Set(["pass", "longKick", "shot", "cross", "setKick", "gkKick", "throwIn"]);
/** 場面の切り替えで暗くする長さ（試合時間の分。前後それぞれ） */
const CUT_FADE = 0.06;
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
  private sim: ReplaySim;
  private cues = new Map<string, Cue>();
  private shadow: THREE.InstancedMesh;
  private tmpLoco: Pose = copyPose({} as Pose, REST);
  private tmpMotion: Pose = copyPose({} as Pose, REST);
  private tmpOut: Pose = copyPose({} as Pose, REST);
  private m4 = new THREE.Matrix4();
  private first = true;
  private idleT = 0;
  /** 途中から再開して、動きの計算がまだ追いついていない（画面を暗くしておく） */
  seeking = false;

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
    this.sim = replayFor(o.ms);
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
  update(t0: number, dt: number, speed: number): CameraShot {
    const sim = this.sim;
    // 動きの計算は 1 フレームに少しずつ（途中から再開して追いつくまでは、seeking で画面を暗くする）
    const { t, seeking } = sim.pumpFrame(t0);
    this.seeking = seeking;
    const f = sim.frame(t, 0);
    const script = scriptFor(sim);
    activeCues(script, t, this.cues);
    this.idleT += dt;
    const bx = toWorldX(f.ball.x / PW),
      bz = toWorldZ(f.ball.y / PL);
    // 蹴る向き：今のボールの行き先
    const leg = f.leg;
    const lx = leg ? toWorldX(leg.to.x / PW) : bx,
      lz = leg ? toWorldZ(leg.to.y / PL) : bz;
    const seen = new Set<string>();
    let si = 0;

    for (const d of f.dots) {
      const sp = sim.players[d.idx];
      const a = this.actor(sp.id, sp.side, d.gk);
      if (!a) continue;
      seen.add(sp.id);
      a.pos.set(toWorldX(d.x / PW), 0, toWorldZ(d.y / PL));
      a.vel.set(toWorldX(d.vx / PW) - toWorldX(0), 0, toWorldZ(d.vy / PL) - toWorldZ(0));
      a.visible = true;
      a.c.root.visible = true;
      // 速さ（等速の現実の m/秒）
      const v = Math.hypot(d.vx, d.vy) / MOVE.secondsPerMinute;

      // 向き：走っていれば進む向き、止まっていればボールの方。蹴るときはボールの行き先
      const cue = this.cues.get(sp.id);
      let face = Math.atan2(bx - a.pos.x, bz - a.pos.z);
      if (cue && KICKS.has(cue.motion)) face = Math.atan2(lx - a.pos.x, lz - a.pos.z);
      else if (v > 1.5 && !cue) face = Math.atan2(a.vel.x, a.vel.z);
      if (Math.abs(bx - a.pos.x) + Math.abs(bz - a.pos.z) < 0.01 && v <= 1.5) face = a.yaw;
      a.yaw = this.first ? face : angleLerp(a.yaw, face, 1 - Math.exp(-dt * (cue ? 14 : 7)));
      a.c.root.position.copy(a.pos);
      a.c.root.rotation.y = a.yaw;

      // 歩く・走る（脚の振りは進んだ距離に合わせる。速すぎるときは振りの速さに上限）
      a.phase += Math.min(16, v * 2.3 * Math.max(1, speed) ** 0.5) * dt;
      const ownGoalZ = sp.side === 0 ? PITCH_L / 2 : -PITCH_L / 2;
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
        }
      }
      applyPose(a.c, pose);
      if (si < 39) {
        // GK が横へ跳んだ分、足元の影も動く
        const sx = pose.x * Math.cos(a.yaw) * PLAYER_SCALE,
          sz = -pose.x * Math.sin(a.yaw) * PLAYER_SCALE;
        this.m4.makeScale(0.62, 1, 0.62).setPosition(a.pos.x + sx, 0.02, a.pos.z + sz);
        this.shadow.setMatrixAt(si++, this.m4);
      }
    }
    // 退場・交代で出ていない選手は隠す
    for (const [id, a] of this.actors)
      if (!seen.has(id) && a.visible) {
        a.visible = false;
        a.c.root.visible = false;
      }

    // ボール：位置と高さは動きのまま（高さは選手の大きさに合わせて伸ばす）
    const r = MOTION_TIMING.ball.radius;
    const h = r + Math.max(0, f.ball.h - MOVE.height.ground) * PLAYER_SCALE;
    const ox = this.ballPos.x,
      oz = this.ballPos.z;
    this.ballPos.set(bx, h, bz);
    this.ball.position.copy(this.ballPos);
    const mvx = this.ballPos.x - ox,
      mvz = this.ballPos.z - oz;
    const dist = Math.hypot(mvx, mvz);
    if (!this.first && dist > 1e-4 && dist < 5) this.ball.rotateOnWorldAxis(new THREE.Vector3(mvz / dist, 0, -mvx / dist), dist / r);
    const bs = Math.max(0.15, 0.4 - h * 0.02);
    this.m4.makeScale(bs, 1, bs).setPosition(this.ballPos.x, 0.025, this.ballPos.z);
    this.shadow.setMatrixAt(si++, this.m4);
    this.shadow.count = si;
    this.shadow.instanceMatrix.needsUpdate = true;
    this.first = false;
    return shotAt(script, t)?.camera ?? "follow";
  }

  /** 場面の切り替え（セットプレーの並び直し）の近くでは、画面を少し暗くする（0〜1） */
  cutFade(t0: number): number {
    const t = Math.min(t0, this.sim.computed);
    let k = 0;
    for (const c of this.sim.cuts) {
      const d = Math.abs(t - c);
      if (d < CUT_FADE) k = Math.max(k, 1 - d / CUT_FADE);
    }
    return k;
  }

  /** 選手の 3D の位置（速報が手前のプレーを隠さないかを見る） */
  *playerPositions(): Generator<THREE.Vector3> {
    for (const a of this.actors.values()) if (a.visible) yield a.pos;
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
