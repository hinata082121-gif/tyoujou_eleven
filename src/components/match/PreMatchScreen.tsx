"use client";

import { useState } from "react";
import { FORMATIONS } from "@/engine/config/formations";
import { APTITUDE_MARKS, POSITION_NAMES } from "@/engine/config/names";
import { defaultSetup, opponentOf, pendingMatchLabel, pendingMatchRules } from "@/engine/game";
import { assignToSlots, autoSetup } from "@/engine/match/lineup";
import { isAvailable, positionRating } from "@/engine/player/rating";
import { playerSchool } from "@/engine/season";
import { FORMATION_IDS, type MatchRules, type Player, type TeamSetup } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Bar, Button, fitnessColor, Header, RankBadge } from "../ui";
import { TacticsEditor } from "./TacticsEditor";

type Sel = { kind: "xi"; index: number } | { kind: "bench"; index: number } | { kind: "res"; id: string } | null;

export function rulesText(r: MatchRules): string {
  const parts = [`${r.halfMinutes * 2}分`];
  if (r.extraTimeHalfMinutes) parts.push(`同点なら延長${r.extraTimeHalfMinutes * 2}分`);
  parts.push(r.pkOnDraw ? "同点ならPK戦" : "同点で終了");
  parts.push(`交代${r.maxSubs}人まで`);
  return parts.join("・");
}

