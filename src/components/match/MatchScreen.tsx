"use client";

import { useEffect, useRef, useState } from "react";
import { FORMATIONS } from "@/engine/config/formations";
import { POSITION_NAMES } from "@/engine/config/names";
import { pendingMatchLabel } from "@/engine/game";
import { cancelSubstitution, injuredAwaitingSub, isBreakPhase, isOut, isPlayingPhase, playersShort, playSegment, resumeFromBreak, subsRemaining } from "@/engine/match/engine";
import { manualFormation, manualSubstitution, manualTactics } from "@/engine/match/orders";
import { halfReport } from "@/engine/match/report";
import { describeEvent, isHighlight, isIncident, isMinorEvent } from "@/engine/match/text";
import type { MatchState, MatchTeamState, Side } from "@/engine/match/types";
import { FORMATION_IDS } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Bar, Button, fitnessColor, Segmented, Sheet } from "../ui";
import { PkScreen } from "./PkScreen";
import { TacticsEditor } from "./TacticsEditor";

/** 等速：試合時間 15 分 = 現実の 1 分（SPEC 10.7） */
const GAME_MINUTES_PER_SECOND = 15 / 60;
const TICK_MS = 100;

function visibleScore(ms: MatchState, display: number): [number, number] {
  const s: [number, number] = [0, 0];
  for (const e of ms.events) {
    if (e.minute > display) break;
    if (e.type === "goal" || e.type === "pkGoal") s[e.side]++;
  }
  return s;
}

function phaseLabel(ms: MatchState, display: number): string {
  if (ms.phase === "PK") return "PK戦";
  if (ms.phase === "END" && display >= ms.minute) return "試合終了";
  if (ms.phase === "HT" && display >= ms.minute) return "ハーフタイム";
  if (ms.phase === "ET_BREAK" && display >= ms.minute) return "延長戦の前";
  if (ms.phase === "ET_HT" && display >= ms.minute) return "延長ハーフタイム";
  const h = ms.rules.halfMinutes;
  if (display < h) return "前半";
  if (display < 2 * h) return "後半";
  return display < 2 * h + (ms.rules.extraTimeHalfMinutes ?? 0) ? "延長前半" : "延長後半";
}

