"use client";

/**
 * 性格・プレースタイル・特殊能力の表示部品（SPEC 7.5〜7.7、PLAN 7章）。
 * 特殊能力のチップは斜めに切った札。色：○＝緑、◎＝青、金色＝金色の地に明るい縁取り、×＝暗い地（DESIGN.md）。
 */
import { useState } from "react";
import {
  LEGEND_SKILL_NAME,
  MOVEMENT_NAMES,
  PERSONALITY_NAMES,
  PLAY_STYLE_NAMES,
  PLAY_STYLE_TEXTS,
  POSITION_NAMES,
  PRACTICE_NAMES,
  SKILL_HINTS,
  SKILL_NAMES,
  SKILL_TEXTS,
} from "@/engine/config/names";
import { PERSONALITY_SKILLS, PERSONALITY_STYLES } from "@/engine/config/personality";
import { PLAY_STYLE_DEFS, STYLE_GROUP_POSITIONS } from "@/engine/config/playStyle";
import { SKILL_DEFS } from "@/engine/config/skills";
import { styleOptions } from "@/engine/player/traits";
import { PERSONALITIES, PLAY_STYLES, type Player, type PlayStyle, type SkillId, type StyleGroup } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Bar, Button, Sheet } from "../ui";

/** 段階ごとのチップの色 */
export function skillChipClass(id: SkillId): string {
  switch (SKILL_DEFS[id].tier) {
    case "minus":
      return "bg-panel-3 text-text-2 border border-line-2";
    case "double":
      return "bg-skill-double text-ink";
    case "gold":
      return "bg-gold text-ink border-2 border-gold-2";
    default:
      return "bg-skill-plus text-ink";
  }
}

