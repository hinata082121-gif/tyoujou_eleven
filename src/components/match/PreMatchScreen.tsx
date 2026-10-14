"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FORMATIONS, type Slot } from "@/engine/config/formations";
import { APTITUDE_MARKS, POSITION_NAMES, TACTICS_LABELS } from "@/engine/config/names";
import { canSkipWatching, defaultSetup, isCarryKind, eligiblePlayers, opponentOf, pendingIsOfficial, pendingMatchLabel, pendingMatchRules } from "@/engine/game";
import { analystScouting } from "@/engine/staff";
import { assignToSlots, autoSetup } from "@/engine/match/lineup";
import { isAvailable, positionRating } from "@/engine/player/rating";
import { playerSchool } from "@/engine/season";
import { bodyScale, generateKits, gkKit, kitsForMatch } from "@/engine/look";
import { homeSide } from "@/engine/look/match";
import type { ActiveMatch } from "@/engine/match/types";
import { FORMATION_IDS, type GameState, type Kit, type MatchRules, type Player, type TeamSetup } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { CONDITION_ICONS, CONDITION_TEXT, Icon, type IconName } from "../icons";
import { KitFigure, PlayerFace } from "../look/Figure";
import { usePortrait } from "../shell/usePortrait";
import { Bar, Button, fitnessColor, IconButton, Label, RankBadge, Screen } from "../ui";
import { TacticsEditor } from "./TacticsEditor";

