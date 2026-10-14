"use client";

import { useState, type ReactNode } from "react";
import { FORMATIONS } from "@/engine/config/formations";
import {
  AUTO_PICK_NAMES,
  MATCH_KIND_NAMES,
  NOTE_ACTION_NAMES,
  NOTE_CONDITION_NAMES,
  NOTE_TEMPLATE_NAMES,
  POSITION_NAMES,
  TACTICS_ITEM_NAMES,
  TACTICS_LABELS,
} from "@/engine/config/names";
import { addNote, newRule } from "@/engine/game";
import { ruleProblem } from "@/engine/match/note";
import { canAddNote, canAddRule, deleteNote, FATIGUE_SUB_DEFAULT, moveRule, NOTE_TEMPLATE_IDS, saveNote, templateRule } from "@/engine/note";
import { describeRef, describeRule, slotLabel } from "@/engine/note/describe";
import { playerSchool } from "@/engine/season";
import {
  FORMATION_IDS,
  NOTE_LIMITS,
  type FormationId,
  type AutoPick,
  type MatchKind,
  type NoteAction,
  type NoteCondition,
  type NoteRule,
  type PlayerRef,
  type Tactics,
  type TacticsNote,
} from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Icon, type IconName } from "../icons";
import { PlayerFace } from "../look/Figure";
import { Band, Button, Empty, Label, Screen, Segmented, Sheet } from "../ui";

/** 小さなアイコンのボタン（行の中の並べ替え・削除など） */
function MiniIcon({ name, label, onClick, disabled, className = "" }: { name: IconName; label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`pressable inline-flex min-h-11 min-w-9 shrink-0 items-center justify-center text-text-2 disabled:opacity-30 ${className}`}
    >
      <Icon name={name} size={16} />
    </button>
  );
}

/** 追加のボタン（点線の枠とプラスのアイコン） */
function AddButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pressable flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 border-2 border-dashed border-line-2 bg-panel text-[0.75rem] font-bold text-text-2 disabled:opacity-40"
    >
      <Icon name="plus" size={14} className="text-yellow" />
      {children}
    </button>
  );
}

/** 選んでいる（黄）・いない（暗い）の札 */
function pickCls(on: boolean) {
  return on ? "bg-yellow text-ink" : "bg-panel-3 text-text-2";
}

