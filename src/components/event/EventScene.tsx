"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../icons";
import { KitFigure } from "../look/Figure";
import { usePortrait } from "../shell/usePortrait";
import { SCENE_BACKGROUNDS } from "./backgrounds";
import { useGameStore } from "@/store/gameStore";
import { pendingChoice } from "@/engine/game";
import { graduationOutcome } from "@/engine/school/events";
import type { Expression } from "../look/Figure";
import { actorsFor, scenesFromCard, scenesFromOutcome, type EventSceneData, type SceneActor } from "./eventScenes";

const STAFF_DUMMY = { template: 0, main: 0, sub: 1, shorts: 0, socks: 0 };

/** 立ち絵（少し遅れて表情が変わる） */
function Actor({ a, size, delay, dim }: { a: SceneActor; size: number; delay: number; dim?: boolean }) {
  const [expr, setExpr] = useState(a.expr);
  const portrait = usePortrait();
  useEffect(() => {
    if (!a.exprAfter || portrait) return;
    const t = setTimeout(() => setExpr(a.exprAfter!), 900);
    return () => clearTimeout(t);
  }, [a.exprAfter, portrait]);
  return (
    <div className="anim-fade-up transition-[filter]" style={{ animationDelay: `${delay}ms`, filter: dim ? "brightness(0.72)" : undefined }}>
      <KitFigure kit={a.kit ?? STAFF_DUMMY} number={a.number} look={a.look} expr={expr} size={size} height={a.height} build={a.build} outfit={a.outfit} gray={a.gray} />
    </div>
  );
}

const TONE_TAG = { good: "bg-yellow text-ink", bad: "bg-red text-white", info: "bg-telop text-ink" } as const;

/**
 * イベントの場面（画面いっぱい）。背景の絵、立ち絵（最大 3 人）、下に名前の札とせりふの枠、右上に結果の札。
 * タップで次の場面へ。choices を渡すと、最後の 1 枚で、せりふの枠のすぐ上に選択肢のボタンを横並びにする（R2）。
 * そのときは立ち絵を選択肢の段より上に立たせ、顔と体に選択肢を重ねない（承認時の修正）。
 * compact は「文章だけ」の設定のときの小さな枠（背景・立ち絵なし）
 */
export function EventScene({ scenes, onDone, choices, compact, skippable = true }: { scenes: EventSceneData[]; onDone: () => void; choices?: ReactNode; compact?: boolean; skippable?: boolean }) {
  const [i, setI] = useState(0);
  const s = scenes[i];
  if (!s) return null;
  const last = i === scenes.length - 1;
  const choosing = !!choices && last;
  const next = () => (choosing ? undefined : i + 1 < scenes.length ? setI(i + 1) : onDone());
  if (compact) return <CompactScene s={s} index={i} total={scenes.length} onNext={next} choices={choosing ? choices : undefined} />;
  const Bg = SCENE_BACKGROUNDS[s.bg];
  const size = choosing ? (s.actors.length >= 3 ? 164 : 180) : s.actors.length >= 3 ? 196 : 220;
  return (
    <div className="fixed inset-0 z-40 select-none overflow-hidden bg-night" onClick={choosing ? undefined : next} role="button" tabIndex={0} aria-label="次へ" onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && next()}>
      <div key={s.key} className="absolute inset-0 anim-fade-up">
        <Bg />
      </div>
      {/* 立ち絵 */}
      <div key={`a-${s.key}`} className={`absolute inset-x-0 flex items-end justify-center gap-[10%] ${choosing ? "bottom-[10.5rem]" : "bottom-[5.5rem]"}`}>
        {s.actors.map((a, j) => (
          <Actor key={a.key} a={a} size={size} delay={j * 90} dim={!!s.speakerKey && s.actors.length > 1 && a.key !== s.speakerKey} />
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
        {skippable && !choosing && (
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
        )}
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
        {choosing && <div className="mb-1.5 flex items-stretch gap-2">{choices}</div>}
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
          {!choosing && <Icon name="down" size={18} className="anim-blink absolute bottom-2 right-3 text-yellow" />}
        </div>
      </div>
    </div>
  );
}

/** 「文章だけ」の設定のときの小さな枠（題名・文章・結果の札・選択肢。タップで次へ） */
function CompactScene({ s, index, total, onNext, choices }: { s: EventSceneData; index: number; total: number; onNext: () => void; choices?: ReactNode }) {
  return (
    <div className="bg-pitch-stripes fixed inset-0 z-40 flex select-none items-center justify-center px-[max(1rem,var(--safe-l))]" onClick={choices ? undefined : onNext} role="button" tabIndex={0} aria-label="次へ" onKeyDown={(e) => !choices && (e.key === "Enter" || e.key === " ") && onNext()}>
      <div className="w-full max-w-[34rem] bg-panel shadow-hard">
        <div className="flex items-center gap-2">
          <span className={`cut-r font-head py-1 pl-3 pr-7 text-[1rem] ${TONE_TAG[s.tone]}`}>{s.title}</span>
          {total > 1 && (
            <span className="font-num ml-auto px-2 text-[0.8125rem] text-text-2">
              {index + 1}/{total}
            </span>
          )}
        </div>
        <div className="border-l-[6px] border-yellow px-4 py-3">
          {s.speaker && (
            <div className="mb-0.5 text-[0.8125rem] font-black text-yellow">
              {s.speaker.name}
              <span className="ml-2 text-[0.6875rem] text-text-2">{s.speaker.role}</span>
            </div>
          )}
          <p key={`x-${s.key}`} className="anim-fade-up text-[1rem] font-bold leading-relaxed">
            {s.text}
          </p>
          {s.badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.badges.map((b, j) => (
                <span key={j} className="bg-telop px-2 py-0.5 text-[0.75rem] font-black text-ink">
                  <span className={b.tone === "bad" ? "text-red-2" : b.tone === "good" ? "text-good-ink" : "text-ink-2"}>{b.label}</span> {b.value}
                </span>
              ))}
            </div>
          )}
        </div>
        {choices ? <div className="flex items-stretch gap-2 px-3 pb-3">{choices}</div> : <Icon name="down" size={18} className="anim-blink mb-2 ml-auto mr-3 block text-yellow" />}
      </div>
    </div>
  );
}

