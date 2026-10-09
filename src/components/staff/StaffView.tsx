"use client";

import { useState } from "react";
import { CAREER_NAMES, POSITION_NAMES, ROLE_NAMES, STAFF_ABILITY_NAMES, TEMP_COACH_LABEL, yearLabel } from "@/engine/config/names";
import { ROLE_ABILITIES } from "@/engine/config/staff";
import { statRank } from "@/engine/player/rank";
import { alumnusAge, hasVacancy, isStaffWindow, staffAge, staffByRole, staffCandidates, staffOverSlots, staffSlots, type Availability } from "@/engine/staff";
import { abilityGrade, bestRole, staffComment } from "@/engine/staff/comment";
import { COMMON_STATS, FIELD_STATS, GK_STATS, STAFF_ABILITIES, STAFF_ROLES, type Alumnus, type StaffAbilities, type StaffMember, type StaffRole } from "@/engine/types";
import { useGameStore } from "@/store/gameStore";
import { Bar, Button, Header, RankBadge, Sheet } from "../ui";
import { statLabel } from "../play/format";

/** 能力の一覧。役割に効く能力を強調し、残りは薄く出す */
export function StaffAbilityList({ abilities, role }: { abilities: StaffAbilities; role?: StaffRole }) {
  const main = role ? ROLE_ABILITIES[role] : [];
  return (
    <ul className="flex flex-col gap-0.5">
      {STAFF_ABILITIES.map((k) => {
        const strong = !role || main.includes(k);
        return (
          <li key={k} className={`flex items-center gap-2 text-xs ${strong ? "" : "opacity-45"}`}>
            <span className={`w-24 shrink-0 ${strong ? "font-bold" : ""}`}>{STAFF_ABILITY_NAMES[k]}</span>
            <Bar value={abilities[k]} color={strong ? "bg-pitch" : "bg-gray-400"} className="!h-1.5" />
            <span className="w-7 shrink-0 text-right font-mono">{Math.round(abilities[k])}</span>
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

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-gray-500">
        スタッフ枠 {filled}/{slots}（評判で増えます）。{inWindow ? "年度初めなので、入れ替え・配置換えができます。" : "年度の途中は、空いた枠への補充と解任だけできます。"}
      </p>
      {over > 0 && <p className="rounded-lg bg-amber-100 p-2 text-xs font-bold text-amber-900">評判が下がり、枠を{over}人超えています。残さない人を「外す」で選んでください。</p>}
      <ul className="flex flex-col gap-2">
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
                  className="flex min-h-14 w-full items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 text-left disabled:opacity-50"
                >
                  <span className="w-28 shrink-0 text-xs font-black text-gray-500">{ROLE_NAMES[role]}</span>
                  <span className="flex-1 text-sm text-gray-500">{open ? "空き（候補から選ぶ）" : filled >= slots ? "枠がありません" : "空き（年度初めに選べます）"}</span>
                </button>
              </li>
            );
          }
          const years = game.year - m.hiredYear;
          return (
            <li key={m.id} className="rounded-xl border border-gray-200 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-black text-pitch-dark">{ROLE_NAMES[role]}</span>
                <span className="flex-1 truncate text-sm font-bold">
                  {m.name}
                  {m.temporary && <span className="ml-1 rounded bg-gray-200 px-1 text-[10px] font-normal">{TEMP_COACH_LABEL}</span>}
                </span>
                <span className="text-[11px] text-gray-500">
                  {staffAge(m, game.year)}歳・{years === 0 ? "今年から" : `${years + 1}年目`}
                </span>
              </div>
              <p className="mb-1.5 text-[11px] text-gray-600">{staffComment(m.abilities)}</p>
              {m.poachNotice && <p className="mb-1.5 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{m.poachNotice.by === "pro" ? "プロのクラブ" : "他校"}から誘いが来ているらしい（年度末に去るかもしれない）</p>}
              <StaffAbilityList abilities={m.abilities} role={role} />
              <div className="mt-2 flex gap-2">
                {m.temporary ? (
                  <Button variant="secondary" className="flex-1 !min-h-9 !text-xs" onClick={() => setPicking("head")}>
                    OB と入れ替える
                  </Button>
                ) : (
                  <>
                    {inWindow && (
                      <Button variant="secondary" className="flex-1 !min-h-9 !text-xs" onClick={() => setRoleFor(m)}>
                        配置換え
                      </Button>
                    )}
                    {inWindow && (
                      <Button variant="secondary" className="flex-1 !min-h-9 !text-xs" onClick={() => setPicking(role)}>
                        入れ替える
                      </Button>
                    )}
                    {over > 0 ? (
                      <Button variant="danger" className="flex-1 !min-h-9 !text-xs" onClick={() => run(releaseStaff(m.id))}>
                        外す
                      </Button>
                    ) : (
                      <Button variant="danger" className="flex-1 !min-h-9 !text-xs" onClick={() => setConfirm(m)}>
                        解任
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-xs text-red-600">{error}</p>}

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
          <p className="mb-2 text-xs text-gray-600">その役割に人がいれば、役割を入れ替えます。</p>
          <div className="flex flex-col gap-2">
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
          <p className="mb-3 text-sm text-gray-700">解任した人は、今年度は雇い直せません。{confirm.role === "head" && "ヘッドコーチがいなくなると、臨時コーチが入ります。"}</p>
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
    <Sheet title={`${ROLE_NAMES[role]}の候補`} onClose={onClose}>
      <p className="mb-2 text-[11px] text-gray-500">
        役割に効く能力：{main.map((k) => STAFF_ABILITY_NAMES[k]).join("・")}。押すと詳しく見られます。
      </p>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <ul className="flex flex-col divide-y divide-gray-100">
        {list.map(({ alumnus: a, availability }) => (
          <li key={a.id}>
            <button type="button" onClick={() => setDetail(a)} className={`flex min-h-14 w-full items-center gap-2 py-1.5 text-left ${availability.ok ? "" : "opacity-55"}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold">{a.name}</span>
                  <span className="text-[11px] text-gray-500">
                    {alumnusAge(a, game.year)}歳・{POSITION_NAMES[a.position]}
                  </span>
                </div>
                <div className="text-[11px] text-gray-600">
                  {CAREER_NAMES[a.career]}・{staffComment(a.staffProfile.base)}
                </div>
              </div>
              <div className="w-20 shrink-0 text-right">
                <div className="text-[10px] text-gray-500">{availabilityText(availability, game.year)}</div>
                <div className="text-sm font-black">{Math.round(fit(a))}</div>
              </div>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-3 text-sm text-gray-500">候補の OB がいません。</li>}
      </ul>
      <Button variant="secondary" className="mt-3 w-full" onClick={onClose}>
        閉じる
      </Button>
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
    <Sheet onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <RankBadge rank={statRank(a.overall)} size="lg" />
        <div className="flex-1">
          <div className="text-lg font-black">{a.name}</div>
          <div className="text-xs text-gray-600">
            {a.fictional ? "昔の卒業生" : `${yearLabel(a.graduatedYear)}卒`}・{POSITION_NAMES[a.position]}・{alumnusAge(a, game.year)}歳・{CAREER_NAMES[a.career]}
          </div>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-1 text-center text-xs">
        <div className="rounded-lg bg-gray-50 p-1.5">
          <div className="text-gray-500">出場</div>
          <div className="font-bold">{a.record.apps}</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-1.5">
          <div className="text-gray-500">得点</div>
          <div className="font-bold">{a.record.goals}</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-1.5">
          <div className="text-gray-500">主将</div>
          <div className="font-bold">{a.wasCaptain ? "◎" : "—"}</div>
        </div>
        <div className="rounded-lg bg-gray-50 p-1.5">
          <div className="text-gray-500">最後の冬</div>
          <div className="truncate font-bold">{best}</div>
        </div>
      </div>
      <h3 className="mb-1 text-xs font-black text-gray-600">スタッフとしての能力{member ? "（今）" : "（迎えたとき）"}</h3>
      <p className="mb-1 text-[11px] text-gray-600">
        {staffComment(abilities)}。向いている役割：{ROLE_NAMES[bestRole(abilities)]}
      </p>
      <div className="mb-3">
        <StaffAbilityList abilities={abilities} role={member?.role} />
      </div>
      <h3 className="mb-1 text-xs font-black text-gray-600">現役時代の能力</h3>
      <ul className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1">
        {stats.map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{statLabel(k)}</span>
            <RankBadge rank={statRank(a.stats[k])} size="sm" />
            <span className="w-7 text-right font-mono text-xs">{a.stats[k]}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          閉じる
        </Button>
        {action}
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
    <main className="flex flex-1 flex-col">
      <Header title={first ? "ヘッドコーチを選ぶ" : `${yearLabel(game.year)}のスタッフ`} />
      <div className="flex flex-col gap-3 p-3 pb-28">
        {first ? (
          <p className="text-sm">サッカー部の OB から、一緒にチームを育てるヘッドコーチを選べます。「あとで選ぶ」なら臨時コーチが入ります（あとからスタッフ画面で選べます）。</p>
        ) : (
          <p className="text-sm">新しい年度のスタッフを決めます。OB の入れ替えや役割の変更は、年度初めのこの画面でできます。</p>
        )}
        <StaffList />
        <p className="text-[11px] text-gray-500">能力の目安：{["素人同然", "まだ未熟", "そこそこ", "頼れる", "優秀", "一流"].join(" → ")}（いまのヘッドコーチは「{head ? abilityGrade(Math.max(head.abilities.coaching, head.abilities.tactics)) : "—"}」）</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-gray-200 bg-white p-3">
        <Button className="w-full" disabled={over > 0} onClick={() => setError(finishStaff())}>
          {first && head?.temporary ? "あとで選ぶ（臨時コーチで始める）" : over > 0 ? `あと${over}人外してください` : "このスタッフで始める"}
        </Button>
      </div>
    </main>
  );
}