/** 作戦ノートの画面：左にノートの一覧、右に選んだノートのルール。ルールを押すと編集の画面 */
export function NotesScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const touch = useGameStore((s) => s.touch);
  const setNotesOpen = useGameStore((s) => s.setNotesOpen);
  const [selected, setSelected] = useState<string | null>(null);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TacticsNote | null>(null);
  const note = game.notes.find((n) => n.id === selected) ?? game.notes[0];

  const save = (n: TacticsNote) => {
    saveNote(game, n);
    touch();
  };

  const rule = note?.rules.find((r) => r.id === ruleId);
  if (note && rule)
    return (
      <RuleEditor
        rule={rule}
        onBack={() => setRuleId(null)}
        onSave={(r) => save({ ...note, rules: note.rules.map((x) => (x.id === r.id ? r : x)) })}
      />
    );

  const create = (fromTemplates: boolean) => {
    const n = addNote(game, `ノート${game.notes.length + 1}`, fromTemplates);
    setCreating(false);
    if (n) {
      touch();
      setSelected(n.id);
    }
  };

  return (
    <Screen title="作戦ノート" onBack={() => setNotesOpen(false)} bodyClassName="!flex-row gap-2">
      {/* 左：ノートの一覧 */}
      <div className="flex w-[14rem] shrink-0 flex-col gap-1.5">
        <p className="shrink-0 bg-panel px-2 py-1 text-[0.75rem] leading-snug text-text-2">「もし〜なら〜する」というルールを書いておくと、観戦中に自動で采配します。試合前の画面で使うノートを選びます。</p>
        <ul className="scroll-y flex min-h-0 flex-1 flex-col bg-panel">
          {game.notes.map((n, i) => {
            const active = n.id === note?.id;
            return (
              <li key={n.id} className={`flex items-center border-b border-l-4 border-b-line ${active ? "border-l-yellow bg-panel-3" : "border-l-transparent"}`}>
                <button type="button" onClick={() => setSelected(n.id)} aria-pressed={active} className="pressable flex min-h-12 min-w-0 flex-1 flex-col justify-center px-2 text-left">
                  <span className="flex items-baseline gap-1.5">
                    <span className={`text-[0.6875rem] font-black ${active ? "text-yellow" : "text-text-3"}`}>ノート{i + 1}</span>
                    <span className="font-num text-[0.75rem] text-text-3">{n.rules.length}ルール</span>
                  </span>
                  <span className="truncate text-[0.875rem] font-bold text-text">「{n.name}」</span>
                </button>
                <MiniIcon name="trash" label="ノートを削除" onClick={() => setDeleting(n)} className="mr-1" />
              </li>
            );
          })}
          {game.notes.length === 0 && (
            <li>
              <Empty>ノートがありません。</Empty>
            </li>
          )}
        </ul>
        {canAddNote(game) && <AddButton onClick={() => setCreating(true)}>新しいノート（あと{NOTE_LIMITS.notes - game.notes.length}冊）</AddButton>}
      </div>

      {/* 右：選んだノートのルール */}
      {note ? (
        <NoteRules note={note} onSave={save} onEditRule={setRuleId} />
      ) : (
        <div className="flex min-w-0 flex-1 items-start">
          <p className="bg-panel p-3 text-[0.8125rem] text-text-2">左の「新しいノート」から作ります。</p>
        </div>
      )}

      {creating && (
        <Sheet title="新しいノート" onClose={() => setCreating(false)}>
          <div className="flex flex-col gap-2">
            <Button onClick={() => create(true)}>テンプレート 4 つ入りで作る</Button>
            <p className="text-[0.75rem] text-text-3">{NOTE_TEMPLATE_IDS.map((t) => NOTE_TEMPLATE_NAMES[t]).join("・")}が入ります。あとから変えられます。</p>
            <Button variant="secondary" onClick={() => create(false)}>
              空のノートを作る
            </Button>
          </div>
        </Sheet>
      )}
      {deleting && (
        <Sheet title={`「${deleting.name}」を削除しますか？`} onClose={() => setDeleting(null)}>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              やめる
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteNote(game, deleting.id);
                if (selected === deleting.id) setSelected(null);
                setDeleting(null);
                touch();
              }}
            >
              削除する
            </Button>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

function useNameOf() {
  const game = useGameStore((s) => s.game)!;
  const players = playerSchool(game).players;
  return (id: string) => players.find((p) => p.id === id && p.status === "active")?.name;
}

/** ノートの中身：ルールの並び＝優先順位 */
function NoteRules({ note, onSave, onEditRule }: { note: TacticsNote; onSave: (n: TacticsNote) => void; onEditRule: (id: string) => void }) {
  const game = useGameStore((s) => s.game)!;
  const nameOf = useNameOf();
  const [templates, setTemplates] = useState(false);
  const [menu, setMenu] = useState<NoteRule | null>(null);
  const [renaming, setRenaming] = useState(false);
  const squad = new Set(playerSchool(game).players.filter((p) => p.status === "active").map((p) => p.id));
  const formation = playerSchool(game).formation;
  const save = onSave;

  const add = (template?: (typeof NOTE_TEMPLATE_IDS)[number]) => {
    const r = newRule(game, template);
    save({ ...note, rules: [...note.rules, r] });
    setTemplates(false);
    if (!template) onEditRule(r.id);
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Band
        sub={`${note.rules.length}/${NOTE_LIMITS.rules}ルール`}
        className="shrink-0"
        right={
          <Button variant="ghost" small onClick={() => setRenaming(true)}>
            名前
          </Button>
        }
      >
        「{note.name}」
      </Band>
      <p className="shrink-0 bg-panel px-2 py-1 text-[0.75rem] leading-snug text-text-3">上にあるルールほど優先します（交代枠が足りないときは上から実行）。1つのルールは1試合1回だけ発動します。</p>
      <ol className="scroll-y flex min-h-0 flex-1 flex-col bg-panel">
        {note.rules.map((r, i) => {
          const problem = ruleProblem(r, squad);
          const live = r.enabled && !problem;
          return (
            <li key={r.id} className={`border-b border-line px-1.5 pb-1 ${live ? "" : "bg-panel-2"}`}>
              <div className="flex items-center gap-1">
                <span className={`font-num w-5 shrink-0 text-center text-[1rem] font-bold ${live ? "text-yellow" : "text-text-3"}`}>{i + 1}</span>
                <button type="button" onClick={() => onEditRule(r.id)} className={`pressable min-h-11 min-w-0 flex-1 truncate text-left text-[0.875rem] font-bold ${live ? "text-text" : "text-text-3"}`}>
                  {r.name}
                </button>
                <button
                  type="button"
                  aria-pressed={r.enabled}
                  onClick={() => save({ ...note, rules: note.rules.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)) })}
                  className="pressable flex min-h-11 shrink-0 items-center px-1"
                >
                  <span className={`font-num flex h-6 w-12 -skew-x-12 items-center justify-center text-[0.75rem] font-bold ${r.enabled ? "bg-yellow text-ink" : "bg-panel-3 text-text-3"}`}>{r.enabled ? "ON" : "OFF"}</span>
                </button>
                <MiniIcon name="up" label="上へ" disabled={i === 0} onClick={() => save(moveRule(note, r.id, -1))} />
                <MiniIcon name="down" label="下へ" disabled={i === note.rules.length - 1} onClick={() => save(moveRule(note, r.id, 1))} />
                <MiniIcon name="menu" label="ほかの操作" onClick={() => setMenu(r)} />
              </div>
              <button type="button" onClick={() => onEditRule(r.id)} className="block w-full pl-6 text-left text-[0.75rem] leading-snug text-text-2">
                {describeRule(r, nameOf, formation)}
              </button>
              {problem && (
                <p className="flex items-center gap-1 pl-6 text-[0.75rem] font-bold text-bad">
                  <Icon name="warning" size={12} />
                  {problem}（このルールは発動しません）
                </p>
              )}
            </li>
          );
        })}
        {note.rules.length === 0 && (
          <li>
            <Empty>ルールがありません。下のボタンから追加します。</Empty>
          </li>
        )}
      </ol>
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <Button variant="secondary" icon="plus" disabled={!canAddRule(note)} onClick={() => add()}>
          ルールを追加
        </Button>
        <Button variant="secondary" icon="list" disabled={!canAddRule(note)} onClick={() => setTemplates(true)}>
          テンプレートから
        </Button>
      </div>

      {templates && (
        <Sheet title="テンプレートから追加" onClose={() => setTemplates(false)}>
          <div className="flex flex-col gap-1.5">
            {NOTE_TEMPLATE_IDS.map((t) => (
              <button key={t} type="button" onClick={() => add(t)} className="pressable min-h-11 border-l-4 border-yellow bg-panel-2 px-3 py-2 text-left">
                <div className="text-[0.875rem] font-bold text-text">{NOTE_TEMPLATE_NAMES[t]}</div>
                <div className="text-[0.75rem] leading-snug text-text-2">{describeRule(templatePreviews[t], nameOf, formation)}</div>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={!canAddRule(note)}
              onClick={() => {
                const copy = { ...structuredClone(menu), id: newRule(game).id, name: `${menu.name}（コピー）` };
                const i = note.rules.findIndex((x) => x.id === menu.id);
                save({ ...note, rules: [...note.rules.slice(0, i + 1), copy, ...note.rules.slice(i + 1)] });
                setMenu(null);
              }}
            >
              複製する
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                save({ ...note, rules: note.rules.filter((x) => x.id !== menu.id) });
                setMenu(null);
              }}
            >
              削除する
            </Button>
          </div>
        </Sheet>
      )}
      {renaming && <RenameSheet value={note.name} onClose={() => setRenaming(false)} onSave={(name) => save({ ...note, name })} />}
    </section>
  );
}

