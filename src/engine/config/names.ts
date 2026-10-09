/**
 * 表示名はすべてここに集約する（SPEC 3章）。
 * 県名・地域名・大会名は架空の仮の名前。実在の名称・商標は使わない。
 */
import type { Career, MajorKind, Position, PracticeKind, ReputationLevel, SquareType, StaffAbility, StaffRole } from "../types";

export const GAME_TITLE = "頂上イレブン";
export const GAME_SUBTITLE = "高校サッカー部 監督育成ゲーム";

/**
 * 地域区分（実在の区分。P2 の特待生スカウトの範囲に使う）
 */
export const REGIONS = [
  { id: "hokkaido", name: "北海道" },
  { id: "tohoku", name: "東北" },
  { id: "kanto", name: "関東" },
  { id: "hokushinetsu", name: "北信越" },
  { id: "tokai", name: "東海" },
  { id: "kinki", name: "近畿" },
  { id: "chugoku", name: "中国" },
  { id: "shikoku", name: "四国" },
  { id: "kyushu", name: "九州" },
] as const;
export type RegionId = (typeof REGIONS)[number]["id"];
export const regionLabel = (name: string) => (name === "北海道" ? name : `${name}地域`);

/** 47 都道府県（実在の名前。学校のデータは架空） */
export const PREFECTURES: { id: string; name: string; region: RegionId }[] = [
  { id: "hokkaido", name: "北海道", region: "hokkaido" },
  { id: "aomori", name: "青森県", region: "tohoku" },
  { id: "iwate", name: "岩手県", region: "tohoku" },
  { id: "miyagi", name: "宮城県", region: "tohoku" },
  { id: "akita", name: "秋田県", region: "tohoku" },
  { id: "yamagata", name: "山形県", region: "tohoku" },
  { id: "fukushima", name: "福島県", region: "tohoku" },
  { id: "ibaraki", name: "茨城県", region: "kanto" },
  { id: "tochigi", name: "栃木県", region: "kanto" },
  { id: "gunma", name: "群馬県", region: "kanto" },
  { id: "saitama", name: "埼玉県", region: "kanto" },
  { id: "chiba", name: "千葉県", region: "kanto" },
  { id: "tokyo", name: "東京都", region: "kanto" },
  { id: "kanagawa", name: "神奈川県", region: "kanto" },
  { id: "yamanashi", name: "山梨県", region: "kanto" },
  { id: "niigata", name: "新潟県", region: "hokushinetsu" },
  { id: "toyama", name: "富山県", region: "hokushinetsu" },
  { id: "ishikawa", name: "石川県", region: "hokushinetsu" },
  { id: "fukui", name: "福井県", region: "hokushinetsu" },
  { id: "nagano", name: "長野県", region: "hokushinetsu" },
  { id: "gifu", name: "岐阜県", region: "tokai" },
  { id: "shizuoka", name: "静岡県", region: "tokai" },
  { id: "aichi", name: "愛知県", region: "tokai" },
  { id: "mie", name: "三重県", region: "tokai" },
  { id: "shiga", name: "滋賀県", region: "kinki" },
  { id: "kyoto", name: "京都府", region: "kinki" },
  { id: "osaka", name: "大阪府", region: "kinki" },
  { id: "hyogo", name: "兵庫県", region: "kinki" },
  { id: "nara", name: "奈良県", region: "kinki" },
  { id: "wakayama", name: "和歌山県", region: "kinki" },
  { id: "tottori", name: "鳥取県", region: "chugoku" },
  { id: "shimane", name: "島根県", region: "chugoku" },
  { id: "okayama", name: "岡山県", region: "chugoku" },
  { id: "hiroshima", name: "広島県", region: "chugoku" },
  { id: "yamaguchi", name: "山口県", region: "chugoku" },
  { id: "tokushima", name: "徳島県", region: "shikoku" },
  { id: "kagawa", name: "香川県", region: "shikoku" },
  { id: "ehime", name: "愛媛県", region: "shikoku" },
  { id: "kochi", name: "高知県", region: "shikoku" },
  { id: "fukuoka", name: "福岡県", region: "kyushu" },
  { id: "saga", name: "佐賀県", region: "kyushu" },
  { id: "nagasaki", name: "長崎県", region: "kyushu" },
  { id: "kumamoto", name: "熊本県", region: "kyushu" },
  { id: "oita", name: "大分県", region: "kyushu" },
  { id: "miyazaki", name: "宮崎県", region: "kyushu" },
  { id: "kagoshima", name: "鹿児島県", region: "kyushu" },
  { id: "okinawa", name: "沖縄県", region: "kyushu" },
];
export const DEFAULT_PREFECTURE_ID = "tokyo";

