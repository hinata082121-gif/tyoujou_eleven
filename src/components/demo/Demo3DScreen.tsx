"use client";

/**
 * 3D 観戦のデモ（R1。開発用。`?demo3d=1` のときだけ page.tsx から動的に読み込む）。R3 で `?demo2d=1`（同じ試合を 2D で）を足した。
 * 設定の画面で大会・会場・ナイター・強さ・ユニフォームを選び、決まったシードの学校どうしの試合を 3D で観る。
 * 試合は最初に最後まで計算してあり、ここは表示の時刻を進めるだけ。セーブ・ストアには触れない（デモの試合は保存しない）
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { VenueStage } from "@/engine/config/look";
import { MATCH_KIND_NAMES, VENUE_NAMES } from "@/engine/config/names";
import { buildDemoMatch, DEMO_KINDS, demoKindName, demoRounds, demoWorld, type DemoKind, type DemoKits, type DemoMatch } from "@/engine/demo";
import { SCHOOL_RANKS, type SchoolRank } from "@/engine/types";
import type { LoadTimes } from "@/view3d/Match3D";
import type { Quality } from "@/view3d/quality";
import { webglSupported } from "@/view3d/webgl";
import { Icon } from "../icons";
import { EventLine, Scoreboard, shownEvents, TeamStatus, visibleScore } from "../match/broadcast";
import { Pitch2D } from "../match/Pitch2D";
import { usePortrait } from "../shell/usePortrait";
import { Band, Button, IconButton, Label, Panel, Screen, Segmented, Toggle } from "../ui";

/** 3D の描画（three）は、観戦を始めたときだけ読み込む */
const loadTimes: LoadTimes = { start: 0 };
const Match3D = dynamic(
  () =>
    import("@/view3d/Match3D").then((m) => {
      loadTimes.code = performance.now();
      return m.default;
    }),
  { ssr: false, loading: () => <StadiumLoading /> },
);

/** 等速：試合時間 15 分 = 現実の 1 分（SPEC 10.7。観戦画面と同じ） */
const GAME_MINUTES_PER_SECOND = 15 / 60;
const TICK_MS = 100;
/** 速報のテロップに出す件数 */
const TELOP_LINES = 3;

type Speed = 1 | 2 | 4;
const SPEEDS: readonly Speed[] = [1, 2, 4];
const SPEED_LABEL: Record<Speed, string> = { 1: "等速", 2: "2倍", 4: "4倍" };

interface DemoConfig {
  /** 3D で観るか 2D で観るか（R3） */
  view: "3d" | "2d";
  kind: DemoKind;
  /** 決勝から数えて何試合前か（0 = 決勝） */
  fromEnd: number;
  venue: VenueStage | "auto";
  night: boolean;
  quality: Quality;
  speed: Speed;
  perf: boolean;
  /** [ホーム, アウェー] */
  ranks: [SchoolRank, SchoolRank];
  kits: DemoKits;
}

const initialConfig = (): DemoConfig => ({
  view: typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo2d") === "1" ? "2d" : "3d",
  kind: "national",
  fromEnd: 0,
  venue: "auto",
  night: false,
  quality: "standard",
  speed: 1,
  perf: typeof window !== "undefined" && new URLSearchParams(window.location.search).get("perf") === "1",
  ranks: ["A", "B"],
  kits: "auto",
});

/** 開発用の URL：&go=1 ですぐ観戦を始め、&t=分 でその時刻から、&pause=1 で止めて（画面の撮影・計測用） */
const urlParam = (k: string) => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(k) : null);

export function Demo3DScreen() {
  const [config, setConfig] = useState<DemoConfig>(initialConfig);
  const [demo, setDemo] = useState<DemoMatch | null>(() => (urlParam("go") === "1" ? buildDemoMatch({ kind: "national", fromEnd: 0, venue: "auto", ranks: ["A", "B"], kits: "auto" }) : null));
  const set = (patch: Partial<DemoConfig>) => setConfig((c) => ({ ...c, ...patch }));

  const start = () => {
    loadTimes.start = performance.now();
    setDemo(buildDemoMatch({ kind: config.kind, fromEnd: config.fromEnd, venue: config.venue, ranks: config.ranks, kits: config.kits }));
  };

  if (demo) return <DemoWatch demo={demo} config={config} onSpeed={(speed) => set({ speed })} onBack={() => setDemo(null)} />;
  return <DemoSetup config={config} set={set} onStart={start} />;
}

// ================= 設定の画面 =================