/** テンプレートの説明を出すための見本（ID は使わない） */
const templatePreviews = Object.fromEntries(NOTE_TEMPLATE_IDS.map((t) => [t, templateRule(t, "preview")])) as Record<(typeof NOTE_TEMPLATE_IDS)[number], NoteRule>;

function RenameSheet({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Sheet title="名前を変える" onClose={onClose}>
      <input
        className="mb-3 min-h-11 w-full border-2 border-line-2 bg-panel-2 px-3 text-[1rem] text-text outline-none focus:border-yellow"
        value={v}
        maxLength={16}
        onChange={(e) => setV(e.target.value)}
      />
      <Button
        className="w-full"
        disabled={!v.trim()}
        onClick={() => {
          onSave(v.trim());
          onClose();
        }}
      >
        決定
      </Button>
    </Sheet>
  );
}

// ================= ルールの編集 =================

const CONDITION_TYPES: NoteCondition["type"][] = ["minutesLeft", "minuteFrom", "score", "stamina", "booked", "injured", "subsLeft", "competition"];
const ACTION_TYPES: NoteAction["type"][] = ["sub", "tactics", "formation", "position"];

function defaultCondition(type: NoteCondition["type"]): NoteCondition {
  switch (type) {
    case "minuteFrom":
      return { type, minute: 60 };
    case "minutesLeft":
      return { type, minutes: 10 };
    case "score":
      return { type, state: "behind", by: 1 };
    case "stamina":
      return { type, target: { kind: "auto", pick: "lowestStamina" }, below: FATIGUE_SUB_DEFAULT };
    case "booked":
      return { type, target: { kind: "auto", pick: "bookedPlayer" } };
    case "injured":
      return { type, target: { kind: "auto", pick: "injuredPlayer" } };
    case "subsLeft":
      return { type, atLeast: 1 };
    case "competition":
      return { type, kinds: ["prefQualifier", "national"] };
  }
}

