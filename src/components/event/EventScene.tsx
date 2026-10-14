"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../icons";
import { KitFigure } from "../look/Figure";
import { usePortrait } from "../shell/usePortrait";
import { SCENE_BACKGROUNDS } from "./backgrounds";
import { useGameStore } from "@/store/gameStore";
import { scenesFromCard, type EventSceneData, type SceneActor } from "./eventScenes";

const STAFF_DUMMY = { template: 0, main: 0, sub: 1, shorts: 0, socks: 0 };

/** 立ち絵（少し遅れて表情が変わる） */
function Actor({ a, size, delay }: { a: SceneActor; size: number; delay: number }) {
  const [expr, setExpr] = useState(a.expr);
  const portrait = usePortrait();
  useEffect(() => {
    if (!a.exprAfter || portrait) return;
    const t = setTimeout(() => setExpr(a.exprAfter!), 900);
    return () => clearTimeout(t);
  }, [a.exprAfter, portrait]);
  return (
    <div className="anim-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <KitFigure kit={a.kit ?? STAFF_DUMMY} number={a.number} look={a.look} expr={expr} size={size} height={a.height} build={a.build} outfit={a.outfit} gray={a.gray} />
    </div>
  );
}

const TONE_TAG = { good: "bg-yellow text-ink", bad: "bg-red text-white", info: "bg-telop text-ink" } as const;

/**
 * イベントの場面（画面いっぱい）。背景の絵、立ち絵（最大 3 人）、下に名前の札とせりふの枠、右上に結果の札。
 * タップで次の場面へ。choices を渡すと、せりふの枠の上に選択肢のボタンを並べる（R2 の選択肢のあるイベント用。R1 では使わない）
 */
export function EventScene({ scenes, onDone, choices }: { scenes: EventSceneData[]; onDone: () => void; choices?: ReactNode }) {
  const [i, setI] = useState(0);
  const s = scenes[i];
  if (!s) return null;
  const Bg = SCENE_BACKGROUNDS[s.bg];
  const next = () => (i + 1 < scenes.length ? setI(i + 1) : onDone());
  const size = s.actors.length >= 3 ? 196 : 220;
  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-night" onClick={choices ? undefined : next} role="button" tabIndex={0} aria-label="次へ" onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && next()}>
      <div key={s.key} className="absolute inset-0 anim-fade-up">
        <Bg />
      </div>
      {/* 立ち絵 */}
      <div key={`a-${s.key}`} className="absolute inset-x-0 bottom-[5.5rem] flex items-end justify-center gap-[10%]">
        {s.actors.map((a, j) => (
          <Actor key={a.key} a={a} size={size} delay={j * 90} />
        ))}
      </div>

      {/* 題名の札 */}
      <div key={`t-${s.key}`} className={`cut-r anim-band-in font-head absolute left-[max(0.75rem,var(--safe-l))] top-[max(0.625rem,var(--safe-t))] py-1 pl-3 pr-8 text-[1rem] ${TONE_TAG[s.tone]}`}>
        {s.title}
      </div>
      {/* 何枚目か・飛ばす */}
      <div className="absolute right-[max(0.75rem,var(--safe-r))] top-[max(0.625rem,var(--safe-t))] flex items-center gap-2">
        {scenes.length > 1 && (
          <span className="font-num bg-panel px-2 py-0.5 text-[0.875rem]">
            {i + 1}/{scenes.length}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
          className="pressable flex min-h-9 items-center gap-1 bg-panel px-3 text-[0.75rem] font-black text-text"
        >
          <Icon name="speed" size={14} />
          飛ばす
        </button>
      </div>
      {/* 結果の札 */}
      {s.badges.length > 0 && (
        <div key={`b-${s.key}`} className="absolute right-[max(0.75rem,var(--safe-r))] top-[3.25rem] flex flex-col items-end gap-1.5">
          {s.badges.map((b, j) => (
            <div key={j} className="cut-l anim-pop bg-telop py-1 pl-6 pr-3 text-right text-ink shadow-hard" style={{ animationDelay: `${250 + j * 120}ms` }}>
              <div className={`text-[0.6875rem] font-black ${b.tone === "bad" ? "text-red-2" : b.tone === "good" ? "text-good-ink" : "text-ink-2"}`}>{b.label}</div>
              <div className="font-head text-[1.125rem] leading-tight">{b.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 名前の札とせりふの枠 */}
      <div className="absolute bottom-[max(0.5rem,var(--safe-b))] left-[max(0.75rem,var(--safe-l))] right-[max(0.75rem,var(--safe-r))]">
        {choices && <div className="mb-2 flex justify-end gap-2">{choices}</div>}
        {s.speaker && (
          <div className="cut-r font-head inline-flex items-baseline gap-2.5 bg-yellow py-0.5 pl-3.5 pr-8 text-[1.125rem] text-ink">
            {s.speaker.name}
            <span className="font-body text-[0.75rem] font-black">{s.speaker.role}</span>
          </div>
        )}
        <div className="relative min-h-[4.25rem] border-l-[6px] border-yellow bg-panel py-2.5 pl-4 pr-10 text-[1rem] font-bold leading-relaxed">
          <p key={`x-${s.key}`} className="anim-fade-up">
            {s.text}
          </p>
          {!choices && <Icon name="down" size={18} className="anim-blink absolute bottom-2 right-3 text-yellow" />}
        </div>
      </div>
    </div>
  );
}

/** カードを使ったあとの出来事の場面（ストアの直前のカードから作る） */
export function CardScenes() {
  const game = useGameStore((s) => s.game)!;
  const lastCard = useGameStore((s) => s.lastCard);
  const finishScenes = useGameStore((s) => s.finishScenes);
  const [scenes] = useState(() => (lastCard ? scenesFromCard(game, lastCard) : []));
  useEffect(() => {
    if (scenes.length === 0) finishScenes();
  }, [scenes.length, finishScenes]);
  return <EventScene scenes={scenes} onDone={finishScenes} />;
}
