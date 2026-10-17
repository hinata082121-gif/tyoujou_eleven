"use client";

import { useState } from "react";
import { PLAY_STYLE_NAMES, POSITION_NAMES, STAT_NAMES } from "@/engine/config/names";
import { FOCUS } from "@/engine/config/growth";
import { focusChoices, focusStreaks, monthlyReview, type FocusStreak, type MonthlyReviewRow } from "@/engine/monthly";
import { bodyScale, generateKits } from "@/engine/look";
import { overall } from "@/engine/player/rating";
import { statRank } from "@/engine/player/rank";
import { trustBand } from "@/engine/school/life";
import { playerSchool } from "@/engine/season";
import type { Player, StatKey } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Icon } from "../icons";
import { KitFigure, PlayerFace } from "../look/Figure";
import { Band, Button, Chip, RankBadge, Screen, Sheet } from "../ui";
import { POSITION_GROUP } from "./format";
import { StyleChangeSheet } from "./traits";

const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const GROUPS = ["GK", "DF", "MF", "FW"] as const;
const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const fmtOv = (v: number) => (v >= 0.05 ? `+${v.toFixed(1)}` : "±0");

/** 重点にしてからの月数と伸び（一覧用の短い形：「5か月 +6」「今月から」） */
const streakShort = (f: FocusStreak) => (f.months === 0 ? "今月から" : `${f.months}か月 +${f.gain}`);
/** 1 人の指示の画面の形：「スピード：重点にして5か月、＋6」 */
const streakLong = (f: FocusStreak) => (f.months === 0 ? `${STAT_NAMES[f.stat]}：今月から重点` : `${STAT_NAMES[f.stat]}：重点にして${f.months}か月、＋${f.gain}`);

/** 「指示」か「おまかせ」かの札 */
function FocusMode({ p }: { p: Player }) {
  const auto = !p.focus;
  return <span className={`w-fit shrink-0 px-1 text-[0.625rem] font-black leading-[0.9rem] ${auto ? "bg-panel-3 text-text" : "bg-yellow text-ink"}`}>{auto ? "おまかせ" : "指示"}</span>;
}

/** 重点の能力名（2 段まで。切らずに全部見せる）と、重点にしてからの累計の伸び（R3。名前が長くて入らなければ伸びは次の行へ） */
function FocusNames({ p, streaks }: { p: Player; streaks: FocusStreak[] }) {
  const auto = !p.focus;
  return (
    <span className="flex min-w-0 flex-col leading-[1.05rem]">
      {streaks.map((f) => (
        <span key={f.stat} className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={`whitespace-nowrap text-[0.75rem] font-black ${auto ? "text-text-2" : "text-yellow"}`}>{STAT_NAMES[f.stat]}</span>
          <span className={`whitespace-nowrap text-[0.6875rem] font-bold ${f.months > 0 && f.gain > 0 ? "text-good" : "text-text-3"}`}>{streakShort(f)}</span>
        </span>
      ))}
    </span>
  );
}

/** 先月の重点の能力の伸び（例：スピード +4） */
function focusGrowth(p: Player, row: MonthlyReviewRow | undefined): string {
  const stats = p.focus ?? p.autoFocus ?? [];
  if (!row) return "";
  return stats
    .filter((k) => (row.stats[k] ?? 0) > 0)
    .map((k) => `${STAT_NAMES[k]} ${sign(row.stats[k]!)}`)
    .join("・");
}

/**
 * 毎月 1 日の育成指示（R2。PHASE_R2_PLAN 2章・試作 02）。左に先月の振り返り、中に部員の一覧（重点は 2 段で全部見せる）、
 * 右にまとめての操作と「この指示で決定」。行をタップすると 1 人の指示を開く
 */
