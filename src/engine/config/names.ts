/**
 * 表示名はすべてここに集約する（SPEC 3章）。
 * 県名・地域名・大会名は架空の仮の名前。実在の名称・商標は使わない。
 */
import type { Career, MajorKind, Position, PracticeKind, ReputationLevel, SquareType } from "../types";

export const GAME_TITLE = "頂上イレブン";
export const GAME_SUBTITLE = "高校サッカー部 監督育成ゲーム";

/** 架空の地域（8） */
export const REGION_NAMES = ["北辰", "東陽", "翠嶺", "白浜", "中原", "西風", "南洋", "瑠璃"] as const;
export const regionLabel = (name: string) => `${name}地域`;

/** 架空の県（32）。地域ごとに 4 県 */
export const PREFECTURE_NAMES = [
  "氷華原", "鷲ノ尾", "雪代", "朔原",
  "朝凪", "陽向", "東雲台", "渦潮浦",
  "翠ヶ峰", "嶺北", "霧ヶ原", "若菜野",
  "白砂", "汐見", "浜百合", "潮騒野",
  "中津原", "花菱", "宮守原", "楓沢",
  "西凪野", "風早", "茜ヶ丘", "夕凪",
  "南瑠", "珊瑚浜", "火群", "椰子ヶ浦",
  "瑠璃沢", "玻璃野", "藍ヶ島", "紺碧",
] as const;
export const prefectureLabel = (name: string) => `${name}県`;

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
  winter: "冬の選手権",
  prefQualifier: "冬の選手権 県予選",
  national: "冬の選手権 全国大会",
  practice: "練習試合",
} as const;

export function roundLabel(totalRounds: number, round: number): string {
  const fromEnd = totalRounds - 1 - round;
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
  prefQualifier: "県予選",
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

export const TACTICS_LABELS = {
  attack: { attacking: "攻撃的", balanced: "バランス", defensive: "守備的" },
  buildUp: { buildUp: "ビルドアップ重視", long: "ロングボール主体" },
  press: { high: "高", mid: "中", low: "低" },
  line: { high: "高", low: "低" },
} as const;
export const TACTICS_ITEM_NAMES = { attack: "攻撃方針", buildUp: "組み立て", press: "プレス", line: "ライン" } as const;

export const yearLabel = (year: number) => `${year}年目`;
