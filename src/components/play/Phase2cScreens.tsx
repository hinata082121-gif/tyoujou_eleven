"use client";

import { useState } from "react";
import { branchPreview, campDays, formatDay } from "@/engine/calendar";
import { CAMP, CAMP_CHOICES } from "@/engine/config/camp";
import {
  ACHIEVEMENT_NAMES,
  AFFILIATION_NAMES,
  BRANCH_THEME_NAMES,
  CAMP_NAMES,
  FACILITY_NAMES,
  METER_NAMES,
  POSITION_GROUP_NAMES,
  POSITION_NAMES,
  PRACTICE_NAMES,
  REACTION_NAMES,
  REPUTATION_NAMES,
  SKILL_NAMES,
  YOUTH_TEAM_NAME,
} from "@/engine/config/names";
import { PRACTICES } from "@/engine/config/practice";
import { REPUTATION_TABLE } from "@/engine/config/reputation";
import { defaultCampPolicy, positionGroup } from "@/engine/camp";
import { facilityLevelName, nextLevelHint } from "@/engine/facilities";
import { inTournamentRun } from "@/engine/game";
import { generateLook } from "@/engine/look";
import { joinChance, scoutScope } from "@/engine/scout";
import { playerSchool } from "@/engine/season";
import {
  FACILITY_IDS,
  POSITION_GROUPS,
  type CampPolicy,
  type FacilityId,
  type GameState,
  type PositionGroup,
  type PracticeKind,
  type RandomSquareType,
  type ScoutCandidate,
  type StatKey,
} from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Icon, type IconName } from "../icons";
import { casualColor } from "../look/casual";
import { PlayerFace, type Expression } from "../look/Figure";
import { Band, Button, Chip, IconButton, Label, Screen, Segmented, Sheet } from "../ui";
import { statLabel } from "./format";

/** 練習の種類はアイコンの名前と同じ */
const practiceIcon = (k: PracticeKind) => k as IconName;

// ================= すごろくのマスの色（DESIGN.md 2.4） =================

const SQUARE_SWATCH: Record<RandomSquareType, string> = {
  blue: "bg-sq-blue",
  red: "bg-sq-red",
  white: "bg-sq-white",
  green: "bg-sq-green",
  yellow: "bg-sq-yellow",
  training: "bg-sq-training",
  person: "bg-sq-person",
};
const SQUARE_LINE: Record<RandomSquareType, string> = {
  blue: "border-sq-blue",
  red: "border-sq-red",
  white: "border-sq-white",
  green: "border-sq-green",
  yellow: "border-sq-yellow",
  training: "border-sq-training",
  person: "border-sq-person",
};
const SQUARE_SHORT: Record<RandomSquareType, string> = { blue: "青", red: "赤", white: "白", green: "緑", yellow: "黄", training: "特訓", person: "人" };

// ================= 合宿 =================

/** 合宿で、その練習で伸びる能力（伸びの大きい順。GK にはフィールド選手だけの能力を出さない） */
function campGains(group: PositionGroup, k: PracticeKind): StatKey[] {
  const def = PRACTICES[k];
  return (Object.entries(def.gains) as [StatKey, number][])
    .filter(([s]) => !(group === "GK" && def.fieldOnly?.includes(s)))
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
}

