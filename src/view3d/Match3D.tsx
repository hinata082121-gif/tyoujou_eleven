"use client";

/**
 * 3D 観戦（P4。SPEC 10.8）の入口。観戦画面から動的に読み込む（ほかの画面からは import しない）。
 * 試合の時計は観戦画面が持ち、ここは表示の時刻を受け取って描くだけ（試合の結果には関わらない）
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { KIT_PALETTE } from "@/engine/config/look";
import type { MatchState, Side } from "@/engine/match/types";
import { Animator } from "./animator";
import { FollowCamera } from "./camera";
import { QUALITY, type Quality } from "./quality";
import { buildStage, FOG, LIGHTING } from "./stage";

/** 等速：試合時間 15 分 = 現実の 1 分 */
const GAME_MINUTES_PER_SECOND = 15 / 60;

export interface LoadTimes {
  /** 観戦の画面を開いた時刻（performance.now） */
  start: number;
  /** 3D のコードの読み込みが終わった時刻 */
  code?: number;
}

export interface Match3DProps {
  ms: MatchState;
  /** 表示している試合時間（分。観戦画面が 0.1 秒ごとに進める） */
  display: number;
  /** 時計が進んでいるか（一時停止・ハーフタイムなどは false） */
  playing: boolean;
  speed: number;
  userSide: Side;
  quality: Quality;
  perf: boolean;
  load: LoadTimes;
  onReady: () => void;
  onError: () => void;
  /** ナイター（R1 は空の色と光を変えるだけ。3D 観戦のデモで選ぶ） */
  night?: boolean;
}

const FALLBACK_KITS = [
  { template: 0, main: 12, sub: 0, shorts: 12, socks: 12 },
  { template: 0, main: 4, sub: 0, shorts: 4, socks: 4 },
] as const;