function defaultAction(type: NoteAction["type"]): NoteAction {
  switch (type) {
    case "sub":
      return { type, out: { kind: "auto", pick: "lowestStamina" }, in: { kind: "auto", pick: "bestForSlot" } };
    case "tactics":
      return { type, change: { attack: "attacking" } };
    case "formation":
      return { type, formation: "4-4-2" };
    case "position":
      return { type, player: { kind: "auto", pick: "lowestStamina" }, slot: 0 };
  }
}

const PITCH_PICKS: AutoPick[] = ["lowestStamina", "goalkeeperOnPitch", "bookedPlayer", "injuredPlayer"];
const BENCH_PICKS: AutoPick[] = ["bestForSlot", "tallestForward", "pkGoalkeeper"];

function Stepper({ value, min, max, step = 1, unit, onChange }: { value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const btn = "pressable inline-flex min-h-9 min-w-9 items-center justify-center bg-panel-3 text-text disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" aria-label="減らす" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Icon name="minus" size={14} />
      </button>
      <span className="font-num w-8 text-center text-[1rem] font-bold text-text">{value}</span>
      <button type="button" aria-label="増やす" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Icon name="plus" size={14} />
      </button>
      {unit && <span className="text-[0.75rem] text-text-2">{unit}</span>}
    </span>
  );
}

