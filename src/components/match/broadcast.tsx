"use client";

/**
 * 観戦の画面の部品（R1。B 案スポーツ中継風）：スコアボードの帯・速報の行（頭にイベントの種類のアイコン）・試合の流れ・退場とケガ。
 * テキスト・2D・3D の観戦と、3D 観戦のデモで共通に使う。表示だけで、試合の状態は変えない
 */
import { KIT_PALETTE } from "@/engine/config/look";
import { isOut, isPlayingPhase, playersShort } from "@/engine/match/engine";
import { describeEvent, isHighlight, isIncident } from "@/engine/match/text";
import type { MatchEvent, MatchState, Side } from "@/engine/match/types";
import { Icon, type IconName } from "../icons";

/** 表示している時間までの得点 */
export function visibleScore(ms: MatchState, display: number): [number, number] {
  const s: [number, number] = [0, 0];
  for (const e of ms.events) {
    if (e.minute > display) break;
    if (e.type === "goal" || e.type === "pkGoal") s[e.side]++;
  }
  return s;
}

/** 前半・後半などの表示 */
export function phaseLabel(ms: MatchState, display: number): string {
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

/** イベントの種類 → 行の頭のアイコンと色（無いものは null） */
const EVENT_ICON: Partial<Record<MatchEvent["type"], { icon: IconName; color: string }>> = {
  goal: { icon: "ball", color: "text-yellow" },
  pkGoal: { icon: "ball", color: "text-yellow" },
  yellow: { icon: "card", color: "text-yellow" },
  secondYellow: { icon: "card", color: "text-red" },
  red: { icon: "card", color: "text-red" },
  injury: { icon: "injury", color: "text-bad" },
  shortHanded: { icon: "warning", color: "text-bad" },
  sub: { icon: "sub", color: "text-info" },
  note: { icon: "note", color: "text-good" },
  kickoff: { icon: "whistle", color: "text-text-2" },
  halfTime: { icon: "whistle", color: "text-text-2" },
  secondHalf: { icon: "whistle", color: "text-text-2" },
  fullTime: { icon: "whistle", color: "text-text-2" },
  extraTime: { icon: "whistle", color: "text-text-2" },
  extraSecondHalf: { icon: "whistle", color: "text-text-2" },
  pkShootout: { icon: "pk", color: "text-text-2" },
  tactics: { icon: "tactics", color: "text-text-3" },
  formation: { icon: "tactics", color: "text-text-3" },
};

export function EventIcon({ e, size = 14 }: { e: MatchEvent; size?: number }) {
  const m = EVENT_ICON[e.type];
  if (!m) return <span className="inline-block shrink-0" style={{ width: `${size / 16}rem` }} />;
  return <Icon name={m.icon} size={size} className={m.color} />;
}

/** 速報の 1 行（分・アイコン・文章）。自校の得点は黄、相手の得点は青の地 */
export function EventLine({ ms, e, userSide, className = "" }: { ms: MatchState; e: MatchEvent; userSide: Side; className?: string }) {
  const goal = e.type === "goal" || e.type === "pkGoal";
  const tone = goal ? (e.side === userSide ? "bg-yellow text-ink" : "bg-info text-ink") : isIncident(e) ? (e.type === "note" ? "text-good" : "text-bad") : "text-text";
  return (
    <li className={`flex items-start gap-1.5 border-b border-line px-1.5 py-1 text-[0.8125rem] leading-snug ${isHighlight(e) || goal ? "font-black" : "font-bold"} ${tone} ${className}`}>
      <span className={`font-num w-7 shrink-0 text-right text-[0.75rem] ${goal ? "text-ink-2" : "text-text-3"}`}>{e.minute}&apos;</span>
      <span className={`mt-px ${goal ? "[&_svg]:!text-ink" : ""}`}>
        <EventIcon e={e} />
      </span>
      <span className="min-w-0 flex-1">{describeEvent(ms, e)}</span>
    </li>
  );
}

const kitColor = (ms: MatchState, side: Side) => {
  const k = ms.view?.kits[side];
  return k ? KIT_PALETTE[k.main] : side === 0 ? "#f2c21b" : "#7cc8ff";
};

/**
 * スコアボードの帯：大会名の札、両チームの名前（ユニフォームの色の印）とスコア、前半・後半と分。
 * compact は 3D の上に重ねる小さい形（左上）
 */
export function Scoreboard({ ms, display, label, compact = false }: { ms: MatchState; display: number; label: string; compact?: boolean }) {
  const score = visibleScore(ms, display);
  const ended = ms.phase === "END" && display >= ms.minute;
  const brk = !isPlayingPhase(ms) && display >= ms.minute;
  const team = (side: Side, align: "l" | "r") => (
    <span className={`flex min-w-0 items-center gap-1.5 ${align === "r" ? "flex-row-reverse text-right" : ""} ${compact ? "max-w-[9rem]" : "flex-1"}`}>
      <span className="h-3.5 w-1.5 shrink-0 outline outline-1 outline-text-3/60" style={{ background: kitColor(ms, side) }} />
      <span className={`truncate font-black ${compact ? "text-[0.8125rem]" : "text-[0.9375rem]"}`}>{ms.teams[side].name}</span>
    </span>
  );
  return (
    <div className={`flex min-w-0 items-stretch ${compact ? "" : "w-full"}`}>
      <div className="cut-r flex shrink-0 items-center bg-yellow py-0.5 pl-2.5 pr-5 text-[0.75rem] font-black text-ink">
        <span className={`truncate ${compact ? "max-w-[8rem]" : "max-w-[14rem]"}`}>{label}</span>
      </div>
      <div className={`-ml-3 flex min-w-0 items-center gap-2 bg-panel py-1 pl-5 pr-2 text-text ${compact ? "" : "flex-1"}`}>
        {team(0, "r")}
        <span className={`font-num flex shrink-0 items-center gap-1.5 bg-telop px-2 text-ink ${compact ? "text-[1.125rem]" : "text-[1.375rem]"} leading-tight`}>
          {score[0]}
          <span className="text-[0.75rem] text-ink-2">-</span>
          {score[1]}
        </span>
        {team(1, "l")}
        <span className={`font-num ml-1 shrink-0 bg-panel-3 px-1.5 text-[0.8125rem] ${ended || brk ? "text-yellow" : "text-text"}`}>
          {phaseLabel(ms, display)}
          {!ended && !brk && ` ${Math.floor(display)}'`}
          {ms.pk && ` PK ${ms.pk.score[0]}-${ms.pk.score[1]}`}
        </span>
      </div>
    </div>
  );
}

/** 試合の流れ（5 分ごと。上が自校ペース） */
export function Momentum({ ms, display, userSide, className = "" }: { ms: MatchState; display: number; userSide: Side; className?: string }) {
  const momentum = ms.momentumHistory.slice(0, Math.floor(display / 5));
  const current = (momentum.at(-1) ?? 0) * (userSide === 0 ? 1 : -1);
  const slots = Math.max(momentum.length, Math.ceil((ms.rules.halfMinutes * 2) / 5));
  return (
    <div className={`bg-panel px-2 py-1 ${className}`}>
      <div className="mb-0.5 flex justify-between text-[0.6875rem] font-bold text-text-3">
        <span>試合の流れ</span>
        <span className={current > 10 ? "text-yellow" : current < -10 ? "text-info" : "text-text-2"}>{current > 10 ? "自校ペース" : current < -10 ? "相手ペース" : "互角"}</span>
      </div>
      <div className="relative flex h-6 items-center gap-px">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line-2" />
        {Array.from({ length: slots }, (_, i) => {
          const m = momentum[i];
          if (m === undefined) return <div key={i} className="flex-1" />;
          const v = m * (userSide === 0 ? 1 : -1);
          const h = Math.max(1, Math.min(12, Math.abs(v) / 2.5));
          return (
            <div key={i} className="relative flex h-6 flex-1 flex-col justify-center">
              <div className={`w-full ${v >= 0 ? "bg-yellow" : "bg-info"}`} style={{ height: h, marginTop: v >= 0 ? -h : h }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 両チームの人数（減っているときだけ）と退場者・ケガ人。表示した時間までのものだけ */
export function TeamStatus({ ms, display }: { ms: MatchState; display: number }) {
  const info = (side: Side) => {
    const t = ms.teams[side];
    const shown = new Set(ms.events.filter((e) => e.side === side && e.minute <= display && (e.type === "red" || e.type === "secondYellow" || e.type === "injury")).map((e) => e.players![0]));
    const out = t.onPitch.filter((id) => isOut(t.players[id]) && shown.has(id));
    return { short: out.length > 0 ? playersShort(t) : 0, out: out.map((id) => ({ id, red: !!t.players[id].sentOff, name: t.players[id].name.split(" ")[0] })) };
  };
  const rows = ([0, 1] as Side[]).map((s) => ({ s, ...info(s) })).filter((r) => r.short > 0 || r.out.length > 0);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 bg-panel px-2 py-1 text-[0.75rem] font-bold">
      {rows.map((r) => (
        <div key={r.s} className="flex min-w-0 items-center gap-1.5">
          <span className="max-w-[6rem] shrink-0 truncate text-text-3">{ms.teams[r.s].name}</span>
          {r.short > 0 && <b className="shrink-0 bg-red px-1 text-white">{11 - r.short}人</b>}
          <span className="flex min-w-0 flex-wrap gap-x-1.5">
            {r.out.map((o) => (
              <span key={o.id} className="inline-flex items-center gap-0.5 text-text">
                <Icon name={o.red ? "card" : "injury"} size={11} className={o.red ? "text-red" : "text-bad"} />
                {o.name}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