/** 合宿の練習方針（ポジションごとに 1 つ） */
export function CampScreen() {
  const game = useGameStore((s) => s.game)!;
  const confirm = useGameStore((s) => s.confirmCamp);
  const pending = game.pending as { type: "camp"; season: "summer" | "winter" };
  const [policy, setPolicy] = useState<CampPolicy>(() => defaultCampPolicy(game.campPolicy));
  const school = playerSchool(game);
  const active = school.players.filter((p) => p.status === "active");
  const count = (g: string) => active.filter((p) => positionGroup(p.mainPosition) === g).length;
  const days = campDays(pending.season).length;
  const maxCost = Math.max(...Object.values(PRACTICES).map((d) => -d.fitness)) * CAMP.fitnessCostMult;
  return (
    <Screen
      title={`${CAMP_NAMES[pending.season]}（${days}日間）`}
      right={
        <Button icon="camp" cut onClick={() => confirm(policy)}>
          この方針で合宿に出発する
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 左：ポジションごとの方針 */}
        <section className="flex min-h-0 min-w-0 flex-[3] flex-col">
          <Band sub="ポジションごとに1つ">練習の方針</Band>
          <div className="scroll-y mt-1 flex min-h-0 flex-1 flex-col gap-1 bg-panel p-1.5">
            {POSITION_GROUPS.map((g) => (
              <div key={g} className="flex gap-2 border-b border-line pb-1 last:border-b-0">
                <div className="flex w-11 shrink-0 flex-col items-center justify-center bg-panel-2">
                  <span className="font-num text-[1rem] font-bold leading-tight text-yellow">{POSITION_GROUP_NAMES[g]}</span>
                  <span className="text-[0.75rem] text-text-3">
                    <span className="font-num">{count(g)}</span>人
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {CAMP_CHOICES[g].map((k) => {
                    const on = policy[g] === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPolicy({ ...policy, [g]: k })}
                        className={`pressable inline-flex min-h-9 items-center gap-1 px-2 text-[0.75rem] font-black ${on ? "bg-yellow text-ink" : "border border-line-2 bg-panel-2 text-text-2"}`}
                      >
                        <Icon name={practiceIcon(k)} size={14} />
                        {PRACTICE_NAMES[k]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 右：見込みの効果 */}
        <section className="flex min-h-0 min-w-0 flex-[2] flex-col">
          <Band>見込みの効果</Band>
          <div className="scroll-y mt-1 flex min-h-0 flex-1 flex-col gap-1.5 bg-panel p-2">
            <p className="text-[0.75rem] leading-snug text-text-2">
              ポジションごとに練習の方針を決めよう。ふだんより経験点が多く入り、特殊能力も身につきやすいが、体力も多く減る。
              {pending.season === "winter" && school.players.some((p) => p.status === "retired") && " 3年生は引退しているので、新チームで行う。"}
            </p>
            <div className="flex flex-wrap gap-1">
              <Chip tone="dark">
                経験点 <span className="font-num text-[0.75rem]">×{CAMP.expMult}</span>
              </Chip>
              <Chip tone="dark">
                体力の消耗 <span className="font-num text-[0.75rem]">×{CAMP.fitnessCostMult}</span>
              </Chip>
            </div>
            <ul className="flex flex-col">
              {POSITION_GROUPS.map((g) => {
                const k = policy[g];
                const cost = -PRACTICES[k].fitness * CAMP.fitnessCostMult;
                return (
                  <li key={g} className="flex flex-col gap-0.5 border-b border-line py-1 last:border-b-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-num w-7 shrink-0 text-[0.875rem] font-bold text-yellow">{POSITION_GROUP_NAMES[g]}</span>
                      <Icon name={practiceIcon(k)} size={16} className="shrink-0 text-text-2" />
                      <span className="truncate text-[0.8125rem] font-bold">{PRACTICE_NAMES[k]}</span>
                    </div>
                    <div className="flex items-center gap-1 pl-7 text-[0.75rem]">
                      <span className="shrink-0 text-text-3">伸びる</span>
                      <span className="truncate font-bold text-good">{campGains(g, k).map(statLabel).join("・")}</span>
                    </div>
                    <div className="flex items-center gap-1.5 pl-7 text-[0.75rem]">
                      <span className="shrink-0 text-text-3">体力</span>
                      <div className="h-1.5 w-full -skew-x-[20deg] bg-panel-3">
                        <div className={`h-full ${cost > maxCost * 0.66 ? "bg-fit-low" : cost > maxCost * 0.33 ? "bg-fit-mid" : "bg-fit-high"}`} style={{ width: `${Math.max(4, (cost / maxCost) * 100)}%` }} />
                      </div>
                      <span className="font-num w-12 shrink-0 text-right text-text-2">
                        {cost > 0 ? `-${Math.round(cost)}` : "0"}/日
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>
    </Screen>
  );
}

/** 合宿の結果 */
export function CampResultScreen() {
  const game = useGameStore((s) => s.game);
  const r = useGameStore((s) => s.lastCamp)!;
  const clear = useGameStore((s) => s.clearLastCamp);
  const school = game ? playerSchool(game) : null;
  const byId = new Map(school?.players.map((p) => [p.id, p]) ?? []);
  return (
    <Screen
      title={`${CAMP_NAMES[r.season]}の成果`}
      right={
        <Button icon="next" cut onClick={clear}>
          次へ
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 左：方針・身につけた特殊能力・ケガ */}
        <section className="scroll-y flex min-h-0 w-[38%] min-w-[15rem] shrink-0 flex-col gap-2">
          <div>
            <Band>方針</Band>
            <ul className="mt-1 grid grid-cols-2 gap-px bg-line">
              {POSITION_GROUPS.map((g) => (
                <li key={g} className="flex min-w-0 items-center gap-1.5 bg-panel px-2 py-1">
                  <span className="font-num w-6 shrink-0 text-[0.8125rem] font-bold text-yellow">{POSITION_GROUP_NAMES[g]}</span>
                  <Icon name={practiceIcon(r.policy[g])} size={14} className="shrink-0 text-text-2" />
                  <span className="truncate text-[0.75rem] font-bold">{PRACTICE_NAMES[r.policy[g]]}</span>
                </li>
              ))}
            </ul>
          </div>
          {r.learned.length > 0 && (
            <div>
              <Band tone="yellow">身につけた特殊能力</Band>
              <ul className="mt-1 flex flex-col gap-px bg-panel p-1.5">
                {r.learned.map((l, i) => (
                  <li key={i} className="anim-fade-up flex items-start gap-1.5 text-[0.8125rem] leading-snug text-good" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
                    <Icon name="star" size={14} className="mt-0.5 shrink-0 text-yellow" />
                    <span>
                      {l.name}が「{SKILL_NAMES[l.skill]}」を身につけた！
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.injured.length > 0 && (
            <div>
              <Band tone="red">ケガ</Band>
              <p className="mt-1 flex items-start gap-1.5 bg-panel p-1.5 text-[0.8125rem] text-bad">
                <Icon name="injury" size={14} className="mt-0.5 shrink-0" />
                {r.injured.join("、")}
              </p>
            </div>
          )}
        </section>

        {/* 右：部員の伸び */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Band sub="総合値の伸びの大きい順">よく伸びた部員</Band>
          <ul className="scroll-y mt-1 min-h-0 flex-1 bg-panel">
            {r.growth.map((g, i) => {
              const p = byId.get(g.playerId);
              const ups = (Object.entries(g.stats) as [StatKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 4);
              return (
                <li key={g.playerId} className="flex min-h-11 items-center gap-2 border-b border-line px-2 py-0.5">
                  <PlayerFace look={p?.look} kit={school?.kits?.first} size={32} expr={i < 3 && g.overallGain > 0 ? "joy" : "normal"} />
                  <span className="font-num w-6 shrink-0 text-[0.75rem] text-text-3">{POSITION_GROUP_NAMES[g.group]}</span>
                  <span className="w-28 shrink-0 truncate text-[0.8125rem] font-bold">
                    {g.name}
                    <span className="font-normal text-text-3">（{g.grade}年）</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap gap-x-2 text-[0.75rem]">
                    {ups.map(([k, v]) => (
                      <span key={k} className="whitespace-nowrap text-text-2">
                        {statLabel(k)}
                        <span className="font-num ml-0.5 font-bold text-good">+{Math.round(v)}</span>
                      </span>
                    ))}
                  </span>
                  <span className="shrink-0 text-right text-[0.75rem] text-text-3">
                    総合<span className="font-num ml-1 text-[0.9375rem] font-bold text-good">+{g.overallGain.toFixed(1)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Screen>
  );
}

// ================= 分岐マス =================

/** 道の上の 1 マス（下の線がマスの色） */
function PathSquare({ t }: { t: RandomSquareType }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 -skew-x-[8deg] items-end justify-center border-b-4 bg-panel-2 pb-0.5 ${SQUARE_LINE[t]}`} title={SQUARE_SHORT[t]}>
      <span className="skew-x-[8deg] text-[0.6875rem] font-black leading-none text-text">{SQUARE_SHORT[t]}</span>
    </span>
  );
}

export function BranchScreen() {
  const game = useGameStore((s) => s.game)!;
  const choose = useGameStore((s) => s.chooseBranch);
  const p = game.pending as { type: "branch"; day: number };
  const b = game.calendar.branches!.find((x) => x.day === p.day)!;
  const previews = branchPreview(b);
  return (
    <Screen title="分かれ道" sub={formatDay(b.day)}>
      <p className="mb-2 flex items-center gap-2 bg-panel px-2 py-1.5 text-[0.8125rem] text-text-2">
        <Icon name="branch" size={18} className="shrink-0 text-sq-branch" />
        道が分かれている。最初の数マスは見えるが、その先はおおまかにしか分からない。
      </p>
      <div className={`grid min-h-0 flex-1 gap-2 ${previews.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {previews.map((pv, i) => (
          <button
            key={i}
            type="button"
            onClick={() => choose(i)}
            className="pressable anim-fade-up flex min-h-0 flex-col border-2 border-line-2 bg-panel text-left hover:border-yellow"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="flex items-center gap-2 bg-panel-2 py-1 pl-0 pr-2">
              <span className="cut-r font-head bg-telop py-0.5 pl-2.5 pr-6 text-[0.9375rem] text-ink">{BRANCH_THEME_NAMES[pv.theme]}</span>
            </span>
            <span className="scroll-y flex min-h-0 flex-1 flex-col gap-2 p-2">
              <span>
                <span className="mb-1 block text-[0.6875rem] font-black tracking-wider text-yellow">最初の{pv.first.length}マス</span>
                <span className="flex flex-wrap items-center gap-1 pl-0.5">
                  {pv.first.map((t, k) => (
                    <PathSquare key={k} t={t} />
                  ))}
                </span>
              </span>
              <span>
                <span className="mb-1 block text-[0.6875rem] font-black tracking-wider text-yellow">その先</span>
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  {(Object.entries(pv.rest) as [RandomSquareType, number][]).map(([t, n]) => (
                    <span key={t} className="flex items-center gap-1 text-[0.8125rem] font-bold">
                      <i className={`inline-block h-3 w-4 -skew-x-12 ${SQUARE_SWATCH[t]}`} />
                      {SQUARE_SHORT[t]}
                      <span className="font-num text-text-2">×{n}</span>
                    </span>
                  ))}
                  {pv.hidden > 0 && (
                    <span className="flex items-center gap-1 text-[0.8125rem] font-bold text-text-2">
                      <i className="inline-block h-3 w-4 -skew-x-12 border border-line-2 bg-panel-3" />？<span className="font-num">×{pv.hidden}</span>
                    </span>
                  )}
                </span>
              </span>
            </span>
            <span className="flex min-h-11 shrink-0 items-center justify-center gap-1 bg-yellow text-[0.875rem] font-black text-ink">
              この道を行く
              <Icon name="next" size={16} />
            </span>
          </button>
        ))}
      </div>
    </Screen>
  );
}

// ================= 特待生スカウト =================

/** 推定の能力（幅のあるバー） */
function Meter({ c }: { c: ScoutCandidate }) {
  const entries = Object.entries(c.meter) as [keyof typeof METER_NAMES, [number, number]][];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {entries.map(([k, [lo, hi]]) => (
        <div key={k} className="text-[0.75rem]">
          <div className="flex justify-between">
            <span className="font-bold text-text-2">{METER_NAMES[k]}</span>
            <span className="font-num text-[0.8125rem] text-text">
              {Math.round(lo)}〜{Math.round(hi)}
            </span>
          </div>
          <div className="relative h-2 -skew-x-[20deg] bg-panel-3">
            <div className="absolute h-full bg-info" style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const REACTION_COLOR = { good: "text-good", normal: "text-warn", bad: "text-bad" } as const;

const candidateLook = (game: GameState, c: ScoutCandidate) => c.player.look ?? generateLook(game.seed, c.id);
const isDone = (c: ScoutCandidate) => c.status !== "open" && c.status !== "courting";
const candidateExpr = (c: ScoutCandidate): Expression => (c.status === "joined" ? "joy" : isDone(c) ? "sad" : c.reaction === "good" ? "joy" : c.reaction === "bad" ? "frustrated" : "normal");

/** スカウトの画面（候補の一覧・訪問・優先順） */
export function ScoutScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const close = useGameStore((s) => s.setScoutOpen);
  const visit = useGameStore((s) => s.visitScout);
  const setPriority = useGameStore((s) => s.setScoutPriority);
  const lastVisit = useGameStore((s) => s.lastVisit);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "courting">("all");
  const sc = game.scout;
  if (!sc) {
    return (
      <Screen title="特待生スカウト" onBack={() => close(false)}>
        <p className="self-start bg-panel p-3 text-[0.875rem] text-text-2">スカウトの期間は 11月1日から2月末までです。</p>
      </Screen>
    );
  }
  const slots = REPUTATION_TABLE[game.reputation.level].scholarshipSlots;
  const pref = (id: string) => game.prefectures.find((p) => p.id === id)?.name ?? "";
  const canVisit = sc.cards > 0 && !sc.replied && !game.pending && !inTournamentRun(game);
  const courting = sc.priority.map((id) => sc.candidates.find((c) => c.id === id)!).filter((c) => c && c.status === "courting");
  const move = (i: number, d: -1 | 1) => {
    const ids = courting.map((c) => c.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setPriority(ids);
  };
  const scopeText = { pref: "自県", region: "地域", adjacent: "近くの地域", national: "全国" }[scoutScope(game.reputation.level)];
  const c = sc.candidates.find((x) => x.id === openId) ?? sc.candidates[0];
  const done = c ? isDone(c) : true;
  const rank = c ? courting.findIndex((x) => x.id === c.id) : -1;

  return (
    <Screen
      title="特待生スカウト"
      sub="返事は 2月28日"
      onBack={() => close(false)}
      right={
        <div className="flex min-h-9 items-center gap-1.5 bg-panel px-2.5 text-[0.75rem] font-bold text-text-2">
          <Icon name="scout" size={16} className="text-yellow" />
          スカウトカード 残り<span className="font-num text-[1.125rem] text-yellow">{sc.cards}</span>枚
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 左：候補の一覧と勧誘中の優先順 */}
        <section className="flex min-h-0 w-[44%] min-w-[17rem] shrink-0 flex-col gap-1">
          <p className="bg-panel px-2 py-1 text-[0.75rem] leading-snug text-text-2">
            特待生の枠 <b className="font-num text-[0.875rem] text-text">{slots}</b>人・探せる範囲 {scopeText}（評判「{REPUTATION_NAMES[game.reputation.level]}」）・今季 <span className="font-num">{sc.cardsDelivered}/{sc.cardsTotal}</span>枚が届いた
          </p>
          <Segmented
            options={["all", "courting"] as const}
            value={tab}
            onChange={setTab}
            labels={{ all: `候補（${sc.candidates.length}人）`, courting: `勧誘中の優先順（${courting.length}人）` }}
          />
          {tab === "all" ? (
            <ul className="scroll-y min-h-0 flex-1 bg-panel">
              {sc.candidates.map((x) => {
                const d = isDone(x);
                const on = c?.id === x.id;
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(x.id)}
                      className={`pressable flex min-h-11 w-full items-center gap-2 border-b border-l-4 border-b-line py-1 pl-1.5 pr-2 text-left ${on ? "border-l-yellow bg-panel-3" : "border-l-transparent"} ${d ? "opacity-55" : ""}`}
                    >
                      <PlayerFace look={candidateLook(game, x)} shirt={casualColor(x.id)} size={32} expr={candidateExpr(x)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[0.8125rem] font-bold">{x.player.name}</span>
                          {x.tier === 1 && (
                            <Chip tone="yellow" className="shrink-0">
                              注目
                            </Chip>
                          )}
                          <span className="ml-auto shrink-0 text-[0.75rem] text-text-3">{POSITION_NAMES[x.player.mainPosition]}</span>
                        </span>
                        <span className="block truncate text-[0.75rem] text-text-3">
                          {pref(x.prefectureId)}・{AFFILIATION_NAMES[x.affiliation]}・{ACHIEVEMENT_NAMES[x.achievement]}
                        </span>
                      </span>
                      {x.reaction && <span className={`w-8 shrink-0 text-right text-[0.75rem] font-black ${REACTION_COLOR[x.reaction]}`}>{REACTION_NAMES[x.reaction]}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="scroll-y min-h-0 flex-1 bg-panel">
              <p className="border-b border-line px-2 py-1 text-[0.75rem] text-text-3">枠を超えたら上から入部が決まる</p>
              {courting.length === 0 && <p className="p-3 text-[0.8125rem] text-text-3">まだ勧誘中の候補はいない。候補を訪ねると勧誘が始まる。</p>}
              <ol>
                {courting.map((x, i) => (
                  <li key={x.id} className={`flex min-h-11 items-center gap-1.5 border-b border-line px-1.5 ${c?.id === x.id ? "bg-panel-3" : ""}`}>
                    <span className="font-num w-5 shrink-0 text-center text-[0.9375rem] font-bold text-yellow">{i + 1}</span>
                    <button type="button" className="pressable flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => setOpenId(x.id)}>
                      <PlayerFace look={candidateLook(game, x)} shirt={casualColor(x.id)} size={28} expr={candidateExpr(x)} />
                      <span className="truncate text-[0.8125rem] font-bold">{x.player.name}</span>
                      <span className={`shrink-0 text-[0.75rem] font-black ${REACTION_COLOR[x.reaction!]}`}>{REACTION_NAMES[x.reaction!]}</span>
                    </button>
                    <IconButton name="up" label="上へ" onClick={() => move(i, -1)} disabled={i === 0} className="!min-h-9 !min-w-9" />
                    <IconButton name="down" label="下へ" onClick={() => move(i, 1)} disabled={i === courting.length - 1} className="!min-h-9 !min-w-9" />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* 右：選んだ候補の推定の能力と訪問 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          {lastVisit && (
            <p key={`${lastVisit.candidate.id}-${lastVisit.candidate.visits}`} className="anim-band-in flex items-center gap-1.5 border-l-4 border-yellow bg-panel px-2 py-1 text-[0.8125rem] text-text">
              <Icon name="scout" size={14} className="shrink-0 text-yellow" />
              <span className="min-w-0">
                {lastVisit.candidate.player.name}を訪ねた。反応は「<b className={REACTION_COLOR[lastVisit.candidate.reaction!]}>{REACTION_NAMES[lastVisit.candidate.reaction!]}</b>」
                {lastVisit.improved && <b className="text-good">（良くなった！）</b>}
              </span>
            </p>
          )}
          {c ? (
            <div className="flex min-h-0 flex-1 flex-col bg-panel">
              <div className="flex shrink-0 gap-2 border-b border-line p-2">
                <div className="flex shrink-0 items-center justify-center bg-panel-2 p-1">
                  <PlayerFace look={candidateLook(game, c)} shirt={casualColor(c.id)} size={56} expr={candidateExpr(c)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[1rem] font-black">{c.player.name}</span>
                    {c.tier === 1 && <Chip tone="yellow">注目</Chip>}
                    <Chip tone="dark">{POSITION_NAMES[c.player.mainPosition]}</Chip>
                  </div>
                  <div className="truncate text-[0.75rem] text-text-2">
                    {pref(c.prefectureId)}・{AFFILIATION_NAMES[c.affiliation]}・実績 {ACHIEVEMENT_NAMES[c.achievement]}
                    {c.visits > 0 && `・訪問 ${c.visits}回`}
                  </div>
                  {c.rivals.length > 0 && (
                    <div className="truncate text-[0.75rem] text-warn">取り合い {c.rivals.map((r) => (r === "youth" ? YOUTH_TEAM_NAME : (game.schools[r]?.name ?? "他校"))).join("、")}</div>
                  )}
                  {c.reaction && (
                    <div className="text-[0.75rem] text-text-2">
                      反応 <b className={REACTION_COLOR[c.reaction]}>{REACTION_NAMES[c.reaction]}</b>・入部してくれそうな度合い：<span className="font-num text-[0.875rem] text-text">{Math.round(joinChance(c) * 100)}%</span>前後
                      {rank >= 0 && `・優先順 ${rank + 1}番目`}
                    </div>
                  )}
                </div>
              </div>
              <div className="scroll-y min-h-0 flex-1 p-2">
                <Label>推定の能力</Label>
                <Meter c={c} />
                {c.comments && (
                  <>
                    <Label className="mt-2">寸評</Label>
                    <ul className="flex flex-col gap-0.5 text-[0.75rem] leading-snug text-text-2">
                      {c.comments.map((t, i) => (
                        <li key={i} className="border-l-2 border-line-2 pl-1.5">
                          {t}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="shrink-0 border-t border-line p-2">
                {!done ? (
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-[0.75rem] leading-snug text-text-3">訪ねると反応が分かり、推定の幅が狭まる。訪ねた日は練習しない（1日進む）。</p>
                    <Button icon="scout" cut disabled={!canVisit} onClick={() => visit(c.id)} className="shrink-0">
                      {c.visits === 0 ? "訪ねる（カード1枚）" : "もう一度訪ねる（カード1枚）"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[0.8125rem] font-bold text-text-2">{c.status === "joined" ? "入部が決まった" : c.status === "lost" ? "ほかの進路に決まった" : "断られた"}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="bg-panel p-3 text-[0.8125rem] text-text-3">候補がいない。</p>
          )}
        </section>
      </div>
    </Screen>
  );
}

/** 2/28：スカウトの返事 */
export function ScoutReplyScreen() {
  const game = useGameStore((s) => s.game)!;
  const ok = useGameStore((s) => s.confirmScoutReply);
  const sc = game.scout;
  const joined = sc?.candidates.filter((c) => c.status === "joined") ?? [];
  const others = sc?.candidates.filter((c) => c.visits > 0 && c.status !== "joined") ?? [];
  const lostTo = (c: ScoutCandidate) => (c.lostTo === "youth" ? YOUTH_TEAM_NAME : (game.schools[c.lostTo ?? ""]?.name ?? "他校"));
  const pref = (c: ScoutCandidate) => game.prefectures.find((p) => p.id === c.prefectureId)?.name;
  const cards = [...joined, ...others];
  return (
    <Screen
      title="特待生の返事"
      right={
        <Button icon="next" cut onClick={ok}>
          次へ
        </Button>
      }
    >
      {joined.length === 0 ? (
        <p className="mb-2 self-start bg-panel px-3 py-2 text-[0.875rem] text-text-2">今年は特待生の入部が決まらなかった。</p>
      ) : (
        <Band tone="yellow" className="anim-band-in mb-2" sub={`${joined.length}人`}>
          4月から入部する特待生
        </Band>
      )}
      {cards.length > 0 && (
        <ul className="scroll-x flex min-h-0 flex-1 items-stretch gap-2 pb-1">
          {cards.map((c, i) => {
            const yes = c.status === "joined";
            return (
              <li
                key={c.id}
                className={`anim-pop flex w-[9.5rem] shrink-0 flex-col border-2 bg-panel ${yes ? "border-yellow" : "border-line"}`}
                style={{ animationDelay: `${Math.min(i, 6) * 70}ms` }}
              >
                <div className={`flex flex-1 items-center justify-center ${yes ? "bg-panel-2" : "bg-panel"}`}>
                  <PlayerFace look={candidateLook(game, c)} shirt={casualColor(c.id)} size={84} expr={yes ? "joy" : "sad"} gray={yes ? 0 : 0.3} />
                </div>
                <div className="flex flex-col gap-0.5 border-t border-line px-2 py-1">
                  <span className="truncate text-[0.875rem] font-black">{c.player.name}</span>
                  <span className="truncate text-[0.75rem] text-text-3">
                    {POSITION_NAMES[c.player.mainPosition]}・{pref(c)}
                  </span>
                </div>
                <div className={`flex min-h-8 items-center justify-center px-1 text-center text-[0.75rem] font-black ${yes ? "bg-yellow text-ink" : "bg-panel-3 text-text-2"}`}>
                  {yes ? "入部が決まった" : c.status === "lost" ? `${lostTo(c)}に進む` : "今回は見送り"}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}

// ================= 設備 =================

const FACILITY_ICON: Record<FacilityId, IconName> = { ground: "ball", trainingRoom: "physical", careRoom: "injury", dorm: "school" };

export function FacilitiesScreen() {
  const game = useGameStore((s) => s.game)!;
  const close = useGameStore((s) => s.setFacilitiesOpen);
  const [logOpen, setLogOpen] = useState(false);
  const f = game.facilities;
  const sourceName = { reputation: "評判", result: "大会の成績", donation: "OBの寄付" } as const;
  return (
    <Screen
      title="設備"
      sub={`今日：${formatDay(game.calendar.position)}`}
      onBack={() => close(false)}
      right={
        game.facilityLog.length > 0 && (
          <Button variant="ghost" small icon="list" onClick={() => setLogOpen(true)}>
            整備の記録
          </Button>
        )
      }
    >
      <p className="mb-2 bg-panel px-2 py-1 text-[0.75rem] leading-snug text-text-2">設備は評判・大会の成績・OBの寄付で整い、下がることはない。練習の効率への効果は、スタッフと合わせて上限がある。</p>
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-2">
        {FACILITY_IDS.map((id, i) => (
          <section key={id} className="anim-fade-up flex min-h-0 flex-col bg-panel" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center gap-1.5 bg-panel-2 py-1 pl-0 pr-1.5">
              <h2 className="cut-r flex min-w-0 items-center gap-1 bg-telop py-0.5 pl-2 pr-5 text-[0.8125rem] font-black text-ink">
                <Icon name={FACILITY_ICON[id]} size={14} className="shrink-0" />
                <span className="truncate">{FACILITY_NAMES[id]}</span>
              </h2>
            </div>
            <div className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5 p-2">
              <div>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-[0.875rem] font-black leading-tight text-yellow">{facilityLevelName(id, f[id])}</span>
                  <span className="font-num shrink-0 text-[0.8125rem] text-text-2">Lv.{f[id]}</span>
                </div>
                <div className="mt-1 flex gap-1">
                  {[1, 2, 3].map((lv) => (
                    <span key={lv} className={`h-2 flex-1 -skew-x-[20deg] ${f[id] >= lv ? "bg-yellow" : "bg-panel-3"}`} />
                  ))}
                </div>
              </div>
              <p className="text-[0.75rem] leading-snug text-text-2">{FACILITY_EFFECT_TEXTS[id]}</p>
              <div className="mt-auto border-t border-line pt-1.5">
                <Label className="!mb-0.5">次の段階</Label>
                <p className="text-[0.75rem] leading-snug text-text">{nextLevelHint(id, f[id], game.facilityGrantedLevel)}</p>
              </div>
            </div>
          </section>
        ))}
      </div>
      {logOpen && (
        <Sheet title="整備の記録" onClose={() => setLogOpen(false)}>
          <ul className="flex flex-col">
            {[...game.facilityLog].reverse().map((e, i) => (
              <li key={i} className="border-b border-line py-1.5 text-[0.8125rem] text-text-2">
                <span className="font-num mr-1 text-text">{e.year}年目</span>：{FACILITY_NAMES[e.facility]}が「{facilityLevelName(e.facility, e.level)}」に（{sourceName[e.source]}）
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </Screen>
  );
}

const FACILITY_EFFECT_TEXTS = {
  ground: "すべての練習の効率が上がる。合宿で特殊能力が身につきやすくなる",
  trainingRoom: "フィジカル・走り込みの効率が上がり、練習中のケガが減る",
  careRoom: "体力の回復が早くなり、ケガが早く治る",
  dorm: "体力の回復が少し早くなり、スカウトの反応が良くなる",
} as const;
