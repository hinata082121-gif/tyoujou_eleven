"use client";

import { useState } from "react";
import { CAREER_NAMES, POSITION_NAMES, ROLE_NAMES, STAFF_ABILITY_NAMES, TEMP_COACH_LABEL, yearLabel } from "@/engine/config/names";
import { ROLE_ABILITIES } from "@/engine/config/staff";
import { statRank } from "@/engine/player/rank";
import { alumnusAge, hasVacancy, isStaffWindow, staffByRole, staffCandidates, staffOverSlots, staffSlots, type Availability } from "@/engine/staff";
import { abilityGrade, bestRole, staffComment } from "@/engine/staff/comment";
import { COMMON_STATS, FIELD_STATS, GK_STATS, STAFF_ABILITIES, STAFF_ROLES, type Alumnus, type StaffAbilities, type StaffMember, type StaffRole } from "@/engine/types";
import { generateKits } from "@/engine/look";
import { staffAppearance } from "@/engine/look/staff";
import { playerSchool } from "@/engine/season";
import { useGameStore } from "@/store/gameStore";
import { Icon } from "../icons";
import { casualColor } from "../look/casual";
import { PlayerFace, StaffFigure } from "../look/Figure";
import { Bar, Button, Label, RankBadge, Screen, Sheet } from "../ui";
import { statLabel } from "../play/format";

/** 能力の一覧。役割に効く能力を強調し、残りは薄く出す */
export function StaffAbilityList({ abilities, role }: { abilities: StaffAbilities; role?: StaffRole }) {
  const main = role ? ROLE_ABILITIES[role] : [];
  return (
    <ul className="flex flex-col gap-0.5">
      {STAFF_ABILITIES.map((k) => {
        const strong = !role || main.includes(k);
        return (
          <li key={k} className={`flex items-center gap-2 text-[0.75rem] ${strong ? "text-text" : "text-text-3"}`}>
            <span className={`w-24 shrink-0 ${strong ? "font-bold" : ""}`}>{STAFF_ABILITY_NAMES[k]}</span>
            <Bar value={abilities[k]} color={strong ? "bg-yellow" : "bg-line-2"} className="!h-1.5" />
            <span className="font-num w-7 shrink-0 text-right text-[0.875rem]">{Math.round(abilities[k])}</span>
          </li>
        );
      })}
    </ul>
  );
}

function availabilityText(a: Availability, year: number): string {
  if (a.ok) return "今すぐ";
  if (a.fromYear) return `${a.fromYear - year}年後から`;
  return a.reason;
}