/** カードを使ったあとの出来事の場面（ストアの直前のカードから作る。設定が「大事なものだけ」なら、大事な出来事だけ） */
export function CardScenes() {
  const game = useGameStore((s) => s.game)!;
  const lastCard = useGameStore((s) => s.lastCard);
  const finishScenes = useGameStore((s) => s.finishScenes);
  const mode = useGameStore((s) => s.settings.eventView);
  const [scenes] = useState(() => (lastCard ? scenesFromCard(game, lastCard, mode) : []));
  useEffect(() => {
    if (scenes.length === 0) finishScenes();
  }, [scenes.length, finishScenes]);
  return <EventScene scenes={scenes} onDone={finishScenes} />;
}

/**
 * 待っている出来事の場面（R2：月初の指示の後の行事、選択肢を選んだ後の結果、入学式など）。
 * 「文章だけ」の設定では小さな枠で見せる（止まって読む。行事と選択の結果は大事な出来事なので、読み飛ばさない）
 */
export function QueuedScenes() {
  const game = useGameStore((s) => s.game)!;
  const queue = useGameStore((s) => s.sceneQueue);
  const shiftScene = useGameStore((s) => s.shiftScene);
  const mode = useGameStore((s) => s.settings.eventView);
  const o = queue[0];
  const [scenes] = useState(() => (o ? scenesFromOutcome(game, o) : []));
  if (!o) return null;
  return <EventScene scenes={scenes} onDone={shiftScene} compact={mode === "text"} />;
}

/** 選択肢のあるイベント（R2）。地の文 → 話す人の一言と選択肢（効果の予告は出さない） → 選んだ後の結果は QueuedScenes で見せる */
export function ChoiceScreen() {
  const game = useGameStore((s) => s.game)!;
  const confirm = useGameStore((s) => s.confirmChoice);
  const pushScenes = useGameStore((s) => s.pushScenes);
  const mode = useGameStore((s) => s.settings.eventView);
  const [view] = useState(() => pendingChoice(game));
  if (!view) return null;
  const actors = actorsFor(game, view.cast, "normal");
  const base = { bg: view.bg as EventSceneData["bg"], title: view.title, tone: "info" as const, actors, badges: [] };
  const sp = view.speaker ? actors.find((a) => a.key.endsWith(`:${view.speaker!.id}`)) : undefined;
  const scenes: EventSceneData[] = [
    { ...base, key: "n", text: view.narration },
    { ...base, key: "i", text: view.intro, speaker: sp ? { name: sp.name, role: sp.role } : undefined, speakerKey: sp?.key, actors: actors.map((a) => (a.key === sp?.key ? { ...a, expr: introExpr(view.def.id) } : a)) },
  ];
  const choices = view.options.map((label, idx) => (
    <button
      key={idx}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        const o = confirm(idx);
        if (o) pushScenes([o]);
      }}
      className="pressable cut-r min-h-11 flex-1 bg-telop py-1.5 pl-3 pr-6 text-left text-[0.875rem] font-black leading-snug text-ink shadow-hard"
    >
      <span className="font-num mr-1.5 text-[0.75rem] text-red-2">{idx + 1}</span>
      {label}
    </button>
  ));
  return <EventScene key={view.def.id} scenes={scenes} onDone={() => undefined} choices={choices} compact={mode === "text"} skippable={false} />;
}

/** 選択肢の場面で、話す人の表情（もめごとは怒り、悩みごとは曇らせる） */
const INTRO_EXPR: Record<string, Expression> = {
  quarrel: "frustrated",
  gradeClash: "frustrated",
  gkRivalry: "frustrated",
  complaint: "frustrated",
  positionWorry: "sad",
  benchWorry: "sad",
  studyBalance: "sad",
  slumpTalk: "sad",
  injuryReturn: "sad",
  freshmanLonely: "sad",
  overwork: "sad",
  styleLost: "sad",
  captainWorry: "sad",
  newTrick: "joy",
  risingJunior: "joy",
  sportsDay: "joy",
  culturalFestival: "joy",
};
const introExpr = (id: string): Expression => INTRO_EXPR[id] ?? "normal";

/** 卒業式の場面（卒業の画面の前に見せる。表示だけ） */
export function GraduationScene({ onDone }: { onDone: () => void }) {
  const game = useGameStore((s) => s.game)!;
  const mode = useGameStore((s) => s.settings.eventView);
  const [scenes] = useState(() => scenesFromOutcome(game, graduationOutcome(game), "g"));
  return <EventScene scenes={scenes} onDone={onDone} compact={mode === "text"} />;
}
