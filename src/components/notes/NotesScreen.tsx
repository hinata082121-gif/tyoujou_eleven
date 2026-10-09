"use client";

import { useState } from "react";
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
import { Button, Header, Segmented, Sheet } from "../ui";

/** 作戦ノートの画面（一覧 → ノート → ルール） */
export function NotesScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const touch = useGameStore((s) => s.touch);
  const setNotesOpen = useGameStore((s) => s.setNotesOpen);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TacticsNote | null>(null);
  const note = game.notes.find((n) => n.id === editing);

  if (note) return <NoteEditor note={note} onBack={() => setEditing(null)} />;

  const create = (fromTemplates: boolean) => {
    const n = addNote(game, `ノート${game.notes.length + 1}`, fromTemplates);
    setCreating(false);
    if (n) {
      touch();
      setEditing(n.id);
    }
  };

  return (
    <main className="flex flex-1 flex-col">
      <Header title="作戦ノート" onBack={() => setNotesOpen(false)} />
      <div className="flex flex-col gap-3 p-3">
        <p className="text-xs text-gray-600">「もし〜なら〜する」というルールを書いておくと、観戦中に自動で采配します。試合前の画面で使うノートを選びます。</p>
        <ul className="flex flex-col gap-2">
          {game.notes.map((n, i) => (
            <li key={n.id} className="flex items-center gap-2 rounded-xl border border-gray-200 p-3">
              <span className="text-xs font-black text-pitch-dark">ノート{i + 1}</span>
              <span className="flex-1 truncate text-sm font-bold">「{n.name}」</span>
              <span className="text-xs text-gray-500">{n.rules.length}ルール</span>
              <Button variant="secondary" className="!min-h-9 !px-3 !text-xs" onClick={() => setEditing(n.id)}>
                編集
              </Button>
              <button type="button" className="min-h-9 min-w-9 text-gray-400" aria-label="ノートを削除" onClick={() => setDeleting(n)}>
                🗑
              </button>
            </li>
          ))}
        </ul>
        {canAddNote(game) && (
          <button type="button" onClick={() => setCreating(true)} className="min-h-12 rounded-xl border border-dashed border-gray-300 text-sm text-gray-600">
            ＋ 新しいノート（あと{NOTE_LIMITS.notes - game.notes.length}冊）
          </button>
        )}
      </div>
      {creating && (
        <Sheet title="新しいノート" onClose={() => setCreating(false)}>
          <div className="flex flex-col gap-2">
            <Button onClick={() => create(true)}>テンプレート 4 つ入りで作る</Button>
            <p className="text-[11px] text-gray-500">{NOTE_TEMPLATE_IDS.map((t) => NOTE_TEMPLATE_NAMES[t]).join("・")}が入ります。あとから変えられます。</p>
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
                setDeleting(null);
                touch();
              }}
            >
              削除する
            </Button>
          </div>
        </Sheet>
      )}
    </main>
  );
}

function useNameOf() {
  const game = useGameStore((s) => s.game)!;
  const players = playerSchool(game).players;
  return (id: string) => players.find((p) => p.id === id && p.status === "active")?.name;
}