function DemoSetup({ config, set, onStart }: { config: DemoConfig; set: (patch: Partial<DemoConfig>) => void; onStart: () => void }) {
  // デモの世界づくり（1 秒弱）は、最初の画面を出してから行う
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      demoWorld();
      setReady(true);
    }, 30);
    return () => clearTimeout(t);
  }, []);
  const rounds = useMemo(() => (ready ? demoRounds(config.kind) : []), [ready, config.kind]);
  const kindName = useMemo(() => (ready ? demoKindName(config.kind) : MATCH_KIND_NAMES[config.kind]), [ready, config.kind]);
  const round = rounds.find((r) => r.fromEnd === config.fromEnd) ?? rounds.at(-1);
  const tournament = config.kind !== "league" && config.kind !== "practice";
  const autoVenue = round?.venue;
  const leave = () => window.location.assign(window.location.pathname);

  return (
    <Screen
      title={config.view === "2d" ? "2D 観戦のデモ" : "3D 観戦のデモ"}
      sub="開発用"
      onBack={leave}
      right={
        <Button icon="play" cut disabled={!ready} onClick={onStart}>
          観戦を始める
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        <Panel title="試合" sub={ready ? `${kindName}${round ? ` ${round.label}` : ""}` : "準備しています…"} className="min-w-0 flex-[1.2]">
          <div className="scroll-y flex h-full flex-col gap-2.5 pr-0.5">
            <Field label="大会の種類">
              <ChoiceGrid
                cols={4}
                options={DEMO_KINDS}
                value={config.kind}
                labels={MATCH_KIND_NAMES}
                onChange={(kind) => {
                  const n = ready ? demoRounds(kind).length : 1;
                  set({ kind, fromEnd: Math.min(config.fromEnd, Math.max(0, n - 1)) });
                }}
              />
            </Field>
            <Field label="ラウンド" note={tournament && autoVenue ? `会場は自動で「${VENUE_NAMES[autoVenue]}」` : undefined}>
              {!tournament ? (
                <p className="bg-panel-2 px-2 py-1.5 text-[0.75rem] text-text-3">県リーグ・練習試合にはラウンドがありません。</p>
              ) : !ready ? (
                <p className="bg-panel-2 px-2 py-1.5 text-[0.75rem] text-text-3">準備しています…</p>
              ) : (
                <ChoiceGrid
                  cols={3}
                  options={rounds.map((r) => r.fromEnd)}
                  value={round?.fromEnd ?? 0}
                  labels={Object.fromEntries(rounds.map((r) => [r.fromEnd, r.label]))}
                  onChange={(fromEnd) => set({ fromEnd })}
                />
              )}
            </Field>
            <Field label="両チームの強さ（ランク）">
              <div className="flex flex-col gap-1">
                {(["ホーム", "アウェー"] as const).map((who, i) => (
                  <div key={who} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[0.75rem] font-bold text-text-2">{who}</span>
                    <Segmented
                      className="flex-1"
                      options={SCHOOL_RANKS}
                      value={config.ranks[i]}
                      onChange={(r) => set({ ranks: i === 0 ? [r, config.ranks[1]] : [config.ranks[0], r] })}
                    />
                  </div>
                ))}
              </div>
            </Field>
            <Field label="ユニフォーム" note={config.kits === "clash" ? "アウェーの 1st をホームと同じ色にします" : undefined}>
              <Segmented options={["auto", "clash"] as const} value={config.kits} labels={{ auto: "おまかせ", clash: "色かぶり" }} onChange={(kits) => set({ kits })} />
            </Field>
          </div>
        </Panel>

        <Panel title="会場と表示" className="min-w-0 flex-1">
          <div className="scroll-y flex h-full flex-col gap-2.5 pr-0.5">
            <Field label="表示">
              <Segmented options={["3d", "2d"] as const} value={config.view} labels={{ "3d": "3D", "2d": "2D" }} onChange={(view) => set({ view })} />
            </Field>
            <Field label="会場の段階" note={config.venue === "auto" ? `自動：${autoVenue ? VENUE_NAMES[autoVenue] : `${VENUE_NAMES[3]}（指定なし）`}` : VENUE_NAMES[config.venue]}>
              <Segmented
                options={["auto", "1", "2", "3", "4"] as const}
                value={config.venue === "auto" ? "auto" : (String(config.venue) as "1" | "2" | "3" | "4")}
                labels={{ auto: "自動" }}
                onChange={(v) => set({ venue: v === "auto" ? "auto" : (Number(v) as VenueStage) })}
              />
            </Field>
            <Toggle label="ナイター" checked={config.night} onChange={(night) => set({ night })} />
            <Field label="画質">
              <Segmented options={["standard", "light"] as const} value={config.quality} labels={{ standard: "標準", light: "軽量" }} onChange={(quality) => set({ quality })} />
            </Field>
            <Field label="速さ">
              <Segmented options={["1", "2", "4"] as const} value={String(config.speed) as "1" | "2" | "4"} labels={{ "1": SPEED_LABEL[1], "2": SPEED_LABEL[2], "4": SPEED_LABEL[4] }} onChange={(v) => set({ speed: Number(v) as Speed })} />
            </Field>
            <Toggle label="計測の表示（fps など）" checked={config.perf} onChange={(perf) => set({ perf })} />
            <p className="text-[0.75rem] leading-snug text-text-3">試合は決まったシードの学校どうしでエンジンが進めます。デモの試合は保存しません。</p>
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex min-w-0 items-baseline gap-2">
        <Label className="!mb-0 shrink-0">{label}</Label>
        {note && <span className="truncate text-[0.6875rem] font-bold text-text-3">{note}</span>}
      </div>
      {children}
    </div>
  );
}

