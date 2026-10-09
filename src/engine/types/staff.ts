/** スタッフ（SPEC 9章） */

/** 5 つの能力（全員が全部持つ。画面では役割に効くものを強調） */
export const STAFF_ABILITIES = ["coaching", "tactics", "gkCoaching", "conditioning", "scouting"] as const;
//                               指導力      戦術眼    GK指導        体力管理         スカウティング
export type StaffAbility = (typeof STAFF_ABILITIES)[number];
export type StaffAbilities = Record<StaffAbility, number>;

export const STAFF_ROLES = ["head", "gk", "physical", "analyst"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** スタッフとしての素質（OB ごとに卒業時に決まる。上限などは隠し） */
export interface StaffProfile {
  /** スタッフになれる年（年度） */
  availableFromYear: number;
  /** 雇ったときの能力 */
  base: StaffAbilities;
  /** 能力の上限（隠し）。得意分野 1〜2 個だけ 100 まで届きうる */
  caps: StaffAbilities;
  specialties: StaffAbility[];
  /** 仮の隠しパラメーター「指導の素質」（0〜1）。Phase 2b で性格に置き換える */
  teachingTalent: number;
  /** 進路による伸び方の倍率 */
  growthMult: number;
}

export interface StaffMember {
  id: string;
  /** 元になった OB の ID（臨時コーチは null） */
  alumnusId: string | null;
  name: string;
  role: StaffRole;
  abilities: StaffAbilities;
  /** 上限（OB の素質から写したもの。臨時コーチは一律で低い） */
  caps: StaffAbilities;
  specialties: StaffAbility[];
  growthMult: number;
  /** 18 歳だった年度（年齢 = 18 + 年度 − この値） */
  age18Year: number;
  hiredYear: number;
  /** 臨時コーチ（能力が低い。欠員と同じ扱いで、いつでも入れ替えられる） */
  temporary?: boolean;
  /** 引き抜きの予告（年度末に去る可能性がある） */
  poachNotice?: { by: "school" | "pro"; year: number };
}

/** 担当分野の成果（年度末の成長に使う。年度替わりでリセット） */
export interface StaffSeasonStats {
  /** 公式戦の試合数と失点 */
  officialMatches: number;
  goalsAgainst: number;
  /** 公式戦の勝ち数（ヘッドコーチの大会成績） */
  officialWins: number;
  /** PK 戦の勝敗と、試合中の PK の成功・阻止 */
  pkShootoutWins: number;
  pkShootouts: number;
  inMatchPkGood: number;
  /** 部員のケガの日数（練習中・試合中の合計） */
  injuryDays: number;
  /** 年度初めの GK の能力の合計（GK コーチの成果の基準） */
  gkStatStart?: number;
}

export interface StaffState {
  members: StaffMember[];
  /** 年度初めに枠が減っていて、誰を残すか選ぶ必要がある */
  needsReview: boolean;
  /** 今年度に解任した OB（同じ年度は再雇用しない） */
  dismissedThisYear: string[];
  /** 勇退・引き抜きで去った OB（もう雇えない） */
  departedIds: string[];
  season: StaffSeasonStats;
}

/** CPU 校の簡略化したスタッフの値（SPEC 9章「相手校もスタッフ能力を持つ」） */
export interface CpuStaff {
  tactics: number;
  /** 0 は分析担当なし */
  scouting: number;
}