type Tab = "players" | "tactics" | "note" | "opponent";

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
  const setNotesOpen = useGameStore((s) => s.setNotesOpen);
  const school = playerSchool(game);
  const opp = opponentOf(game)!;
  const rules = pendingMatchRules(game)!;
  const setMatchDraft = useGameStore((s) => s.setMatchDraft);
  const leagueMode = useGameStore((s) => s.settings.leagueMode);
  const updateSettings = useGameStore((s) => s.updateSettings);
  // 作戦ノートを開いて戻ったときは、組んでいた並びを使う（同じ試合のときだけ）
  const p = game.pending;
  const draftKey = p?.type === "match" ? `${game.year}-${game.calendar.position}-${p.opponentId}` : "";
  const draft = useGameStore.getState().matchDraft;
  const fromDraft = draft && draft.key === draftKey ? draft : null;
  const [setup, setSetup] = useState<TeamSetup>(() => fromDraft?.setup ?? defaultSetup(game));
  const [sel, setSel] = useState<Sel>(null);
  const [tab, setTab] = useState<Tab>("players");
  /** スタメン発表を出している（公式戦の試合開始） */
  const [announce, setAnnounce] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(() => {
    const id = fromDraft ? fromDraft.noteId : (game.selectedNoteId ?? null);
    return id && game.notes.some((n) => n.id === id) ? id : null;
  });
  useEffect(() => {
    setMatchDraft({ key: draftKey, setup, noteId });
  }, [draftKey, setup, noteId, setMatchDraft]);
  const byId = new Map(school.players.map((p) => [p.id, p]));
  const pool = eligiblePlayers(game);
  const poolIds = new Set(pool.map((p) => p.id));
  const official = pendingIsOfficial(game);
  const hasAnalyst = analystScouting(game.staff) > 0;
  const slots = FORMATIONS[setup.formation];
  const used = new Set([...setup.lineup, ...setup.bench]);
  const reserves = pool.filter((p) => isAvailable(p) && !used.has(p.id));
  const unavailable = school.players.filter((p) => (!isAvailable(p) || !poolIds.has(p.id)) && p.status === "active");

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
    setSetup(autoSetup(pool, setup.formation, setup.tactics, rules.benchSize));
    setSel(null);
  };

  const pend = game.pending;
  const carry = pend?.type === "match" && isCarryKind(pend.kind) && (game.competitions[pend.kind as "national"]?.roundsDone ?? 0) > 0;
  const actives = eligiblePlayers(game).filter((p) => p.status === "active");
  const avgFit = actives.reduce((a, p) => a + p.fitness, 0) / Math.max(1, actives.length);
  const valid = setup.lineup.length === 11 && setup.lineup.every((id) => byId.get(id) && isAvailable(byId.get(id)!) && poolIds.has(id));
  const isSel = (s: NonNullable<Sel>) => JSON.stringify(sel) === JSON.stringify(s);
  /** 選んだモードを次の試合の初期値として覚える */
  const go = (mode: "manage" | "auto") => {
    if (mode !== leagueMode) updateSettings({ leagueMode: mode });
    startMatch(setup, mode === "auto" ? "auto" : "watch", noteId);
  };

  const kits = previewKits(game);
  const fwRowOmf = slots.some((x) => x.pos === "OMF");
  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: "players", label: "選手", icon: "squad" },
    { id: "tactics", label: "戦術", icon: "tactics" },
    { id: "note", label: "作戦ノート", icon: "note" },
    { id: "opponent", label: "相手", icon: "info" },
  ];

  const startButtons = canSkipWatching(game) ? (
    (() => {
      const manage = (
        <Button key="manage" variant={leagueMode === "manage" ? "primary" : "secondary"} disabled={!valid} onClick={() => go("manage")} cut={leagueMode === "manage"}>
          采配あり
        </Button>
      );
      const autoBtn = (
        <Button key="auto" variant={leagueMode === "auto" ? "primary" : "secondary"} disabled={!valid} onClick={() => go("auto")} cut={leagueMode === "auto"}>
          結果のみ
        </Button>
      );
      // 設定で選んでいる方を右（いつも押す場所）に置く
      return leagueMode === "auto" ? [manage, autoBtn] : [autoBtn, manage];
    })()
  ) : (
    <Button icon="whistle" cut disabled={!valid} onClick={() => (official ? setAnnounce(true) : startMatch(setup, "watch", noteId))}>
      試合開始
    </Button>
  );

  if (announce)
    return (
      <LineupAnnounce
        school={school.name}
        label={pendingMatchLabel(game)}
        opponent={opp.name}
        players={setup.lineup.map((id, i) => ({ p: byId.get(id)!, slot: slots[i] })).filter((x) => !!x.p)}
        kit={kits.kit}
        gkColor={kits.gk}
        onDone={() => startMatch(setup, "watch", noteId)}
      />
    );

  return (
    <Screen
      title="試合前"
      sub={pendingMatchLabel(game)}
      right={
        <>
          <Button variant="ghost" icon="dice" small onClick={auto}>
            おまかせ
          </Button>
          {startButtons}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 gap-2">
        {/* 左：フォーメーション図（先発 11 人の顔と背番号。タップで選び、もう一人をタップで入れ替え） */}
        <section className="flex min-h-0 w-[46%] shrink-0 flex-col gap-1">
          <div className="flex items-center gap-2 bg-panel px-2 py-1">
            <span className="text-[0.75rem] font-bold text-text-3">対戦</span>
            <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-black">{opp.name}</span>
            <RankBadge rank={opp.rank} size="sm" />
            <span className="font-num bg-panel-3 px-1.5 text-[0.75rem]">{opp.formation}</span>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-turf">
            <FormationPitch />
            {slots.map((slot, i) => {
              const pl = byId.get(setup.lineup[i]);
              const pos = slotPosition(slots, i, fwRowOmf);
              const selected = isSel({ kind: "xi", index: i });
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => tap({ kind: "xi", index: i })}
                  className={`pressable absolute flex w-[4.25rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center ${selected ? "z-10" : ""}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  aria-label={`${POSITION_NAMES[slot.pos]} ${pl?.name ?? "空き"}`}
                >
                  <span className={`relative flex ${selected ? "outline outline-2 outline-yellow" : ""}`}>
                    {pl ? <PlayerFace look={pl.look} kit={slot.pos === "GK" ? gkKit(kits.gk) : kits.kit} size={26} /> : <span className="h-[1.625rem] w-[1.625rem] bg-panel-3" />}
                    {pl?.shirtNumber !== undefined && <span className="font-num absolute -bottom-0.5 -right-2 bg-ink px-0.5 text-[0.625rem] leading-tight text-text">{pl.shirtNumber}</span>}
                  </span>
                  <span className={`mt-0.5 max-w-full truncate px-1 text-[0.6875rem] font-black leading-tight ${selected ? "bg-yellow text-ink" : "bg-panel/85 text-text"}`}>
                    {pl ? pl.name.split(" ")[0] : "空き"}
                  </span>
                  {pl && (
                    <span className="mt-px flex w-9">
                      <Bar value={pl.fitness} color={fitnessColor(pl.fitness)} className="!h-1 !w-full" />
                    </span>
                  )}
                </button>
              );
            })}
            {sel && <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-panel/90 px-2 py-0.5 text-[0.6875rem] font-bold text-yellow">入れ替える相手をタップ</p>}
          </div>
        </section>

        {/* 右：タブ（選手・戦術・作戦ノート・相手） */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
          <div className="flex gap-0.5 bg-panel p-0.5" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`pressable flex min-h-9 flex-1 items-center justify-center gap-1 text-[0.75rem] font-black ${tab === t.id ? "bg-yellow text-ink" : "bg-panel-2 text-text-2"}`}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
              </button>
            ))}
          </div>

          {tab === "players" && (
            <div className="scroll-y min-h-0 flex-1 bg-panel">
              <ListHead>スタメン（タップで選び、もう一人をタップで入れ替え）</ListHead>
              <ul>
                {slots.map((slot, i) => {
                  const pl = byId.get(setup.lineup[i]);
                  return (
                    <PlayerRow
                      key={i}
                      label={POSITION_NAMES[slot.pos]}
                      p={pl}
                      kit={slot.pos === "GK" ? gkKit(kits.gk) : kits.kit}
                      apt={pl ? APTITUDE_MARKS[pl.aptitude[slot.pos]] : ""}
                      rating={pl ? Math.round(positionRating(pl, slot.pos)) : undefined}
                      selected={isSel({ kind: "xi", index: i })}
                      onTap={() => tap({ kind: "xi", index: i })}
                    />
                  );
                })}
              </ul>
              <ListHead>
                控え（{setup.bench.length}/{rules.benchSize}）
              </ListHead>
              <ul>
                {setup.bench.map((id, i) => (
                  <PlayerRow
                    key={id}
                    label="控え"
                    p={byId.get(id)}
                    kit={kits.kit}
                    selected={isSel({ kind: "bench", index: i })}
                    onTap={() => tap({ kind: "bench", index: i })}
                    onRemove={() => removeFromBench(i)}
                  />
                ))}
                {setup.bench.length < rules.benchSize && (
                  <li className="p-1">
                    <button
                      type="button"
                      disabled={sel?.kind !== "res"}
                      onClick={addToBench}
                      className="pressable flex min-h-10 w-full items-center justify-center gap-1 border border-dashed border-line-2 text-[0.75rem] font-bold text-text-2 disabled:text-text-3 disabled:opacity-70"
                    >
                      <Icon name="plus" size={14} />
                      選んだ選手を控えに入れる
                    </button>
                  </li>
                )}
              </ul>
              <ListHead>ベンチ外</ListHead>
              <ul>
                {reserves.map((pl) => (
                  <PlayerRow key={pl.id} label="外" p={pl} kit={kits.kit} selected={isSel({ kind: "res", id: pl.id })} onTap={() => tap({ kind: "res", id: pl.id })} />
                ))}
                {unavailable.map((pl) => (
                  <PlayerRow key={pl.id} label={official && pl.suspended > 0 ? "停止" : "ケガ"} p={pl} kit={kits.kit} disabled />
                ))}
                {reserves.length === 0 && unavailable.length === 0 && <li className="px-2 py-1.5 text-[0.75rem] text-text-3">なし</li>}
              </ul>
            </div>
          )}

          {tab === "tactics" && (
            <div className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5">
              <section className="bg-panel p-1.5">
                <Label className="!mb-1">フォーメーション</Label>
                <div className="grid grid-cols-5 gap-0.5">
                  {FORMATION_IDS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => changeFormation(f)}
                      aria-pressed={setup.formation === f}
                      className={`pressable font-num min-h-10 text-[0.875rem] ${setup.formation === f ? "bg-yellow text-ink" : "bg-panel-2 text-text-2"}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </section>
              <TacticsEditor tactics={setup.tactics} onChange={(t) => update({ tactics: t })} />
            </div>
          )}

          {tab === "note" && (
            <div className="scroll-y min-h-0 flex-1 bg-panel p-1.5">
              <div className="mb-1 flex items-center justify-between">
                <Label className="!mb-0">この試合で使う作戦ノート</Label>
                <Button variant="ghost" small icon="edit" onClick={() => setNotesOpen(true)}>
                  編集する
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[null, ...game.notes].map((n) => (
                  <button
                    key={n?.id ?? "none"}
                    type="button"
                    onClick={() => setNoteId(n?.id ?? null)}
                    aria-pressed={noteId === (n?.id ?? null)}
                    className={`pressable flex min-h-11 items-center gap-1.5 px-2 text-left text-[0.8125rem] font-black ${noteId === (n?.id ?? null) ? "bg-yellow text-ink" : "bg-panel-2 text-text-2"}`}
                  >
                    <Icon name={n ? "note" : "close"} size={14} />
                    <span className="truncate">{n ? n.name : "なし"}</span>
                  </button>
                ))}
              </div>
              {game.notes.length === 0 && <p className="mt-1.5 text-[0.75rem] text-text-3">ノートを作ると、観戦中に自動で交代や戦術変更ができます。</p>}
            </div>
          )}

          {tab === "opponent" && (
            <div className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5 bg-panel p-2 text-[0.8125rem]">
              <div className="flex items-center gap-2">
                <span className="text-[1rem] font-black">{opp.name}</span>
                <RankBadge rank={opp.rank} size="sm" />
                <span className="ml-auto flex items-center gap-1 text-[0.75rem] text-text-3">
                  自校 <RankBadge rank={school.rank} size="sm" />
                </span>
              </div>
              <p className="text-text-2">
                相手の傾向：基本フォーメーション <b className="font-num text-text">{opp.formation}</b>・攻撃方針 <b className="text-text">{TACTICS_LABELS.attack[opp.tactics.attack]}</b>
              </p>
              {hasAnalyst ? (
                <p className="text-text-2">
                  分析担当の報告：プレス <b className="text-text">{TACTICS_LABELS.press[opp.tactics.press]}</b>・ライン <b className="text-text">{TACTICS_LABELS.line[opp.tactics.line]}</b>
                </p>
              ) : (
                <p className="text-text-3">分析担当がいれば、相手のプレスとラインもわかります。</p>
              )}
              <p className="flex items-center gap-1.5 text-text-2">
                <Icon name="whistle" size={14} className="text-yellow" />
                {rulesText(rules)}
              </p>
              {carry && (
                <p className="border-l-4 border-warn bg-panel-2 px-2 py-1 text-[0.75rem] font-bold text-warn">
                  連戦中：前の試合の疲れが残っている（部の平均体力 {Math.round(avgFit)}）。体力の低い選手は控えと入れ替えよう。相手も同じく疲れている。
                </p>
              )}
              {canSkipWatching(game) && (
                <p className="text-[0.75rem] text-text-3">
                  「采配あり」は試合前とハーフタイムに采配します（ケガ人はノートかAIの監督が交代）。「結果のみ」はAIの監督が最後まで采配します。観戦の途中で結果のみに切り替えることもできます。
                </p>
              )}
            </div>
          )}
          {carry && tab !== "opponent" && (
            <p className="flex items-center gap-1.5 bg-panel px-2 py-1 text-[0.75rem] font-bold text-warn">
              <Icon name="warning" size={14} />
              連戦中：部の平均体力 {Math.round(avgFit)}
            </p>
          )}
        </section>
      </div>
    </Screen>
  );
}

