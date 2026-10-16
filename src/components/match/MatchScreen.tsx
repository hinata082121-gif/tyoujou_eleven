"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { FORMATIONS } from "@/engine/config/formations";
import { POSITION_NAMES } from "@/engine/config/names";
import { pendingMatchLabel } from "@/engine/game";
import { cancelSubstitution, injuredAwaitingSub, isBreakPhase, isPlayingPhase, playSegment, resumeFromBreak, subsRemaining } from "@/engine/match/engine";
import { manualFormation, manualSubstitution, manualTactics } from "@/engine/match/orders";
import { halfReport } from "@/engine/match/report";
import type { MatchTeamState, Side } from "@/engine/match/types";
import { FORMATION_IDS } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Icon, type IconName } from "../icons";
import { PlayerFace } from "../look/Figure";
import { usePortrait } from "../shell/usePortrait";
import { Bar, Button, fitnessColor, IconButton, Label, Segmented, Sheet } from "../ui";
import { EventLine, Momentum, Scoreboard, shownEvents, TeamStatus } from "./broadcast";
import { Pitch2D } from "./Pitch2D";
import { PkScreen } from "./PkScreen";
import { TacticsEditor } from "./TacticsEditor";
import { webglSupported } from "@/view3d/webgl";
import type { LoadTimes } from "@/view3d/Match3D";
import { shortNames } from "@/lib/names";
import { MOVE } from "@/engine/config/replay";
import { replayFor } from "@/engine/replay/sim";

/** 3D の描画（three）は、3D で観戦するときだけ読み込む（P4。ほかの画面の読み込みを重くしない） */
const loadTimes: LoadTimes = { start: 0 };
const Match3D = dynamic(
  () =>
    import("@/view3d/Match3D").then((m) => {
      loadTimes.code = performance.now();
      return m.default;
    }),
  { ssr: false, loading: () => <Stadium3DLoading /> },
);

function Stadium3DLoading() {
  return <div className="absolute inset-0 flex items-center justify-center bg-night text-[0.875rem] font-bold text-text-2">スタジアムを準備しています…</div>;
}

/** 等速：試合時間 15 分 = 現実の 1 分（SPEC 10.7） */
const GAME_MINUTES_PER_SECOND = 15 / 60;
const TICK_MS = 100;

