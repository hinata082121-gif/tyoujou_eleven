/**
 * キャラクターの組み立て（P4。SPEC 17.1）：2.5 頭身。頭は大きな球、胴・腕・脚はカプセルで、肩と腰で胴にめり込ませてつなげる。
 * 描画の回数を減らすため、動く部品ごと（頭・胴・左右の腕・左右の脚）に形をまとめて 1 つにする（1 人 6 回）
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HAIR_COLORS, HAIR_STYLES } from "@/engine/config/look";
import type { Expr } from "@/engine/replay/motion";
import type { Kit, Look } from "@/engine/types";
import type { Pose } from "./poses";
import { bandTexture, col, faceTexture, shirtTexture, skinHex } from "./textures";

/**
 * 見やすさのため、選手は実寸より大きく描く（ピッチは実寸）。R3 で 1.6 倍から 1.3 倍に（承認のときの修正 3）：
 * 味方どうしは 3.6m 以上離れて動くので、この大きさなら体どうしの間にすき間が見える
 */
export const PLAYER_SCALE = 1.3;
const R = 0.5;

/** 顔のテクスチャの上の帯（頭のてっぺん。髪に隠れる）に、髪の色を塗っておく所 */
const UV_HAIR: [number, number] = [0.25, 0.97];
const UV_HAIR_LIGHT: [number, number] = [0.75, 0.97];
const UV_SKIN: [number, number] = [0.1, 0.5];

function paintUV(geo: THREE.BufferGeometry, [u, v]: [number, number]) {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return geo;
}

/** 顔のテクスチャに髪の色の帯を足す */
function faceWithSwatches(look: Look, expr: Expr): THREE.CanvasTexture {
  const tex = faceTexture(look, expr);
  const c = tex.image as HTMLCanvasElement;
  const g = c.getContext("2d")!;
  const hair = (HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0]).hex;
  const style = (HAIR_STYLES[look.hair] ?? HAIR_STYLES[0]).id;
  // 坊主は地肌が透けて見える色、ツーブロックの刈り上げは明るい色
  const main = style === "buzz" ? new THREE.Color(hair).lerp(new THREE.Color(skinHex(look)), 0.3) : new THREE.Color(hair);
  const light = new THREE.Color(hair).lerp(new THREE.Color("#bbbbbb"), 0.35);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = `#${main.getHexString()}`;
  g.fillRect(0, 0, c.width / 2, c.height * 0.12);
  g.fillStyle = `#${light.getHexString()}`;
  g.fillRect(c.width / 2, 0, c.width / 2, c.height * 0.12);
  tex.needsUpdate = true;
  return tex;
}

/** 髪（髪型ごとの形。どれも顔のテクスチャの髪の色の所を指す） */
function hairGeometries(style: string): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const cap = (r: number, thetaLen: number, tilt = 0.25, uv = UV_HAIR) => {
    const g = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, thetaLen);
    g.rotateX(-tilt);
    return paintUV(g, uv);
  };
  switch (style) {
    case "buzz":
      out.push(cap(R * 1.015, 1.45, 0.45));
      break;
    case "long": {
      out.push(cap(R * 1.08, 1.35, 0.15));
      out.push(paintUV(new THREE.SphereGeometry(R * 1.07, 12, 8, Math.PI * 1.5 - 1.25, 2.5, 0, 2.25), UV_HAIR));
      break;
    }
    case "twoBlock": {
      const top = cap(R * 1.12, 0.95, 0.2);
      top.translate(0, R * 0.05, 0);
      out.push(top);
      out.push(paintUV(new THREE.SphereGeometry(R * 1.01, 12, 8, 0, Math.PI * 2, 0, 1.12), UV_HAIR_LIGHT));
      break;
    }
    case "curly": {
      out.push(cap(R * 1.04, 1.2));
      for (let i = 0; i < 22; i++) {
        const th = 0.15 + (i % 3) * 0.32,
          ph = (i / 22) * Math.PI * 2 + (i % 2) * 0.3;
        if (Math.cos(ph) > 0.6 && th > 0.6) continue; // 顔の前はあける
        const s = new THREE.SphereGeometry(R * 0.26, 6, 4);
        const p = new THREE.Vector3().setFromSphericalCoords(R * 1.03, th, ph);
        s.translate(p.x, p.y, p.z);
        out.push(paintUV(s, UV_HAIR));
      }
      break;
    }
    case "spiky": {
      out.push(cap(R * 1.05, 1.15));
      for (let i = 0; i < 14; i++) {
        const th = 0.2 + (i % 2) * 0.45,
          ph = (i / 14) * Math.PI * 2;
        const cone = new THREE.ConeGeometry(R * 0.2, R * 0.55, 5);
        const p = new THREE.Vector3().setFromSphericalCoords(R, th, ph);
        cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize()));
        cone.translate(p.x, p.y, p.z);
        out.push(paintUV(cone, UV_HAIR));
      }
      break;
    }
    case "bowl":
      out.push(cap(R * 1.1, 1.6, 0.55));
      break;
    case "centerPart":
      for (const s of [-1, 1]) {
        const h = new THREE.SphereGeometry(R * 1.08, 10, 8, s > 0 ? 0 : Math.PI, Math.PI, 0, 1.45);
        h.rotateX(-0.2);
        h.rotateZ(s * 0.06);
        out.push(paintUV(h, UV_HAIR));
      }
      break;
    default: // short
      out.push(cap(R * 1.06, 1.25));
  }
  return out;
}

export interface Character {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: [THREE.Group, THREE.Group];
  arms: [THREE.Group, THREE.Group];
  hipY: number;
  /** 頭の中心の高さ（スケール前） */
  headY: number;
  dispose: () => void;
}