export function MonthlyScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const confirm = useGameStore((s) => s.confirmMonthly);
  const setFocus = useGameStore((s) => s.setFocus);
  const [open, setOpen] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const pending = game.pending;
  const month = pending?.type === "monthly" ? pending.month : 0;
  const school = playerSchool(game);
  const kits = school.kits ?? generateKits(game.seed, school.id);
  const ps = school.players.filter((p) => p.status === "active").sort((a, b) => overall(b) - overall(a));
  const review = monthlyReview(game);
  const rowOf = new Map(review.rows.map((r) => [r.playerId, r]));
  const top = review.rows.filter((r) => r.overall > 0).slice(0, 5);
  const selected = open ? ps.find((p) => p.id === open) : undefined;
  if (selected) return <MonthlyPlayer p={selected} row={rowOf.get(selected.id)} label={review.label} onBack={() => setOpen(null)} />;

  return (
    <Screen title={`${MONTHS[month]}月の育成指示`} sub="毎月1日" right={<Chip tone="dark">指示は来月にそのまま引き継ぐ</Chip>}>
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 先月の振り返り */}
        <section className="flex w-[10rem] shrink-0 flex-col min-[760px]:w-[11.5rem]">
          <Band sub={review.label}>振り返り</Band>
          <div className="scroll-y mt-1 flex min-h-0 flex-1 flex-col gap-1.5 bg-panel p-2">
            {review.label ? (
              <>
                <div className="grid grid-cols-1 gap-1.5 min-[760px]:grid-cols-2">
                  <div className="bg-panel-2 px-2 py-1">
                    <div className="text-[0.6875rem] font-bold text-text-3">総合の伸び</div>
                    <div className="font-num text-[1.25rem] font-bold text-good">+{review.teamOverall.toFixed(1)}</div>
                  </div>
                  <div className="bg-panel-2 px-2 py-1">
                    <div className="text-[0.6875rem] font-bold text-text-3">伸びた部員</div>
                    <div className="font-num text-[1.25rem] font-bold">
                      {review.grew}
                      <span className="text-[0.75rem] text-text-2">/{review.rows.length}人</span>
                    </div>
                  </div>
                </div>
                <div className="text-[0.6875rem] font-black tracking-wider text-yellow">よく伸びた部員</div>
                {top.map((r) => {
                  const p = ps.find((x) => x.id === r.playerId);
                  if (!p) return null;
                  const best = (Object.entries(r.stats) as [StatKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 2);
                  return (
                    <div key={r.playerId} className="flex items-center gap-1.5 border-b border-line pb-1 text-[0.75rem]">
                      <PlayerFace look={p.look} size={26} expr="joy" kit={kits.first} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{p.name}</div>
                        <div className="text-[0.6875rem] leading-tight text-text-2">{best.map(([k, v]) => `${STAT_NAMES[k]} ${sign(v)}`).join("・")}</div>
                      </div>
                      <span className="font-num text-[0.9375rem] font-bold text-good">{fmtOv(r.overall)}</span>
                    </div>
                  );
                })}
              </>
            ) : (
              <p className="text-[0.75rem] leading-relaxed text-text-2">前の月の記録がありません。来月から、伸びた能力をここで振り返れます。</p>
            )}
          </div>
        </section>

        {/* 部員の一覧 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Band sub={`${ps.length}人　タップで1人ずつ変える`}>今月の重点</Band>
          <div className="scroll-y mt-1 min-h-0 flex-1 bg-panel">
            <div className="sticky top-0 z-10 grid grid-cols-[6.25rem_2rem_2rem_2.5rem_minmax(0,1fr)] items-center gap-1.5 border-b border-line-2 bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-black text-text-3 min-[760px]:grid-cols-[1.75rem_6.25rem_2rem_2rem_2.5rem_minmax(0,1fr)]">
              <span className="hidden min-[760px]:block" />
              <span>名前</span>
              <span>位置</span>
              <span>総合</span>
              <span>先月</span>
              <span>重点</span>
            </div>
            {ps.map((p) => {
              const r = rowOf.get(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOpen(p.id)}
                  className="pressable grid min-h-11 w-full grid-cols-[6.25rem_2rem_2rem_2.5rem_minmax(0,1fr)] items-center gap-1.5 border-b border-line px-2 py-0.5 text-left text-[0.75rem] min-[760px]:grid-cols-[1.75rem_6.25rem_2rem_2rem_2.5rem_minmax(0,1fr)]"
                >
                  {/* 狭い画面（667 など）は顔を省いて、重点と累計の伸びの幅を取る */}
                  <span className="hidden min-[760px]:block">
                    <PlayerFace look={p.look} size={28} kit={kits.first} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-bold">
                      <span className="mr-1 text-[0.6875rem] text-text-3">{p.grade}年</span>
                      {p.name}
                    </span>
                    <FocusMode p={p} />
                  </span>
                  <span className="font-bold text-text-2">{p.mainPosition}</span>
                  <RankBadge rank={statRank(overall(p))} size="sm" />
                  <span className={`font-num text-[0.875rem] ${r && r.overall >= 1 ? "text-good" : "text-text-2"}`}>{r ? fmtOv(r.overall) : "—"}</span>
                  <FocusNames p={p} streaks={focusStreaks(game, p)} />
                </button>
              );
            })}
          </div>
        </section>

        {/* まとめての操作 */}
        <section className="flex w-[7.5rem] shrink-0 flex-col gap-1.5 min-[760px]:w-[8.25rem]">
          <Band>まとめて</Band>
          <Button variant="ghost" icon="squad" className="w-full !justify-start" onClick={() => setGroupOpen(true)}>
            ポジション別
          </Button>
          <Button variant="ghost" icon="rotate" className="w-full !justify-start" onClick={() => setFocus(ps.map((p) => p.id), null)}>
            全員おまかせ
          </Button>
          <div className="mt-1 bg-panel p-2 text-[0.6875rem] leading-snug text-text-2">
            重点の能力に、練習の経験点の{Math.round(FOCUS.share * 10)}割を回す。その分、ほかの能力の伸びは減る。
          </div>
          <Button className="mt-auto w-full" icon="check" cut onClick={confirm}>
            この指示で決定
          </Button>
        </section>
      </div>
      {groupOpen && <GroupSheet players={ps} onClose={() => setGroupOpen(false)} />}
    </Screen>
  );
}