export function MatchScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const touch = useGameStore((s) => s.touch);
  const finishMatch = useGameStore((s) => s.finishMatch);
  const switchToAuto = useGameStore((s) => s.switchToAuto);
  const speed = useGameStore((s) => s.settings.matchSpeed);
  const settings = useGameStore((s) => s.settings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const portrait = usePortrait();
  const am = game.activeMatch!;
  /** トーナメントは「トーナメントの表示」（3D／2D／テキスト）、リーグ戦・練習試合は今までの表示の設定（P4） */
  const tournament = am.kind !== "league" && am.kind !== "practice";
  const [lost3d, setLost3d] = useState(false);
  const view = tournament ? settings.tournamentView : settings.matchView;
  const no3d: null | "webgl" | "lost" = view !== "3d" ? null : lost3d ? "lost" : webglSupported() ? null : "webgl";
  const use3d = view === "3d" && no3d === null;
  const view2d = view === "2d" || (view === "3d" && no3d !== null);
  const [ready3d, setReady3d] = useState(false);
  const [perf] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("perf") === "1");
  const [tickerOpen, setTickerOpen] = useState(false);
  const tickerRef = useRef<HTMLButtonElement>(null);
  const wide = useWide();
  useEffect(() => {
    if (view !== "3d") return;
    loadTimes.start = performance.now();
  }, [view]);
  const ms = am.state;
  const side = am.userSide;
  const opp: Side = side === 0 ? 1 : 0;

  // 表示している試合時間（再開時は、計算済みの最後の区間の頭から再生し直す）
  const [display, setDisplay] = useState(() => (isPlayingPhase(ms) || ms.phase === "END" ? Math.max(0, ms.minute - 5) : ms.minute));
  const displayRef = useRef<number>(display);
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState(false);
  /** ケガ人が出たときに、交代で下げる選手として最初から選んでおく */
  const [presetOut, setPresetOut] = useState<string | null>(null);
  const prompted = useRef(new Set<string>());
  const label = pendingMatchLabel(game);
  /** リーグ戦・練習試合の采配あり：采配は試合前とハーフタイムだけ（P3） */
  const breaksOnly = !!ms.teams[side].breaksOnly;
  const toAuto = () => {
    if (window.confirm("残りをAIの監督に任せて、結果だけを出しますか？（采配ありには戻せません）")) switchToAuto();
  };

  const caughtUp = display >= ms.minute;
  const inBreak = isBreakPhase(ms) && caughtUp;
  const inPk = ms.phase === "PK" && caughtUp;
  const ended = ms.phase === "END" && caughtUp;
  /** 縦に持っている間は時計を止める（R1。縦持ちの画面が出ている） */
  const stopped = paused || panel || portrait;

  useEffect(() => {
    // 3D の読み込み中は時計を進めない
    if (stopped || inBreak || inPk || ended || (use3d && !ready3d)) return;
    const id = setInterval(() => {
      const state = useGameStore.getState().game?.activeMatch?.state;
      if (!state) return;
      if (displayRef.current >= state.minute) {
        if (isPlayingPhase(state)) {
          // 次の区間を計算（采配の変更はここで反映される）してセーブ
          playSegment(state);
          useGameStore.getState().touch(true);
        }
        return;
      }
      displayRef.current = Math.min(state.minute, displayRef.current + (GAME_MINUTES_PER_SECOND * speed * TICK_MS) / 1000);
      setDisplay(displayRef.current);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [stopped, inBreak, inPk, ended, speed, use3d, ready3d]);

  // 自校にケガ人が出たら一時停止して、交代を選べるようにする（選ばずに閉じれば自動で交代）
  useEffect(() => {
    if (panel || breaksOnly) return;
    const team = ms.teams[side];
    if (subsRemaining(team, ms.rules) <= 0 || team.bench.length === 0) return;
    const hurt = ms.events.find(
      (e) => e.type === "injury" && e.side === side && e.minute <= display && !prompted.current.has(e.players![0]) && injuredAwaitingSub(team).includes(e.players![0]),
    );
    if (!hurt) return;
    prompted.current.add(hurt.players![0]);
    setPresetOut(hurt.players![0]);
    setPanel(true);
  }, [display, panel, ms, side, breaksOnly]);

  // テキストだけの表示は描画のループが無いので、ここで動きを少しずつ計算する（速報・スコアの時刻に使う）
  if (!use3d && !view2d) replayFor(ms).pump(display, MOVE.pump.textSteps);
  const events = shownEvents(ms, display);

  if (inPk) return <PkScreen />;

  const breakLabel = ms.phase === "HT" ? "ハーフタイム" : ms.phase === "ET_BREAK" ? "延長戦の前" : "延長ハーフタイム";
  const setView = (v: "3d" | "2d" | "text") => updateSettings(tournament ? { tournamentView: v } : { matchView: v === "3d" ? "2d" : v });
  const nextSpeed = () => updateSettings({ matchSpeed: speed === 1 ? 2 : speed === 2 ? 4 : 1 });
  const playing = !(stopped || inBreak || inPk || ended);

  const ordersPanel = panel && (
    <OrdersPanel
      side={side}
      opp={opp}
      presetOut={presetOut}
      onClose={() => {
        setPanel(false);
        setPresetOut(null);
      }}
      breakAction={
        inBreak
          ? {
              label: ms.phase === "HT" ? "後半開始" : ms.phase === "ET_BREAK" ? "延長戦開始" : "延長後半開始",
              run: () => {
                resumeFromBreak(ms);
                touch(true);
                setPanel(false);
              },
            }
          : undefined
      }
    />
  );

  const tickerSheet = tickerOpen && (
    <Sheet onClose={() => setTickerOpen(false)} title="速報" wide>
      <ul>
        {events.map((e, i) => (
          <EventLine key={`${e.minute}-${i}-${e.type}`} ms={ms} e={e} userSide={side} />
        ))}
      </ul>
    </Sheet>
  );

  /** 右の端の縦のボタン（3D・2D 共通） */
  const rail = (
    <div className="absolute bottom-[max(0.5rem,var(--safe-b))] right-[max(0.5rem,var(--safe-r))] top-[max(0.5rem,var(--safe-t))] z-10 flex w-[4.25rem] flex-col items-stretch justify-end gap-1.5">
      {use3d ? (
        <RailButton icon="squad" label="2D" onClick={() => setView("2d")} />
      ) : (
        <>
          {tournament && <RailButton icon="squad" label="3D" onClick={() => setView("3d")} />}
          <RailButton icon="list" label="文章だけ" onClick={() => setView("text")} />
        </>
      )}
      {ended ? (
        <RailButton icon="next" label="結果へ" primary onClick={finishMatch} />
      ) : inBreak ? (
        <>
          {breaksOnly && <RailButton icon="speed" label="結果のみ" onClick={toAuto} />}
          <RailButton icon="tactics" label={breakLabel} primary onClick={() => setPanel(true)} />
        </>
      ) : (
        <>
          <RailButton icon="speed" label={`${speed}倍`} onClick={nextSpeed} />
          {breaksOnly ? <RailButton icon="next" label="結果のみ" onClick={toAuto} /> : <RailButton icon="tactics" label="采配" onClick={() => setPanel(true)} />}
          <RailButton icon={paused ? "play" : "pause"} label={paused ? "再開" : "一時停止"} primary={paused} onClick={() => setPaused((p) => !p)} />
        </>
      )}
    </div>
  );

  /** 3D：画面いっぱいに 3D、左上にスコアボード、左下に速報のテロップ、右の端に操作のボタンを縦に */
  if (use3d)
    return (
      <main className="fixed inset-0 overflow-hidden bg-night">
        <Match3D
          ms={ms}
          display={Math.min(display, ms.minute)}
          playing={playing}
          speed={speed}
          userSide={side}
          quality={settings.quality3d}
          perf={perf}
          load={loadTimes}
          avoid={tickerRef}
          onReady={() => setReady3d(true)}
          onError={() => setLost3d(true)}
        />
        <div className={`pointer-events-none absolute left-[max(0.5rem,var(--safe-l))] top-[max(0.5rem,var(--safe-t))] z-10 ${perf ? "mt-24" : ""}`}>
          <div className="pointer-events-auto">
            <Scoreboard ms={ms} display={display} label={label} compact />
          </div>
          <div className="mt-1 w-[17rem] max-w-full">
            <TeamStatus ms={ms} display={display} />
          </div>
        </div>
        {/* 速報：ボールや選手が手前に来たら、薄くして 1 行にする（Match3D が data-near を付ける。計画の修正 5） */}
        <button
          ref={tickerRef}
          type="button"
          aria-label="速報の一覧"
          className="pressable group absolute bottom-[max(0.5rem,var(--safe-b))] left-[max(0.5rem,var(--safe-l))] z-10 w-[min(32rem,62%)] border-l-4 border-yellow bg-panel/90 py-1 text-left transition-opacity duration-300 data-[near=1]:bg-panel/60 data-[near=1]:opacity-60"
          onClick={() => setTickerOpen(true)}
        >
          <ul>
            {events
              .slice(0, 3)
              .reverse()
              .map((e, i, arr) => (
                <EventLine
                  key={`${e.minute}-${i}-${e.type}`}
                  ms={ms}
                  e={e}
                  userSide={side}
                  className={`!border-0 !py-0.5 ${i === arr.length - 1 ? "" : "opacity-75 group-data-[near=1]:hidden"} [&>span:last-child]:truncate`}
                />
              ))}
            {events.length === 0 && <li className="px-2 py-0.5 text-[0.8125rem] font-bold text-text-3">まもなくキックオフ</li>}
          </ul>
        </button>
        {rail}
        {tickerSheet}
        {ordersPanel}
      </main>
    );

  /** 2D：ピッチを画面いっぱいに描き、左上にスコアボード、速報（広い画面は左の列・狭い画面は下に 1 行）、右の端にボタン（計画 2.5） */
  if (view2d) {
    const top = "top-[calc(max(0.5rem,var(--safe-t))+2.375rem)]";
    const area = wide
      ? `${top} bottom-[max(0.5rem,var(--safe-b))] left-[calc(max(0.5rem,var(--safe-l))+15.5rem)] right-[calc(max(0.5rem,var(--safe-r))+4.75rem)]`
      : `${top} bottom-[calc(max(0.5rem,var(--safe-b))+2rem)] left-[max(0.25rem,var(--safe-l))] right-[calc(max(0.5rem,var(--safe-r))+4.75rem)]`;
    const latest = events[0];
    return (
      <main className="fixed inset-0 overflow-hidden bg-night">
        <Pitch2D ms={ms} display={Math.min(display, ms.minute)} playing={playing} speed={speed} userSide={side} areaClass={area} tactical={paused || inBreak} perf={perf} />
        <div className="pointer-events-none absolute left-[max(0.5rem,var(--safe-l))] right-[calc(max(0.5rem,var(--safe-r))+4.75rem)] top-[max(0.5rem,var(--safe-t))] z-10 flex flex-col items-start gap-1">
          <div className="pointer-events-auto max-w-full">
            <Scoreboard ms={ms} display={display} label={label} compact />
          </div>
          {no3d && view === "3d" && (
            <p className="flex items-center gap-1.5 bg-panel/90 px-2 py-0.5 text-[0.6875rem] font-bold text-warn">
              <Icon name="warning" size={12} />
              {no3d === "webgl" ? "この端末では 3D を表示できないため、2D で表示しています。" : "3D の表示が止まったため、2D に切り替えました。"}
            </p>
          )}
          {!wide && (
            <div className="w-[17rem] max-w-full">
              <TeamStatus ms={ms} display={display} />
            </div>
          )}
        </div>
        {wide ? (
          <div className={`absolute ${top} bottom-[max(0.5rem,var(--safe-b))] left-[max(0.5rem,var(--safe-l))] z-10 flex w-[15rem] flex-col gap-1`}>
            <Momentum ms={ms} display={display} userSide={side} />
            <TeamStatus ms={ms} display={display} />
            <button type="button" aria-label="速報の一覧" className="pressable flex min-h-0 flex-1 flex-col justify-end overflow-hidden border-l-4 border-yellow bg-panel/90 text-left" onClick={() => setTickerOpen(true)}>
              <ul>
                {events
                  .slice(0, 8)
                  .reverse()
                  .map((e, i) => (
                    <EventLine key={`${e.minute}-${i}-${e.type}`} ms={ms} e={e} userSide={side} className="!border-0" />
                  ))}
                {events.length === 0 && <li className="px-2 py-1 text-[0.8125rem] font-bold text-text-3">まもなくキックオフ</li>}
              </ul>
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="速報の一覧"
            className="pressable absolute bottom-[max(0.5rem,var(--safe-b))] left-[max(0.5rem,var(--safe-l))] right-[calc(max(0.5rem,var(--safe-r))+4.75rem)] z-10 border-l-4 border-yellow bg-panel/90 text-left"
            onClick={() => setTickerOpen(true)}
          >
            <ul>
              {latest ? (
                <EventLine ms={ms} e={latest} userSide={side} className="!border-0 !py-0.5 [&>span:last-child]:truncate" />
              ) : (
                <li className="px-2 py-0.5 text-[0.8125rem] font-bold text-text-3">まもなくキックオフ</li>
              )}
            </ul>
          </button>
        )}
        {rail}
        {tickerSheet}
        {ordersPanel}
      </main>
    );
  }

  /** テキストだけ：上にスコアボード、左に速報、右に試合の流れ・状態・操作（今のまま） */
  const log = (
    <ul className="scroll-y min-h-0 flex-1 bg-panel">
      {events.map((e, i) => (
        <EventLine key={`${e.minute}-${i}-${e.type}`} ms={ms} e={e} userSide={side} />
      ))}
      {events.length === 0 && <li className="px-2 py-2 text-[0.8125rem] font-bold text-text-3">まもなくキックオフ</li>}
    </ul>
  );
  return (
    <main className="bg-pitch-stripes fixed inset-0 flex flex-col gap-1.5 pb-[max(0.5rem,var(--safe-b))] pl-[max(0.5rem,var(--safe-l))] pr-[max(0.5rem,var(--safe-r))] pt-[max(0.375rem,var(--safe-t))]">
      <Scoreboard ms={ms} display={display} label={label} />
      <div className="flex min-h-0 flex-1 gap-1.5">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">{log}</section>
        <aside className="flex min-h-0 w-[16rem] shrink-0 flex-col gap-1.5">
          <Momentum ms={ms} display={display} userSide={side} />
          <TeamStatus ms={ms} display={display} />
          <div className="min-h-0 flex-1" />
          <div className="flex gap-1">
            {tournament && (
              <Button variant="ghost" small className="flex-1 !px-1" onClick={() => setView("3d")}>
                3D で見る
              </Button>
            )}
            <Button variant="ghost" small className="flex-1 !px-1" onClick={() => setView("2d")}>
              2D を出す
            </Button>
          </div>
          {ended ? (
            <Button icon="next" cut onClick={finishMatch}>
              結果へ
            </Button>
          ) : inBreak ? (
            <div className="flex gap-1.5">
              {breaksOnly && (
                <Button variant="secondary" className="!px-2" onClick={toAuto}>
                  結果のみ
                </Button>
              )}
              <Button icon="tactics" className="min-w-0 flex-1 !px-2" onClick={() => setPanel(true)}>
                {breakLabel}の采配
              </Button>
            </div>
          ) : (
            <>
              <Segmented options={["1", "2", "4"] as const} value={String(speed) as "1" | "2" | "4"} onChange={(v) => updateSettings({ matchSpeed: Number(v) as 1 | 2 | 4 })} labels={{ "1": "等速", "2": "2倍", "4": "4倍" }} />
              <div className="flex gap-1.5">
                <Button variant="secondary" icon={paused ? "play" : "pause"} className="flex-1 !px-2" onClick={() => setPaused((p) => !p)}>
                  {paused ? "再開" : "一時停止"}
                </Button>
                {breaksOnly ? (
                  <Button className="flex-1 !px-2" onClick={toAuto}>
                    結果のみに
                  </Button>
                ) : (
                  <Button icon="tactics" className="flex-1 !px-2" onClick={() => setPanel(true)}>
                    采配
                  </Button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      {ordersPanel}
    </main>
  );
}

/** 広い画面（幅 760px 以上）か。2D の速報を左の列に出す（計画 2.5） */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 760px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return wide;
}

/** 3D の右の端の縦のボタン（アイコンと短い文字） */
function RailButton({ icon, label, onClick, primary }: { icon: IconName; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-black leading-tight shadow-hard ${primary ? "bg-yellow text-ink" : "bg-panel/90 text-text"}`}
    >
      <Icon name={icon} size={18} />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

/** 作戦ノートのルールごとの状態（待機中／実行済み／停止中） */
function NoteStatus({ team }: { team: MatchTeamState }) {
  const note = team.note;
  if (!note) return <div className="bg-panel-2 px-2 py-1.5 text-[0.75rem] font-bold text-text-3">作戦ノート：なし</div>;
  return (
    <section className="bg-panel-2 p-1.5">
      <h3 className="mb-1 flex items-center gap-1 text-[0.75rem] font-black text-yellow">
        <Icon name="note" size={13} />
        作戦ノート「{note.noteName}」
      </h3>
      <ul className="flex flex-col gap-0.5 text-[0.75rem]">
        {note.rules
          .filter((r) => r.enabled)
          .map((r) => {
            const st = note.fired.includes(r.id) ? "実行済み" : note.stopped.includes(r.id) ? "停止中" : "待機中";
            const color = st === "実行済み" ? "text-good" : st === "停止中" ? "text-text-3" : "text-text-2";
            return (
              <li key={r.id} className="flex justify-between gap-2">
                <span className="truncate">{r.name}</span>
                <span className={`shrink-0 font-bold ${color}`}>{st}</span>
              </li>
            );
          })}
      </ul>
      <p className="mt-1 text-[0.6875rem] text-text-3">自分で交代・戦術変更をすると、関係するルールはこの試合では止まります。</p>
    </section>
  );
}

/** 采配（横画面：左にフォーメーション・戦術・状況、右に選手交代） */
function OrdersPanel({
  side,
  opp,
  onClose,
  breakAction,
  presetOut,
}: {
  side: Side;
  opp: Side;
  onClose: () => void;
  breakAction?: { label: string; run: () => void };
  presetOut?: string | null;
}) {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const touch = useGameStore((s) => s.touch);
  const ms = game.activeMatch!.state;
  const team = ms.teams[side];
  const [selOut, setSelOut] = useState<string | null>(presetOut ?? null);
  const [error, setError] = useState<string | null>(null);
  const pending = team.pending;
  const formation = pending?.formation ?? team.formation;
  const tactics = pending?.tactics ?? team.tactics;
  const slots = FORMATIONS[team.formation];
  const pendingOut = new Set(pending?.subs.map((s) => s.out));
  const pendingIn = new Set(pending?.subs.map((s) => s.in));
  const kit = ms.view?.kits[side];
  const look = (id: string) => team.players[id]?.look;

  const sub = (inId: string) => {
    if (!selOut) return;
    const err = manualSubstitution(ms, side, selOut, inId);
    setError(err);
    if (!err) {
      setSelOut(null);
      touch(true);
    }
  };

  return (
    <Sheet onClose={breakAction ? undefined : onClose} title={breakAction ? "采配" : "采配（次の5分から反映）"} wide>
      <div className="grid grid-cols-2 gap-2">
        {/* 左：状況・フォーメーション・戦術 */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="bg-panel-2 px-2 py-1.5 text-[0.75rem] font-bold text-text-2">
            相手：{ms.teams[opp].name}（{ms.teams[opp].formation}）・交代 残り<span className="font-num text-yellow">{subsRemaining(team, ms.rules)}</span>人
          </div>
          {presetOut && team.players[presetOut]?.injury && (
            <p className="flex items-start gap-1.5 border-l-4 border-red bg-panel-2 p-1.5 text-[0.75rem] font-bold text-bad">
              <Icon name="injury" size={14} className="mt-px" />
              {team.players[presetOut].name}がケガでプレーを続けられない。入れる選手を選んでください（選ばずに閉じると、位置に合う控えが自動で入ります）。
            </p>
          )}
          {breakAction && <HalfTimeReport side={side} />}
          <section className="bg-panel p-1.5">
            <Label className="!mb-1">フォーメーション</Label>
            <div className="grid grid-cols-5 gap-0.5">
              {FORMATION_IDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    manualFormation(ms, side, f);
                    touch(true);
                  }}
                  aria-pressed={formation === f}
                  className={`pressable font-num min-h-9 text-[0.8125rem] ${formation === f ? "bg-yellow text-ink" : "bg-panel-2 text-text-2"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </section>
          <TacticsEditor
            tactics={tactics}
            onChange={(t) => {
              manualTactics(ms, side, t);
              touch(true);
            }}
          />
          <NoteStatus team={team} />
        </div>

        {/* 右：選手交代 */}
        <section className="flex min-w-0 flex-col gap-1">
          <Label className="!mb-0">選手交代（下げる選手、入れる選手の順にタップ）</Label>
          <ul className="flex flex-col gap-0.5">
            {team.onPitch.map((id, i) => {
              const p = team.players[id];
              const out = pendingOut.has(id);
              const gone = !!p.sentOff;
              const lk = look(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={out || gone}
                    onClick={() => setSelOut(selOut === id ? null : id)}
                    className={`pressable flex min-h-10 w-full items-center gap-1.5 border-l-4 px-1.5 text-left ${selOut === id ? "border-yellow bg-panel-3" : "border-transparent bg-panel-2"} ${out ? "opacity-60" : ""}`}
                  >
                    <span className="w-8 shrink-0 text-[0.75rem] font-black text-yellow">{gone ? "-" : POSITION_NAMES[slots[i].pos]}</span>
                    {lk && <PlayerFace look={lk} kit={kit} size={26} />}
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold">{p.name}</span>
                    {out && <span className="text-[0.6875rem] font-bold text-warn">交代予定</span>}
                    {gone && <span className="text-[0.6875rem] font-bold text-bad">退場</span>}
                    {!gone && p.injury && <Icon name="injury" size={12} className="text-bad" title="ケガ" />}
                    {!gone && (p.yellow ?? 0) > 0 && <Icon name="card" size={12} className="text-yellow" title="イエローカード" />}
                    {p.goals > 0 && (
                      <span className="font-num flex items-center gap-0.5 text-[0.75rem] text-yellow">
                        <Icon name="ball" size={12} />
                        {p.goals}
                      </span>
                    )}
                    <Bar value={p.stamina} color={fitnessColor(p.stamina)} className="!h-1.5 !w-10" />
                  </button>
                </li>
              );
            })}
          </ul>
          <Label className="!mb-0 mt-1">控え</Label>
          <ul className="flex flex-col gap-0.5">
            {team.bench.map((id) => {
              const p = team.players[id];
              const inPending = pendingIn.has(id);
              const lk = look(id);
              return (
                <li key={id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={!selOut || inPending}
                    onClick={() => sub(id)}
                    className={`pressable flex min-h-10 min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left disabled:opacity-70 ${selOut && !inPending ? "bg-panel-3" : "bg-panel-2"}`}
                  >
                    <span className="w-8 shrink-0 text-[0.75rem] font-black text-text-3">{POSITION_NAMES[p.mainPosition]}</span>
                    {lk && <PlayerFace look={lk} kit={kit} size={26} />}
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem]">{p.name}</span>
                    {inPending && (
                      <span className="flex shrink-0 items-center gap-0.5 text-[0.6875rem] font-bold text-warn">
                        <Icon name="sub" size={12} />
                        {shortNames(Object.values(team.players)).get(pending!.subs.find((s) => s.in === id)!.out)}と交代
                      </span>
                    )}
                  </button>
                  {inPending && (
                    <IconButton
                      name="close"
                      label="交代を取り消す"
                      className="!min-h-10 !min-w-10"
                      onClick={() => {
                        cancelSubstitution(ms, side, id);
                        touch(true);
                      }}
                    />
                  )}
                </li>
              );
            })}
            {team.bench.length === 0 && <li className="bg-panel-2 px-2 py-1.5 text-[0.75rem] text-text-3">控えはいません</li>}
          </ul>
          {error && <p className="text-[0.75rem] font-bold text-bad">{error}</p>}
          <div className="mt-auto pt-1.5">
            {breakAction ? (
              <Button icon="whistle" cut className="w-full" onClick={breakAction.run}>
                {breakAction.label}
              </Button>
            ) : (
              <Button icon="play" className="w-full" onClick={onClose}>
                閉じて再開
              </Button>
            )}
          </div>
        </section>
      </div>
    </Sheet>
  );
}

/** ハーフタイムの状況：支配率・シュート数・ゾーン別の優劣（どこで押されているか） */
function HalfTimeReport({ side }: { side: Side }) {
  const game = useGameStore((s) => s.game)!;
  const ms = game.activeMatch!.state;
  const r = halfReport(ms, side);
  const pct = Math.round(r.possession * 100);
  const color = { 優勢: "text-good", 互角: "text-text-2", 押されている: "text-bad" } as const;
  return (
    <section className="bg-panel p-1.5 text-[0.75rem]">
      <Label className="!mb-1">{ms.phase === "HT" ? "前半" : "ここまで"}の状況</Label>
      <div className="mb-1 flex items-center gap-2">
        <span className="w-14 shrink-0 font-bold text-text-2">支配率</span>
        <span className="font-num w-8 text-right text-yellow">{pct}%</span>
        <div className="flex h-2 flex-1 bg-info">
          <div className="h-full bg-yellow" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-num w-8 text-info">{100 - pct}%</span>
      </div>
      <div className="mb-1.5 flex gap-2">
        <span className="w-14 shrink-0 whitespace-nowrap font-bold text-text-2">シュート</span>
        <span>
          自校 <b className="font-num">{r.shots[0]}</b>本（枠内{r.onTarget[0]}） ／ 相手 <b className="font-num">{r.shots[1]}</b>本（枠内{r.onTarget[1]}）
        </span>
      </div>
      <table className="w-full text-center">
        <thead className="text-[0.6875rem] text-text-3">
          <tr className="border-b border-line">
            <th className="text-left font-bold">ゾーン</th>
            <th className="font-bold">自校の攻撃</th>
            <th className="font-bold">相手の攻撃</th>
            <th className="font-bold">優劣</th>
          </tr>
        </thead>
        <tbody>
          {r.zones.map((z) => (
            <tr key={z.zone} className="border-b border-line">
              <td className="py-0.5 text-left font-bold">{z.zone}</td>
              <td>
                {z.ourAttacks}回（好機{z.ourChances}）
              </td>
              <td>
                {z.theirAttacks}回（好機{z.theirChances}）
              </td>
              <td className={`font-bold ${color[z.verdict]}`}>{z.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