/** ノートの中身：ルールの並び＝優先順位 */
function NoteEditor({ note, onBack }: { note: TacticsNote; onBack: () => void }) {
  const game = useGameStore((s) => s.game)!;
  const touch = useGameStore((s) => s.touch);
  const nameOf = useNameOf();
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [templates, setTemplates] = useState(false);
  const [menu, setMenu] = useState<NoteRule | null>(null);
  const [renaming, setRenaming] = useState(false);
  const squad = new Set(playerSchool(game).players.filter((p) => p.status === "active").map((p) => p.id));
  const formation = playerSchool(game).formation;

  const save = (n: TacticsNote) => {
    saveNote(game, n);
    touch();
  };
  const rule = note.rules.find((r) => r.id === ruleId);
  if (rule)
    return (
      <RuleEditor
        rule={rule}
        onBack={() => setRuleId(null)}
        onSave={(r) => save({ ...note, rules: note.rules.map((x) => (x.id === r.id ? r : x)) })}
      />
    );

  const add = (template?: (typeof NOTE_TEMPLATE_IDS)[number]) => {
    const r = newRule(game, template);
    save({ ...note, rules: [...note.rules, r] });
    setTemplates(false);
    if (!template) setRuleId(r.id);
  };

  return (
    <main className="flex flex-1 flex-col">
      <Header
        title={`「${note.name}」`}
        onBack={onBack}
        right={
          <button type="button" className="min-h-11 rounded-lg px-2 text-xs font-bold" onClick={() => setRenaming(true)}>
            名前
          </button>
        }
      />
      <div className="flex flex-col gap-2 p-3 pb-28">
        <p className="text-[11px] text-gray-500">上にあるルールほど優先します（交代枠が足りないときは上から実行）。1つのルールは1試合1回だけ発動します。</p>
        <ol className="flex flex-col gap-2">
          {note.rules.map((r, i) => {
            const problem = ruleProblem(r, squad);
            return (
              <li key={r.id} className={`rounded-xl border p-2 ${r.enabled && !problem ? "border-gray-200" : "border-gray-200 bg-gray-50"}`}>
                <div className="flex items-center gap-1">
                  <span className="w-5 text-center text-sm font-black text-pitch-dark">{i + 1}</span>
                  <button type="button" onClick={() => setRuleId(r.id)} className="min-h-10 flex-1 truncate text-left text-sm font-bold">
                    {r.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => save({ ...note, rules: note.rules.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)) })}
                    className={`min-h-9 rounded-full px-3 text-xs font-black ${r.enabled ? "bg-pitch text-white" : "bg-gray-200 text-gray-500"}`}
                  >
                    {r.enabled ? "ON" : "OFF"}
                  </button>
                  <button type="button" className="min-h-9 min-w-8 text-gray-500 disabled:opacity-30" disabled={i === 0} onClick={() => save(moveRule(note, r.id, -1))} aria-label="上へ">
                    ▲
                  </button>
                  <button
                    type="button"
                    className="min-h-9 min-w-8 text-gray-500 disabled:opacity-30"
                    disabled={i === note.rules.length - 1}
                    onClick={() => save(moveRule(note, r.id, 1))}
                    aria-label="下へ"
                  >
                    ▼
                  </button>
                  <button type="button" className="min-h-9 min-w-8 text-gray-500" onClick={() => setMenu(r)} aria-label="ほかの操作">
                    …
                  </button>
                </div>
                <button type="button" onClick={() => setRuleId(r.id)} className="block w-full pl-6 text-left text-[11px] leading-snug text-gray-600">
                  {describeRule(r, nameOf, formation)}
                </button>
                {problem && <p className="pl-6 text-[11px] font-bold text-red-600">{problem}（このルールは発動しません）</p>}
              </li>
            );
          })}
          {note.rules.length === 0 && <li className="text-sm text-gray-500">ルールがありません。下のボタンから追加します。</li>}
        </ol>
      </div>
      <div className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-[430px] -translate-x-1/2 grid-cols-2 gap-2 border-t border-gray-200 bg-white p-3">
        <Button variant="secondary" disabled={!canAddRule(note)} onClick={() => add()}>
          ＋ ルールを追加
        </Button>
        <Button variant="secondary" disabled={!canAddRule(note)} onClick={() => setTemplates(true)}>
          テンプレートから
        </Button>
      </div>
      {templates && (
        <Sheet title="テンプレートから追加" onClose={() => setTemplates(false)}>
          <div className="flex flex-col gap-2">
            {NOTE_TEMPLATE_IDS.map((t) => (
              <button key={t} type="button" onClick={() => add(t)} className="rounded-xl border border-gray-200 p-3 text-left">
                <div className="text-sm font-bold">{NOTE_TEMPLATE_NAMES[t]}</div>
                <div className="text-[11px] text-gray-600">{describeRule(templatePreviews[t], nameOf, formation)}</div>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <div className="flex flex-col gap-2">
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
    </main>
  );
}

/** テンプレートの説明を出すための見本（ID は使わない） */
const templatePreviews = Object.fromEntries(NOTE_TEMPLATE_IDS.map((t) => [t, templateRule(t, "preview")])) as Record<(typeof NOTE_TEMPLATE_IDS)[number], NoteRule>;

function RenameSheet({ value, onClose, onSave }: { value: string; onClose: () => void; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Sheet title="名前を変える" onClose={onClose}>
      <input
        className="mb-3 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base"
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
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className="min-h-9 min-w-9 rounded-lg bg-gray-100 font-black disabled:opacity-40" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="w-8 text-center font-mono text-sm font-bold">{value}</span>
      <button type="button" className="min-h-9 min-w-9 rounded-lg bg-gray-100 font-black disabled:opacity-40" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        ＋
      </button>
      {unit && <span className="text-xs">{unit}</span>}
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
    <button type="button" onClick={() => setPicker({ where, picks, onPick })} className="min-h-9 rounded-lg border border-pitch/40 bg-white px-2 text-left text-xs font-bold text-pitch-dark">
      {describeRef(ref, nameOf)} ▾
    </button>
  );

  return (
    <main className="flex flex-1 flex-col">
      <Header
        title={`ルール「${rule.name}」`}
        onBack={onBack}
        right={
          <button type="button" className="min-h-11 rounded-lg px-2 text-xs font-bold" onClick={() => setRenaming(true)}>
            名前
          </button>
        }
      />
      <div className="flex flex-col gap-3 p-3 pb-8">
        <p className="rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-900">{describeRule(rule, nameOf, formation)}</p>

        <section>
          <h2 className="mb-1 text-sm font-black">もし（すべて満たしたら）</h2>
          <ul className="flex flex-col gap-1.5">
            {rule.conditions.map((c, i) => (
              <li key={i} className="flex items-start gap-1 rounded-lg border border-gray-200 p-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-gray-500">{NOTE_CONDITION_NAMES[c.type]}</span>
                  <ConditionFields c={c} onChange={(x) => setCond(i, x)} refButton={refButton} />
                </div>
                <button type="button" className="min-h-9 min-w-9 text-gray-400" aria-label="条件を消す" onClick={() => onSave({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setAddCond(true)} className="mt-1.5 min-h-10 w-full rounded-lg border border-dashed border-gray-300 text-xs text-gray-600">
            ＋ 条件を追加
          </button>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-black">なら（上から順に実行）</h2>
          <ul className="flex flex-col gap-1.5">
            {rule.actions.map((a, i) => (
              <li key={i} className="flex items-start gap-1 rounded-lg border border-gray-200 p-2">
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-gray-500">{NOTE_ACTION_NAMES[a.type]}</span>
                  <ActionFields a={a} formation={formation} onChange={(x) => setAct(i, x)} refButton={refButton} />
                </div>
                <div className="flex flex-col">
                  <button type="button" className="min-h-8 min-w-9 text-gray-400" aria-label="行動を消す" onClick={() => onSave({ ...rule, actions: rule.actions.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                  <button type="button" className="min-h-8 min-w-9 text-gray-500 disabled:opacity-30" disabled={i === 0} onClick={() => moveAct(i, -1)} aria-label="上へ">
                    ▲
                  </button>
                  <button type="button" className="min-h-8 min-w-9 text-gray-500 disabled:opacity-30" disabled={i === rule.actions.length - 1} onClick={() => moveAct(i, 1)} aria-label="下へ">
                    ▼
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setAddAct(true)} className="mt-1.5 min-h-10 w-full rounded-lg border border-dashed border-gray-300 text-xs text-gray-600">
            ＋ 行動を追加
          </button>
        </section>

        <p className="text-[11px] text-gray-500">試合中の速報：「作戦ノート：{rule.name}を実行」</p>
        <Button onClick={onBack}>ノートに戻る</Button>
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
    </main>
  );
}

type RefButton = (ref: PlayerRef, where: "pitch" | "bench", picks: AutoPick[], onPick: (r: PlayerRef) => void) => React.ReactNode;

function ConditionFields({ c, onChange, refButton }: { c: NoteCondition; onChange: (c: NoteCondition) => void; refButton: RefButton }) {
  switch (c.type) {
    case "minuteFrom":
      return <Stepper value={c.minute} min={0} max={115} step={5} unit="分以降" onChange={(minute) => onChange({ ...c, minute })} />;
    case "minutesLeft":
      return (
        <span className="flex items-center gap-1 text-xs">
          残り <Stepper value={c.minutes} min={1} max={40} unit="分" onChange={(minutes) => onChange({ ...c, minutes })} />
        </span>
      );
    case "score":
      return (
        <div className="flex flex-col gap-1.5">
          <Segmented options={["lead", "draw", "behind"] as const} value={c.state} onChange={(state) => onChange({ ...c, state, by: state === "draw" ? 0 : Math.max(1, c.by) })} labels={{ lead: "リード", draw: "同点", behind: "ビハインド" }} />
          {c.state !== "draw" && <Stepper value={c.by} min={1} max={5} unit="点以上" onChange={(by) => onChange({ ...c, by })} />}
        </div>
      );
    case "stamina":
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {refButton(c.target, "pitch", ["lowestStamina", "goalkeeperOnPitch"], (target) => onChange({ ...c, target }))}
          のスタミナが
          <Stepper value={c.below} min={10} max={90} step={5} unit="%未満" onChange={(below) => onChange({ ...c, below })} />
        </div>
      );
    case "booked":
      return <div className="flex items-center gap-1.5 text-xs">{refButton(c.target, "pitch", ["bookedPlayer"], (target) => onChange({ ...c, target }))}がイエローを受けている</div>;
    case "injured":
      return <div className="flex items-center gap-1.5 text-xs">{refButton(c.target, "pitch", ["injuredPlayer"], (target) => onChange({ ...c, target }))}がケガ</div>;
    case "subsLeft":
      return (
        <span className="flex items-center gap-1 text-xs">
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
                onClick={() => {
                  const kinds = on ? c.kinds.filter((x) => x !== k) : [...c.kinds, k];
                  if (kinds.length) onChange({ ...c, kinds });
                }}
                className={`min-h-9 rounded-full px-3 text-xs font-bold ${on ? "bg-pitch text-white" : "bg-gray-100 text-gray-600"}`}
              >
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
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {refButton(a.out, "pitch", PITCH_PICKS, (out) => onChange({ ...a, out }))}
          を下げて
          {refButton(a.in, "bench", BENCH_PICKS, (inRef) => onChange({ ...a, in: inRef }))}
          を入れる
        </div>
      );
    case "formation":
      return (
        <div className="grid grid-cols-5 gap-1">
          {FORMATION_IDS.map((f) => (
            <button key={f} type="button" onClick={() => onChange({ ...a, formation: f })} className={`min-h-9 rounded-lg text-xs font-bold ${a.formation === f ? "bg-pitch text-white" : "bg-gray-100"}`}>
              {f}
            </button>
          ))}
        </div>
      );
    case "tactics":
      return (
        <div className="flex flex-col gap-1">
          {(Object.keys(TACTIC_OPTIONS) as (keyof Tactics)[]).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] font-bold text-gray-600">{TACTICS_ITEM_NAMES[k]}</span>
              <div className="flex-1">
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
            </div>
          ))}
        </div>
      );
    case "position":
      return (
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex items-center gap-1.5">{refButton(a.player, "pitch", PITCH_PICKS, (player) => onChange({ ...a, player }))}を</div>
          <div className="flex flex-wrap gap-1">
            {FORMATIONS[formation].map((s, i) => (
              <button key={i} type="button" onClick={() => onChange({ ...a, slot: i })} className={`min-h-9 min-w-11 rounded-lg px-1 text-[11px] font-bold ${a.slot === i ? "bg-pitch text-white" : "bg-gray-100"}`}>
                {POSITION_NAMES[s.pos]}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-gray-500">今の基本フォーメーション（{formation}）での位置：{slotLabel(formation, a.slot)}</span>
        </div>
      );
  }
}

/** 選手の指定：「自動で選ぶ」と部員の一覧 */
function PlayerPicker({ where, picks, onPick, onClose }: { where: "pitch" | "bench"; picks: AutoPick[]; onPick: (r: PlayerRef) => void; onClose: () => void }) {
  const game = useGameStore((s) => s.game)!;
  const players = playerSchool(game).players.filter((p) => p.status === "active");
  const pick = (r: PlayerRef) => {
    onPick(r);
    onClose();
  };
  return (
    <Sheet title={where === "pitch" ? "ピッチにいる選手" : "控えの選手"} onClose={onClose}>
      <h3 className="mb-1 text-xs font-black text-gray-600">試合中に自動で選ぶ</h3>
      <div className="mb-3 flex flex-col gap-1">
        {picks.map((p) => (
          <Button key={p} variant="secondary" onClick={() => pick({ kind: "auto", pick: p })}>
            {AUTO_PICK_NAMES[p]}
          </Button>
        ))}
      </div>
      <h3 className="mb-1 text-xs font-black text-gray-600">選手を指定する</h3>
      <p className="mb-1 text-[10px] text-gray-500">{where === "pitch" ? "その選手がピッチにいるときだけ発動します。" : "その選手が控えにいるときだけ発動します。"}</p>
      <ul className="flex flex-col divide-y divide-gray-100">
        {players.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => pick({ kind: "player", id: p.id })} className="flex min-h-11 w-full items-center gap-2 text-left text-sm">
              <span className="w-9 text-[11px] font-black text-pitch-dark">{POSITION_NAMES[p.mainPosition]}</span>
              <span className="flex-1 truncate font-bold">{p.name}</span>
              <span className="text-[11px] text-gray-500">{p.grade}年</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