/** ポジション別にまとめて重点を付ける */
function GroupSheet({ players, onClose }: { players: Player[]; onClose: () => void }) {
  const setFocus = useGameStore((s) => s.setFocus);
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("DF");
  const [pick, setPick] = useState<StatKey[]>([]);
  const members = players.filter((p) => POSITION_GROUP[p.mainPosition] === group);
  const choices = members[0] ? focusChoices(members[0]) : [];
  const toggle = (k: StatKey) => setPick((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= FOCUS.max ? [cur[1], k] : [...cur, k]));
  const apply = (stats: StatKey[] | null) => {
    setFocus(
      members.map((p) => p.id),
      stats,
    );
    onClose();
  };
  return (
    <Sheet onClose={onClose} title="ポジション別にまとめて" wide>
      <div className="mb-2 flex gap-1.5">
        {GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => {
              setGroup(g);
              setPick([]);
            }}
            className={`pressable min-h-9 flex-1 text-[0.875rem] font-black ${g === group ? "bg-yellow text-ink" : "bg-panel-2 text-text"}`}
          >
            {g}
            <span className="ml-1 text-[0.6875rem]">{players.filter((p) => POSITION_GROUP[p.mainPosition] === g).length}人</span>
          </button>
        ))}
      </div>
      <p className="mb-1.5 text-[0.75rem] text-text-2">重点の能力を1〜2個選んでください。</p>
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {choices.map((k) => {
          const on = pick.includes(k);
          return (
            <button key={k} type="button" onClick={() => toggle(k)} className={`pressable min-h-9 border-2 px-1 text-[0.75rem] font-black ${on ? "border-yellow bg-panel-3 text-yellow" : "border-transparent bg-panel-2"}`}>
              {STAT_NAMES[k]}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" icon="rotate" className="flex-1" onClick={() => apply(null)} disabled={members.length === 0}>
          {group}をおまかせに
        </Button>
        <Button icon="check" className="flex-1" onClick={() => apply(pick)} disabled={pick.length === 0 || members.length === 0}>
          {group}に付ける
        </Button>
      </div>
    </Sheet>
  );
}

/** 1 人の指示（試作 03）：左に全身の立ち絵と先月の伸び、右に能力の札（タップで重点）・スタイル・おまかせに戻す */
function MonthlyPlayer({ p, row, label, onBack }: { p: Player; row: MonthlyReviewRow | undefined; label: string | null; onBack: () => void }) {
  const game = useGameStore((s) => s.game)!;
  const setFocus = useGameStore((s) => s.setFocus);
  const [styleOpen, setStyleOpen] = useState(false);
  const school = playerSchool(game);
  const kits = school.kits ?? generateKits(game.seed, school.id);
  const b = bodyScale(p.heightCm, p.stats.physical);
  const current = p.focus ?? p.autoFocus ?? [];
  const toggle = (k: StatKey) => {
    const base = p.focus ?? [];
    const next = base.includes(k) ? base.filter((x) => x !== k) : base.length >= FOCUS.max ? [base[1], k] : [...base, k];
    setFocus([p.id], next.length > 0 ? next : null);
  };
  const tb = trustBand(p);
  return (
    <Screen title={`${p.name}の指示`} sub={`${p.grade}年・${POSITION_NAMES[p.mainPosition]}`} onBack={onBack}>
      <div className="flex min-h-0 flex-1 gap-3">
        <section className="flex w-[11rem] shrink-0 flex-col items-center bg-panel/60 pt-1">
          <KitFigure kit={kits.first} number={p.shirtNumber} look={p.look} expr="focus" size={170} height={b.height} build={b.build} />
          <div className="mt-auto w-full bg-panel p-2 text-[0.75rem]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-text-3">総合</span>
              <span className="flex items-center gap-1">
                <RankBadge rank={statRank(overall(p))} size="sm" />
                {row && <b className="font-num text-[0.9375rem] text-good">{fmtOv(row.overall)}</b>}
              </span>
            </div>
            <div className="mt-1 text-[0.6875rem] leading-snug text-text-2">{row ? `${label ?? "先月"}：${focusGrowth(p, row) || "重点の能力の伸びなし"}` : "先月の記録なし"}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-bold text-text-3">信頼度</span>
              <span className="flex gap-0.5" aria-label={`信頼度 ${tb + 1}/5`}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} className={`h-2.5 w-3 -skew-x-12 ${i <= tb ? "bg-yellow" : "bg-panel-3"}`} />
                ))}
              </span>
            </div>
          </div>
        </section>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Band sub={`1〜2個。タップで選ぶ／外す${p.focus ? "" : "（今はおまかせ）"}`} right={<Chip tone="dark">選んだ能力に経験点の{Math.round(FOCUS.share * 10)}割</Chip>}>
            重点の能力
          </Band>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {focusChoices(p).map((k) => {
              const on = current.includes(k);
              const mine = !!p.focus?.includes(k);
              const delta = row?.stats[k] ?? 0;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggle(k)}
                  className={`pressable flex min-h-11 items-center gap-1.5 border-2 px-1.5 text-left ${on ? (mine ? "border-yellow bg-panel-3" : "border-line-2 bg-panel-3") : "border-transparent bg-panel"}`}
                >
                  <RankBadge rank={statRank(p.stats[k])} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[0.75rem] font-black leading-tight ${on ? (mine ? "text-yellow" : "text-text") : ""}`}>{STAT_NAMES[k]}</div>
                    <div className="font-num text-[0.75rem] text-text-2">
                      {p.stats[k]}
                      {delta > 0 && <span className="ml-1 text-good">+{delta}</span>}
                    </div>
                  </div>
                  {on && <Icon name="check" size={16} className={mine ? "text-yellow" : "text-text-3"} />}
                </button>
              );
            })}
          </div>
          {!p.focus && current.length > 0 && <p className="mt-1.5 text-[0.75rem] text-text-2">おまかせ：ヘッドコーチが今月は「{current.map((k) => STAT_NAMES[k]).join("・")}」を重点にしました。</p>}
          {/* 重点にしてからの累計の伸び（R3。「指示」と「おまかせ」を切り替えても、同じ能力が重点のままなら数え続ける） */}
          {current.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-0.5 border-l-4 border-yellow bg-panel px-2 py-1">
              {focusStreaks(game, p).map((f) => (
                <li key={f.stat} className="text-[0.8125rem] font-bold">
                  {streakLong(f)}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <Band>スタイル</Band>
            <span className="text-[0.8125rem] font-bold">{PLAY_STYLE_NAMES[p.playStyle]}</span>
            <span className="text-[0.75rem] text-text-2">熟練度 {Math.floor(p.styleProficiency)}</span>
            <Button small variant="ghost" icon="swap" onClick={() => setStyleOpen(true)}>
              スタイルを変える
            </Button>
            <Button small variant="secondary" icon="rotate" className="ml-auto" onClick={() => setFocus([p.id], null)} disabled={!p.focus}>
              おまかせに戻す
            </Button>
          </div>
        </section>
      </div>
      {styleOpen && <StyleChangeSheet player={p} onClose={() => setStyleOpen(false)} />}
    </Screen>
  );
}
