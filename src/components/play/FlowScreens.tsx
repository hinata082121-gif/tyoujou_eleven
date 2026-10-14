"use client";

import { useState, type ReactNode } from "react";
import { captainOf } from "@/engine/captain";
import { CAREER_NAMES, COMPETITION_NAMES, MAJOR_NAMES, POSITION_NAMES, REPUTATION_NAMES, SKILL_NAMES, yearLabel } from "@/engine/config/names";
import type { MatchSummary } from "@/engine/game";
import { divisionOf, standings } from "@/engine/league";
import { bodyScale, generateKits } from "@/engine/look";
import { overall } from "@/engine/player/rating";
import { statRank } from "@/engine/player/rank";
import { playerSchool } from "@/engine/season";
import type { Career, GameState, Player, School } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Icon } from "../icons";
import { casualColor } from "../look/casual";
import { KitFigure, PlayerFace, type Expression } from "../look/Figure";
import { Band, Button, Label, RankBadge, Screen } from "../ui";

const kitsOf = (game: GameState, school: School) => school.kits ?? generateKits(game.seed, school.id);

/** 試合で活躍した選手（得点の多い人 → 特殊能力を身につけた人 → キャプテン → 総合の高い人）。表示だけ */
function matchHero(r: MatchSummary, school: School): { player: Player; reason: string } | null {
  const goals = new Map<string, number>();
  for (const g of r.goals) if (g.mine && g.name) goals.set(g.name, (goals.get(g.name) ?? 0) + 1);
  const top = [...goals.entries()].sort((a, b) => b[1] - a[1])[0];
  const scorer = top && school.players.find((p) => p.name === top[0]);
  if (scorer) return { player: scorer, reason: `${top[1]}得点` };
  const learn = r.learned?.find((l) => l.kind === "learn");
  const learner = learn && school.players.find((p) => p.id === learn.playerId);
  if (learner) return { player: learner, reason: "特殊能力を習得" };
  const cap = captainOf(school);
  if (cap) return { player: cap, reason: "キャプテン" };
  const best = school.players.filter((p) => p.status === "active").sort((a, b) => overall(b) - overall(a))[0];
  return best ? { player: best, reason: "チームの柱" } : null;
}

