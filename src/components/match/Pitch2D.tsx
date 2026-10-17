"use client";

/**
 * 2D 観戦（R3。計画 2 章の A 案）：canvas に毎フレーム直接描く（requestAnimationFrame）。React は描き直さない。
 * 試合の時計は観戦画面が持ち、ここは 0.1 秒ごとの時計の間をなめらかにつないで描くだけ（試合の結果には関わらない）。
 * 選手とボールの動きは 3D と同じ engine/replay/sim.ts
 */
import { useEffect, useMemo, useRef } from "react";
import type { MatchState, Side } from "@/engine/match/types";
import { replayFor } from "@/engine/replay/sim";
import { shortNames } from "@/lib/names";
import { drawFrame, type Fonts, type Insets } from "./pitch2d/draw";

/** 等速：試合時間 15 分 = 現実の 1 分 */
const GAME_MINUTES_PER_SECOND = 15 / 60;

export interface Pitch2DProps {
  ms: MatchState;
  /** 表示している試合時間（分。観戦画面が 0.1 秒ごとに進める） */
  display: number;
  /** 時計が進んでいるか */
  playing: boolean;
  speed: number;
  userSide: Side;
  /** ピッチを収める所（CSS のクラス。スコアボード・速報・ボタンを避ける。セーフエリアも CSS で） */
  areaClass: string;
  /** チームの広がりと最終ラインを重ねる（一時停止中・ハーフタイム） */
  tactical?: boolean;
  /** ?perf=1：fps と 1 フレームの時間を隅に出す */
  perf?: boolean;
}

function readFonts(): Fonts {
  const probe = (cls: string) => {
    const d = document.createElement("span");
    d.className = cls;
    document.body.appendChild(d);
    const f = getComputedStyle(d).fontFamily;
    d.remove();
    return f;
  };
  return { head: probe("font-head"), body: getComputedStyle(document.body).fontFamily, num: probe("font-num") };
}

export function Pitch2D(props: Pitch2DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const perfBox = useRef<HTMLPreElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  const clock = useRef({ display: props.display, at: 0, t: props.display, wake: 0 });
  const ms = props.ms;
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const side of [0, 1] as Side[]) for (const [id, n] of shortNames(Object.values(ms.teams[side].players))) m.set(id, n);
    return m;
  }, [ms]);
  const namesRef = useRef(names);

  useEffect(() => {
    live.current = props;
    namesRef.current = names;
    const c = clock.current;
    if (props.display !== c.display || !props.playing) {
      c.display = props.display;
      c.at = performance.now();
    }
    c.wake = performance.now();
  });

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d", { alpha: false });
    if (!ctx) return;
    const fonts = readFonts();
    // フォントの読み込みが済んだら描き直す
    document.fonts?.ready.then(() => {
      Object.assign(fonts, readFonts());
      clock.current.wake = performance.now();
    });
    const insets: Insets = { l: 0, r: 0, t: 0, b: 0 };
    let measured = false;
    const resize = () => {
      clock.current.wake = performance.now();
      measured = false;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    ro.observe(area.current!);

    const frames: number[] = [];
    const drawMs: number[] = [];
    let lastPerf = 0;
    let raf = 0;
    let last = performance.now();
    let seeking = true;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const lp = live.current;
      const c = clock.current;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // 止まっているときは、少し描いたら止める（電池を使わない）。途中から再開して動きの計算が追いつくまでは描き続ける
      if (!lp.playing && now - c.wake > 600 && !seeking) return;
      const rate = lp.playing ? GAME_MINUTES_PER_SECOND * lp.speed : 0;
      const target = Math.min(c.display + rate * Math.min(0.15, (now - c.at) / 1000), lp.ms.minute);
      c.t = target < c.t - 0.5 || !lp.playing ? target : Math.max(c.t, target);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth || 1,
        h = el.clientHeight || 1;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      if (!measured) {
        const a = el.getBoundingClientRect(),
          b = area.current!.getBoundingClientRect();
        insets.l = b.left - a.left;
        insets.t = b.top - a.top;
        insets.r = a.right - b.right;
        insets.b = a.bottom - b.bottom;
        measured = true;
      }
      const d0 = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seeking = drawFrame(ctx, w, h, replayFor(lp.ms), c.t, { userSide: lp.userSide, fonts, insets, names: namesRef.current, tactical: !!lp.tactical, speed: lp.speed });
      if (lp.perf && perfBox.current) {
        drawMs.push(performance.now() - d0);
        frames.push(dt);
        if (frames.length > 600) frames.shift();
        if (drawMs.length > 120) drawMs.shift();
        if (now - lastPerf > 500) {
          lastPerf = now;
          const recent = frames.slice(-60);
          const fps = recent.length / Math.max(1e-3, recent.reduce((s, x) => s + x, 0));
          const sorted = [...frames].sort((a, b) => b - a);
          const worst = sorted.slice(0, Math.max(1, Math.floor(frames.length / 100)));
          const low1 = 1 / (worst.reduce((s, x) => s + x, 0) / worst.length);
          const mean = drawMs.reduce((s, x) => s + x, 0) / Math.max(1, drawMs.length);
          perfBox.current.textContent = `2D fps ${fps.toFixed(0)}（下位1% ${low1.toFixed(0)}）\n1フレームの描画 ${mean.toFixed(2)}ms（動きの計算を含む）  画素密度 ${dpr}`;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-night">
      <div ref={area} aria-hidden className={`pointer-events-none absolute ${props.areaClass}`} />
      <canvas ref={canvas} className="block h-full w-full" role="img" aria-label="試合の2D表示" />
      {props.perf && <pre ref={perfBox} className="pointer-events-none absolute bottom-1 left-1/2 z-20 -translate-x-1/2 whitespace-pre bg-panel/80 px-1.5 py-1 font-mono text-[0.5625rem] leading-tight text-text" />}
    </div>
  );
}