/** 選択肢をます目に並べる（選んでいるものは黄） */
function ChoiceGrid<T extends string | number>({
  options,
  value,
  onChange,
  labels,
  cols,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Partial<Record<T, string>>;
  cols: 3 | 4;
}) {
  return (
    <div className={`grid gap-0.5 bg-panel p-0.5 ${cols === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`pressable min-h-11 px-1 text-[0.75rem] font-black leading-tight ${value === o ? "bg-yellow text-ink" : "bg-panel-2 text-text-2"}`}
        >
          {labels[o] ?? String(o)}
        </button>
      ))}
    </div>
  );
}

// ================= 観戦の画面 =================

function StadiumLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-night">
      <p className="cut-lr bg-panel px-8 py-2 text-[0.8125rem] font-bold text-text-2">スタジアムを準備しています…</p>
    </div>
  );
}

function DemoWatch({ demo, config, onSpeed, onBack }: { demo: DemoMatch; config: DemoConfig; onSpeed: (s: Speed) => void; onBack: () => void }) {
  const ms = demo.ms;
  const end = ms.minute;
  const [display, setDisplay] = useState(() => Math.min(end, Math.max(0, Number(urlParam("t") ?? 0) || 0)));
  const displayRef = useRef(display);
  const [paused, setPaused] = useState(() => urlParam("pause") === "1");
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [webgl] = useState(() => webglSupported());
  const telopRef = useRef<HTMLOListElement>(null);
  const use2d = config.view === "2d";
  const portrait = usePortrait();
  const speed = config.speed;
  const ended = display >= end;

  // 試合の時計（3D の読み込み中・一時停止・縦持ちの間は進めない）
  useEffect(() => {
    if (paused || ended || (!ready && !use2d) || portrait) return;
    const id = setInterval(() => {
      displayRef.current = Math.min(end, displayRef.current + (GAME_MINUTES_PER_SECOND * speed * TICK_MS) / 1000);
      setDisplay(displayRef.current);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [paused, ended, ready, portrait, speed, end, use2d]);

  const again = () => {
    displayRef.current = 0;
    setDisplay(0);
    setPaused(false);
  };
  const nextSpeed = () => onSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);

  const telop = shownEvents(ms, display, TELOP_LINES).reverse();
  const label = `${MATCH_KIND_NAMES[config.kind]}${demo.labels.round ? ` ${demo.labels.round}` : ""}`;
  const venue = config.venue === "auto" ? (ms.view?.venue ?? 3) : config.venue;
  const score = visibleScore(ms, display);
  const can3d = webgl && !lost && !use2d;

  return (
    <main className="fixed inset-0 overflow-hidden bg-night">
      {can3d && (
        <Match3D
          ms={ms}
          display={Math.min(display, end)}
          playing={!paused && !ended && !portrait}
          speed={speed}
          userSide={0}
          quality={config.quality}
          perf={config.perf}
          load={loadTimes}
          night={config.night}
          avoid={telopRef}
          onReady={() => setReady(true)}
          onError={() => setLost(true)}
        />
      )}
      {can3d && !ready && <StadiumLoading />}
      {use2d && (
        <Pitch2D
          ms={ms}
          display={Math.min(display, end)}
          playing={!paused && !ended && !portrait}
          speed={speed}
          userSide={0}
          perf={config.perf}
          tactical={paused}
          areaClass="top-[calc(max(0.5rem,var(--safe-t))+2.375rem)] bottom-[calc(max(0.5rem,var(--safe-b))+2rem)] left-[max(0.25rem,var(--safe-l))] right-[calc(max(0.5rem,var(--safe-r))+3.75rem)]"
        />
      )}

      {/* 左上：スコアボード（計測の表示があるときは、その下にずらす） */}
      <div className={`pointer-events-none absolute left-[max(0.5rem,var(--safe-l))] right-[calc(max(0.5rem,var(--safe-r))+3.5rem)] flex flex-col items-start gap-1 ${config.perf && !use2d ? "top-[max(5rem,var(--safe-t))]" : "top-[max(0.5rem,var(--safe-t))]"}`}>
        <div className="anim-band-in max-w-full shadow-hard">
          <Scoreboard ms={ms} display={display} label={label} compact />
        </div>
        <TeamStatus ms={ms} display={display} />
        <p className="bg-panel/90 px-2 py-0.5 text-[0.75rem] font-bold text-text-2">
          {VENUE_NAMES[venue]}
          {config.night && "・ナイター"}
          {demo.clashed && `・色かぶりのため${demo.kitChoice[1] === "second" ? "アウェーが 2nd" : demo.kitChoice[0] === "second" ? "ホームが 2nd" : "アウェーが予備の無地"}`}
        </p>
      </div>

      {/* 左下：速報のテロップ（直近の数件。行は観戦画面と共通の EventLine） */}
      {/* 3D では、ボールや選手が手前に来たら薄くして 1 行にする（R3 の修正 5）。2D は 1 行だけ */}
      <ol
        ref={telopRef}
        className="group pointer-events-none absolute bottom-[max(0.5rem,var(--safe-b))] left-[max(0.5rem,var(--safe-l))] right-[calc(max(0.5rem,var(--safe-r))+3.5rem)] max-w-[30rem] bg-panel/90 shadow-hard transition-opacity duration-300 data-[near=1]:opacity-60"
      >
        {(use2d ? telop.slice(-1) : telop).map((e, i, arr) => (
          <EventLine
            key={`${e.minute}-${ms.events.indexOf(e)}`}
            ms={ms}
            e={e}
            userSide={0}
            className={`[&>span:last-child]:truncate ${i === arr.length - 1 ? "anim-fade-up" : "group-data-[near=1]:hidden"} ${use2d ? "!border-0 !py-0.5" : ""}`}
          />
        ))}
      </ol>

      {/* 右の端：操作 */}
      <div className="absolute right-[max(0.5rem,var(--safe-r))] top-1/2 flex -translate-y-1/2 flex-col gap-2">
        <IconButton name={paused ? "play" : "pause"} label={paused ? "再生" : "一時停止"} variant="secondary" disabled={ended} onClick={() => setPaused((p) => !p)} />
        <button
          type="button"
          aria-label={`速さ（今は${SPEED_LABEL[speed]}）`}
          title="速さ"
          onClick={nextSpeed}
          className="pressable flex min-h-11 min-w-11 flex-col items-center justify-center border border-line-2 bg-panel-2 text-text"
        >
          <Icon name="speed" size={14} />
          <span className="font-num text-[0.75rem] font-bold leading-none">{SPEED_LABEL[speed]}</span>
        </button>
        <IconButton name="gear" label="設定に戻る" onClick={onBack} />
      </div>

      {!can3d && !use2d && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="anim-pop flex max-w-[24rem] flex-col gap-3 bg-panel p-4 shadow-hard-lg">
            <Band tone="red">3D を表示できません</Band>
            <p className="text-[0.8125rem] text-text-2">{lost ? "3D の表示が止まりました。" : "この端末・ブラウザでは WebGL が使えません。"}</p>
            <Button variant="secondary" icon="back" onClick={onBack}>
              設定に戻る
            </Button>
          </div>
        </div>
      )}

      {ended && (can3d || use2d) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pr-16">
          <div className="anim-pop pointer-events-auto flex flex-col items-stretch gap-2 bg-panel p-3 shadow-hard-lg">
            <Band tone="yellow" sub={demo.labels.title}>
              試合終了
            </Band>
            <div className="flex items-center justify-center gap-3 py-1">
              <span className="max-w-[9rem] truncate text-[0.875rem] font-black text-text">{ms.teams[0].name}</span>
              <span className="font-num bg-telop px-3 text-[1.75rem] font-bold leading-tight text-ink">
                {score[0]}
                <span className="mx-1 text-[1rem] text-ink-2">-</span>
                {score[1]}
              </span>
              <span className="max-w-[9rem] truncate text-[0.875rem] font-black text-text">{ms.teams[1].name}</span>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" icon="play" onClick={again}>
                もう一度
              </Button>
              <Button className="flex-1" variant="secondary" icon="gear" onClick={onBack}>
                設定に戻る
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
