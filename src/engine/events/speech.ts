/**
 * すごろくのイベントに、せりふを足す（R2。PHASE_R2_PLAN 5.3）。
 * 表示だけ：乱数を使わず、ゲームの状態も変えない（出来事の lines を足すだけ）。
 * 語りの文は出来事の文章を残し（特殊能力の結果は結果の札で見せるので、地の文からは外す）、そのあと人物のせりふを並べる。
 */
import { SKILL_NAMES } from "../config/names";
import { EVENT_LINES, type EventLineDef } from "../config/eventLines";
import { PERSONALITY_SPEECH, type Lines } from "../config/speech";
import { playerSchool } from "../season";
import type { GameState, Player } from "../types";
import { learnText, type CastRef, type EventOutcome, type SceneLine } from ".";

const surname = (name: string) => name.split(" ")[0];
const say = (p: Player, lines: Lines) => lines[PERSONALITY_SPEECH[p.personality]];
const pref = (p: Player): CastRef => ({ kind: "player", id: p.id });

/** 地の文：出来事の文章から、身についた・つかなかったの一文を外したもの */
function narrationOf(o: EventOutcome, def: EventLineDef): string {
  let t = o.text;
  if (o.learned && o.learned.length > 0) t = t.replace(`${learnText(o.learned)}。`, "");
  t = t.replace("今回は身につかなかった。", "").replace("今回は変化がなかった。", "").trim();
  if (!t) return def.narration ?? o.title;
  if (o.kind === "donation") return `${def.narration ?? ""}${t}`;
  if (o.kind === "pepTalk" || o.kind === "training") return t;
  return def.narration ?? t;
}

/** 出来事にせりふを足す（せりふの決まりが無い出来事・すでにせりふのある出来事はそのまま） */
export function addEventLines(state: GameState, o: EventOutcome): EventOutcome {
  if (o.lines || !o.kind) return o;
  const fix = o.kind === "staffTeach" && (o.learned?.some((l) => l.kind === "remove") || o.text.includes("癖を直そう"));
  const def = EVENT_LINES[fix ? "staffFix" : o.kind];
  if (!def) return o;
  const school = playerSchool(state);
  const active = school.players.filter((p) => p.status === "active");
  const player = (id: string) => school.players.find((p) => p.id === id);
  const captain = active.find((p) => p.id === school.captainId) ?? active[0];
  const cast = o.cast ?? [];
  const lines: SceneLine[] = [{ speaker: null, text: narrationOf(o, def) }];

  // 教えた人と、対象の部員
  const mentorRef = def.speaker === "mentor" && cast[0] && (cast[0].kind !== "player" || o.kind === "seniorTeach") ? cast[0] : undefined;
  const targetRefs = cast.filter((r) => r !== mentorRef && r.kind === "player");
  const target = targetRefs.map((r) => player(r.id)).find((p): p is Player => !!p);
  const learnedOf = (p: Player | undefined) => (p ? o.learned?.find((l) => l.playerId === p.id) : undefined);
  const fill = (text: string, p?: Player) => {
    const l = learnedOf(p);
    return text
      .replace(/\{skill\}/g, l ? SKILL_NAMES[l.skill] : "")
      .replace(/\{junior\}/g, target ? surname(target.name) : "")
      .replace(/\{senior\}/g, mentorRef ? surname(player(mentorRef.id)?.name ?? "") : "");
  };
  /** 対象の部員の答え（身についたか・つかなかったかで変える） */
  const answer = (p: Player): string => {
    const l = learnedOf(p);
    if (o.kind === "badHabit") return say(p, l ? def.lines : (def.missed ?? def.lines));
    if (l && def.learned) return fill(say(p, def.learned), p);
    if (!l && def.missed) return fill(say(p, def.missed), p);
    return fill(say(p, def.lines), p);
  };

  if (def.speaker === "mentor" && mentorRef) {
    if (mentorRef.kind === "player") {
      const s = player(mentorRef.id);
      if (s) lines.push({ speaker: mentorRef, text: fill(say(s, def.lines), s) });
    } else if (def.adult) {
      const role = mentorRef.kind === "staff" ? state.staff.members.find((m) => m.id === mentorRef.id)?.role : undefined;
      lines.push({ speaker: mentorRef, text: def.adult[role ?? "ob"] });
    }
    if (target) lines.push({ speaker: pref(target), text: answer(target) });
  } else if (def.speaker === "captain" || !target) {
    if (captain) lines.push({ speaker: pref(captain), text: o.kind === "training" ? say(captain, def.missed ?? def.lines) : say(captain, def.lines) });
  } else {
    lines.push({ speaker: pref(target), text: answer(target) });
  }
  o.lines = lines;
  return o;
}