/** 試合結果：左にスコアと得点者、右に活躍した選手の全身と、評判などの変化 */
export function MatchResultScreen() {
  const r = useGameStore((s) => s.lastMatch)!;
  const clear = useGameStore((s) => s.clearLastMatch);
  const game = useGameStore((s) => s.game)!;
  const school = playerSchool(game);
  const kits = kitsOf(game, school);
  const resultText = r.result === "win" ? "勝利" : r.result === "draw" ? "引き分け" : "敗戦";
  const tone = r.result === "win" ? "bg-yellow text-ink" : r.result === "loss" ? "bg-red text-white" : "bg-telop text-ink";
  const expr: Expression = r.result === "win" ? "joy" : r.result === "loss" ? "frustrated" : "focus";
  const hero = matchHero(r, school);
  const heroBody = hero ? bodyScale(hero.player.heightCm, hero.player.stats.physical) : null;
  const myGoals = r.goals.filter((g) => g.mine).length;
  return (
    <Screen
      title="試合結果"
      sub={r.label}
      right={
        <Button icon="next" cut onClick={clear}>
          次へ
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 左：スコアと得点者 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
          <div className={`cut-r anim-band-in shrink-0 py-1.5 pl-3 pr-8 ${tone}`}>
            <div className="flex items-center gap-2">
              <span className="-skew-x-12 bg-ink px-2 py-px text-[0.875rem] font-black text-telop">{resultText}</span>
              <span className="min-w-0 truncate text-[0.75rem] font-bold">vs {r.opponentName}</span>
            </div>
            <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <span className="font-head truncate text-right text-[0.9375rem]">{school.name}</span>
              <span className="font-num text-[2.5rem] font-bold leading-none">
                {r.score[0]} - {r.score[1]}
              </span>
              <span className="font-head truncate text-[0.9375rem]">{r.opponentName}</span>
            </div>
            {r.pk && (
              <div className="font-num text-center text-[0.9375rem] font-bold">
                PK {r.pk[0]} - {r.pk[1]}
              </div>
            )}
          </div>
          {r.stats && (
            <div className="shrink-0 bg-panel px-2">
              {(
                [
                  ["シュート", r.stats.shots],
                  ["枠内", r.stats.onTarget],
                  ["支配率", r.stats.possession.map((v) => `${v}%`)],
                ] as [string, (number | string)[]][]
              ).map(([k, v]) => (
                <div key={k} className="grid h-7 grid-cols-[1fr_5rem_1fr] items-center border-b border-line last:border-b-0">
                  <span className="font-num text-right text-[1rem] font-bold">{v[0]}</span>
                  <span className="text-center text-[0.6875rem] font-bold text-text-3">{k}</span>
                  <span className="font-num text-[1rem] text-text-2">{v[1]}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            <Band sub={`自校 ${myGoals}点`}>得点</Band>
            <ul className="scroll-y mt-1 min-h-0 flex-1 bg-panel px-2">
              {r.goals.length === 0 && <li className="py-2 text-[0.75rem] text-text-3">得点なし</li>}
              {r.goals.map((g, i) => {
                const p = g.mine ? school.players.find((x) => x.name === g.name) : undefined;
                return (
                  <li key={i} className={`flex h-8 items-center gap-1.5 border-b border-line text-[0.8125rem] ${g.mine ? "font-bold text-text" : "text-text-3"}`}>
                    <span className="font-num w-7 shrink-0 text-right text-[0.875rem]">{g.minute}&apos;</span>
                    {p ? <PlayerFace look={p.look} size={24} expr="joy" kit={kits.first} /> : <Icon name="ball" size={16} className="mx-1 shrink-0" />}
                    <span className="min-w-0 truncate">
                      {g.name}
                      {g.pk && "（PK）"}
                    </span>
                    {!g.mine && <span className="ml-auto shrink-0 truncate text-[0.6875rem]">{r.opponentName}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* 右：活躍した選手と変化 */}
        <section className="flex min-h-0 w-[21rem] shrink-0 gap-2">
          {hero && heroBody && (
            <div className="relative min-h-0 w-[8.5rem] shrink-0 overflow-hidden">
              <div className="anim-pop absolute bottom-[3.25rem] left-1/2 -translate-x-1/2">
                <KitFigure kit={kits.first} number={hero.player.shirtNumber} look={hero.player.look} height={heroBody.height} build={heroBody.build} size={190} expr={expr} />
              </div>
              <div className="absolute inset-x-0 bottom-0">
                <div className="cut-r anim-band-in font-head truncate bg-telop py-0.5 pl-2 pr-5 text-[0.9375rem] text-ink">{hero.player.name}</div>
                <div className="cut-r -mt-px inline-block bg-ink py-0.5 pl-2 pr-5 text-[0.75rem] font-bold text-yellow">{hero.reason}</div>
              </div>
            </div>
          )}
          <div className="scroll-y flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
            {r.qualifiedNational && (
              <Banner>
                予選を勝ち抜いた！ {r.kind === "summerQualifier" ? COMPETITION_NAMES.summerNational : COMPETITION_NAMES.national}に出場！
              </Banner>
            )}
            {r.champion && !r.qualifiedNational && (
              <Banner>{r.kind === "national" || r.kind === "summerNational" ? "全国制覇！" : r.kind === "rookiePref" ? "新人戦の県大会で優勝！" : "新人戦の地域大会で優勝！"}</Banner>
            )}
            <div className="shrink-0 bg-panel px-2 py-1.5">
              <Label>評判</Label>
              <div className="flex items-baseline gap-2 text-[0.75rem] text-text-2">
                評判ゲージ
                <b className={`font-num text-[1.25rem] ${r.reputationDelta > 0 ? "text-good" : r.reputationDelta < 0 ? "text-bad" : "text-text"}`}>
                  {r.reputationDelta >= 0 ? "+" : ""}
                  {r.reputationDelta}
                </b>
              </div>
              {r.levelChange !== 0 && (
                <div className={`anim-pop mt-0.5 flex items-center gap-1 text-[0.8125rem] font-black ${r.levelChange > 0 ? "text-good" : "text-bad"}`}>
                  <Icon name={r.levelChange > 0 ? "up" : "down"} size={14} />
                  評判が「{REPUTATION_NAMES[game.reputation.level]}」に{r.levelChange > 0 ? "上がった！" : "下がった…"}
                </div>
              )}
            </div>
            {r.league && (
              <div className="shrink-0 bg-panel px-2 py-1.5 text-[0.75rem] text-text-2">
                <Label>{COMPETITION_NAMES.league}</Label>
                リーグ {r.league.level}部：<b className="font-num text-[1rem] text-text">{r.league.position}位</b>（{r.league.size}校・勝ち点{r.league.points}）{r.league.finished && " 全節終了"}
              </div>
            )}
            {r.learned?.length > 0 && (
              <div className="shrink-0 bg-panel px-2 py-1.5">
                <Label>特殊能力の変化</Label>
                <ul className="flex flex-col gap-0.5">
                  {r.learned.map((l, i) => (
                    <li key={i} className={`flex items-start gap-1 text-[0.75rem] leading-snug ${l.kind === "remove" ? "text-text-2" : "font-bold text-good"}`}>
                      {l.kind === "learn" && <Icon name="star" size={12} className="mt-0.5 shrink-0" />}
                      {l.kind === "remove" ? `${l.name}の「${SKILL_NAMES[l.skill]}」が消えた` : `${l.name}が「${SKILL_NAMES[l.skill]}」を身につけた！`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.eliminated && (r.kind === "prefQualifier" || r.kind === "national") && <p className="shrink-0 bg-panel px-2 py-1.5 text-[0.75rem] text-text-2">冬の全国大会はここで敗退。3年生は引退となる。</p>}
            {r.eliminated && (r.kind === "summerQualifier" || r.kind === "summerNational") && (
              <p className="shrink-0 bg-panel px-2 py-1.5 text-[0.75rem] text-text-2">夏の全国大会はここで敗退。冬に向けて鍛え直そう。</p>
            )}
          </div>
        </section>
      </div>
    </Screen>
  );
}

/** 大きな知らせの札（予選突破・優勝） */
function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="cut-r anim-pop flex shrink-0 items-center gap-1.5 bg-yellow py-1 pl-2 pr-6 text-ink">
      <Icon name="cup" size={18} className="shrink-0" />
      <span className="font-head text-[0.9375rem] leading-snug">{children}</span>
    </div>
  );
}

/** 卒業式：3 年生の全身を横に並べ、タップで一人ずつ見る */
export function GraduationScreen() {
  const game = useGameStore((s) => s.game)!;
  const graduate = useGameStore((s) => s.graduate);
  const school = playerSchool(game);
  const kits = kitsOf(game, school);
  const grads = school.players.filter((p) => p.grade === 3);
  const [selId, setSelId] = useState<string | null>(grads[0]?.id ?? null);
  const sel = grads.find((p) => p.id === selId) ?? grads[0];
  return (
    <Screen
      title={`${yearLabel(game.year)} ${MAJOR_NAMES.graduation}`}
      right={
        <Button icon="alumni" cut onClick={graduate}>
          卒業式を行う
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Band sub={`${grads.length}人`}>卒業する3年生</Band>
          <div className="scroll-x mt-1 flex min-h-0 flex-1 items-end gap-1 bg-panel/60 px-1 pb-1">
            {grads.map((p) => {
              const body = bodyScale(p.heightCm, p.stats.physical);
              const on = sel?.id === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setSelId(p.id)} aria-pressed={on} className="pressable flex w-[6.25rem] shrink-0 flex-col items-center">
                  <KitFigure kit={kits.first} number={p.shirtNumber} look={p.look} height={body.height} build={body.build} size={on ? 168 : 150} expr={on ? "joy" : "normal"} />
                  <span className={`cut-r -mt-1 w-full truncate py-0.5 pl-1.5 pr-3 text-left text-[0.75rem] font-black ${on ? "bg-yellow text-ink" : "bg-telop text-ink"}`}>{p.name}</span>
                  <span className="w-full truncate bg-ink px-1.5 text-left text-[0.6875rem] font-bold text-text-2">{POSITION_NAMES[p.mainPosition]}</span>
                </button>
              );
            })}
          </div>
        </section>
        <aside className="flex min-h-0 w-[14rem] shrink-0 flex-col gap-1.5">
          <p className="shrink-0 bg-panel px-2 py-1.5 text-[0.8125rem] text-text-2">今年は{grads.length}人の3年生が卒業する。</p>
          {sel && (
            <div key={sel.id} className="anim-fade-up flex min-h-0 flex-col gap-1">
              <div className="cut-r font-head bg-telop py-0.5 pl-2.5 pr-6 text-[1.125rem] text-ink">{sel.name}</div>
              <div className="bg-panel px-2 py-1.5">
                <div className="flex items-center gap-2 text-[0.75rem] text-text-2">
                  <RankBadge rank={statRank(overall(sel))} size="sm" />
                  <b className="font-num text-[1.125rem] text-text">{Math.round(overall(sel))}</b>
                  <span>{POSITION_NAMES[sel.mainPosition]}</span>
                  {school.captainId === sel.id && <span className="bg-ink px-1.5 text-[0.75rem] font-black text-yellow">C</span>}
                </div>
                {sel.admission === "scholarship" && <p className="mt-0.5 text-[0.75rem] font-bold text-warn">特待生として入部</p>}
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <RecordStat label="出場" value={sel.record.apps} />
                  <RecordStat label="得点" value={sel.record.goals} />
                  <RecordStat label="公式戦出場" value={sel.record.officialApps} />
                  <RecordStat label="公式戦得点" value={sel.record.officialGoals} />
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </Screen>
  );
}

function RecordStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-panel-2 px-1.5 py-0.5">
      <div className="text-[0.6875rem] font-bold text-text-3">{label}</div>
      <div className="font-num text-[1rem] leading-tight">{value}</div>
    </div>
  );
}

const CAREER_ORDER: Career[] = ["pro", "university", "worker", "coach", "other"];

/** 卒業生の進路：卒業生の顔（私服）と名前・進路の札 */
export function AlumniScreen() {
  const alumni = useGameStore((s) => s.lastAlumni)!;
  const clear = useGameStore((s) => s.clearAlumni);
  return (
    <Screen
      title="卒業生の進路"
      right={
        <Button icon="next" cut onClick={clear}>
          次へ
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        <aside className="flex min-h-0 w-[12rem] shrink-0 flex-col gap-1.5">
          <p className="shrink-0 bg-panel px-2 py-1.5 text-[0.8125rem] text-text-2">卒業生はOBとして記録された。</p>
          <div className="shrink-0 bg-panel px-2 py-1.5">
            <Label>進路</Label>
            {CAREER_ORDER.map((c) => {
              const n = alumni.filter((a) => a.career === c).length;
              return (
                <div key={c} className={`flex h-6 items-center justify-between border-b border-line text-[0.75rem] last:border-b-0 ${n > 0 ? "text-text" : "text-text-3"}`}>
                  <span className="font-bold">{CAREER_NAMES[c]}</span>
                  <span className="font-num text-[0.9375rem]">{n}</span>
                </div>
              );
            })}
          </div>
        </aside>
        <ul className="scroll-y grid min-h-0 min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] content-start gap-1">
          {alumni.map((a, i) => (
            <li key={a.id} className="anim-fade-up flex items-center gap-2 bg-panel p-1.5" style={{ animationDelay: `${i * 40}ms` }}>
              <PlayerFace look={a.look} size={48} shirt={casualColor(a.id)} expr={a.career === "pro" ? "joy" : "normal"} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.875rem] font-bold">{a.name}</div>
                <div className="flex items-center gap-1.5 text-[0.75rem] text-text-3">
                  <RankBadge rank={statRank(a.overall)} size="sm" />
                  {POSITION_NAMES[a.position]}
                </div>
                <span className={`cut-r mt-0.5 inline-block py-px pl-1.5 pr-3.5 text-[0.75rem] font-black text-ink ${a.career === "pro" ? "bg-yellow" : "bg-telop"}`}>{CAREER_NAMES[a.career]}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}

/** 県リーグの今年の成績（表示用。終わっていなければ今の順位） */
function leagueLine(game: GameState): string | null {
  const lg = game.league;
  if (!lg) return null;
  if (lg.final && lg.final.playerLevel > 0) {
    const f = lg.final;
    return `${f.playerLevel}部 ${f.position}位（${f.size}校）${f.promoted ? "・昇格" : f.relegated ? "・降格" : ""}`;
  }
  if (!lg.active) return null;
  const d = divisionOf(lg, game.playerSchoolId);
  if (!d) return null;
  const table = standings(d);
  const i = table.findIndex((r) => r.schoolId === game.playerSchoolId);
  return i < 0 ? null : `${d.level}部 ${i + 1}位（${table.length}校）`;
}

/** 年度末：1 年の結果を帯で順に出す */
export function YearEndScreen() {
  const game = useGameStore((s) => s.game)!;
  const newYear = useGameStore((s) => s.newYear);
  const school = playerSchool(game);
  const c = game.competitions;
  const league = leagueLine(game);
  const rows: { label: string; value: ReactNode; tone?: "yellow" }[] = [
    { label: COMPETITION_NAMES.winter, value: c.winterResult ?? "—" },
    { label: COMPETITION_NAMES.summer, value: c.summerResult ?? "—" },
    { label: COMPETITION_NAMES.rookie, value: c.rookieResult ?? "—" },
    ...(league ? [{ label: COMPETITION_NAMES.league, value: league }] : []),
    { label: "評判", value: REPUTATION_NAMES[game.reputation.level], tone: "yellow" as const },
    { label: "チームのランク", value: <RankBadge rank={school.rank} size="lg" />, tone: "yellow" as const },
  ];
  const leds = Math.max(1, Math.round(game.reputation.gauge / 10));
  return (
    <Screen
      title={`${yearLabel(game.year)}の終わり`}
      right={
        <Button icon="next" cut onClick={newYear}>
          新年度へ
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 gap-3">
        <section className="scroll-y flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`cut-r anim-band-in flex min-h-10 shrink-0 items-stretch gap-3 pr-8 text-ink ${r.tone === "yellow" ? "bg-yellow" : "bg-telop"}`}
              style={{ animationDelay: `${i * 110}ms` }}
            >
              <span className="flex w-[8.5rem] shrink-0 items-center self-stretch bg-ink px-2.5 text-[0.75rem] font-black text-telop">{r.label}</span>
              <span className="font-head flex min-w-0 items-center truncate py-1 text-[1.125rem]">{r.value}</span>
            </div>
          ))}
        </section>
        <aside className="flex min-h-0 w-[14rem] shrink-0 flex-col gap-1.5">
          <div className="bg-panel px-2 py-1.5">
            <div className="font-head truncate text-[1rem]">{school.name}</div>
            <div className="mt-1 flex items-center gap-2 text-[0.75rem] font-bold text-text-2">
              評判のゲージ
              <span className="flex gap-0.5" aria-label={`評判のゲージ ${game.reputation.gauge}`}>
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className={`h-3 w-2 -skew-x-[15deg] ${i < leds ? "bg-yellow" : "bg-panel-3"}`} />
                ))}
              </span>
            </div>
          </div>
          <p className="bg-panel px-2 py-1.5 text-[0.8125rem] leading-snug text-text-2">4月になると、評判に応じた人数の新入生が入部し、1・2年生は進級する。</p>
        </aside>
      </div>
    </Screen>
  );
}

/** 新入生：特待生は全身を大きく、全員の顔の一覧 */
export function FreshmenScreen() {
  const freshmen = useGameStore((s) => s.lastFreshmen)!;
  const clear = useGameStore((s) => s.clearFreshmen);
  const game = useGameStore((s) => s.game)!;
  const school = playerSchool(game);
  const kits = kitsOf(game, school);
  const scholars = freshmen.filter((p) => p.admission === "scholarship");
  return (
    <Screen
      title={`${yearLabel(game.year)} ${MAJOR_NAMES.entrance}`}
      right={
        <Button icon="next" cut onClick={clear}>
          新しいシーズンを始める
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        {scholars.length > 0 && (
          <section className="flex min-h-0 shrink-0 flex-col">
            <Band tone="yellow" sub={`${scholars.length}人`}>
              特待生
            </Band>
            <div className="scroll-x mt-1 flex min-h-0 max-w-[24rem] flex-1 items-end gap-1 bg-panel/60 px-1 pb-1">
              {scholars.map((p, i) => {
                const body = bodyScale(p.heightCm, p.stats.physical);
                return (
                  <div key={p.id} className="anim-pop flex w-[7rem] shrink-0 flex-col items-center" style={{ animationDelay: `${i * 120}ms` }}>
                    <KitFigure kit={kits.first} number={p.shirtNumber} look={p.look} height={body.height} build={body.build} size={180} expr="focus" />
                    <span className="cut-r font-head -mt-1 w-full truncate bg-yellow py-0.5 pl-1.5 pr-4 text-[0.875rem] text-ink">{p.name}</span>
                    <span className="flex w-full items-center gap-1 bg-ink px-1.5 text-[0.6875rem] font-bold text-text-2">
                      <RankBadge rank={statRank(overall(p))} size="sm" />
                      {POSITION_NAMES[p.mainPosition]}・{p.heightCm}cm
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Band sub={`${freshmen.length}人`}>新入生</Band>
          <p className="mt-1 shrink-0 bg-panel px-2 py-1 text-[0.8125rem] text-text-2">{freshmen.length}人の新入生が入部した！</p>
          <ul className="scroll-y mt-1 grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] content-start gap-1">
            {freshmen.map((p, i) => (
              <li key={p.id} className="anim-fade-up flex items-center gap-2 bg-panel p-1.5" style={{ animationDelay: `${i * 30}ms` }}>
                <PlayerFace look={p.look} size={40} kit={kits.first} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-[0.8125rem] font-bold">
                    {p.admission === "scholarship" && <Icon name="star" size={12} className="shrink-0 text-yellow" />}
                    <span className="truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[0.75rem] text-text-3">
                    <RankBadge rank={statRank(overall(p))} size="sm" />
                    {POSITION_NAMES[p.mainPosition]}・{p.heightCm}cm
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Screen>
  );
}