export default function Match3D(props: Match3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const perfBox = useRef<HTMLPreElement>(null);
  const live = useRef(props);
  const clock = useRef({ display: props.display, at: 0, t: props.display, wake: 0 });

  useEffect(() => {
    live.current = props;
    const c = clock.current;
    if (props.display !== c.display || !props.playing) {
      c.display = props.display;
      c.at = performance.now();
    }
    c.wake = performance.now();
  });

  useEffect(() => {
    const el = host.current!;
    const p = live.current;
    const q = QUALITY[p.quality];
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: q.antialias, powerPreference: "high-performance" });
    } catch {
      p.onError();
      return;
    }
    const built0 = performance.now();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const ms = p.ms;
    const view = ms.view;
    const kits = view?.kits ?? [FALLBACK_KITS[0], FALLBACK_KITS[1]];
    const home = view?.home ?? 0;
    const scene = new THREE.Scene();
    const stage = buildStage(view?.venue ?? 3, KIT_PALETTE[kits[home].main], KIT_PALETTE[kits[home].sub], q);
    const light = p.night ? LIGHTING.night : LIGHTING.day;
    const sky = p.night ? new THREE.Color(LIGHTING.night.sky) : stage.sky;
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, FOG.near, FOG.far);
    scene.add(stage.group);
    scene.add(new THREE.HemisphereLight(light.hemiSky, light.hemiGround, light.hemi));
    const sun = new THREE.DirectionalLight(light.sun, light.sunIntensity);
    sun.position.set(30, 60, 40);
    scene.add(sun);
    const anim = new Animator({ ms, kits: [kits[0], kits[1]], gk: view?.gk ?? [9, 11], shadows: q.shadows });
    scene.add(anim.group);
    // 自校が下から上へ攻める向き（side 0 は z が小さい方へ攻める）
    const cam = new FollowCamera(1, p.userSide === 0 ? -1 : 1);

    const resize = () => {
      const w = el.clientWidth || 1,
        h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      cam.setAspect(w / h);
      clock.current.wake = performance.now();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // 計測（?perf=1）
    const frames: number[] = [];
    const jsMs: number[] = [];
    const drawMs: number[] = [];
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    let lastPerf = 0;
    let firstFrame = 0;
    const built = performance.now();

    let raf = 0;
    let last = performance.now();
    let ready = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const lp = live.current;
      const c = clock.current;
      const dt = Math.min(0.1, (now - last) / 1000);
      // 止まっている（一時停止・ハーフタイム）ときは、カメラが落ち着いたら描かない（電池を使わない）
      if (!lp.playing && ready && now - c.wake > 1500) {
        last = now;
        return;
      }
      last = now;
      const rate = lp.playing ? GAME_MINUTES_PER_SECOND * lp.speed : 0;
      // 0.1 秒ごとの時計の間を、なめらかにつなぐ（先へ行きすぎない）
      const target = Math.min(c.display + rate * Math.min(0.15, (now - c.at) / 1000), lp.ms.minute);
      c.t = target < c.t - 0.5 ? target : Math.max(c.t, target);
      const j0 = performance.now();
      const shot = anim.update(c.t, ready ? dt : 0, lp.speed);
      if (!ready) cam.snap(anim.ballWorld, shot);
      else cam.update(dt, anim.ballWorld, shot);
      const j1 = performance.now();
      renderer.render(scene, cam.camera);
      if (lp.perf) {
        jsMs.push(j1 - j0);
        drawMs.push(performance.now() - j1);
        if (jsMs.length > 120) {
          jsMs.shift();
          drawMs.shift();
        }
      }
      if (!ready) {
        ready = true;
        firstFrame = performance.now();
        lp.onReady();
      }
      if (lp.perf && perfBox.current) {
        frames.push(dt);
        if (frames.length > 600) frames.shift();
        if (now - lastPerf > 500) {
          lastPerf = now;
          const recent = frames.slice(-60);
          const fps1 = recent.length / Math.max(1e-3, recent.reduce((s, x) => s + x, 0));
          const avg = frames.length / Math.max(1e-3, frames.reduce((s, x) => s + x, 0));
          const sorted = [...frames].sort((a, b) => b - a);
          const worst = sorted.slice(0, Math.max(1, Math.floor(frames.length / 100)));
          const low1 = 1 / (worst.reduce((s, x) => s + x, 0) / worst.length);
          const info = renderer.info;
          const lt = lp.load;
          perfBox.current.textContent = [
            `fps ${fps1.toFixed(0)}（平均 ${avg.toFixed(0)}・下位1% ${low1.toFixed(0)}）`,
            `1フレーム ${(1000 / Math.max(1, fps1)).toFixed(1)}ms（動きの計算 ${mean(jsMs).toFixed(1)}ms・描画の命令 ${mean(drawMs).toFixed(1)}ms）`,
            `描画 ${info.render.calls}回  三角形 ${(info.render.triangles / 1000).toFixed(1)}k`,
            `テクスチャ ${info.memory.textures}  形 ${info.memory.geometries}  画素密度 ${renderer.getPixelRatio()}`,
            `読み込み：コード ${lt.code ? (lt.code - lt.start).toFixed(0) : "?"}ms・組み立て ${(built - built0).toFixed(0)}ms・最初の1枚 ${(firstFrame - lt.start).toFixed(0)}ms`,
          ].join("\n");
        }
      }
    };
    raf = requestAnimationFrame(loop);

    const lost = (e: Event) => {
      e.preventDefault();
      live.current.onError();
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      anim.dispose();
      stage.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
    // 画質・ナイターを変えたときだけ作り直す
  }, [props.quality, props.night]);

  return (
    <div ref={host} className="absolute inset-0 overflow-hidden">
      {props.perf && <pre ref={perfBox} className="pointer-events-none absolute left-1 top-1 z-10 whitespace-pre bg-panel/80 px-1.5 py-1 font-mono text-[0.5625rem] leading-tight text-text" />}
    </div>
  );
}