function RuleEditor({ rule, onBack, onSave }: { rule: NoteRule; onBack: () => void; onSave: (r: NoteRule) => void }) {
  const game = useGameStore((s) => s.game)!;
  const nameOf = useNameOf();
  const formation = playerSchool(game).formation;
  const [addCond, setAddCond] = useState(false);
  const [addAct, setAddAct] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [picker, setPicker] = useState<{ where: "pitch" | "bench"; picks: AutoPick[]; onPick: (r: PlayerRef) => void } | null>(null);

  const setCond = (i: number, c: NoteCondition) => onSave({ ...rule, conditions: rule.conditions.map((x, j) => (j === i ? c : x)) });
  const setAct = (i: number, a: NoteAction) => onSave({ ...rule, actions: rule.actions.map((x, j) => (j === i ? a : x)) });
  const moveAct = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rule.actions.length) return;
    const acts = [...rule.actions];
    [acts[i], acts[j]] = [acts[j], acts[i]];
    onSave({ ...rule, actions: acts });
  };
  const refButton = (ref: PlayerRef, where: "pitch" | "bench", picks: AutoPick[], onPick: (r: PlayerRef) => void) => (
    <button
      type="button"
      onClick={() => setPicker({ where, picks, onPick })}
      className="pressable inline-flex min-h-9 items-center gap-1 border border-yellow bg-panel-3 px-2 text-left text-[0.75rem] font-bold text-text"
    >
      {describeRef(ref, nameOf)}
      <Icon name="down" size={12} className="text-yellow" />
    </button>
  );

  return (
    <Screen
      title={`ルール「${rule.name}」`}
      onBack={onBack}
      right={
        <>
          <Button variant="ghost" small onClick={() => setRenaming(true)}>
            名前
          </Button>
          <Button small icon="check" onClick={onBack}>
            ノートに戻る
          </Button>
        </>
      }
      bodyClassName="gap-1.5"
    >
      <div className="flex shrink-0 items-stretch gap-2">
        <p className="scroll-y max-h-[3.25rem] min-w-0 flex-1 border-l-4 border-yellow bg-panel px-2 py-1 text-[0.75rem] leading-snug text-text">{describeRule(rule, nameOf, formation)}</p>
        <p className="flex w-[11rem] shrink-0 items-center bg-panel px-2 text-[0.75rem] leading-snug text-text-3">試合中の速報：「作戦ノート：{rule.name}を実行」</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        {/* 左：条件 */}
        <section className="flex min-h-0 flex-col gap-1">
          <Band className="shrink-0" sub="すべて満たしたら">
            もし
          </Band>
          <ul className="scroll-y flex min-h-0 flex-1 flex-col gap-1 bg-panel p-1">
            {rule.conditions.map((c, i) => (
              <li key={i} className="flex items-start gap-1 bg-panel-2 py-1 pl-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Label className="!mb-0">{NOTE_CONDITION_NAMES[c.type]}</Label>
                  <ConditionFields c={c} onChange={(x) => setCond(i, x)} refButton={refButton} />
                </div>
                <MiniIcon name="close" label="条件を消す" onClick={() => onSave({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) })} />
              </li>
            ))}
            {rule.conditions.length === 0 && <li className="p-2 text-[0.75rem] text-text-3">条件がありません。</li>}
          </ul>
          <AddButton onClick={() => setAddCond(true)}>条件を追加</AddButton>
        </section>

        {/* 右：行動 */}
        <section className="flex min-h-0 flex-col gap-1">
          <Band className="shrink-0" tone="yellow" sub="上から順に実行">
            なら
          </Band>
          <ul className="scroll-y flex min-h-0 flex-1 flex-col gap-1 bg-panel p-1">
            {rule.actions.map((a, i) => (
              <li key={i} className="flex items-start gap-1 bg-panel-2 py-1 pl-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Label className="!mb-0">
                    <span className="font-num mr-1">{i + 1}.</span>
                    {NOTE_ACTION_NAMES[a.type]}
                  </Label>
                  <ActionFields a={a} formation={formation} onChange={(x) => setAct(i, x)} refButton={refButton} />
                </div>
                <div className="flex shrink-0 flex-col">
                  <MiniIcon name="close" label="行動を消す" onClick={() => onSave({ ...rule, actions: rule.actions.filter((_, j) => j !== i) })} />
                  <MiniIcon name="up" label="上へ" disabled={i === 0} onClick={() => moveAct(i, -1)} />
                  <MiniIcon name="down" label="下へ" disabled={i === rule.actions.length - 1} onClick={() => moveAct(i, 1)} />
                </div>
              </li>
            ))}
            {rule.actions.length === 0 && <li className="p-2 text-[0.75rem] text-text-3">行動がありません。</li>}
          </ul>
          <AddButton onClick={() => setAddAct(true)}>行動を追加</AddButton>
        </section>
      </div>

      {addCond && (
        <Sheet title="条件を追加" onClose={() => setAddCond(false)}>
          <div className="grid grid-cols-2 gap-2">
            {CONDITION_TYPES.map((t) => (
              <Button
                key={t}
                variant="secondary"
                onClick={() => {
                  onSave({ ...rule, conditions: [...rule.conditions, defaultCondition(t)] });
                  setAddCond(false);
                }}
              >
                {NOTE_CONDITION_NAMES[t]}
              </Button>
            ))}
          </div>
        </Sheet>
      )}
      {addAct && (
        <Sheet title="行動を追加" onClose={() => setAddAct(false)}>
          <div className="grid grid-cols-2 gap-2">
            {ACTION_TYPES.map((t) => (
              <Button
                key={t}
                variant="secondary"
                onClick={() => {
                  onSave({ ...rule, actions: [...rule.actions, defaultAction(t)] });
                  setAddAct(false);
                }}
              >
                {NOTE_ACTION_NAMES[t]}
              </Button>
            ))}
          </div>
        </Sheet>
      )}
      {picker && <PlayerPicker {...picker} onClose={() => setPicker(null)} />}
      {renaming && <RenameSheet value={rule.name} onClose={() => setRenaming(false)} onSave={(name) => onSave({ ...rule, name })} />}
    </Screen>
  );
}

