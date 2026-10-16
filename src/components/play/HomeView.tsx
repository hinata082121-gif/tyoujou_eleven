"use client";

import { useEffect, useRef, useState } from "react";
import { dayToDate, formatDay } from "@/engine/calendar";
import { COMPETITION_NAMES, PRACTICE_NAMES } from "@/engine/config/names";
import { PRACTICES } from "@/engine/config/practice";
import { inTournamentRun, nextTournamentMatchDay } from "@/engine/game";
import { boardSquare, nextNonMatchPlan, type BoardSquare } from "@/engine/game/board";
import { isTextOnly } from "../event/eventScenes";
import { playerSchool } from "@/engine/season";
import type { Square } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Icon, type IconName } from "../icons";
import { PlayerFace } from "../look/Figure";
import { usePortrait } from "../shell/usePortrait";
import { Band, Button, Chip, IconButton, Sheet, fitnessColor } from "../ui";

/** マスの種類 → 下の線の色（DESIGN.md 2.4） */
const SQUARE_LINE: Record<string, string> = {
  blue: "border-sq-blue",
  red: "border-sq-red",
  white: "border-sq-white",
  green: "border-sq-green",
  yellow: "border-sq-yellow",
  training: "border-sq-training",
  person: "border-sq-person",
  major: "border-sq-major",
  branch: "border-sq-branch",
  hidden: "border-line-2",
};
const SQUARE_SWATCH: Record<string, string> = {
  blue: "bg-sq-blue",
  red: "bg-sq-red",
  white: "bg-sq-white",
  green: "bg-sq-green",
  yellow: "bg-sq-yellow",
  training: "bg-sq-training",
  person: "bg-sq-person",
  major: "bg-red",
  branch: "bg-sq-branch",
  hidden: "bg-line-2",
};
const LEGEND: [string, string][] = [
  ["blue", "良いことが起きやすい"],
  ["red", "悪いことが起きやすい"],
  ["white", "どちらか"],
  ["green", "体力回復"],
  ["yellow", "練習効率アップ"],
  ["training", "特訓"],
  ["person", "人物（選択肢のある出来事）"],
  ["branch", "分かれ道"],
  ["major", "必ず止まる（行事・合宿など）"],
  ["hidden", "？＝まだ見えない（10日より先）"],
];

const TARGET_LABEL = { all: "全員", field: "フィールド", gk: "GKのみ" } as const;

/** 練習の種類 → アイコン（練習の名前の文字から探す。CardResult は名前で持っているため） */
export const PRACTICE_ICON = Object.fromEntries(Object.keys(PRACTICES).map((k) => [k, k as IconName])) as Record<keyof typeof PRACTICES, IconName>;

