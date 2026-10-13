"use client";

import { useState } from "react";
import { branchPreview, formatDay } from "@/engine/calendar";
import { CAMP_CHOICES } from "@/engine/config/camp";
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
import { REPUTATION_TABLE } from "@/engine/config/reputation";
import { defaultCampPolicy, positionGroup } from "@/engine/camp";
import { facilityLevelName, nextLevelHint } from "@/engine/facilities";
import { inTournamentRun } from "@/engine/game";
import { joinChance, scoutScope } from "@/engine/scout";
import { playerSchool } from "@/engine/season";
import { FACILITY_IDS, POSITION_GROUPS, type CampPolicy, type RandomSquareType, type ScoutCandidate } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Button, Header } from "../ui";

const SQUARE_CHIP: Record<RandomSquareType, string> = {
  blue: "bg-sky-400",
  red: "bg-red-400",
  white: "bg-white border border-gray-300",
  green: "bg-emerald-400",
  yellow: "bg-yellow-300",
  training: "bg-fuchsia-500",
};
const SQUARE_SHORT: Record<RandomSquareType, string> = { blue: "青", red: "赤", white: "白", green: "緑", yellow: "黄", training: "特訓" };

// ================= 合宿 =================

/** 合宿の練習方針（ポジションごとに 1 つ） */
export function CampScreen() {
  const game = useGameStore((s) => s.game)!;
  const confirm = useGameStore((s) => s.confirmCamp);
  const pending = game.pending as { type: "camp"; season: "summer" | "winter" };
  const [policy, setPolicy] = useState<CampPolicy>(() => defaultCampPolicy(game.campPolicy));
  const school = playerSchool(game);
  const active = school.players.filter((p) => p.status === "active");
  const count = (g: string) => active.filter((p) => positionGroup(p.mainPosition) === g).length;
  return (
    <main className="flex flex-1 flex-col">
      <Header title={`${CAMP_NAMES[pending.season]}（${pending.season === "summer" ? 5 : 4}日間）`} />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-gray-700">
          ポジションごとに練習の方針を決めよう。ふだんより経験点が多く入り、特殊能力も身につきやすいが、体力も多く減る。
          {pending.season === "winter" && school.players.some((p) => p.status === "retired") && " 3年生は引退しているので、新チームで行う。"}
        </p>
        {POSITION_GROUPS.map((g) => (
          <section key={g} className="rounded-xl border border-gray-200 p-3">
            <h2 className="mb-2 text-sm font-black">
              {POSITION_GROUP_NAMES[g]} <span className="text-xs font-normal text-gray-500">{count(g)}人</span>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {CAMP_CHOICES[g].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPolicy({ ...policy, [g]: k })}
                  className={`min-h-9 rounded-lg px-2.5 text-xs font-bold ${policy[g] === k ? "bg-pitch text-white" : "border border-gray-300 bg-white text-gray-700"}`}
                >
                  {PRACTICE_NAMES[k]}
                </button>
              ))}
            </div>
          </section>
        ))}
        <Button className="w-full" onClick={() => confirm(policy)}>
          この方針で合宿に出発する
        </Button>
      </div>
    </main>
  );
}