type RefButton = (ref: PlayerRef, where: "pitch" | "bench", picks: AutoPick[], onPick: (r: PlayerRef) => void) => React.ReactNode;

function ConditionFields({ c, onChange, refButton }: { c: NoteCondition; onChange: (c: NoteCondition) => void; refButton: RefButton }) {
  switch (c.type) {
    case "minuteFrom":
      return <Stepper value={c.minute} min={0} max={115} step={5} unit="分以降" onChange={(minute) => onChange({ ...c, minute })} />;
    case "minutesLeft":
      return (
        <span className="flex items-center gap-1 text-[0.75rem] text-text-2">
          残り <Stepper value={c.minutes} min={1} max={40} unit="分" onChange={(minutes) => onChange({ ...c, minutes })} />
        </span>
      );
    case "score":
      return (
        <div className="flex flex-col gap-1">
          <Segmented options={["lead", "draw", "behind"] as const} value={c.state} onChange={(state) => onChange({ ...c, state, by: state === "draw" ? 0 : Math.max(1, c.by) })} labels={{ lead: "リード", draw: "同点", behind: "ビハインド" }} />
          {c.state !== "draw" && <Stepper value={c.by} min={1} max={5} unit="点以上" onChange={(by) => onChange({ ...c, by })} />}
        </div>
      );
    case "stamina":
      return (
        <div className="flex flex-wrap items-center gap-1 text-[0.75rem] text-text-2">
          {refButton(c.target, "pitch", ["lowestStamina", "goalkeeperOnPitch"], (target) => onChange({ ...c, target }))}
          のスタミナが
          <Stepper value={c.below} min={10} max={90} step={5} unit="%未満" onChange={(below) => onChange({ ...c, below })} />
        </div>
      );
    case "booked":
      return <div className="flex flex-wrap items-center gap-1 text-[0.75rem] text-text-2">{refButton(c.target, "pitch", ["bookedPlayer"], (target) => onChange({ ...c, target }))}がイエローを受けている</div>;
    case "injured":
      return <div className="flex flex-wrap items-center gap-1 text-[0.75rem] text-text-2">{refButton(c.target, "pitch", ["injuredPlayer"], (target) => onChange({ ...c, target }))}がケガ</div>;
    case "subsLeft":
      return (
        <span className="flex items-center gap-1 text-[0.75rem] text-text-2">
          交代枠が <Stepper value={c.atLeast} min={1} max={5} unit="人以上" onChange={(atLeast) => onChange({ ...c, atLeast })} />
        </span>
      );
    case "competition":
      return (
        <div className="flex flex-wrap gap-1">
          {(Object.keys(MATCH_KIND_NAMES) as MatchKind[]).map((k) => {
            const on = c.kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const kinds = on ? c.kinds.filter((x) => x !== k) : [...c.kinds, k];
                  if (kinds.length) onChange({ ...c, kinds });
                }}
                className={`pressable inline-flex min-h-9 items-center gap-1 px-2 text-[0.75rem] font-bold ${pickCls(on)}`}
              >
                {on && <Icon name="check" size={12} />}
                {MATCH_KIND_NAMES[k]}
              </button>
            );
          })}
        </div>
      );
  }
}

const TACTIC_OPTIONS = {
  attack: ["attacking", "balanced", "defensive"],
  buildUp: ["buildUp", "long"],
  press: ["high", "mid", "low"],
  line: ["high", "low"],
} as const;

