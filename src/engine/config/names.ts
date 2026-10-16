/**
 * 表示名はすべてここに集約する（SPEC 3章）。
 * 県名・地域名・大会名は架空の仮の名前。実在の名称・商標は使わない。
 */
import type { Career, DribbleMove, MajorKind, MovementRange, Personality, PlayStyle, Position, PracticeKind, ReputationLevel, SkillCategory, SkillId, SquareType, StaffAbility, StaffRole } from "../types";

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
  summer: "夏の全国大会",
  summerQualifier: "夏の全国大会 予選",
  summerNational: "夏の全国大会",
  rookie: "新人戦",
  rookiePref: "新人戦 県大会",
  rookieRegion: "新人戦 地域大会",
  practice: "練習試合",
  league: "県リーグ",
} as const;

/** 県リーグの表示名（例：東京都リーグ 2部） */
export const leagueName = (prefName: string, level: number) => `${prefName}リーグ ${level}部`;

/** 都道府県予選の表示名（例：冬の全国大会 東京都予選） */
export const prefQualifierName = (prefName: string) => `${COMPETITION_NAMES.winter} ${prefName}予選`;
/** 夏の全国大会の都道府県予選（例：夏の全国大会 東京都予選） */
export const summerQualifierName = (prefName: string) => `${COMPETITION_NAMES.summer} ${prefName}予選`;
/** 新人戦の県大会（例：新人戦 東京都大会） */
export const rookiePrefName = (prefName: string) => `${COMPETITION_NAMES.rookie} ${prefName}大会`;
/** 新人戦の地域大会（例：新人戦 関東地域大会。北海道は「全道大会」） */
export const rookieRegionName = (regionName: string) => (regionName === "北海道" ? `${COMPETITION_NAMES.rookie} 全道大会` : `${COMPETITION_NAMES.rookie} ${regionName}地域大会`);

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
export const FOOT_NAMES = { R: "右", L: "左" } as const;
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
  training: "特訓マス",
  person: "人物マス",
  branch: "分岐マス",
  major: "大マス",
};

