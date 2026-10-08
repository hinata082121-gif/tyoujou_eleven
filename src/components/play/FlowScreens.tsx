"use client";

import { CAREER_NAMES, MAJOR_NAMES, POSITION_NAMES, REPUTATION_NAMES, yearLabel } from "@/engine/config/names";
import { overall } from "@/engine/player/rating";
import { statRank } from "@/engine/player/rank";
import { playerSchool } from "@/engine/season";
import { useGameStore } from "@/store/gameStore";
import { Button, Header, RankBadge } from "../ui";

/** 試合結果 */
export function MatchResultScreen() {
  const r = useGameStore((s) => s.lastMatch)!;
  const clear = useGameStore((s) => s.clearLastMatch);
  const game = useGameStore((s) => s.game)!;
  const resultText = r.result === "win" ? "勝利" : r.result === "draw" ? "引き分け" : "敗戦";
  const color = r.result === "win" ? "text-emerald-600" : r.result === "draw" ? "text-gray-600" : "text-red-600";
  return (
    <main className="flex flex-1 flex-col">
      <Header title="試合結果" />
      <div className="flex flex-1 flex-col items-center gap-4 p-6 text-center">
        <p className="text-sm text-gray-500">{r.label}</p>
        <p className="text-sm">vs {r.opponentName}</p>
        <p className="font-mono text-5xl font-black">
          {r.score[0]} - {r.score[1]}
        </p>
        {r.pk && (
          <p className="text-sm text-gray-600">
            PK {r.pk[0]} - {r.pk[1]}
          </p>
        )}
        <p className={`text-3xl font-black ${color}`}>{resultText}</p>
        {r.qualifiedNational && <p className="rounded-xl bg-amber-100 px-4 py-2 font-black text-amber-900">🏆 県予選優勝！ 全国大会に出場！</p>}
        {r.champion && !r.qualifiedNational && <p className="rounded-xl bg-amber-100 px-4 py-2 font-black text-amber-900">🏆 全国制覇！</p>}
        {r.eliminated && r.kind !== "practice" && <p className="text-sm text-gray-600">冬の選手権はここで敗退。3年生は引退となる。</p>}
        <div className="w-full rounded-xl bg-gray-50 p-3 text-sm">
          評判ゲージ {r.reputationDelta >= 0 ? "+" : ""}
          {r.reputationDelta}
          {r.levelChange !== 0 && (
            <div className={`mt-1 font-black ${r.levelChange > 0 ? "text-emerald-600" : "text-red-600"}`}>
              評判が「{REPUTATION_NAMES[game.reputation.level]}」に{r.levelChange > 0 ? "上がった！" : "下がった…"}
            </div>
          )}
        </div>
        <div className="flex-1" />
        <Button className="w-full" onClick={clear}>
          次へ
        </Button>
      </div>
    </main>
  );
}

/** 卒業式 */
export function GraduationScreen() {
  const game = useGameStore((s) => s.game)!;
  const graduate = useGameStore((s) => s.graduate);
  const grads = playerSchool(game).players.filter((p) => p.grade === 3);
  return (
    <main className="flex flex-1 flex-col">
      <Header title={`${yearLabel(game.year)} ${MAJOR_NAMES.graduation}`} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm">今年は{grads.length}人の3年生が卒業する。</p>
        <ul className="flex flex-col divide-y divide-gray-100">
          {grads.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
              <RankBadge rank={statRank(overall(p))} size="sm" />
              <span className="flex-1 font-bold">{p.name}</span>
              <span className="text-xs text-gray-500">{POSITION_NAMES[p.mainPosition]}</span>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <Button onClick={graduate}>卒業式を行う</Button>
      </div>
    </main>
  );
}

/** 卒業生の進路 */
export function AlumniScreen() {
  const alumni = useGameStore((s) => s.lastAlumni)!;
  const clear = useGameStore((s) => s.clearAlumni);
  return (
    <main className="flex flex-1 flex-col">
      <Header title="卒業生の進路" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm">卒業生はOBとして記録された。</p>
        <ul className="flex flex-col divide-y divide-gray-100">
          {alumni.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1.5 text-sm">
              <RankBadge rank={statRank(a.overall)} size="sm" />
              <span className="flex-1 font-bold">{a.name}</span>
              <span className="text-xs">{CAREER_NAMES[a.career]}</span>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <Button onClick={clear}>次へ</Button>
      </div>
    </main>
  );
}

/** 年度末 */
export function YearEndScreen() {
  const game = useGameStore((s) => s.game)!;
  const newYear = useGameStore((s) => s.newYear);
  const school = playerSchool(game);
  return (
    <main className="flex flex-1 flex-col">
      <Header title={`${yearLabel(game.year)}の終わり`} />
      <div className="flex flex-1 flex-col gap-3 p-4 text-sm">
        <div className="rounded-xl bg-gray-50 p-3">
          <div className="flex justify-between">
            <span>冬の選手権</span>
            <span className="font-bold">{game.competitions.winterResult ?? "—"}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>評判</span>
            <span className="font-bold">{REPUTATION_NAMES[game.reputation.level]}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>チームのランク</span>
            <RankBadge rank={school.rank} size="sm" />
          </div>
        </div>
        <p>4月になると、評判に応じた人数の新入生が入部し、1・2年生は進級する。</p>
        <div className="flex-1" />
        <Button onClick={newYear}>新年度へ</Button>
      </div>
    </main>
  );
}

/** 新入生 */
export function FreshmenScreen() {
  const freshmen = useGameStore((s) => s.lastFreshmen)!;
  const clear = useGameStore((s) => s.clearFreshmen);
  const game = useGameStore((s) => s.game)!;
  return (
    <main className="flex flex-1 flex-col">
      <Header title={`${yearLabel(game.year)} ${MAJOR_NAMES.entrance}`} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm">{freshmen.length}人の新入生が入部した！</p>
        <ul className="flex flex-col divide-y divide-gray-100">
          {freshmen.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
              <RankBadge rank={statRank(overall(p))} size="sm" />
              <span className="flex-1 font-bold">{p.name}</span>
              <span className="text-xs text-gray-500">
                {POSITION_NAMES[p.mainPosition]}・{p.heightCm}cm
              </span>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <Button onClick={clear}>新しいシーズンを始める</Button>
      </div>
    </main>
  );
}