function ListHead({ children }: { children: ReactNode }) {
  return <div className="sticky top-0 z-[1] border-b border-line-2 bg-panel-2 px-2 py-0.5 text-[0.6875rem] font-black text-yellow">{children}</div>;
}

/** 試合で着るユニフォームの見込み（表示だけ。試合を始めるときに engine/look/match の decorateMatch で決まるのと同じ考え方） */
function previewKits(game: GameState): { kit: Kit; gk: number } {
  const p = game.pending;
  const me = playerSchool(game);
  if (!p || p.type !== "match") return { kit: (me.kits ?? generateKits(game.seed, me.id)).first, gk: 9 };
  const opp = game.schools[p.opponentId];
  const fake = { kind: p.kind, round: p.round, bracketMatchId: p.bracketMatchId, userSide: 0, state: { teams: [{ schoolId: me.id }, { schoolId: opp.id }] } } as unknown as ActiveMatch;
  const home = homeSide(game, fake);
  const mk = kitsForMatch([me.kits ?? generateKits(game.seed, me.id), opp.kits ?? generateKits(game.seed, opp.id)], home);
  return { kit: mk.kits[0], gk: mk.gk[0] };
}

/** フォーメーション図での位置（%。自校は左から右へ攻める。左のレーンが上） */
function slotPosition(slots: Slot[], i: number, omfRow: boolean): { x: number; y: number } {
  const row = (s: Slot) => (s.pos === "GK" ? 0 : s.line === "DF" ? 1 : s.pos === "DMF" ? 2 : s.pos === "OMF" ? 4 : s.line === "MF" ? 3 : s.pos === "WG" && omfRow ? 4 : 5);
  const X = [7, 24, 40, 54, 69, 85];
  const r = row(slots[i]);
  const same = slots.map((s, j) => ({ s, j })).filter((x) => row(x.s) === r);
  const k = same.findIndex((x) => x.j === i);
  const n = same.length;
  return { x: X[r], y: 9 + (82 * (k + 0.5)) / n };
}