export function PreMatchScreen() {
  const game = useGameStore((s) => s.game)!;
  const startMatch = useGameStore((s) => s.startMatch);
  const school = playerSchool(game);
  const opp = opponentOf(game)!;
  const rules = pendingMatchRules(game)!;
  const [setup, setSetup] = useState<TeamSetup>(() => defaultSetup(game));
  const [sel, setSel] = useState<Sel>(null);
  const byId = new Map(school.players.map((p) => [p.id, p]));
  const slots = FORMATIONS[setup.formation];
  const used = new Set([...setup.lineup, ...setup.bench]);
  const reserves = school.players.filter((p) => isAvailable(p) && !used.has(p.id));
  const unavailable = school.players.filter((p) => !isAvailable(p) && p.status === "active");

  const update = (patch: Partial<TeamSetup>) => setSetup((s) => ({ ...s, ...patch }));

  const tap = (next: NonNullable<Sel>) => {
    if (!sel) return setSel(next);
    if (JSON.stringify(sel) === JSON.stringify(next)) return setSel(null);
    const lineup = [...setup.lineup];
    const bench = [...setup.bench];
    const get = (s: NonNullable<Sel>) => (s.kind === "xi" ? lineup[s.index] : s.kind === "bench" ? bench[s.index] : s.id);
    const put = (s: NonNullable<Sel>, id: string | undefined) => {
      if (s.kind === "xi" && id) lineup[s.index] = id;
      if (s.kind === "bench") {
        if (id) bench[s.index] = id;
        else bench.splice(s.index, 1);
      }
    };
    if (sel.kind === "res" && next.kind === "res") return setSel(next);
    const a = get(sel);
    const b = get(next);
    put(sel, b);
    put(next, a);
    update({ lineup, bench: bench.filter(Boolean) });
    setSel(null);
  };

  const addToBench = () => {
    if (sel?.kind !== "res" || setup.bench.length >= rules.benchSize) return;
    update({ bench: [...setup.bench, sel.id] });
    setSel(null);
  };

  const removeFromBench = (index: number) => {
    update({ bench: setup.bench.filter((_, i) => i !== index) });
    setSel(null);
  };

  const changeFormation = (f: TeamSetup["formation"]) => {
    const players = setup.lineup.map((id) => byId.get(id)!).filter(Boolean);
    update({ formation: f, lineup: assignToSlots(players, f) });
  };

  const auto = () => {
    setSetup(autoSetup(school.players, setup.formation, setup.tactics, rules.benchSize));
    setSel(null);
  };

  const valid = setup.lineup.length === 11 && setup.lineup.every((id) => byId.get(id) && isAvailable(byId.get(id)!));
  const isSel = (s: NonNullable<Sel>) => JSON.stringify(sel) === JSON.stringify(s);

  return (
    <main className="flex flex-1 flex-col">
      <Header title="試合前" />
      <div className="flex flex-col gap-3 p-3 pb-28">
        <section className="rounded-xl bg-gray-50 p-3">
          <div className="text-xs text-gray-500">{pendingMatchLabel(game)}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-base font-black">vs {opp.name}</span>
            <RankBadge rank={opp.rank} size="sm" />
            <span className="ml-auto text-xs text-gray-500">{opp.formation}</span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">{rulesText(rules)}</div>
          <div className="mt-1 text-[11px] text-gray-500">
            自校のランク <RankBadge rank={school.rank} size="sm" />
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-black">フォーメーション</h2>
          <div className="grid grid-cols-5 gap-1">
            {FORMATION_IDS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => changeFormation(f)}
                className={`min-h-10 rounded-lg text-xs font-bold ${setup.formation === f ? "bg-pitch text-white" : "bg-gray-100"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </section>

        <TacticsEditor tactics={setup.tactics} onChange={(t) => update({ tactics: t })} />

        <section>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-black">スタメン（タップで選び、もう一人をタップで入れ替え）</h2>
          </div>
          <ul className="flex flex-col gap-1">
            {slots.map((slot, i) => {
              const p = byId.get(setup.lineup[i]);
              return (
                <PlayerRow
                  key={i}
                  label={POSITION_NAMES[slot.pos]}
                  p={p}
                  apt={p ? APTITUDE_MARKS[p.aptitude[slot.pos]] : ""}
                  rating={p ? Math.round(positionRating(p, slot.pos)) : undefined}
                  selected={isSel({ kind: "xi", index: i })}
                  onTap={() => tap({ kind: "xi", index: i })}
                />
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-black">
            控え（{setup.bench.length}/{rules.benchSize}）
          </h2>
          <ul className="flex flex-col gap-1">
            {setup.bench.map((id, i) => (
              <PlayerRow
                key={id}
                label="控え"
                p={byId.get(id)}
                selected={isSel({ kind: "bench", index: i })}
                onTap={() => tap({ kind: "bench", index: i })}
                onRemove={() => removeFromBench(i)}
              />
            ))}
            {setup.bench.length < rules.benchSize && (
              <li>
                <button
                  type="button"
                  disabled={sel?.kind !== "res"}
                  onClick={addToBench}
                  className="min-h-10 w-full rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 disabled:opacity-50"
                >
                  ＋ 選んだ選手を控えに入れる
                </button>
              </li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-black">ベンチ外</h2>
          <ul className="flex flex-col gap-1">
            {reserves.map((p) => (
              <PlayerRow key={p.id} label="外" p={p} selected={isSel({ kind: "res", id: p.id })} onTap={() => tap({ kind: "res", id: p.id })} />
            ))}
            {unavailable.map((p) => (
              <PlayerRow key={p.id} label="ケガ" p={p} disabled />
            ))}
            {reserves.length === 0 && unavailable.length === 0 && <li className="text-xs text-gray-400">なし</li>}
          </ul>
        </section>
      </div>

      <div className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-[430px] -translate-x-1/2 grid-cols-3 gap-2 border-t border-gray-200 bg-white p-3">
        <Button variant="secondary" onClick={auto}>
          おまかせ
        </Button>
        <Button className="col-span-2" disabled={!valid} onClick={() => startMatch(setup)}>
          試合開始
        </Button>
      </div>
    </main>
  );
}

export function PlayerRow({
  label,
  p,
  apt,
  rating,
  selected,
  onTap,
  onRemove,
  disabled,
  stamina,
  note,
}: {
  label: string;
  p?: Player;
  apt?: string;
  rating?: number;
  selected?: boolean;
  onTap?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  stamina?: number;
  note?: string;
}) {
  const fit = stamina ?? p?.fitness ?? 0;
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={onTap}
        className={`flex min-h-11 flex-1 items-center gap-2 rounded-lg px-2 text-left ${selected ? "bg-amber-100 ring-2 ring-amber-400" : "bg-gray-50"} ${disabled ? "opacity-50" : ""}`}
      >
        <span className="w-10 shrink-0 text-[11px] font-black text-pitch-dark">{label}</span>
        {p ? (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-bold">
              {p.name}
              <span className="ml-1 text-[10px] font-normal text-gray-500">
                {p.grade}年 {POSITION_NAMES[p.mainPosition]}
              </span>
            </span>
            {note && <span className="text-[10px] text-amber-700">{note}</span>}
            {apt && <span className="w-4 text-center text-sm">{apt}</span>}
            {rating !== undefined && <span className="w-6 text-right font-mono text-xs">{rating}</span>}
            <Bar value={fit} color={fitnessColor(fit)} className="!h-1.5 !w-10" />
          </>
        ) : (
          <span className="text-xs text-gray-400">（空き）</span>
        )}
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} className="min-h-11 min-w-9 rounded-lg text-gray-400" aria-label="控えから外す">
          ×
        </button>
      )}
    </li>
  );
}