export function MatchScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const touch = useGameStore((s) => s.touch);
  const finishMatch = useGameStore((s) => s.finishMatch);
  const speed = useGameStore((s) => s.settings.matchSpeed);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const am = game.activeMatch!;
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

  const caughtUp = display >= ms.minute;
  const inBreak = isBreakPhase(ms) && caughtUp;
  const inPk = ms.phase === "PK" && caughtUp;
  const ended = ms.phase === "END" && caughtUp;

  useEffect(() => {
    if (paused || panel || inBreak || inPk || ended) return;
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
  }, [paused, panel, inBreak, inPk, ended, speed]);

  // 自校にケガ人が出たら一時停止して、交代を選べるようにする（選ばずに閉じれば自動で交代）
  useEffect(() => {
    if (panel) return;
    const team = ms.teams[side];
    if (subsRemaining(team, ms.rules) <= 0 || team.bench.length === 0) return;
    const hurt = ms.events.find(
      (e) => e.type === "injury" && e.side === side && e.minute <= display && !prompted.current.has(e.players![0]) && injuredAwaitingSub(team).includes(e.players![0]),
    );
    if (!hurt) return;
    prompted.current.add(hurt.players![0]);
    setPresetOut(hurt.players![0]);
    setPanel(true);
  }, [display, panel, ms, side]);

  const score = visibleScore(ms, display);
  const events = ms.events.filter((e) => e.minute <= display && !isMinorEvent(e)).slice(-80).reverse();
  const momentum = ms.momentumHistory.slice(0, Math.floor(display / 5));
  const current = (momentum.at(-1) ?? 0) * (side === 0 ? 1 : -1);

  if (inPk) return <PkScreen />;

  return (
    <main className="flex h-dvh flex-col">
      <div className="bg-pitch-dark px-3 pb-2 pt-2 text-white">
        <div className="text-center text-[11px] text-white/70">{label}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="flex-1 truncate text-right text-sm font-bold">{ms.teams[0].name}</span>
          <span className="rounded-lg bg-black/30 px-3 py-1 font-mono text-2xl font-black">
            {score[0]} - {score[1]}
          </span>
          <span className="flex-1 truncate text-sm font-bold">{ms.teams[1].name}</span>
        </div>
        <TeamStatusRow ms={ms} display={display} />
        <div className="mt-1 text-center text-xs">
          {phaseLabel(ms, display)} {!ended && !inBreak && `${Math.floor(display)}分`}
          {ms.pk && ` PK ${ms.pk.score[0]}-${ms.pk.score[1]}`}
        </div>
        <div className="mt-2">
          <div className="mb-0.5 flex justify-between text-[10px] text-white/70">
            <span>試合の流れ</span>
            <span>{current > 10 ? "自校ペース" : current < -10 ? "相手ペース" : "互角"}</span>
          </div>
          <div className="flex h-6 items-center gap-px border-y border-white/10 bg-[linear-gradient(transparent_calc(50%-0.5px),rgba(255,255,255,0.35)_calc(50%-0.5px),rgba(255,255,255,0.35)_calc(50%+0.5px),transparent_calc(50%+0.5px))]">
            {momentum.map((m, i) => {
              const v = m * (side === 0 ? 1 : -1);
              const h = Math.max(1, Math.min(12, Math.abs(v) / 2.5));
              return (
                <div key={i} className="flex h-6 flex-1 flex-col justify-center">
                  <div className={`w-full ${v >= 0 ? "bg-amber-300" : "bg-sky-300"}`} style={{ height: h, marginTop: v >= 0 ? -h : h }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto px-3 py-2 text-sm">
        {events.map((e, i) => (
          <li
            key={`${e.minute}-${i}-${e.type}`}
            className={`border-b border-gray-100 py-1 ${isHighlight(e) ? "font-black" : ""} ${e.type === "goal" || e.type === "pkGoal" ? (e.side === side ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900") : isIncident(e) ? (e.type === "note" ? "bg-emerald-50 font-bold text-emerald-900" : "font-bold text-red-800") : ""}`}
          >
            <span className="mr-2 inline-block w-8 text-right font-mono text-xs text-gray-400">{e.minute}&apos;</span>
            {describeEvent(ms, e)}
          </li>
        ))}
      </ul>

      <div className="border-t border-gray-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {ended ? (
          <Button className="w-full" onClick={finishMatch}>
            結果へ
          </Button>
        ) : inBreak ? (
          <Button className="w-full" onClick={() => setPanel(true)}>
            {ms.phase === "HT" ? "ハーフタイム（采配・後半開始）" : ms.phase === "ET_BREAK" ? "延長戦の前（采配・延長開始）" : "延長ハーフタイム（采配・再開）"}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-36">
              <Segmented options={["1", "2", "4"] as const} value={String(speed) as "1" | "2" | "4"} onChange={(v) => updateSettings({ matchSpeed: Number(v) as 1 | 2 | 4 })} labels={{ "1": "等速", "2": "2倍", "4": "4倍" }} />
            </div>
            <Button variant="secondary" className="flex-1" onClick={() => setPaused((p) => !p)}>
              {paused ? "▶ 再開" : "⏸ 一時停止"}
            </Button>
            <Button className="flex-1" onClick={() => setPanel(true)}>
              采配
            </Button>
          </div>
        )}
      </div>

      {panel && (
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
      )}
    </main>
  );
}

/** 両チームの人数（減っているときだけ）と退場者・ケガ人 */
function TeamStatusRow({ ms, display }: { ms: MatchState; display: number }) {
  const info = (t: MatchTeamState, side: Side) => {
    // まだ表示していない時間のイベントは出さない
    const shown = new Set(ms.events.filter((e) => e.side === side && e.minute <= display && (e.type === "red" || e.type === "secondYellow" || e.type === "injury")).map((e) => e.players![0]));
    const out = t.onPitch.filter((id) => isOut(t.players[id]) && shown.has(id));
    const short = out.length > 0 ? playersShort(t) : 0;
    return { short, out: out.map((id) => `${t.players[id].sentOff ? "🟥" : "✚"}${t.players[id].name.split(" ")[0]}`) };
  };
  const a = info(ms.teams[0], 0);
  const b = info(ms.teams[1], 1);
  if (a.short === 0 && b.short === 0 && a.out.length === 0 && b.out.length === 0) return null;
  return (
    <div className="mt-1 flex gap-2 text-[10px]">
      <span className="flex-1 truncate text-right">
        {a.short > 0 && <b className="mr-1 rounded bg-red-600 px-1">{11 - a.short}人</b>}
        {a.out.join(" ")}
      </span>
      <span className="w-20" />
      <span className="flex-1 truncate">
        {b.short > 0 && <b className="mr-1 rounded bg-red-600 px-1">{11 - b.short}人</b>}
        {b.out.join(" ")}
      </span>
    </div>
  );
}

/** 作戦ノートのルールごとの状態（待機中／実行済み／停止中） */
function NoteStatus({ team }: { team: MatchTeamState }) {
  const note = team.note;
  if (!note) return <div className="rounded-lg bg-gray-50 p-2 text-[11px] text-gray-500">作戦ノート：なし</div>;
  return (
    <section className="rounded-lg border border-gray-200 p-2">
      <h3 className="mb-1 text-xs font-black">作戦ノート「{note.noteName}」</h3>
      <ul className="flex flex-col gap-0.5 text-[11px]">
        {note.rules
          .filter((r) => r.enabled)
          .map((r) => {
            const st = note.fired.includes(r.id) ? "実行済み" : note.stopped.includes(r.id) ? "停止中" : "待機中";
            const color = st === "実行済み" ? "text-emerald-700" : st === "停止中" ? "text-gray-400" : "text-gray-700";
            return (
              <li key={r.id} className="flex justify-between">
                <span className="truncate">{r.name}</span>
                <span className={`font-bold ${color}`}>{st}</span>
              </li>
            );
          })}
      </ul>
      <p className="mt-1 text-[10px] text-gray-500">自分で交代・戦術変更をすると、関係するルールはこの試合では止まります。</p>
    </section>
  );
}

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
    <Sheet onClose={breakAction ? undefined : onClose} title={breakAction ? "采配" : "采配（次の5分から反映）"}>
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
          相手：{ms.teams[opp].name}（{ms.teams[opp].formation}）・交代 残り{subsRemaining(team, ms.rules)}人
        </div>
        {presetOut && team.players[presetOut]?.injury && (
          <p className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-800">
            {team.players[presetOut].name}がケガでプレーを続けられない。入れる選手を選んでください（選ばずに閉じると、位置に合う控えが自動で入ります）。
          </p>
        )}
        {breakAction && <HalfTimeReport side={side} />}
        <NoteStatus team={team} />

        <section>
          <h3 className="mb-1 text-sm font-black">フォーメーション</h3>
          <div className="grid grid-cols-5 gap-1">
            {FORMATION_IDS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  manualFormation(ms, side, f);
                  touch(true);
                }}
                className={`min-h-10 rounded-lg text-xs font-bold ${formation === f ? "bg-pitch text-white" : "bg-gray-100"}`}
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

        <section>
          <h3 className="mb-1 text-sm font-black">選手交代（下げる選手 → 入れる選手の順にタップ）</h3>
          <ul className="flex flex-col gap-1">
            {team.onPitch.map((id, i) => {
              const p = team.players[id];
              const out = pendingOut.has(id);
              const gone = !!p.sentOff;
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={out || gone}
                    onClick={() => setSelOut(selOut === id ? null : id)}
                    className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left ${selOut === id ? "bg-amber-100 ring-2 ring-amber-400" : "bg-gray-50"} ${out ? "opacity-50" : ""}`}
                  >
                    <span className="w-9 text-[11px] font-black text-pitch-dark">{gone ? "—" : POSITION_NAMES[slots[i].pos]}</span>
                    <span className="flex-1 truncate text-sm font-bold">{p.name}</span>
                    {out && <span className="text-[10px] text-amber-700">交代予定</span>}
                    {gone && <span className="text-[10px] text-red-700">退場</span>}
                    {!gone && p.injury && <span className="text-[10px] text-red-700">ケガ</span>}
                    {!gone && (p.yellow ?? 0) > 0 && <span className="text-[10px]">🟨</span>}
                    {p.goals > 0 && <span className="text-xs">⚽×{p.goals}</span>}
                    <Bar value={p.stamina} color={fitnessColor(p.stamina)} className="!h-1.5 !w-12" />
                  </button>
                </li>
              );
            })}
          </ul>
          <h4 className="mb-1 mt-2 text-xs font-black text-gray-600">控え</h4>
          <ul className="flex flex-col gap-1">
            {team.bench.map((id) => {
              const p = team.players[id];
              const inPending = pendingIn.has(id);
              return (
                <li key={id} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!selOut || inPending}
                    onClick={() => sub(id)}
                    className="flex min-h-10 flex-1 items-center gap-2 rounded-lg bg-gray-50 px-2 text-left disabled:opacity-60"
                  >
                    <span className="w-9 text-[11px] font-black text-gray-500">{POSITION_NAMES[p.mainPosition]}</span>
                    <span className="flex-1 truncate text-sm">{p.name}</span>
                    {inPending && <span className="text-[10px] text-amber-700">→{team.players[pending!.subs.find((s) => s.in === id)!.out].name.split(" ")[0]}と交代</span>}
                  </button>
                  {inPending && (
                    <button
                      type="button"
                      className="min-h-10 min-w-9 text-gray-400"
                      onClick={() => {
                        cancelSubstitution(ms, side, id);
                        touch(true);
                      }}
                      aria-label="交代を取り消す"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
            {team.bench.length === 0 && <li className="text-xs text-gray-400">控えはいません</li>}
          </ul>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </section>

        {breakAction ? (
          <Button onClick={breakAction.run}>{breakAction.label}</Button>
        ) : (
          <Button onClick={onClose}>閉じて再開</Button>
        )}
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
  const color = { 優勢: "text-emerald-700", 互角: "text-gray-600", 押されている: "text-red-600" } as const;
  return (
    <section className="rounded-lg border border-gray-200 p-2 text-xs">
      <h3 className="mb-1 text-sm font-black">{ms.phase === "HT" ? "前半" : "ここまで"}の状況</h3>
      <div className="mb-1 flex items-center gap-2">
        <span className="w-14 shrink-0 font-bold">支配率</span>
        <span className="w-8 text-right">{pct}%</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-sky-300">
          <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
        </div>
        <span className="w-8">{100 - pct}%</span>
      </div>
      <div className="mb-2 flex gap-2">
        <span className="w-14 shrink-0 whitespace-nowrap font-bold">シュート</span>
        <span>
          自校 {r.shots[0]}本（枠内{r.onTarget[0]}） ／ 相手 {r.shots[1]}本（枠内{r.onTarget[1]}）
        </span>
      </div>
      <table className="w-full text-center">
        <thead className="text-[10px] text-gray-500">
          <tr>
            <th className="text-left">ゾーン</th>
            <th>自校の攻撃</th>
            <th>相手の攻撃</th>
            <th>優劣</th>
          </tr>
        </thead>
        <tbody>
          {r.zones.map((z) => (
            <tr key={z.zone}>
              <td className="text-left font-bold">{z.zone}</td>
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