/** 県ごとの区分の表示名 */
export const PREF_TIER_NAMES = { competitive: "激戦区", normal: "普通", small: "少数" } as const;

/** 学校名のパーツ（地名風の造語 + 種別） */
export const SCHOOL_NAME_HEADS = [
  "青嵐", "暁嶺", "白鷺", "翔洋", "蒼穹", "清風", "桜陵", "緑陽", "光翠", "星環館",
  "鳳雛", "朝凪台", "紫峰", "若葉", "天城", "飛鳥野", "瑞穂", "黎明", "大河原", "高嶺",
  "松風", "常磐野", "旭丘", "葵", "秋津", "千早", "湊", "柊", "楓林", "雲雀ヶ丘",
  "銀河", "北翔", "昴", "琥珀", "翡翠", "真澄", "早瀬", "隼", "鷹ノ巣", "椿",
  "望洋", "碧海", "風祭", "陽炎", "鳴神", "疾風", "稲穂", "樫ノ木", "紅陵", "久遠",
] as const;
export const SCHOOL_NAME_TAILS = ["高校", "高校", "高校", "学園", "学院高校", "工業高校", "商業高校", "第一高校", "東高校", "西高校", "南高校", "北高校"] as const;
export const PLAYER_SCHOOL_DEFAULT_NAME = "県立頂上高校";

/** 選手名（一般的な姓・名の組み合わせ。実在の選手を指すものではない） */
export const FAMILY_NAMES = [
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "斎藤", "清水",
  "山崎", "森", "池田", "橋本", "阿部", "石川", "山下", "中島", "石井", "小川",
  "前田", "岡田", "長谷川", "藤田", "後藤", "近藤", "村上", "遠藤", "青木", "坂本",
  "西村", "福田", "太田", "三浦", "藤井", "岡本", "松田", "中川", "中野", "原田",
  "小野", "田村", "竹内", "金子", "和田", "中山", "石田", "上田", "森田", "原",
  "柴田", "酒井", "工藤", "横山", "宮崎", "宮本", "内田", "高木", "安藤", "島田",
] as const;
export const GIVEN_NAMES = [
  "翔", "大翔", "蓮", "陽翔", "湊", "颯", "悠真", "樹", "大和", "陸",
  "蒼", "結翔", "悠人", "律", "朝陽", "颯太", "奏太", "優斗", "健太", "拓海",
  "海斗", "翼", "隼人", "陽太", "瑛太", "大輝", "航", "誠", "亮", "直樹",
  "裕太", "和真", "将太", "智也", "雄大", "啓太", "駿", "光", "創", "遥斗",
  "晴", "凌", "空", "陽向", "新", "壮真", "一輝", "勇気", "龍之介", "玲央",
] as const;

// ---- 大会 ----
export const COMPETITION_NAMES = {
  winter: "冬の全国大会",
  prefQualifier: "冬の全国大会 予選",
  national: "冬の全国大会",
  /** P2 */
  summer: "夏の全国大会",
  practice: "練習試合",
} as const;

/** 都道府県予選の表示名（例：冬の全国大会 東京都予選） */
export const prefQualifierName = (prefName: string) => `${COMPETITION_NAMES.winter} ${prefName}予選`;

/**
 * ラウンドの表示名。qualifiers が 2 以上（東京の予選など）のときは、最終ラウンドを「代表決定戦」と呼ぶ
 */
export function roundLabel(totalRounds: number, round: number, qualifiers = 1): string {
  const fromEnd = totalRounds - 1 - round;
  if (qualifiers > 1 && fromEnd === 0) return "代表決定戦";
  if (qualifiers > 1) return fromEnd === 1 ? "準々決勝" : `${round + 1}回戦`;
  if (fromEnd === 0) return "決勝";
  if (fromEnd === 1) return "準決勝";
  if (fromEnd === 2) return "準々決勝";
  return `${round + 1}回戦`;
}

// ---- 評判・ランク ----
export const REPUTATION_NAMES: Record<ReputationLevel, string> = {
  0: "弱小",
  1: "そこそこ",
  2: "中堅",
  3: "強豪",
  4: "名門",
};