/** フォーメーション図の芝とライン（横長。自校は左から右へ攻める） */
function FormationPitch() {
  return (
    <svg viewBox="0 0 105 68" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (i % 2 ? <rect key={i} x={i * 10.5} y={0} width={10.5} height={68} fill="#22442f" /> : null))}
      <g fill="none" stroke="rgba(246,243,234,0.45)" strokeWidth={0.5} vectorEffect="non-scaling-stroke">
        <rect x={1.5} y={1.5} width={102} height={65} vectorEffect="non-scaling-stroke" />
        <line x1={52.5} y1={1.5} x2={52.5} y2={66.5} vectorEffect="non-scaling-stroke" />
        <circle cx={52.5} cy={34} r={8} vectorEffect="non-scaling-stroke" />
        <rect x={1.5} y={14} width={15} height={40} vectorEffect="non-scaling-stroke" />
        <rect x={88.5} y={14} width={15} height={40} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

/**
 * スタメン発表（公式戦だけ。R1 計画 Q8）：先発 11 人の全身を 2 段に並べ、背番号と名前の帯を出す。タップで飛ばせる
 */
function LineupAnnounce({ school, label, opponent, players, kit, gkColor, onDone }: { school: string; label: string; opponent: string; players: { p: Player; slot: Slot }[]; kit: Kit; gkColor: number; onDone: () => void }) {
  const portrait = usePortrait();
  useEffect(() => {
    if (portrait) return;
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [onDone, portrait]);
  // 後ろの段に GK と DF、前の段に MF と FW（前の段を大きく）
  const back = players.filter((x) => x.slot.line === "GK" || x.slot.line === "DF");
  const front = players.filter((x) => x.slot.line !== "GK" && x.slot.line !== "DF");
  const fig = (x: { p: Player; slot: Slot }, j: number, size: number, delay: number) => {
    const b = bodyScale(x.p.heightCm, x.p.stats.physical);
    return (
      <div key={x.p.id} className="anim-fade-up flex min-w-0 flex-col items-center" style={{ animationDelay: `${delay + j * 70}ms` }}>
        <KitFigure kit={x.slot.pos === "GK" ? gkKit(gkColor) : kit} number={x.p.shirtNumber} look={x.p.look} expr={j % 3 === 0 ? "focus" : "normal"} size={size} height={b.height} build={b.build} />
        <div className="-mt-1 flex max-w-full items-center bg-panel">
          <span className="font-num bg-yellow px-1 text-[0.75rem] text-ink">{x.p.shirtNumber ?? ""}</span>
          <span className="truncate px-1 text-[0.6875rem] font-black">{x.p.name.split(" ")[0]}</span>
        </div>
      </div>
    );
  };
  return (
    <div className="bg-pitch-stripes fixed inset-0 z-40 flex select-none flex-col overflow-hidden pb-[max(0.5rem,var(--safe-b))] pl-[max(0.75rem,var(--safe-l))] pr-[max(0.75rem,var(--safe-r))] pt-[max(0.5rem,var(--safe-t))]" onClick={onDone} role="button" tabIndex={0} aria-label="飛ばす" onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onDone()}>
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="cut-r anim-band-in inline-block bg-yellow py-0.5 pl-3 pr-8 text-[0.75rem] font-black text-ink">{label}</div>
          <h1 className="font-head anim-band-in mt-1 text-[1.5rem] leading-tight">
            スタメン発表
            <span className="font-body ml-2 text-[0.875rem] font-black text-text-2">
              {school} <span className="text-text-3">対</span> {opponent}
            </span>
          </h1>
        </div>
        <span className="ml-auto flex items-center gap-1 bg-panel px-2 py-1 text-[0.75rem] font-black">
          <Icon name="speed" size={14} />
          タップで飛ばす
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end">
        <div className="flex justify-center gap-[3%] px-[8%]">{back.map((x, j) => fig(x, j, 118, 0))}</div>
        <div className="-mt-1 flex justify-center gap-[3%]">{front.map((x, j) => fig(x, j, 138, 300))}</div>
      </div>
    </div>
  );
}