/** 合宿の結果 */
export function CampResultScreen() {
  const r = useGameStore((s) => s.lastCamp)!;
  const clear = useGameStore((s) => s.clearLastCamp);
  const top = r.growth.slice(0, 8);
  return (
    <main className="flex flex-1 flex-col">
      <Header title={`${CAMP_NAMES[r.season]}の成果`} />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-gray-600">
          方針：{POSITION_GROUPS.map((g) => `${POSITION_GROUP_NAMES[g]} ${PRACTICE_NAMES[r.policy[g]]}`).join("・")}
        </p>
        {r.learned.length > 0 && (
          <ul className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            {r.learned.map((l, i) => (
              <li key={i}>✨ {l.name}が「{SKILL_NAMES[l.skill]}」を身につけた！</li>
            ))}
          </ul>
        )}
        <section className="rounded-xl border border-gray-200 p-3">
          <h2 className="mb-1 text-sm font-black">よく伸びた部員</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {top.map((g) => (
              <li key={g.playerId} className="flex items-center gap-2">
                <span className="w-8 text-xs text-gray-500">{POSITION_GROUP_NAMES[g.group]}</span>
                <span className="flex-1 truncate">
                  {g.name}（{g.grade}年）
                </span>
                <span className="font-mono text-xs font-bold text-emerald-700">総合 +{g.overallGain.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </section>
        {r.injured.length > 0 && <p className="text-sm text-red-700">ケガ：{r.injured.join("、")}</p>}
        <Button className="w-full" onClick={clear}>
          次へ
        </Button>
      </div>
    </main>
  );
}

// ================= 分岐マス =================

export function BranchScreen() {
  const game = useGameStore((s) => s.game)!;
  const choose = useGameStore((s) => s.chooseBranch);
  const p = game.pending as { type: "branch"; day: number };
  const b = game.calendar.branches!.find((x) => x.day === p.day)!;
  const previews = branchPreview(b);
  return (
    <main className="flex flex-1 flex-col">
      <Header title="分かれ道" />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-gray-700">道が分かれている。最初の数マスは見えるが、その先はおおまかにしか分からない。</p>
        {previews.map((pv, i) => (
          <button key={i} type="button" onClick={() => choose(i)} className="rounded-xl border-2 border-pitch/30 bg-white p-3 text-left active:bg-green-50">
            <div className="mb-2 text-sm font-black">{BRANCH_THEME_NAMES[pv.theme]}</div>
            <div className="flex flex-wrap items-center gap-1">
              {pv.first.map((t, k) => (
                <span key={k} className={`h-6 w-6 rounded ${SQUARE_CHIP[t]}`} title={SQUARE_SHORT[t]} />
              ))}
              <span className="mx-1 text-xs text-gray-400">その先</span>
              {Object.entries(pv.rest).map(([t, n]) => (
                <span key={t} className="flex items-center gap-0.5 text-xs">
                  <i className={`inline-block h-3 w-3 rounded-sm ${SQUARE_CHIP[t as RandomSquareType]}`} />
                  {SQUARE_SHORT[t as RandomSquareType]}×{n}
                </span>
              ))}
              {pv.hidden > 0 && <span className="text-xs text-gray-500">？×{pv.hidden}</span>}
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}

// ================= 特待生スカウト =================

function Meter({ c }: { c: ScoutCandidate }) {
  const entries = Object.entries(c.meter) as [keyof typeof METER_NAMES, [number, number]][];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      {entries.map(([k, [lo, hi]]) => (
        <div key={k} className="text-[11px]">
          <div className="flex justify-between">
            <span>{METER_NAMES[k]}</span>
            <span className="font-mono text-gray-500">
              {Math.round(lo)}〜{Math.round(hi)}
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-gray-200">
            <div className="absolute h-full rounded-full bg-sky-400" style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const REACTION_COLOR = { good: "text-emerald-700", normal: "text-amber-700", bad: "text-red-700" } as const;

/** スカウトの画面（候補の一覧・訪問・優先順） */
export function ScoutScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const close = useGameStore((s) => s.setScoutOpen);
  const visit = useGameStore((s) => s.visitScout);
  const setPriority = useGameStore((s) => s.setScoutPriority);
  const lastVisit = useGameStore((s) => s.lastVisit);
  const [openId, setOpenId] = useState<string | null>(null);
  const sc = game.scout;
  if (!sc) {
    return (
      <main className="flex flex-1 flex-col">
        <Header title="特待生スカウト" onBack={() => close(false)} />
        <p className="p-4 text-sm text-gray-600">スカウトの期間は 11月1日から2月末までです。</p>
      </main>
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
  return (
    <main className="flex flex-1 flex-col">
      <Header title="特待生スカウト" onBack={() => close(false)} />
      <div className="flex flex-col gap-3 p-4 pb-24">
        <div className="rounded-xl bg-gray-50 p-3 text-sm">
          <div>
            スカウトカード 残り<b>{sc.cards}</b>枚（今季 {sc.cardsDelivered}/{sc.cardsTotal}枚が届いた）
          </div>
          <div className="text-xs text-gray-600">
            特待生の枠 {slots}人・探せる範囲 {scopeText}（評判「{REPUTATION_NAMES[game.reputation.level]}」）・返事は 2月28日
          </div>
          <div className="mt-1 text-[11px] text-gray-500">訪ねると反応が分かり、推定の幅が狭まる。訪ねた日は練習しない（1日進む）。</div>
        </div>
        {lastVisit && (
          <p className="rounded-xl bg-green-50 p-2 text-sm text-pitch-dark">
            {lastVisit.candidate.player.name}を訪ねた。反応は「{REACTION_NAMES[lastVisit.candidate.reaction!]}」
            {lastVisit.improved && "（良くなった！）"}
          </p>
        )}
        {courting.length > 0 && (
          <section className="rounded-xl border border-gray-200 p-3">
            <h2 className="mb-1 text-sm font-black">勧誘中（優先順。枠を超えたら上から）</h2>
            <ol className="flex flex-col gap-1">
              {courting.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-xs text-gray-400">{i + 1}</span>
                  <span className="flex-1 truncate">
                    {c.player.name} <span className={`text-xs ${REACTION_COLOR[c.reaction!]}`}>{REACTION_NAMES[c.reaction!]}</span>
                  </span>
                  <button type="button" className="min-h-9 min-w-9 rounded border border-gray-300 text-xs" onClick={() => move(i, -1)} aria-label="上へ">
                    ▲
                  </button>
                  <button type="button" className="min-h-9 min-w-9 rounded border border-gray-300 text-xs" onClick={() => move(i, 1)} aria-label="下へ">
                    ▼
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}
        <h2 className="text-sm font-black">候補（{sc.candidates.length}人）</h2>
        <ul className="flex flex-col gap-2">
          {sc.candidates.map((c) => {
            const open = openId === c.id;
            const done = c.status !== "open" && c.status !== "courting";
            return (
              <li key={c.id} className={`rounded-xl border p-3 ${c.tier ? "border-amber-300 bg-amber-50/40" : "border-gray-200"} ${done ? "opacity-50" : ""}`}>
                <button type="button" className="w-full text-left" onClick={() => setOpenId(open ? null : c.id)}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-bold">
                      {c.player.name}
                      {c.tier === 1 && <span className="ml-1 text-[10px] text-amber-700">注目</span>}
                    </span>
                    <span className="text-xs text-gray-500">{POSITION_NAMES[c.player.mainPosition]}</span>
                    {c.reaction && <span className={`text-xs font-bold ${REACTION_COLOR[c.reaction]}`}>{REACTION_NAMES[c.reaction]}</span>}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {pref(c.prefectureId)}・{AFFILIATION_NAMES[c.affiliation]}・実績 {ACHIEVEMENT_NAMES[c.achievement]}
                    {c.rivals.length > 0 && `・取り合い ${c.rivals.map((r) => (r === "youth" ? YOUTH_TEAM_NAME : (game.schools[r]?.name ?? "他校"))).join("、")}`}
                    {c.visits > 0 && `・訪問 ${c.visits}回`}
                  </div>
                </button>
                {open && (
                  <div className="mt-2 flex flex-col gap-2">
                    <Meter c={c} />
                    {c.comments && (
                      <ul className="list-disc pl-4 text-xs text-gray-700">
                        {c.comments.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    )}
                    {c.reaction && <p className="text-[11px] text-gray-500">入部してくれそうな度合い：{Math.round(joinChance(c) * 100)}%前後</p>}
                    {!done && (
                      <Button disabled={!canVisit} onClick={() => visit(c.id)}>
                        {c.visits === 0 ? "訪ねる（カード1枚）" : "もう一度訪ねる（カード1枚）"}
                      </Button>
                    )}
                    {done && <p className="text-xs text-gray-500">{c.status === "joined" ? "入部が決まった" : c.status === "lost" ? "ほかの進路に決まった" : "断られた"}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
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
  return (
    <main className="flex flex-1 flex-col">
      <Header title="特待生の返事" />
      <div className="flex flex-col gap-3 p-4">
        {joined.length === 0 ? (
          <p className="text-sm text-gray-700">今年は特待生の入部が決まらなかった。</p>
        ) : (
          <section className="rounded-xl bg-amber-50 p-3">
            <h2 className="mb-1 text-sm font-black text-amber-900">4月から入部する特待生</h2>
            <ul className="text-sm">
              {joined.map((c) => (
                <li key={c.id}>
                  🎓 {c.player.name}（{POSITION_NAMES[c.player.mainPosition]}・{game.prefectures.find((p) => p.id === c.prefectureId)?.name}）
                </li>
              ))}
            </ul>
          </section>
        )}
        {others.length > 0 && (
          <ul className="text-xs text-gray-600">
            {others.map((c) => (
              <li key={c.id}>
                {c.player.name}：{c.status === "lost" ? `${lostTo(c)}に進む` : "今回は見送り"}
              </li>
            ))}
          </ul>
        )}
        <Button className="w-full" onClick={ok}>
          次へ
        </Button>
      </div>
    </main>
  );
}

// ================= 設備 =================

export function FacilitiesScreen() {
  const game = useGameStore((s) => s.game)!;
  const close = useGameStore((s) => s.setFacilitiesOpen);
  const f = game.facilities;
  const sourceName = { reputation: "評判", result: "大会の成績", donation: "OBの寄付" } as const;
  return (
    <main className="flex flex-1 flex-col">
      <Header title="設備" onBack={() => close(false)} />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-gray-600">設備は評判・大会の成績・OBの寄付で整い、下がることはない。練習の効率への効果は、スタッフと合わせて上限がある。</p>
        {FACILITY_IDS.map((id) => (
          <section key={id} className="rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-sm font-black">{FACILITY_NAMES[id]}</h2>
              <span className="text-xs font-bold text-pitch-dark">
                {facilityLevelName(id, f[id])}（Lv.{f[id]}）
              </span>
            </div>
            <div className="mt-1 flex gap-1">
              {[1, 2, 3].map((lv) => (
                <span key={lv} className={`h-1.5 flex-1 rounded-full ${f[id] >= lv ? "bg-pitch" : "bg-gray-200"}`} />
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">{FACILITY_EFFECT_TEXTS[id]}</p>
            <p className="text-[11px] text-gray-500">次：{nextLevelHint(id, f[id], game.facilityGrantedLevel)}</p>
          </section>
        ))}
        {game.facilityLog.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-black">整備の記録</h2>
            <ul className="text-xs text-gray-600">
              {[...game.facilityLog].reverse().map((e, i) => (
                <li key={i}>
                  {e.year}年目：{FACILITY_NAMES[e.facility]}が「{facilityLevelName(e.facility, e.level)}」に（{sourceName[e.source]}）
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-[11px] text-gray-400">今日：{formatDay(game.calendar.position)}</p>
      </div>
    </main>
  );
}

const FACILITY_EFFECT_TEXTS = {
  ground: "すべての練習の効率が上がる。合宿で特殊能力が身につきやすくなる",
  trainingRoom: "フィジカル・走り込みの効率が上がり、練習中のケガが減る",
  careRoom: "体力の回復が早くなり、ケガが早く治る",
  dorm: "体力の回復が少し早くなり、スカウトの反応が良くなる",
} as const;