// ---- ポジション ----
export const POSITION_NAMES: Record<Position, string> = {
  GK: "GK",
  CB: "CB",
  SB: "SB",
  DMF: "DMF",
  CMF: "CMF",
  OMF: "OMF",
  WG: "WG",
  CF: "CF",
};
export const APTITUDE_MARKS = { 3: "◎", 2: "○", 1: "△" } as const;
export const FOOT_NAMES = { R: "右", L: "左", B: "両" } as const;
export const CONDITION_NAMES = { [-2]: "絶不調", [-1]: "不調", 0: "普通", 1: "好調", 2: "絶好調" } as const;

// ---- 能力 ----
export const STAT_NAMES = {
  vision: "視野の広さ",
  kickPower: "キック力",
  speed: "スピード",
  stamina: "スタミナ",
  pass: "パス",
  technique: "テクニック",
  physical: "フィジカル",
  pkSkill: "PK駆け引き",
  shooting: "シュート",
  dribble: "ドリブル",
  defense: "守備",
  aerial: "空中戦",
  decision: "判断",
  saving: "セービング",
  highBall: "ハイボール",
  positioning: "ポジショニング",
  catching: "キャッチング",
} as const;

// ---- すごろく ----
export const PRACTICE_NAMES: Record<PracticeKind, string> = {
  shoot: "シュート練習",
  pass: "パス練習",
  dribble: "ドリブル練習",
  defense: "守備練習",
  physical: "フィジカル",
  run: "走り込み",
  tactics: "戦術ミーティング",
  gk: "GK練習",
  setPiece: "セットプレー",
  pk: "PK練習",
  rest: "休養",
};

export const SQUARE_NAMES: Record<SquareType, string> = {
  blue: "青マス",
  red: "赤マス",
  white: "白マス",
  green: "緑マス",
  yellow: "黄マス",
  major: "大マス",
};

export const MAJOR_NAMES: Record<MajorKind, string> = {
  entrance: "入学式",
  practiceMatch: "練習試合",
  prefQualifier: "予選",
  national: "全国大会",
  graduation: "卒業式",
  yearEnd: "年度末",
};

export const CAREER_NAMES: Record<Career, string> = {
  pro: "プロ入り",
  university: "大学進学",
  worker: "社会人チーム",
  coach: "指導者の道",
  other: "その他の進路",
};

export const ROLE_NAMES: Record<StaffRole, string> = {
  head: "ヘッドコーチ",
  gk: "GKコーチ",
  physical: "フィジカルコーチ",
  analyst: "分析担当",
};

export const STAFF_ABILITY_NAMES: Record<StaffAbility, string> = {
  coaching: "指導力",
  tactics: "戦術眼",
  gkCoaching: "GK指導",
  conditioning: "体力管理",
  scouting: "スカウティング",
};

export const TEMP_COACH_LABEL = "臨時コーチ";

export const NOTE_TEMPLATE_NAMES = {
  powerPlay: "パワープレイ",
  holdLead: "逃げ切り",
  fatigueSub: "疲労交代",
  pkPrep: "PK準備",
} as const;

/** 作戦ノートの「自動で選ぶ」選手の指定 */
export const AUTO_PICK_NAMES = {
  lowestStamina: "スタミナが最も低い選手",
  bestForSlot: "その位置に最も合う控え",
  tallestForward: "控えの長身FW",
  pkGoalkeeper: "PKに強い控えのGK",
  goalkeeperOnPitch: "出ているGK",
  bookedPlayer: "イエローを受けた選手",
  injuredPlayer: "ケガをした選手",
} as const;

export const NOTE_CONDITION_NAMES = {
  minuteFrom: "○分以降",
  minutesLeft: "残り○分",
  score: "スコア",
  stamina: "スタミナ",
  booked: "イエローカード",
  injured: "ケガ",
  subsLeft: "交代枠の残り",
  competition: "試合の種類",
} as const;

export const NOTE_ACTION_NAMES = {
  sub: "選手交代",
  formation: "フォーメーション変更",
  tactics: "戦術変更",
  position: "ポジション変更",
} as const;

export const MATCH_KIND_NAMES = { practice: "練習試合", prefQualifier: "予選", national: "全国大会" } as const;

export const TACTICS_LABELS = {
  attack: { attacking: "攻撃的", balanced: "バランス", defensive: "守備的" },
  buildUp: { buildUp: "ビルドアップ重視", long: "ロングボール主体" },
  press: { high: "高", mid: "中", low: "低" },
  line: { high: "高", low: "低" },
} as const;
export const TACTICS_ITEM_NAMES = { attack: "攻撃方針", buildUp: "組み立て", press: "プレス", line: "ライン" } as const;

export const yearLabel = (year: number) => `${year}年目`;