export function PlayerRow({
  label,
  p,
  kit,
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
  kit?: Kit;
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
    <li className="flex items-center border-b border-line">
      <button
        type="button"
        disabled={disabled}
        onClick={onTap}
        className={`pressable flex min-h-10 min-w-0 flex-1 items-center gap-1.5 border-l-4 px-1.5 text-left ${selected ? "border-yellow bg-panel-3" : "border-transparent"} ${disabled ? "opacity-60" : ""}`}
      >
        <span className="w-8 shrink-0 text-[0.75rem] font-black text-yellow">{label}</span>
        {p ? (
          <>
            <PlayerFace look={p.look} kit={kit} size={24} />
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold">
              {p.name}
              <span className="ml-1 text-[0.6875rem] font-normal text-text-3">
                {p.grade}年 {POSITION_NAMES[p.mainPosition]}
              </span>
            </span>
            {note && <span className="text-[0.6875rem] font-bold text-warn">{note}</span>}
            <Icon name={CONDITION_ICONS[p.condition]} size={14} className={CONDITION_TEXT[p.condition]} title="調子" />
            {apt !== undefined && <span className="w-4 text-center text-[0.875rem] font-bold">{apt}</span>}
            {rating !== undefined && <span className="font-num w-6 text-right text-[0.875rem]">{rating}</span>}
            <Bar value={fit} color={fitnessColor(fit)} className="!h-1.5 !w-10" />
          </>
        ) : (
          <span className="text-[0.75rem] text-text-3">（空き）</span>
        )}
      </button>
      {onRemove && <IconButton name="close" label="控えから外す" className="!min-h-10 !min-w-10 border-0 bg-transparent" onClick={onRemove} />}
    </li>
  );
}