export const MAJOR_NAMES: Record<MajorKind, string> = {
  entrance: "入学式",
  practiceMatch: "練習試合",
  prefQualifier: "予選",
  national: "全国大会",
  summerQualifier: "夏の予選",
  summerNational: "夏の全国",
  rookiePref: "新人戦",
  rookieRegion: "新人戦（地域）",
  league: "県リーグ",
  camp: "合宿",
  scoutReply: "スカウトの返事",
  graduation: "卒業式",
  yearEnd: "年度末",
  school: "学校行事",
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

export const MATCH_KIND_NAMES = {
  practice: "練習試合",
  prefQualifier: "冬の予選",
  national: "冬の全国大会",
  summerQualifier: "夏の予選",
  summerNational: "夏の全国大会",
  rookiePref: "新人戦（県）",
  rookieRegion: "新人戦（地域）",
  league: "県リーグ",
} as const;

// ---- 設備（P2c） ----
export const FACILITY_NAMES = { ground: "グラウンド", trainingRoom: "トレーニングルーム", careRoom: "ケアルーム", dorm: "寮" } as const;
/** グラウンドの段階の名前（SPEC 15章） */
export const GROUND_LEVEL_NAMES = ["土", "人工芝", "ナイター設備付き", "人工芝2面＋ナイター設備"] as const;

// ---- 合宿・分岐・スカウト（P2c） ----
export const CAMP_NAMES = { summer: "夏合宿", winter: "冬合宿" } as const;
export const POSITION_GROUP_NAMES = { GK: "GK", DF: "DF", MF: "MF", FW: "FW" } as const;
export const BRANCH_THEME_NAMES = { normal: "ふつうの道", blue: "青の道", training: "特訓の道", rest: "休養の道", yellow: "集中の道" } as const;
export const AFFILIATION_NAMES = { juniorHigh: "中学の部活", townClub: "街クラブ", juniorYouth: "ジュニアユース" } as const;
export const ACHIEVEMENT_NAMES = ["実績なし", "県大会", "地域大会", "全国大会"] as const;
export const REACTION_NAMES = { good: "良好", normal: "普通", bad: "悪い" } as const;
/** ジュニアユースから上がる架空のユースチーム */
export const YOUTH_TEAM_NAME = "ユースチーム";
export const METER_NAMES = {
  attack: "攻撃",
  pass: "パス",
  dribble: "ドリブル",
  defense: "守備",
  physical: "フィジカル",
  speed: "スピード",
  saving: "セービング",
  kick: "キック",
  highBall: "ハイボール",
} as const;

export const TACTICS_LABELS = {
  attack: { attacking: "攻撃的", balanced: "バランス", defensive: "守備的" },
  buildUp: { buildUp: "ビルドアップ重視", long: "ロングボール主体" },
  press: { high: "高", mid: "中", low: "低" },
  line: { high: "高", low: "低" },
} as const;
export const TACTICS_ITEM_NAMES = { attack: "攻撃方針", buildUp: "組み立て", press: "プレス", line: "ライン" } as const;

export const yearLabel = (year: number) => `${year}年目`;

// ================= 性格・プレースタイル・特殊能力（P2b） =================

export const PERSONALITY_NAMES: Record<Personality, string> = {
  diligent: "努力家",
  passionate: "情熱家",
  calm: "冷静沈着",
  craftsman: "職人気質",
  competitive: "負けず嫌い",
  moodMaker: "ムードメーカー",
  cautious: "慎重派",
  inspired: "ひらめき型",
};

export const PERSONALITY_TEXTS: Record<Personality, string> = {
  diligent: "どの練習でも安定して伸びる。調子の波が小さい。",
  passionate: "フィジカルと走り込みが得意。終盤に強いが、熱くなってカードをもらいやすい。",
  calm: "戦術ミーティングとパスが得意。PKに強く、調子の波が小さい。",
  craftsman: "こだわりの練習1つで大きく伸びる。セットプレーに強い。",
  competitive: "試合で多くを学ぶ。格上相手に燃えるが、負けると落ち込む。",
  moodMaker: "調子の波が大きいが、上向きやすい。キャプテンにするとチームの調子が安定する。",
  cautious: "守備の練習が得意でシュートは苦手。ミスが少ないが、大舞台では少し硬くなる。",
  inspired: "伸びは大きいが当たり外れも大きい。ここ一番で特殊能力が冴える。",
};

/** キャプテンにしたときの効果（表示用） */
export const CAPTAIN_EFFECT_TEXTS: Record<Personality, string> = {
  diligent: "チーム全体の練習効率が少し上がる",
  passionate: "ビハインド時にチームの士気が上がる",
  calm: "終盤の判断ミスが減る",
  craftsman: "セットプレーのキッカーが少し良くなる",
  competitive: "格上との試合でチームの士気が上がる",
  moodMaker: "チーム全体の調子が安定し、上がりやすくなる",
  cautious: "失点した後に崩れにくい",
  inspired: "チームへの効果は小さい",
};

export const PLAY_STYLE_NAMES: Record<PlayStyle, string> = {
  striker: "ストライカー",
  postPlayer: "ポストプレーヤー",
  speedster: "スピードスター",
  linkman: "リンクマン",
  poacher: "ポーチャー",
  wingDribbler: "ウイングドリブラー",
  insideDribbler: "インサイドドリブラー",
  number10: "No.10",
  boxToBox: "ボックストゥボックス",
  anchor: "アンカー",
  ballHunter: "ボールハンター",
  crosser: "クロッサー",
  stopper: "ストッパー",
  coverer: "カバーリング",
  attackingFullback: "攻撃的サイドバック",
  buildUpDefender: "ビルドアップ型",
  launcher: "砲台",
  boxKeeper: "ボックスキーパー",
  sweeperKeeper: "スイーパーキーパー",
  aerialKeeper: "空中戦の番人",
};

/** 部員一覧などの短い名前 */
export const PLAY_STYLE_SHORT: Record<PlayStyle, string> = {
  striker: "ストライカー",
  postPlayer: "ポスト",
  speedster: "スピード",
  linkman: "リンク",
  poacher: "ポーチャー",
  wingDribbler: "Wドリブル",
  insideDribbler: "Iドリブル",
  number10: "No.10",
  boxToBox: "B2B",
  anchor: "アンカー",
  ballHunter: "ハンター",
  crosser: "クロッサー",
  stopper: "ストッパー",
  coverer: "カバー",
  attackingFullback: "攻撃的SB",
  buildUpDefender: "ビルドアップ",
  launcher: "砲台",
  boxKeeper: "ボックスGK",
  sweeperKeeper: "スイーパーGK",
  aerialKeeper: "空中戦GK",
};

export const PLAY_STYLE_TEXTS: Record<PlayStyle, string> = {
  striker: "ゴール前での決定力",
  postPlayer: "体を張ったキープと空中戦",
  speedster: "裏への抜け出しとカウンター",
  linkman: "少し低い位置でMFとFWをつなぐ",
  poacher: "ペナルティエリア内に特化し、そこで大きな力を出す。組み立てとポストプレーには参加しない",
  wingDribbler: "大外に張って仕掛けるドリブラー",
  insideDribbler: "内側に入り、味方と近い距離のコンビネーションで突破する",
  number10: "視野とパスで決定機を作る",
  boxToBox: "攻守に走り回る運動量",
  anchor: "中盤の底で守備を固める",
  ballHunter: "相手に積極的に奪いにいく",
  crosser: "大外からクロスを多く入れる",
  stopper: "対人の強さ",
  coverer: "判断とスピードで背後を守る",
  attackingFullback: "オーバーラップとクロス",
  buildUpDefender: "後方から攻撃を組み立てる",
  launcher: "前線へのロングボールや、逆サイドへのボールで打開する",
  boxKeeper: "反応とセービング",
  sweeperKeeper: "飛び出しと足元の技術",
  aerialKeeper: "クロスへの強さ",
};

export const MOVEMENT_NAMES: Record<MovementRange, string> = {
  free: "自由",
  fixed: "定位置",
  wideOnly: "大外のみ",
  mostlyWide: "主に大外",
  mostlyInside: "主に内側",
};

/** 最上位の特殊能力の呼び名（仮） */
export const LEGEND_SKILL_NAME = "レジェンドスキル";

export const SKILL_CATEGORY_NAMES: Record<SkillCategory, string> = {
  shoot: "シュート",
  dribble: "ドリブル",
  pass: "パス",
  setPiece: "セットプレー",
  defense: "守備",
  gk: "GK",
  mental: "メンタル",
  body: "からだ",
};

export const SKILL_NAMES: Record<SkillId, string> = {
  oneOnOneX: "1対1×",
  oneOnOne1: "1対1○",
  oneOnOne2: "1対1◎",
  oneOnOneG: "1対1職人",
  heading1: "ヘディング○",
  heading2: "ヘディング◎",
  headingG: "ボンバーヘッド",
  duel1: "対人○",
  duel2: "対人◎",
  duelG: "対人の鬼",
  aerialDef1: "空中戦○",
  aerialDef2: "空中戦◎",
  aerialDefG: "空中戦の要",
  gkOneOnOne1: "1対1ストップ○",
  gkOneOnOne2: "1対1ストップ◎",
  gkOneOnOneG: "1対1の壁",
  feed1: "フィード○",
  feed2: "フィード◎",
  feedG: "フィードの名手",
  pkX: "PK×",
  pk1: "PK○",
  pk2: "PK◎",
  pkG: "PK職人",
  bigStageX: "大舞台×",
  bigStage1: "大舞台○",
  bigStage2: "大舞台◎",
  adversity1: "逆境○",
  adversity2: "逆境◎",
  durabilityX: "ケガしにくさ×",
  durability1: "ケガしにくさ○",
  durability2: "ケガしにくさ◎",
  staminaKeepX: "スタミナ持続×",
  staminaKeep1: "スタミナ持続○",
  staminaKeep2: "スタミナ持続◎",
  captaincy1: "キャプテンシー○",
  captaincy2: "キャプテンシー◎",
  footX: "逆足×",
  footG: "両利き",
  fkMaster: "FKの名手",
  ckMaster: "CKの名手",
  crossMaster: "クロスの名手",
  middleShot: "ミドルシュート",
  curveShot: "カーブシュート",
  offBall: "消える動き",
  doubleTouch: "ダブルタッチ",
  roulette: "ルーレット",
  uraKaido: "裏街道",
  chopTouch: "チョップタッチ",
  scissors: "シザース",
  chanceMaker: "チャンスメイカー",
  throughPass: "スルーパス",
  switchPlay: "サイドチェンジ",
  longThrow: "ロングスロー",
  interception: "インターセプト",
  spaceCover: "スペースカバー",
  manMark: "マンマーク",
  coverShadow: "カバーシャドウ",
  slidingTackle: "スライディングタックル",
  pkStopper: "PKストッパー",
  gkRush: "飛び出し",
  roughPlay: "ラフプレー×",
};

/** 系統の名前（図鑑の 1 行） */
export const SKILL_LINE_NAMES = {
  oneOnOne: "1対1（シュート）",
  heading: "ヘディング",
  duel: "対人（守備）",
  aerialDef: "空中戦（守備）",
  gkOneOnOne: "GKの1対1",
  feed: "フィード（GK）",
  pk: "PK",
  bigStage: "大舞台",
  adversity: "逆境",
  durability: "ケガしにくさ",
  staminaKeep: "スタミナ持続",
  captaincy: "キャプテンシー",
  foot: "利き足",
} as const;

/** 効果の説明（系統は系統ごと、ほかは 1 つずつ） */
export const SKILL_TEXTS: Partial<Record<SkillId | keyof typeof SKILL_LINE_NAMES, string>> = {
  oneOnOne: "GKとの1対1でのシュートと突破が強くなる（1対1の場面でだけ効く）。",
  heading: "攻撃の空中戦とヘディングの精度が上がる。",
  duel: "1対1の守備が強くなる。",
  aerialDef: "守備の空中戦（クロス・ロングボール）が強くなる。",
  gkOneOnOne: "GKとして、相手との1対1を止めやすくなる。",
  feed: "GKのロングボールの距離と精度が上がり、つなぐときのミスが減る。",
  pk: "PKの読み合いに強くなる（キッカーでもGKでも）。",
  bigStage: "全国大会と県予選の決勝で力を出せる。",
  adversity: "ビハインドのときに力を出せる。",
  durability: "試合中・練習中のケガが減る。",
  staminaKeep: "試合中の体力の減りが小さく、終盤の低下が小さい。",
  captaincy: "キャプテンのとき、チーム全体が少し力を出せる。",
  foot: "両利きは、逆足で蹴る場面でも精度が落ちず、サイドからのカットインとクロスが良くなる。逆足×は逆足で蹴ると精度が大きく落ちる。",
  fkMaster: "直接FKでの得点率が上がり、キッカーを任されやすい。",
  ckMaster: "CKからの得点チャンスの質が上がり、キッカーを任されやすい。",
  crossMaster: "サイドからのクロスの質が上がる。",
  middleShot: "ペナルティエリアの外からのシュートの精度が上がる。",
  curveShot: "斜めの角度（サイドから）のシュートの成功率が上がる。",
  offBall: "マークを外して抜け出すチャンスが増える。",
  doubleTouch: "相手が飛び込んできたときの突破。",
  roulette: "相手を背負った状態や、プレスを受けたときの突破。",
  uraKaido: "スピード勝負で、相手の背後にスペースがあるときの突破。",
  chopTouch: "縦に走りながら内側へ切り返すときの突破。",
  scissors: "止まった状態からの1対1で、相手を揺さぶっての突破。",
  chanceMaker: "決定的なパスが増える。",
  throughPass: "裏へのパスの成功率が上がる。",
  switchPlay: "逆サイドへのロングパスで、サイドの1対1を有利にする。",
  longThrow: "スローインがCKに近いチャンスになる。",
  interception: "パスを奪う確率が上がる。",
  spaceCover: "危険なスペースを察知して埋めやすくなる（カウンターに強い）。",
  manMark: "マークを外されにくくなる。",
  coverShadow: "相手のパスコースを消すのがうまくなる。",
  slidingTackle: "スライディングで止めやすく、ファウルになりにくい。",
  pkStopper: "GKとして、PKでの読みと反応に補正がかかる。",
  gkRush: "GKとして、裏へのボールと1対1への飛び出しが良くなる。",
  roughPlay: "ファウルやカードが多い。",
};

/** 入手のヒント（図鑑） */
export const SKILL_HINTS: Partial<Record<SkillId | keyof typeof SKILL_LINE_NAMES, string>> = {
  oneOnOne: "特訓：シュート練習／公式戦の1試合で3得点で段階アップ。1対1職人は公式戦での1対1からの通算2得点が条件",
  heading: "特訓：フィジカル・セットプレー／公式戦の1試合でヘディング2得点で段階アップ。ボンバーヘッドは公式戦でのヘディングの通算2得点が条件",
  duel: "特訓：守備練習。対人の鬼は公式戦での1対1の守備の勝ち通算5が条件",
  aerialDef: "特訓：フィジカル。空中戦の要は公式戦での守備の空中戦の勝ち通算4が条件",
  gkOneOnOne: "特訓：GK練習。1対1の壁は公式戦で1対1を通算5回止めるのが条件",
  feed: "特訓：GK練習。フィードの名手は公式戦でGKのロングボールから得点が生まれるのが条件",
  pk: "特訓：PK練習／PKを5本続けて決めると段階アップ。PK職人は2本連続が条件",
  bigStage: "特訓：PK練習／全国大会の決勝で決勝点を決めると段階アップ",
  adversity: "特訓：戦術ミーティング",
  durability: "特訓：フィジカル・走り込み",
  staminaKeep: "特訓：走り込み",
  captaincy: "特訓：戦術ミーティング",
  foot: "両利き：逆足×がなく、熟練度80以上の選手が、シュートかドリブルの特訓でごくまれに",
  fkMaster: "公式戦の直接FKで得点したあと、セットプレーの特訓などで",
  ckMaster: "公式戦のCKからアシストしたあと、セットプレーの特訓などで",
  crossMaster: "公式戦のクロスから2回アシストしたあと、パス・セットプレーの特訓などで",
  middleShot: "特訓：シュート練習",
  curveShot: "特訓：シュート練習",
  offBall: "特訓：シュート練習",
  doubleTouch: "特訓：ドリブル練習",
  roulette: "特訓：ドリブル練習",
  uraKaido: "特訓：ドリブル練習",
  chopTouch: "特訓：ドリブル練習",
  scissors: "特訓：ドリブル練習",
  chanceMaker: "特訓：パス練習",
  throughPass: "特訓：パス練習",
  switchPlay: "特訓：パス練習",
  longThrow: "特訓：セットプレー",
  interception: "特訓：守備練習",
  spaceCover: "特訓：守備練習・戦術ミーティング",
  manMark: "特訓：守備練習",
  coverShadow: "特訓：守備練習・戦術ミーティング",
  slidingTackle: "特訓：守備練習",
  pkStopper: "特訓：GK練習・PK練習／PK戦で2本止める",
  gkRush: "特訓：GK練習",
  roughPlay: "守備練習・戦術ミーティング・休養の特訓や、スタッフの指導で消せる",
};

export const DRIBBLE_MOVE_NAMES: Record<DribbleMove, string> = {
  doubleTouch: "ダブルタッチ",
  roulette: "ルーレット",
  uraKaido: "裏街道",
  chopTouch: "チョップタッチ",
  scissors: "シザース",
};

// ================= 見た目・ユニフォーム・会場（P4） =================

/** 髪型（config/look.ts の HAIR_STYLES と同じ順） */
export const HAIR_STYLE_NAMES = ["短髪", "坊主", "長め", "ツーブロック", "くせ毛", "ツンツン", "マッシュ", "センター分け"] as const;

/** ユニフォームのテンプレート（config/look.ts の KIT_TEMPLATES と同じ順） */
export const KIT_TEMPLATE_NAMES = ["無地", "縦縞", "横縞", "ハーフ", "サッシュ", "肩・袖の切り替え", "胸の太いライン", "ピンストライプ"] as const;

/** ユニフォームの色（config/look.ts の KIT_PALETTE と同じ順） */
export const KIT_COLOR_NAMES = ["白", "黒", "灰", "紺", "青", "水色", "緑", "深緑", "黄緑", "黄", "金", "橙", "赤", "えんじ", "ピンク", "紫", "茶", "ベージュ", "ターコイズ", "ラベンダー", "銀", "濃い灰", "ミント", "サーモン"] as const;

/** 会場の段階（SPEC 10.8） */
export const VENUE_NAMES = { 1: "学校のグラウンド", 2: "小さな競技場", 3: "競技場", 4: "大きなスタジアム" } as const;
