/**
 * Canvas で描くテクスチャ（P4。外部の画像は使わない）：シャツ・手足の色の帯・顔・ピッチ・ネット・観客・ボール
 */
import * as THREE from "three";
import { BROWS, EYES, KIT_PALETTE, MOUTHS, SKIN_TONES } from "@/engine/config/look";
import { numberColor } from "@/engine/look";
import type { Expr } from "@/engine/replay/motion";
import type { Kit, Look } from "@/engine/types";

export const col = (c: number) => KIT_PALETTE[c] ?? KIT_PALETTE[0];
const pick = <T extends { id: string }>(list: readonly T[], i: number) => (list[i] ?? list[0]).id;
export const skinHex = (look: Look) => (SKIN_TONES[look.skin] ?? SKIN_TONES[0]).hex;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** シャツの柄（u は胴の周り：u = 0 が前の中央、0.5 が背中。v は下 → 上）を描く */
function drawPattern(g: CanvasRenderingContext2D, kit: Kit, W: number, H: number) {
  g.fillStyle = col(kit.main);
  g.fillRect(0, 0, W, H);
  g.fillStyle = col(kit.sub);
  switch (kit.template) {
    case 1: // 縦縞
      for (let i = 0; i < 12; i += 2) g.fillRect((i * W) / 12, 0, W / 12, H);
      break;
    case 2: // 横縞
      for (let i = 0; i < 8; i += 2) g.fillRect(0, (i * H) / 8, W, H / 8);
      break;
    case 3: // ハーフ（体の片側）
      g.fillRect(0, 0, W / 2, H);
      break;
    case 4: // サッシュ（前は右肩から左の腰へ、背中へ続く）
      g.beginPath();
      for (const off of [0, W / 2, W]) {
        g.moveTo(off - W * 0.12, H);
        g.lineTo(off + W * 0.02, H);
        g.lineTo(off + W * 0.27, 0);
        g.lineTo(off + W * 0.14, 0);
        g.closePath();
      }
      g.fill();
      break;
    case 5: // 肩・袖の切り替え
      g.fillRect(0, 0, W, H * 0.22);
      break;
    case 6: // 胸の太いライン
      g.fillRect(0, H * 0.3, W, H * 0.2);
      break;
    case 7: // ピンストライプ
      for (let i = 0; i < 40; i++) g.fillRect((i * W) / 40, 0, Math.max(1, W / 170), H);
      break;
  }
  // 襟
  g.fillStyle = kit.sub === kit.main ? "#ffffff" : col(kit.sub);
  g.fillRect(0, 0, W, H * 0.04);
}

/** シャツ（胴のカプセルに貼る。背中に大きな背番号、胸に小さな番号） */
export function shirtTexture(kit: Kit, number: number | undefined, size = 256): THREE.CanvasTexture {
  const W = size,
    H = size / 2;
  const [c, g] = canvas(W, H);
  drawPattern(g, kit, W, H);
  if (number !== undefined) {
    const s = String(number);
    const tc = numberColor(kit) === 1 ? "#1c1c1e" : "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `bold ${Math.round(H * 0.44)}px 'Arial Black', Arial, sans-serif`;
    g.lineWidth = H * 0.04;
    g.strokeStyle = tc === "#ffffff" ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)";
    g.save();
    g.translate(W / 2, H * 0.5);
    g.scale(0.75, 1);
    g.strokeText(s, 0, 0);
    g.fillStyle = tc;
    g.fillText(s, 0, 0);
    g.restore();
    g.font = `bold ${Math.round(H * 0.16)}px Arial, sans-serif`;
    g.fillStyle = tc;
    g.fillText(s, W * 0.07, H * 0.32);
  }
  // カプセルの UV は u = 0.25 が正面なので、u = 0 を正面として描いた絵を 1/4 ずらす
  const [c2, g2] = canvas(W, H);
  g2.drawImage(c, W * 0.25, 0);
  g2.drawImage(c, -W * 0.75, 0);
  return toTexture(c2);
}

