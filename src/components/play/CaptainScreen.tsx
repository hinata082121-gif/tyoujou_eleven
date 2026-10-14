"use client";

/**
 * キャプテン指名（SPEC 7.8、PLAN 7.4）。
 * 年度初め（スタッフの編成の後）と、3 年生の引退でキャプテンがいなくなったときに出す。決めるまで先に進めない。
 * メニューの「チーム」からはいつでも見られるが、変えられるのは指名の時期だけ。
 * 横画面：左に候補の一覧（顔）、右に選んだ人の全身とキャプテンシーの効果。
 */
import { useState } from "react";
import { CAPTAIN_EFFECT_TEXTS, PERSONALITY_NAMES, POSITION_NAMES, SKILL_NAMES } from "@/engine/config/names";
import { captainCandidates } from "@/engine/captain";
import { bodyScale, generateKits } from "@/engine/look";
import { skillInLine } from "@/engine/skills";
import { playerSchool } from "@/engine/season";
import { useGameStore } from "@/store/gameStore";
import { KitFigure, PlayerFace } from "../look/Figure";
import { Band, Button, Label, RankBadge, Screen } from "../ui";
import { overallRank, overallValue } from "./format";

export function CaptainScreen({ viewOnly = false }: { viewOnly?: boolean }) {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const confirmCaptain = useGameStore((s) => s.confirmCaptain);
  const setTeamOpen = useGameStore((s) => s.setTeamOpen);
  const selectPlayer = useGameStore((s) => s.selectPlayer);
  const school = playerSchool(game);
  const kits = school.kits ?? generateKits(game.seed, school.id);
  const cands = captainCandidates(school);
  const [pick, setPick] = useState<string | null>(school.captainId ?? cands[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const chosen = cands.find((p) => p.id === pick);
  const list = viewOnly ? cands.filter((p) => p.id === school.captainId) : cands;
  const body = chosen ? bodyScale(chosen.heightCm, chosen.stats.physical) : null;
  const capSkill = chosen ? skillInLine(chosen, "captaincy") : undefined;
  return (
    <Screen
      title={viewOnly ? "チーム" : "キャプテン指名"}
      onBack={viewOnly ? () => setTeamOpen(false) : undefined}
      right={
        !viewOnly && (
          <Button icon="captain" cut disabled={!pick} onClick={() => pick && setError(confirmCaptain(pick))}>
            {chosen ? `${chosen.name}をキャプテンにする` : "キャプテンを選ぶ"}
          </Button>
        )
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 左：候補の一覧 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Band sub={viewOnly ? undefined : "おすすめ順"}>{viewOnly ? "キャプテン" : "候補"}</Band>
          {viewOnly ? (
            <p className="mt-1 shrink-0 bg-panel px-2 py-1 text-[0.75rem] text-text-2">キャプテンは年度初めと、3年生の引退の後に選び直せます。</p>
          ) : (
            <p className="mt-1 shrink-0 bg-panel px-2 py-1 text-[0.75rem] leading-snug text-text-2">
              チームをまとめるキャプテンを選んでください。学年は問いません。キャプテンの性格でチームへの効果が変わります。
              <span className="block text-text-3">試合に出ていないときは、試合中の効果が半分になります。おすすめ順に並んでいます。</span>
            </p>
          )}
          <ul className="scroll-y mt-1 min-h-0 flex-1 bg-panel px-1">
            {list.map((p) => {
              const on = pick === p.id && !viewOnly;
              const cs = skillInLine(p, "captaincy");
              return (
                <li key={p.id} className={`flex items-center gap-1 border-b border-line ${on ? "bg-panel-3" : ""}`}>
                  <button
                    type="button"
                    disabled={viewOnly}
                    onClick={() => setPick(p.id)}
                    aria-pressed={on}
                    className={`pressable flex min-h-11 min-w-0 flex-1 items-center gap-2 border-l-4 pl-1 text-left ${on ? "border-yellow" : "border-transparent"}`}
                  >
                    <PlayerFace look={p.look} size={32} kit={kits.first} expr={on ? "focus" : "normal"} />
                    <RankBadge rank={overallRank(p)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-[0.8125rem] font-bold">{p.name}</span>
                        {cs && <span className="cut-r shrink-0 bg-skill-plus py-px pl-1 pr-2.5 text-[0.6875rem] font-black text-ink">{SKILL_NAMES[cs]}</span>}
                      </span>
                      <span className="block truncate text-[0.75rem] text-text-3">
                        {p.grade}年・{POSITION_NAMES[p.mainPosition]}・{PERSONALITY_NAMES[p.personality]}
                      </span>
                    </span>
                    <span className="font-num w-7 shrink-0 text-right text-[1rem]">{overallValue(p)}</span>
                  </button>
                  <Button variant="ghost" small className="shrink-0" onClick={() => selectPlayer(p.id)}>
                    詳細
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 右：選んだ人の全身と効果 */}
        <section className="flex min-h-0 w-[20rem] shrink-0 gap-2">
          {chosen && body && (
            <div key={chosen.id} className="relative min-h-0 w-[8rem] shrink-0 overflow-hidden">
              <div className="anim-pop absolute bottom-[2.25rem] left-1/2 -translate-x-1/2">
                <KitFigure kit={kits.first} number={chosen.shirtNumber} look={chosen.look} height={body.height} build={body.build} size={200} expr="focus" />
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-stretch">
                <span className="font-head flex items-center bg-ink px-1.5 text-[1rem] text-yellow">C</span>
                <span className="cut-r anim-band-in font-head min-w-0 flex-1 truncate bg-telop py-1 pl-1.5 pr-5 text-[0.9375rem] text-ink">{chosen.name}</span>
              </div>
            </div>
          )}
          <div className="scroll-y flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
            {chosen ? (
              <div className="shrink-0 bg-panel px-2 py-1.5">
                <Label>キャプテンシー</Label>
                <div className="text-[0.75rem] text-text-3">
                  {chosen.grade}年・{PERSONALITY_NAMES[chosen.personality]}
                </div>
                <p className="mt-1 text-[0.8125rem] font-bold leading-snug text-text">{CAPTAIN_EFFECT_TEXTS[chosen.personality]}</p>
                {capSkill && <p className="mt-1 text-[0.75rem] leading-snug text-good">さらに「{SKILL_NAMES[capSkill]}」でチーム全体が少し力を出せる。</p>}
              </div>
            ) : (
              <p className="shrink-0 bg-panel px-2 py-1.5 text-[0.75rem] text-text-3">{viewOnly ? "キャプテンがいません。" : "左の一覧から選んでください。"}</p>
            )}
            {error && <p className="shrink-0 bg-panel px-2 py-1.5 text-[0.75rem] font-bold text-bad">{error}</p>}
          </div>
        </section>
      </div>
    </Screen>
  );
}