export function SkillChip({ id, faded, onClick }: { id: SkillId; faded?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable cut-r min-h-8 pl-2 pr-4 text-[0.75rem] font-black ${skillChipClass(id)} ${faded ? "opacity-40" : ""}`}
      title={SKILL_NAMES[id]}
    >
      {SKILL_NAMES[id]}
    </button>
  );
}

/** 説明の文（系統は系統の説明） */
export function skillText(id: SkillId): string {
  const line = SKILL_DEFS[id].line;
  return (line ? SKILL_TEXTS[line] : SKILL_TEXTS[id]) ?? "";
}

export function skillHint(id: SkillId): string {
  const line = SKILL_DEFS[id].line;
  return (line ? SKILL_HINTS[line] : SKILL_HINTS[id]) ?? "";
}

/** 相性の良いスタイルと性格 */
export function skillAffinity(id: SkillId): { styles: PlayStyle[]; personalities: string[] } {
  return {
    styles: PLAY_STYLES.filter((s) => PLAY_STYLE_DEFS[s].skillAffinity.includes(id)),
    personalities: PERSONALITIES.filter((k) => PERSONALITY_SKILLS[k].includes(id)).map((k) => PERSONALITY_NAMES[k]),
  };
}

/** 特殊能力の説明（下から出す） */
export function SkillSheet({ id, onClose, note }: { id: SkillId; onClose: () => void; note?: string }) {
  const def = SKILL_DEFS[id];
  const aff = skillAffinity(id);
  return (
    <Sheet onClose={onClose}>
      <div className="mb-2 flex items-center gap-2">
        <SkillChip id={id} />
        {def.tier === "gold" && <span className="text-[0.75rem] font-bold text-gold-2">{LEGEND_SKILL_NAME}</span>}
      </div>
      <p className="mb-2 text-[0.875rem] leading-relaxed">{skillText(id)}</p>
      {note && <p className="mb-2 text-[0.75rem] text-warn">{note}</p>}
      <p className="mb-1 text-[0.75rem] text-text-2">入手：{skillHint(id) || "—"}</p>
      {aff.styles.length > 0 && <p className="mb-1 text-[0.75rem] text-text-2">身につけやすいスタイル：{aff.styles.map((s) => PLAY_STYLE_NAMES[s]).join("・")}</p>}
      {aff.personalities.length > 0 && <p className="mb-1 text-[0.75rem] text-text-2">身につけやすい性格：{aff.personalities.join("・")}</p>}
      <Button variant="secondary" className="mt-2 w-full" onClick={onClose}>
        閉じる
      </Button>
    </Sheet>
  );
}

/** 熟練度のバー */
export function ProficiencyBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.75rem] font-bold text-text-3">熟練度</span>
      <Bar value={value} color="bg-teal" className="flex-1" />
      <span className="font-num w-8 text-right text-[0.875rem]">{Math.floor(value)}</span>
    </div>
  );
}

const GROUP_LABEL: Record<StyleGroup, string> = { FW: "FW", MF: "MF", DF: "DF", GK: "GK" };

/** スタイルを変えるシート。区分ごとに並べ、決める前に熟練度が 0 に戻ることを確認する */
export function StyleChangeSheet({ player, onClose }: { player: Player; onClose: () => void }) {
  const setPlayStyle = useGameStore((s) => s.setPlayStyle);
  const [pick, setPick] = useState<PlayStyle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = styleOptions(player);
  // 複数の区分に入るスタイル（ウイングドリブラーなど）は、最初の区分にだけ並べる
  const seen = new Set<PlayStyle>();
  const groups = (["FW", "MF", "DF", "GK"] as StyleGroup[])
    .map((g) => ({ g, styles: options.filter((s) => PLAY_STYLE_DEFS[s].groups.includes(g) && !seen.has(s) && (seen.add(s), true)) }))
    .filter((x) => x.styles.length > 0);
  const easy = PERSONALITY_STYLES[player.personality];
  if (pick)
    return (
      <Sheet onClose={() => setPick(null)} title="スタイルを変える">
        <p className="mb-2 text-[0.875rem]">
          {player.name}のスタイルを「{PLAY_STYLE_NAMES[pick]}」に変えます。
        </p>
        <p className="mb-3 border-l-4 border-yellow bg-panel-2 p-2 text-[0.875rem] font-bold text-warn">熟練度が 0 に戻ります（今 {Math.floor(player.styleProficiency)}）。</p>
        {error && <p className="mb-2 text-[0.75rem] text-bad">{error}</p>}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setPick(null)}>
            やめる
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              const err = setPlayStyle(player.id, pick);
              if (err) setError(err);
              else onClose();
            }}
          >
            変える
          </Button>
        </div>
      </Sheet>
    );
  return (
    <Sheet onClose={onClose} title="スタイルを変える">
      <p className="mb-2 text-[0.75rem] text-text-2">
        主ポジションと、適性○以上のポジションのスタイルから選べます。今いる枠のポジションに合わないスタイルは、試合では効果が出ません。
      </p>
      {groups.map(({ g, styles }) => (
        <section key={g} className="mb-3">
          <h3 className="mb-1 text-[0.75rem] font-black text-yellow">
            {GROUP_LABEL[g]}（{STYLE_GROUP_POSITIONS[g].map((p) => POSITION_NAMES[p]).join("・")}）
          </h3>
          <ul className="flex flex-col gap-1">
            {styles.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  disabled={s === player.playStyle}
                  onClick={() => setPick(s)}
                  className={`pressable w-full border-l-4 p-2 text-left ${s === player.playStyle ? "border-yellow bg-panel-3" : "border-line-2 bg-panel-2"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.875rem] font-bold">{PLAY_STYLE_NAMES[s]}</span>
                    <span className="bg-panel px-1 text-[0.6875rem] text-text-2">{MOVEMENT_NAMES[PLAY_STYLE_DEFS[s].movement]}</span>
                    {easy.includes(s) && <span className="bg-skill-plus px-1 text-[0.6875rem] font-bold text-ink">伸ばしやすい</span>}
                    {s === player.playStyle && <span className="ml-auto text-[0.6875rem] font-bold text-yellow">今のスタイル</span>}
                  </div>
                  <p className="mt-0.5 text-[0.75rem] text-text-2">{PLAY_STYLE_TEXTS[s]}</p>
                  <p className="text-[0.6875rem] text-text-3">熟練度が上がる練習：{PLAY_STYLE_DEFS[s].practices.map((k) => PRACTICE_NAMES[k]).join("・")}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Button variant="secondary" className="w-full" onClick={onClose}>
        閉じる
      </Button>
    </Sheet>
  );
}