/** 上から順の色の帯（腕・脚。v = 1 が上） */
export function bandTexture(bands: [string, number][]): THREE.CanvasTexture {
  const [c, g] = canvas(4, 64);
  let y = 0;
  for (const [color, frac] of bands) {
    g.fillStyle = color;
    g.fillRect(0, Math.floor(y), 4, Math.ceil(frac * 64) + 1);
    y += frac * 64;
  }
  const t = toTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** 顔（頭の球に貼る。表情で描き分ける。SVG の絵と同じパーツ） */
export function faceTexture(look: Look, expr: Expr = "normal", S = 128): THREE.CanvasTexture {
  const [c, g] = canvas(S * 2, S);
  g.fillStyle = skinHex(look);
  g.fillRect(0, 0, S * 2, S);
  const k = S / 256;
  const cx = S,
    cy = S * 0.56;
  g.translate(cx, cy);
  g.scale(1.45 * k, 1.45 * k);
  g.translate(-cx / k, -cy / k);
  const X = cx / k,
    Y = cy / k;
  g.fillStyle = "rgba(240,120,110,0.28)";
  for (const dx of [-46, 46]) {
    g.beginPath();
    g.ellipse(X + dx, Y + 26, 14, 8, 0, 0, 7);
    g.fill();
  }
  const ink = "#2a1d18";
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineCap = "round";
  const eye = expr === "joy" ? "smile" : expr === "sad" || expr === "pain" ? "sad" : pick(EYES, look.eyes);
  for (const s of [-1, 1]) {
    const ex = X + s * 30,
      ey = Y;
    g.lineWidth = 5;
    g.beginPath();
    switch (eye) {
      case "dot":
        g.arc(ex, ey, 6, 0, 7);
        g.fill();
        break;
      case "oval":
        g.ellipse(ex, ey, 7, 11, 0, 0, 7);
        g.fill();
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(ex + 2, ey - 4, 2.5, 0, 7);
        g.fill();
        g.fillStyle = ink;
        break;
      case "round":
        g.arc(ex, ey, 10, 0, 7);
        g.fill();
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(ex + 3, ey - 4, 3.5, 0, 7);
        g.fill();
        g.fillStyle = ink;
        break;
      case "narrow":
        g.moveTo(ex - 10, ey);
        g.lineTo(ex + 10, ey);
        g.stroke();
        break;
      case "droopy":
        g.ellipse(ex, ey + 2, 7, 9, s * 0.35, 0, 7);
        g.fill();
        break;
      case "sharp":
        g.ellipse(ex, ey, 9, 6.5, -s * 0.32, 0, 7);
        g.fill();
        break;
      case "smile":
        g.arc(ex, ey + 6, 10, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
        break;
      default:
        g.arc(ex, ey - 6, 10, Math.PI * 0.15, Math.PI * 0.85);
        g.stroke();
    }
  }
  const brow = pick(BROWS, look.brows);
  g.lineWidth = brow === "thick" ? 8 : brow === "thin" ? 3 : 5;
  for (const s of [-1, 1]) {
    const bx = X + s * 30,
      by = Y - 24;
    let tilt = brow === "up" ? 6 : brow === "worried" ? -6 : 0;
    if (expr === "sad" || expr === "pain") tilt = -9;
    if (expr === "joy") tilt = 2;
    if (expr === "focus") tilt = 8;
    g.beginPath();
    g.moveTo(bx - s * 13, by + tilt * 0.2);
    g.lineTo(bx + s * 13, by - tilt);
    g.stroke();
  }
  g.lineWidth = 4;
  const my = Y + 40;
  const mouth = expr === "joy" ? "open" : expr === "sad" || expr === "pain" ? "frown" : expr === "focus" ? "flat" : pick(MOUTHS, look.mouth);
  g.beginPath();
  switch (mouth) {
    case "flat":
      g.moveTo(X - 9, my);
      g.lineTo(X + 9, my);
      g.stroke();
      break;
    case "smallSmile":
      g.arc(X, my - 6, 9, Math.PI * 0.2, Math.PI * 0.8);
      g.stroke();
      break;
    case "wide":
      g.arc(X, my - 10, 15, Math.PI * 0.25, Math.PI * 0.75);
      g.stroke();
      break;
    case "o":
      g.ellipse(X, my, 5, 6, 0, 0, 7);
      g.stroke();
      break;
    case "open":
      g.fillStyle = "#7a2a2a";
      g.arc(X, my - 4, 14, 0, Math.PI);
      g.closePath();
      g.fill();
      break;
    default:
      g.arc(X, my + 10, 11, Math.PI * 1.2, Math.PI * 1.8);
      g.stroke();
  }
  return toTexture(c);
}

/** ピッチ（芝の縞・ライン）。margin はピッチの外の芝の幅（m） */
export function pitchTexture(L: number, W: number, margin: number, scale: number): THREE.CanvasTexture {
  const [c, g] = canvas(Math.round((W + margin * 2) * scale), Math.round((L + margin * 2) * scale));
  g.fillStyle = "#3f8f3a";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 18; i++)
    if (i % 2) {
      g.fillStyle = "#4b9c44";
      g.fillRect(0, (margin + (i * L) / 18) * scale, c.width, (L / 18) * scale);
    }
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.lineWidth = Math.max(1.5, 0.14 * scale);
  const o = margin * scale;
  const R = (x: number, y: number, w: number, h: number) => g.strokeRect(o + x * scale, o + y * scale, w * scale, h * scale);
  R(0, 0, W, L);
  g.beginPath();
  g.moveTo(o, o + (L / 2) * scale);
  g.lineTo(o + W * scale, o + (L / 2) * scale);
  g.stroke();
  g.beginPath();
  g.arc(o + (W / 2) * scale, o + (L / 2) * scale, 9.15 * scale, 0, 7);
  g.stroke();
  R(W / 2 - 20.16, 0, 40.32, 16.5);
  R(W / 2 - 20.16, L - 16.5, 40.32, 16.5);
  R(W / 2 - 9.16, 0, 18.32, 5.5);
  R(W / 2 - 9.16, L - 5.5, 18.32, 5.5);
  for (const [y, a0, a1] of [
    [11, 0.2, 0.8],
    [L - 11, 1.2, 1.8],
  ]) {
    g.beginPath();
    g.arc(o + (W / 2) * scale, o + y * scale, 9.15 * scale, a0 * Math.PI, a1 * Math.PI);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.92)";
  for (const y of [11, L - 11, L / 2]) {
    g.beginPath();
    g.arc(o + (W / 2) * scale, o + y * scale, Math.max(1.5, 0.25 * scale), 0, 7);
    g.fill();
  }
  const t = toTexture(c);
  t.anisotropy = 4;
  return t;
}

/** ネットの網目（くり返し） */
export function netTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(32, 32);
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 2;
  g.strokeRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 観客の人の形（白で描き、色はインスタンスごとに付ける） */
export function crowdTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(32, 64);
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(16, 14, 9, 0, 7);
  g.fill();
  g.beginPath();
  g.moveTo(3, 64);
  g.quadraticCurveTo(2, 26, 16, 25);
  g.quadraticCurveTo(30, 26, 29, 64);
  g.fill();
  return new THREE.CanvasTexture(c);
}

export function ballTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 32);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = "#222";
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(5 + i * 11, i % 2 ? 10 : 22, 4, 0, 7);
    g.fill();
  }
  return toTexture(c);
}

/** 横断幕（学校の色と文言） */
export function bannerTexture(main: string, sub: string, text: string): THREE.CanvasTexture {
  const [c, g] = canvas(512, 64);
  g.fillStyle = main;
  g.fillRect(0, 0, 512, 64);
  g.fillStyle = sub;
  g.fillRect(0, 0, 512, 7);
  g.fillRect(0, 57, 512, 7);
  g.font = "bold 38px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 256, 33);
  return toTexture(c);
}