function ActionFields({ a, formation, onChange, refButton }: { a: NoteAction; formation: FormationId; onChange: (a: NoteAction) => void; refButton: RefButton }) {
  switch (a.type) {
    case "sub":
      return (
        <div className="flex flex-wrap items-center gap-1 text-[0.75rem] text-text-2">
          {refButton(a.out, "pitch", PITCH_PICKS, (out) => onChange({ ...a, out }))}
          を下げて
          {refButton(a.in, "bench", BENCH_PICKS, (inRef) => onChange({ ...a, in: inRef }))}
          を入れる
        </div>
      );
    case "formation":
      return (
        <div className="grid grid-cols-5 gap-0.5">
          {FORMATION_IDS.map((f) => (
            <button key={f} type="button" aria-pressed={a.formation === f} onClick={() => onChange({ ...a, formation: f })} className={`font-num pressable min-h-9 text-[0.75rem] font-bold ${pickCls(a.formation === f)}`}>
              {f}
            </button>
          ))}
        </div>
      );
    case "tactics":
      return (
        <div className="flex flex-col gap-1">
          {(Object.keys(TACTIC_OPTIONS) as (keyof Tactics)[]).map((k) => (
            <div key={k} className="flex flex-col">
              <span className="text-[0.6875rem] font-bold text-text-3">{TACTICS_ITEM_NAMES[k]}</span>
              <Segmented
                options={["keep", ...TACTIC_OPTIONS[k]] as readonly string[]}
                value={a.change[k] ?? "keep"}
                onChange={(v) => {
                  const change = { ...a.change } as Record<string, string>;
                  if (v === "keep") delete change[k];
                  else change[k] = v;
                  onChange({ ...a, change: change as Partial<Tactics> });
                }}
                labels={{ keep: "変えない", ...(TACTICS_LABELS[k] as Record<string, string>) }}
              />
            </div>
          ))}
        </div>
      );
    case "position":
      return (
        <div className="flex flex-col gap-1 text-[0.75rem] text-text-2">
          <div className="flex items-center gap-1">{refButton(a.player, "pitch", PITCH_PICKS, (player) => onChange({ ...a, player }))}を</div>
          <div className="flex flex-wrap gap-0.5">
            {FORMATIONS[formation].map((s, i) => (
              <button key={i} type="button" aria-pressed={a.slot === i} onClick={() => onChange({ ...a, slot: i })} className={`pressable min-h-9 min-w-11 px-1 text-[0.75rem] font-bold ${pickCls(a.slot === i)}`}>
                {POSITION_NAMES[s.pos]}
              </button>
            ))}
          </div>
          <span className="text-[0.6875rem] text-text-3">
            今の基本フォーメーション（<span className="font-num">{formation}</span>）での位置：{slotLabel(formation, a.slot)}
          </span>
        </div>
      );
  }
}

/** 選手の指定：「自動で選ぶ」と部員の一覧 */
function PlayerPicker({ where, picks, onPick, onClose }: { where: "pitch" | "bench"; picks: AutoPick[]; onPick: (r: PlayerRef) => void; onClose: () => void }) {
  const game = useGameStore((s) => s.game)!;
  const school = playerSchool(game);
  const players = school.players.filter((p) => p.status === "active");
  const pick = (r: PlayerRef) => {
    onPick(r);
    onClose();
  };
  return (
    <Sheet title={where === "pitch" ? "ピッチにいる選手" : "控えの選手"} onClose={onClose} wide>
      <div className="flex gap-3">
        <div className="flex w-[12rem] shrink-0 flex-col gap-1">
          <Label>試合中に自動で選ぶ</Label>
          {picks.map((p) => (
            <Button key={p} variant="secondary" onClick={() => pick({ kind: "auto", pick: p })}>
              {AUTO_PICK_NAMES[p]}
            </Button>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <Label>選手を指定する</Label>
          <p className="mb-1 text-[0.75rem] text-text-3">{where === "pitch" ? "その選手がピッチにいるときだけ発動します。" : "その選手が控えにいるときだけ発動します。"}</p>
          <ul className="grid grid-cols-2 gap-x-2">
            {players.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pick({ kind: "player", id: p.id })} className="pressable flex min-h-11 w-full items-center gap-2 border-b border-line text-left">
                  <PlayerFace look={p.look} size={28} kit={school.kits?.first} />
                  <span className="w-8 shrink-0 text-[0.6875rem] font-black text-yellow">{POSITION_NAMES[p.mainPosition]}</span>
                  <span className="min-w-0 flex-1 truncate text-[0.875rem] font-bold text-text">{p.name}</span>
                  <span className="font-num shrink-0 text-[0.75rem] text-text-3">{p.grade}年</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}