/** スタッフの一覧（部員タブの「スタッフ」・年度初めの編成で使う） */
export function StaffList() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const dismissStaff = useGameStore((s) => s.dismissStaff);
  const releaseStaff = useGameStore((s) => s.releaseStaff);
  const changeStaffRole = useGameStore((s) => s.changeStaffRole);
  const [picking, setPicking] = useState<StaffRole | null>(null);
  const [roleFor, setRoleFor] = useState<StaffMember | null>(null);
  const [confirm, setConfirm] = useState<StaffMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inWindow = isStaffWindow(game);
  const slots = staffSlots(game.reputation);
  const over = staffOverSlots(game);
  const filled = game.staff.members.filter((m) => !m.temporary).length;
  const canHire = inWindow || hasVacancy(game);

  const run = (err: string | null) => {
    setError(err);
    return !err;
  };

  const kits = playerSchool(game).kits ?? generateKits(game.seed, game.playerSchoolId);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="bg-panel/90 px-2 py-1 text-[0.75rem] text-text-2">
        スタッフ枠 <b className="font-num text-[0.875rem] text-text">{filled}/{slots}</b>（評判で増えます）。{inWindow ? "年度初めなので、入れ替え・配置換えができます。" : "年度の途中は、空いた枠への補充と解任だけできます。"}
      </p>
      {over > 0 && <p className="border-l-4 border-yellow bg-panel p-2 text-[0.75rem] font-bold text-warn">評判が下がり、枠を{over}人超えています。残さない人を「外す」で選んでください。</p>}
      <ul className="grid grid-cols-2 gap-1.5">
        {STAFF_ROLES.map((role) => {
          const m = staffByRole(game.staff, role);
          if (!m) {
            const open = canHire && filled < slots;
            return (
              <li key={role}>
                <button
                  type="button"
                  disabled={!open}
                  onClick={() => setPicking(role)}
                  className="pressable flex min-h-24 w-full items-center gap-3 border-2 border-dashed border-line-2 bg-panel/70 px-3 text-left disabled:opacity-60"
                >
                  <Icon name={open ? "plus" : "lock"} size={22} className={open ? "text-yellow" : "text-text-3"} />
                  <span>
                    <span className="block text-[0.75rem] font-black text-yellow">{ROLE_NAMES[role]}</span>
                    <span className="text-[0.8125rem] text-text-2">{open ? "空き（候補から選ぶ）" : filled >= slots ? "枠がありません" : "空き（年度初めに選べます）"}</span>
                  </span>
                </button>
              </li>
            );
          }
          const years = game.year - m.hiredYear;
          const look = staffAppearance(game, m, kits);
          return (
            <li key={m.id} className="flex gap-2 bg-panel p-2">
              <div className="flex w-20 shrink-0 items-center justify-center overflow-hidden bg-panel-2 py-1">
                <StaffFigure appearance={look} size={128} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="cut-r shrink-0 bg-telop py-px pl-1.5 pr-3 text-[0.6875rem] font-black text-ink">{ROLE_NAMES[role]}</span>
                  <span className="truncate text-[0.875rem] font-bold">{m.name}</span>
                  {m.temporary && <span className="shrink-0 bg-panel-3 px-1 text-[0.6875rem]">{TEMP_COACH_LABEL}</span>}
                </div>
                <div className="text-[0.75rem] text-text-3">
                  {look.age}歳・{years === 0 ? "今年から" : `${years + 1}年目`}
                </div>
                <p className="mb-1 text-[0.75rem] leading-snug text-text-2">{staffComment(m.abilities)}</p>
                {m.poachNotice && <p className="mb-1 bg-red-2 px-2 py-0.5 text-[0.75rem] font-bold text-white">{m.poachNotice.by === "pro" ? "プロのクラブ" : "他校"}から誘いが来ているらしい（年度末に去るかもしれない）</p>}
                <StaffAbilityList abilities={m.abilities} role={role} />
                <div className="mt-1.5 flex gap-1.5">
                  {m.temporary ? (
                    <Button variant="secondary" small className="flex-1" onClick={() => setPicking("head")}>
                      OB と入れ替える
                    </Button>
                  ) : (
                    <>
                      {inWindow && (
                        <Button variant="ghost" small className="flex-1" onClick={() => setRoleFor(m)}>
                          配置換え
                        </Button>
                      )}
                      {inWindow && (
                        <Button variant="ghost" small className="flex-1" onClick={() => setPicking(role)}>
                          入れ替える
                        </Button>
                      )}
                      {over > 0 ? (
                        <Button variant="danger" small className="flex-1" onClick={() => run(releaseStaff(m.id))}>
                          外す
                        </Button>
                      ) : (
                        <Button variant="danger" small className="flex-1" onClick={() => setConfirm(m)}>
                          解任
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="bg-panel p-2 text-[0.75rem] font-bold text-bad">{error}</p>}

      {picking && (
        <CandidateSheet
          role={picking}
          onClose={() => setPicking(null)}
          onHired={() => {
            setPicking(null);
            setError(null);
          }}
        />
      )}
      {roleFor && (
        <Sheet title={`${roleFor.name}の役割`} onClose={() => setRoleFor(null)}>
          <p className="mb-2 text-[0.8125rem] text-text-2">その役割に人がいれば、役割を入れ替えます。</p>
          <div className="grid grid-cols-2 gap-2">
            {STAFF_ROLES.map((r) => (
              <Button
                key={r}
                variant={r === roleFor.role ? "primary" : "secondary"}
                onClick={() => {
                  if (run(changeStaffRole(roleFor.id, r))) setRoleFor(null);
                }}
              >
                {ROLE_NAMES[r]}
              </Button>
            ))}
          </div>
        </Sheet>
      )}
      {confirm && (
        <Sheet title={`${confirm.name}を解任しますか？`} onClose={() => setConfirm(null)}>
          <p className="mb-3 text-[0.875rem] text-text-2">解任した人は、今年度は雇い直せません。{confirm.role === "head" && "ヘッドコーチがいなくなると、臨時コーチが入ります。"}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              やめる
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                run(dismissStaff(confirm.id));
                setConfirm(null);
              }}
            >
              解任する
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** 候補の OB 一覧（役割を決めて選ぶ） */
function CandidateSheet({ role, onClose, onHired }: { role: StaffRole; onClose: () => void; onHired: () => void }) {
  const game = useGameStore((s) => s.game)!;
  const hireStaff = useGameStore((s) => s.hireStaff);
  const [detail, setDetail] = useState<Alumnus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cands = staffCandidates(game);
  const main = ROLE_ABILITIES[role];
  const fit = (a: Alumnus) => main.reduce((s, k) => s + a.staffProfile.base[k], 0) / main.length;
  // 雇える人を先に、役割に合う順
  const list = [...cands].sort((x, y) => Number(y.availability.ok) - Number(x.availability.ok) || fit(y.alumnus) - fit(x.alumnus));

  if (detail) {
    const av = list.find((c) => c.alumnus.id === detail.id)?.availability;
    return (
      <AlumnusSheet
        alumnus={detail}
        onClose={() => setDetail(null)}
        action={
          av?.ok ? (
            <Button
              className="flex-1"
              onClick={() => {
                const err = hireStaff(detail.id, role);
                setError(err);
                if (!err) onHired();
                else setDetail(null);
              }}
            >
              {ROLE_NAMES[role]}に迎える
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <Sheet title={`${ROLE_NAMES[role]}の候補`} onClose={onClose} wide>
      <p className="mb-2 text-[0.75rem] text-text-2">
        役割に効く能力：{main.map((k) => STAFF_ABILITY_NAMES[k]).join("・")}。押すと詳しく見られます。
      </p>
      {error && <p className="mb-2 text-[0.75rem] font-bold text-bad">{error}</p>}
      <ul className="grid grid-cols-2 gap-x-3">
        {list.map(({ alumnus: a, availability }) => (
          <li key={a.id}>
            <button type="button" onClick={() => setDetail(a)} className={`pressable flex min-h-14 w-full items-center gap-2 border-b border-line py-1 text-left ${availability.ok ? "" : "opacity-60"}`}>
              <PlayerFace look={a.look} size={36} shirt={casualColor(a.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[0.875rem] font-bold">{a.name}</span>
                  <span className="shrink-0 text-[0.75rem] text-text-3">
                    {alumnusAge(a, game.year)}歳・{POSITION_NAMES[a.position]}
                  </span>
                </div>
                <div className="truncate text-[0.75rem] text-text-2">
                  {CAREER_NAMES[a.career]}・{staffComment(a.staffProfile.base)}
                </div>
              </div>
              <div className="w-16 shrink-0 text-right">
                <div className="text-[0.6875rem] text-text-3">{availabilityText(availability, game.year)}</div>
                <div className="font-num text-[1.125rem] font-bold">{Math.round(fit(a))}</div>
              </div>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-3 text-[0.875rem] text-text-3">候補の OB がいません。</li>}
      </ul>
    </Sheet>
  );
}

/** OB の詳細：現役時代の能力・在学中の成績・進路・スタッフとしての能力と寸評 */
export function AlumnusSheet({ alumnus: a, onClose, action }: { alumnus: Alumnus; onClose: () => void; action?: React.ReactNode }) {
  const game = useGameStore((s) => s.game)!;
  const stats = a.position === "GK" ? [...GK_STATS, ...COMMON_STATS] : [...FIELD_STATS, ...COMMON_STATS];
  const best = a.record.winterResults.length ? a.record.winterResults[a.record.winterResults.length - 1] : "—";
  const member = game.staff.members.find((m) => m.alumnusId === a.id);
  const abilities = member?.abilities ?? a.staffProfile.base;
  return (
    <Sheet onClose={onClose} title="OB" wide>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <PlayerFace look={a.look} size={64} shirt={casualColor(a.id)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <RankBadge rank={statRank(a.overall)} />
                <span className="font-head truncate text-[1.125rem]">{a.name}</span>
              </div>
              <div className="text-[0.75rem] text-text-2">
                {a.fictional ? "昔の卒業生" : `${yearLabel(a.graduatedYear)}卒`}・{POSITION_NAMES[a.position]}・{alumnusAge(a, game.year)}歳・{CAREER_NAMES[a.career]}
              </div>
            </div>
          </div>
          <div className="mb-3 grid grid-cols-4 gap-1 text-center">
            {[
              ["出場", a.record.apps],
              ["得点", a.record.goals],
              ["主将", a.wasCaptain ? "◎" : "-"],
              ["最後の冬", best],
            ].map(([k, v]) => (
              <div key={k} className="bg-panel-2 p-1">
                <div className="text-[0.6875rem] font-bold text-text-3">{k}</div>
                <div className="font-num truncate text-[0.9375rem] font-bold">{v}</div>
              </div>
            ))}
          </div>
          <Label>スタッフとしての能力{member ? "（今）" : "（迎えたとき）"}</Label>
          <p className="mb-1 text-[0.75rem] text-text-2">
            {staffComment(abilities)}。向いている役割：{ROLE_NAMES[bestRole(abilities)]}
          </p>
          <StaffAbilityList abilities={abilities} role={member?.role} />
        </div>
        <div>
          <Label>現役時代の能力</Label>
          <ul className="mb-3 flex flex-col">
            {stats.map((k) => (
              <li key={k} className="flex h-7 items-center gap-2 border-b border-line text-[0.8125rem]">
                <span className="flex-1 truncate">{statLabel(k)}</span>
                <RankBadge rank={statRank(a.stats[k])} size="sm" />
                <span className="font-num w-7 text-right">{a.stats[k]}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              閉じる
            </Button>
            {action}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/** 年度初め・ゲーム開始時のスタッフ編成 */
export function StaffReviewScreen() {
  const game = useGameStore((s) => s.game)!;
  useGameStore((s) => s.rev);
  const finishStaff = useGameStore((s) => s.finishStaff);
  const [error, setError] = useState<string | null>(null);
  const first = game.history.length === 0 && game.year === 1;
  const over = staffOverSlots(game);
  const head = staffByRole(game.staff, "head");
  return (
    <Screen
      title={first ? "ヘッドコーチを選ぶ" : `${yearLabel(game.year)}のスタッフ`}
      right={
        <Button disabled={over > 0} icon="check" cut onClick={() => setError(finishStaff())}>
          {first && head?.temporary ? "あとで選ぶ（臨時コーチで始める）" : over > 0 ? `あと${over}人外してください` : "このスタッフで始める"}
        </Button>
      }
    >
      <div className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5">
        <p className="bg-panel px-2 py-1.5 text-[0.8125rem] leading-snug text-text-2">
          {first
            ? "サッカー部の OB から、一緒にチームを育てるヘッドコーチを選べます。「あとで選ぶ」なら臨時コーチが入ります（あとからスタッフ画面で選べます）。"
            : "新しい年度のスタッフを決めます。OB の入れ替えや役割の変更は、年度初めのこの画面でできます。"}
        </p>
        <StaffList />
        <p className="bg-panel/90 px-2 py-1 text-[0.75rem] text-text-3">
          能力の目安：{["素人同然", "まだ未熟", "そこそこ", "頼れる", "優秀", "一流"].join("・")}（いまのヘッドコーチは「{head ? abilityGrade(Math.max(head.abilities.coaching, head.abilities.tactics)) : "-"}」）
        </p>
        {error && <p className="bg-panel p-2 text-[0.75rem] font-bold text-bad">{error}</p>}
      </div>
    </Screen>
  );
}