export interface CharacterOptions {
  look: Look;
  kit: Kit;
  number?: number;
  /** bodyScale の倍率 */
  height: number;
  build: number;
  expr?: Expr;
}

const lambert = (map: THREE.Texture) => new THREE.MeshLambertMaterial({ map });

/** 1 人の選手を作る（前は +z、足元が原点） */
export function buildCharacter(o: CharacterOptions): Character {
  const { look, kit } = o;
  const skin = skinHex(look);
  const hS = o.height;
  const w = o.build;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  const root = new THREE.Group();
  const legLen = 0.62 * hS;
  const hipY = legLen + 0.06;
  const body = new THREE.Group();
  body.position.y = hipY;
  root.add(body);

  // 脚（パンツの裾・肌・靴下・靴の帯。靴は同じ形にまとめる）
  const legMat = track(lambert(track(bandTexture([[col(kit.shorts), 0.12], [skin, 0.2], [col(kit.socks), 0.6], ["#222222", 0.08]]))));
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.16 * w, 0, 0);
    const leg = new THREE.CapsuleGeometry(0.11 * w, legLen - 0.1, 3, 8);
    leg.translate(0, -legLen / 2, 0);
    const shoe = new THREE.SphereGeometry(0.13, 8, 6);
    shoe.scale(1, 0.6, 1.5);
    shoe.translate(0, -legLen + 0.02, 0.05);
    paintUV(shoe, [0.5, 0.02]);
    const geo = track(mergeGeometries([leg, shoe])!);
    leg.dispose();
    shoe.dispose();
    pivot.add(new THREE.Mesh(geo, legMat));
    body.add(pivot);
    legs.push(pivot);
  }

  // 胴（シャツ）とパンツ（シャツのテクスチャの下の帯にパンツの色を塗って、同じ形にまとめる）
  const shirt = track(shirtTexture(kit, o.number));
  {
    const c = shirt.image as HTMLCanvasElement;
    const g = c.getContext("2d")!;
    g.fillStyle = col(kit.shorts);
    g.fillRect(0, c.height * 0.95, c.width, c.height * 0.05);
    shirt.needsUpdate = true;
  }
  const torsoH = 0.5 * hS;
  const torsoY = 0.12 + torsoH / 2 + 0.06;
  const torso = new THREE.CapsuleGeometry(0.3 * w, torsoH, 4, 14);
  torso.scale(1, 1, 0.82);
  torso.translate(0, torsoY, 0);
  const shorts = new THREE.CylinderGeometry(0.31 * w, 0.34 * w, 0.24, 14);
  shorts.translate(0, 0.04, 0);
  paintUV(shorts, [0.5, 0.01]);
  const torsoGeo = track(mergeGeometries([torso, shorts])!);
  torso.dispose();
  shorts.dispose();
  body.add(new THREE.Mesh(torsoGeo, track(lambert(shirt))));

  // 腕（肩で胴にめり込ませる。袖の色の帯）
  const arms: THREE.Group[] = [];
  const armGeo = track(new THREE.CapsuleGeometry(0.085 * w, 0.42 * hS, 3, 6));
  armGeo.translate(0, -0.24 * hS, 0);
  for (const s of [-1, 1]) {
    const sleeve = kit.template === 5 ? kit.sub : kit.template === 3 ? (s < 0 ? kit.sub : kit.main) : kit.main;
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.3 * w, torsoY + torsoH * 0.38, 0);
    pivot.add(new THREE.Mesh(armGeo, track(lambert(track(bandTexture([[col(sleeve), 0.42], [skin, 0.58]]))))));
    body.add(pivot);
    arms.push(pivot);
  }

  // 頭（首はなく、胴の上にのせる）。顔・耳・髪を 1 つにまとめる（位置は腰から）
  const headY = torsoY + torsoH / 2 + 0.3 * w * 0.6 + R * 0.88;
  const head = new THREE.Group();
  head.position.y = headY;
  const face = new THREE.SphereGeometry(R, 20, 14);
  face.rotateY(-Math.PI / 2);
  face.scale(1, 0.94, 0.96);
  const parts: THREE.BufferGeometry[] = [face];
  for (const s of [-1, 1]) {
    const ear = new THREE.SphereGeometry(0.09, 6, 4);
    ear.scale(1, 1, 0.6);
    ear.translate(s * R * 0.95, -0.04, 0);
    parts.push(paintUV(ear, UV_SKIN));
  }
  parts.push(...hairGeometries((HAIR_STYLES[look.hair] ?? HAIR_STYLES[0]).id));
  const headGeo = track(mergeGeometries(parts)!);
  parts.forEach((g) => g.dispose());
  const faceMat = track(lambert(track(faceWithSwatches(look, o.expr ?? "normal"))));
  head.add(new THREE.Mesh(headGeo, faceMat));
  body.add(head);

  root.scale.setScalar(PLAYER_SCALE);
  return {
    root,
    body,
    head,
    legs: legs as [THREE.Group, THREE.Group],
    arms: arms as [THREE.Group, THREE.Group],
    hipY,
    headY: hipY + headY,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/** 姿勢を部品の回転にする */
export function applyPose(c: Character, p: Pose) {
  c.body.position.set(p.x, c.hipY + p.y, p.z);
  c.body.rotation.set(p.lean, p.twist, -p.roll, "YXZ");
  c.head.rotation.x = p.head;
  c.legs[0].rotation.set(-p.legLF, 0, -p.legLO);
  c.legs[1].rotation.set(-p.legRF, 0, p.legRO);
  c.arms[0].rotation.set(-p.armLF, 0, -p.armLO);
  c.arms[1].rotation.set(-p.armRF, 0, p.armRO);
}