export function HomeView() {
  const game = useGameStore((s) => s.game)!;
  const playCard = useGameStore((s) => s.playCard);
  const nextMatch = useGameStore((s) => s.nextMatch);
  const setScoutOpen = useGameStore((s) => s.setScoutOpen);
  const lastCard = useGameStore((s) => s.lastCard);
  const clearLastCard = useGameStore((s) => s.clearLastCard);
  const moving = useGameStore((s) => s.moving);
  const setMoving = useGameStore((s) => s.setMoving);
  const eventView = useGameStore((s) => s.settings.eventView);
  const openSchedule = useGameStore((s) => s.openSchedule);
  const selectPlayer = useGameStore((s) => s.selectPlayer);
  const portrait = usePortrait();
  const cal = game.calendar;
  const [animPos, setAnimPos] = useState<number | null>(null);
  const [legend, setLegend] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 移動の演出（スキップできる。縦に持っている間は止める）
  useEffect(() => {
    if (!moving || !lastCard || portrait) return;
    let pos = animPos ?? lastCard.from;
    timer.current = setInterval(() => {
      pos++;
      setAnimPos(pos);
      if (pos >= lastCard.to) {
        if (timer.current) clearInterval(timer.current);
        setTimeout(() => {
          setAnimPos(null);
          setMoving(false);
        }, 250);
      }
    }, 130);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // animPos は続きから動かすためだけに読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, lastCard, setMoving, portrait]);

  const skip = () => {
    if (timer.current) clearInterval(timer.current);
    setAnimPos(null);
    setMoving(false);
  };

  const position = moving && lastCard ? (animPos ?? lastCard.from) : cal.position;
  const start = Math.max(0, Math.min(cal.position - 3, cal.squares.length - 28));
  const squares = cal.squares.slice(start, start + 28);
  const school = playerSchool(game);
  const active = school.players.filter((p) => p.status === "active");
  const avgFit = active.reduce((s, p) => s + p.fitness, 0) / Math.max(1, active.length);
  // コンディション：ケガ → 体力の低い順
  const watch = [...active].sort((a, b) => (b.injuryDays > 0 ? 1 : 0) - (a.injuryDays > 0 ? 1 : 0) || a.fitness - b.fitness);
  const run = inTournamentRun(game);
  const nextDay = run ? nextTournamentMatchDay(game) : null;
  const plan = nextNonMatchPlan(game);
  const sc = game.scout;
  const host = game.prefectures.find((p) => p.id === game.competitions.summerHostPrefId);
  const recent = game.log.slice(-12).reverse();
  const showResult = !moving && lastCard && eventView === "text";
  // 速報：直前のカードの、文章だけの出来事（無ければ最新の記録）
  const ticker = !moving && lastCard && eventView === "important" ? lastCard.outcomes.filter(isTextOnly) : [];
  const newsItems = ticker.length > 0 ? ticker.map((o) => ({ text: `${o.title}：${o.text}`, tone: o.tone })) : recent.slice(0, 1).map((l) => ({ text: l.text, tone: l.tone ?? ("info" as const) }));
  const [mm] = dayToDate(cal.position);
  // テスト前の 3 日（マスの上に細い帯）
  const prepDays = new Set<number>();
  for (const sq of squares) if (sq.major?.kind === "school" && sq.major.event === "test") for (let d = sq.day - 3; d < sq.day; d++) prepDays.add(d);

  return (
    <div className="flex min-h-0 flex-1 gap-2.5">
      {/* 日程と手札 */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Band sub={`${mm}月　見えるのは10日先まで`} right={<IconButton name="info" label="マスの見方" onClick={() => setLegend(true)} className="!min-h-8 !min-w-8 border-0 bg-panel/80" />}>
          日程
        </Band>
        <div className="mt-1 grid grid-cols-14 gap-[3px] pl-1">
          {squares.map((sq) => (
            <SquareCell key={sq.day} sq={sq} view={boardSquare(game, sq)} current={sq.day === position} passed={sq.day < position} prep={prepDays.has(sq.day) && sq.day - cal.position <= 10} />
          ))}
        </div>

        {run ? (
          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            <Band tone="red">大会の本戦の最中</Band>
            <div className="mt-1 flex flex-1 flex-col justify-center gap-3 bg-panel p-4">
              <p className="text-[0.875rem] leading-relaxed text-text-2">試合のない日は調整日（練習なし・回復だけ）。連戦の疲れが残るので、試合前の画面で体力を見て入れ替えよう。</p>
              <Button className="w-full" icon="next" disabled={moving} onClick={() => nextMatch()}>
                次の試合へ{nextDay !== null && `（${formatDay(nextDay)}）`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2.5 flex min-h-0 flex-1 flex-col">
            <Band
              sub="練習を1枚選ぶ"
              right={
                sc &&
                !sc.replied && (
                  <Chip tone="yellow" onClick={() => setScoutOpen(true)}>
                    <Icon name="scout" size={14} />
                    スカウト 残り<span className="font-num text-[0.8125rem]">{sc.cards}</span>枚
                  </Chip>
                )
              }
            >
              手札
            </Band>
            {moving ? (
              <div className="mt-1 flex flex-1 items-center justify-between gap-3 bg-panel px-4">
                <div className="flex items-center gap-3">
                  <Icon name="run" size={28} className="text-yellow" />
                  <div>
                    <div className="font-head text-[1.125rem]">{lastCard?.practice}</div>
                    <div className="text-[0.75rem] font-bold text-text-2">
                      <span className="font-num text-[1rem] text-text">{lastCard?.days}</span> 日間
                    </div>
                  </div>
                </div>
                <Button variant="secondary" icon="speed" onClick={skip}>
                  スキップ
                </Button>
              </div>
            ) : (
              <div className="mt-1 grid min-h-0 flex-1 gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.max(4, cal.hand.length)}, minmax(0, 1fr))` }}>
                {cal.hand.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={moving}
                    onClick={() => playCard(c.id)}
                    style={{ animationDelay: `${i * 40}ms` }}
                    className="pressable anim-fade-up relative flex min-h-[7rem] flex-col items-center overflow-hidden border border-line-2 bg-panel px-1.5 pb-1.5 pt-1 shadow-hard"
                  >
                    <span className="absolute -left-5 -right-5 top-[42%] h-[24%] -rotate-12 bg-yellow" aria-hidden />
                    <span className="font-num relative text-[clamp(2rem,9vh,3rem)] font-bold leading-none text-text">{c.value}</span>
                    <span className="relative mt-auto mb-auto text-ink">
                      <Icon name={PRACTICE_ICON[c.practice]} size={24} stroke={2.6} />
                    </span>
                    <span className={`relative whitespace-nowrap text-center font-black leading-tight tracking-tight ${PRACTICE_NAMES[c.practice].length >= 6 ? "text-[0.6875rem] tracking-tighter" : "text-[0.75rem]"}`}>{PRACTICE_NAMES[c.practice]}</span>
                    <span className="relative whitespace-nowrap text-[0.6875rem] font-bold tracking-tight text-text-2">{TARGET_LABEL[PRACTICES[c.practice].target]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 右：次の大会・コンディション・速報 */}
      <aside className="flex min-h-0 w-[14.5rem] shrink-0 flex-col gap-1.5">
        <div className="flex shrink-0 items-stretch gap-1">
          {plan ? (
            <div className="cut-r anim-band-in flex min-w-0 flex-1 items-center gap-1.5 bg-red py-1 pl-2 pr-4 text-white">
              <span className="bg-ink px-1 text-[0.6875rem] font-black">次</span>
              <b className="font-num text-[1.125rem] leading-none">{dayToDate(plan.day).join(".")}</b>
              <span className="font-head min-w-0 truncate text-[0.8125rem]">{plan.label}</span>
              <span className="ml-auto shrink-0 text-[0.6875rem] font-bold">
                あと<span className="font-num text-[0.875rem]">{plan.day - cal.position}</span>日
              </span>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <IconButton name="calendar" label="予定表" onClick={openSchedule} className="!min-h-8 !min-w-8 border-0 bg-panel" />
        </div>
        {/* 初めのうちだけ：すごろくでは試合の日が分からないので、予定表の場所を知らせる（PLAN 14章） */}
        {game.year === 1 && cal.position < HINT_UNTIL_DAY && (
          <button type="button" onClick={openSchedule} className="pressable -mt-0.5 flex shrink-0 items-center gap-1 bg-telop px-2 py-0.5 text-left text-[0.6875rem] font-black text-ink">
            <Icon name="calendar" size={12} />
            試合の日は、すごろくでは見えません。予定表で確かめられます
          </button>
        )}
        {showResult ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Band sub={`${lastCard.days}日間`} right={<IconButton name="close" label="閉じる" onClick={clearLastCard} className="!min-h-7 !min-w-7 border-0 bg-panel/80" />}>
              {lastCard.practice}
            </Band>
            <div className="scroll-y mt-1 min-h-0 flex-1 bg-panel px-2 py-1">
              {cal.nextPracticeMult !== 1 && <p className="text-[0.75rem] font-bold text-warn">次の練習効率 ×{cal.nextPracticeMult}</p>}
              {lastCard.outcomes.map((o, i) => (
                <p key={i} className={`border-b border-line py-1 text-[0.75rem] leading-snug ${o.tone === "good" ? "text-good" : o.tone === "bad" ? "text-bad" : "text-text-2"}`}>
                  <b className="mr-1">{o.title}</b>
                  {o.text}
                </p>
              ))}
              {lastCard.injured.length > 0 && <p className="py-1 text-[0.75rem] text-bad">練習中のケガ：{lastCard.injured.join("、")}</p>}
              {lastCard.outcomes.length === 0 && lastCard.injured.length === 0 && <p className="py-1 text-[0.75rem] text-text-3">特に出来事はなかった</p>}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <Band sub={`平均体力 ${Math.round(avgFit)}`}>コンディション</Band>
            <div className="scroll-y mt-1 min-h-0 flex-1 bg-panel px-2">
              {watch.map((p) => (
                <button key={p.id} type="button" onClick={() => selectPlayer(p.id)} className="pressable grid h-9 w-full grid-cols-[1.75rem_4.5rem_1fr_2.75rem] items-center gap-1.5 border-b border-line text-left text-[0.75rem]">
                  <PlayerFace look={p.look} size={28} expr={p.injuryDays > 0 ? "sad" : p.fitness < 45 ? "sad" : "normal"} kit={school.kits?.first} />
                  <span className="truncate font-bold">{p.name.split(" ")[0]}</span>
                  <span className="h-1.5 -skew-x-[20deg] bg-panel-3">
                    <i className={`block h-full ${p.injuryDays > 0 ? "bg-fit-low" : fitnessColor(p.fitness)}`} style={{ width: `${p.fitness}%` }} />
                  </span>
                  {p.injuryDays > 0 ? (
                    <span className="flex items-center justify-end text-[0.6875rem] font-black text-bad">
                      ケガ{p.injuryDays}日
                    </span>
                  ) : (p.remedialDays ?? 0) > 0 || (p.awayDays ?? 0) > 0 ? (
                    <span className="flex items-center justify-end whitespace-nowrap text-[0.6875rem] font-black text-warn">
                      {(p.remedialDays ?? 0) > 0 ? `補習${p.remedialDays}日` : `不在${p.awayDays}日`}
                    </span>
                  ) : (
                    <span className="font-num text-right text-[0.9375rem]">{Math.round(p.fitness)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        <NewsTicker key={newsItems.map((x) => x.text).join("|")} items={newsItems} onOpen={() => setLogOpen(true)} />
      </aside>

      {legend && (
        <Sheet title="マスの見方" onClose={() => setLegend(false)}>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
            {LEGEND.map(([t, label]) => (
              <li key={t} className="flex items-center gap-2 text-[0.8125rem]">
                <i className={`h-3 w-5 -skew-x-12 ${SQUARE_SWATCH[t]}`} />
                {label}
              </li>
            ))}
          </ul>
          {host && (
            <p className="mt-3 text-[0.8125rem] text-text-2">
              今年の{COMPETITION_NAMES.summer}は{host.name}で開催
            </p>
          )}
        </Sheet>
      )}
      {logOpen && (
        <Sheet title="速報" onClose={() => setLogOpen(false)}>
          <ul>
            {recent.map((l, i) => (
              <li key={i} className="flex gap-3 border-b border-line py-1.5 text-[0.8125rem] leading-snug">
                <span className="font-num w-10 shrink-0 text-text-3">{dayToDate(l.day).join(".")}</span>
                <span className={l.tone === "good" ? "text-good" : l.tone === "bad" ? "text-bad" : "text-text"}>{l.text}</span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}

/** 予定表のお知らせを出す期間（1 年目の 6 月末まで） */
const HINT_UNTIL_DAY = 91;

/** 速報の帯。出来事が複数あれば、1 つずつ短く出す（タップで全文） */
function NewsTicker({ items, onOpen }: { items: { text: string; tone: "good" | "bad" | "info" }[]; onOpen: () => void }) {
  const [i, setI] = useState(0);
  const key = items.map((x) => x.text).join("|");
  // 中身が変わったときは、呼ぶ側が key を変えて最初から
  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 2600);
    return () => clearInterval(t);
  }, [items.length]);
  const cur = items[i] ?? items[0];
  return (
    <button type="button" onClick={onOpen} className="pressable flex h-7 shrink-0 items-stretch bg-panel text-left text-[0.75rem]" aria-label="速報をすべて見る">
      <span className="flex shrink-0 items-center bg-yellow px-2 font-black text-ink">速報</span>
      <span key={`${key}-${i}`} className={`anim-fade-up min-w-0 flex-1 self-center truncate px-2 ${cur?.tone === "good" ? "text-good" : cur?.tone === "bad" ? "text-bad" : "text-text"}`}>
        {cur?.text ?? "まだ出来事はない"}
      </span>
      {items.length > 1 && <span className="font-num flex shrink-0 items-center px-1.5 text-[0.6875rem] text-text-3">{i + 1}/{items.length}</span>}
    </button>
  );
}

/** すごろくのマス（R2：10 日より先は「？」、試合の日は通常マスに見える、1 日は「指示」の札、テスト前は上に細い帯） */
function SquareCell({ sq, view, current, passed, prep }: { sq: Square; view: BoardSquare; current: boolean; passed: boolean; prep: boolean }) {
  const [m, d] = dayToDate(sq.day);
  const hidden = view.type === "hidden";
  const bg = current ? "bg-yellow text-ink outline-2 outline-white" : view.type === "major" ? "bg-red text-white" : hidden ? "bg-panel/70 text-text-3" : "bg-panel/90 text-text";
  return (
    <div className={`relative h-[2.375rem] -skew-x-[8deg] border-b-4 ${SQUARE_LINE[view.type]} ${bg} ${passed ? "opacity-35" : ""}`}>
      <div className="h-full skew-x-[8deg]">
        <span className={`font-num block whitespace-nowrap px-1 leading-[1.1rem] ${d === 1 ? "text-[0.6875rem] tracking-tighter" : "text-[0.8125rem]"}`}>{d === 1 ? `${m}/1` : d}</span>
        {view.monthly && !current && <span className="absolute inset-x-0.5 bottom-0.5 overflow-hidden whitespace-nowrap bg-telop tracking-tighter text-center text-[0.5625rem] font-black leading-[0.75rem] text-ink">指示</span>}
        {hidden && !view.monthly && <span className="font-head absolute inset-x-0 bottom-0.5 text-center text-[0.875rem] leading-none text-text-3">？</span>}
        {view.type === "person" && !view.monthly && <span className="absolute inset-x-0 bottom-px overflow-hidden whitespace-nowrap text-center text-[0.625rem] font-black leading-[0.6875rem] tracking-tighter text-sq-person">人物</span>}
        {view.label && !(view.monthly && !current) && <span className="absolute inset-x-0 bottom-px block truncate text-center text-[0.625rem] font-black leading-[0.6875rem] tracking-tighter">{view.label}</span>}
      </div>
      {prep && !current && <span className="absolute -top-1.5 left-0 right-0 h-1 bg-telop" />}
      {current && <Icon name="ball" size={14} className="absolute -right-1 -top-2 text-white" />}
    </div>
  );
}
