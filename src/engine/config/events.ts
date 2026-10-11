/**
 * すごろくのイベント（SPEC 5章。P1 は最小限の 14 種）。
 * 効果の処理は src/engine/events にある。ここは文言と数値だけ。
 */
export type EventEffect =
  | { type: "teamFitness"; amount: number }
  | { type: "teamCondition"; amount: number }
  | { type: "someCondition"; count: [number, number]; amount: number }
  | { type: "someFitness"; count: [number, number]; amount: number; condition?: number }
  | { type: "someExp"; count: [number, number]; exp: number }
  | { type: "teamExp"; stats: string[]; exp: number; fitness: number }
  | { type: "injury"; days: [number, number] }
  | { type: "healInjuries"; days: number }
  | { type: "reputation"; amount: number }
  | { type: "nextPractice"; mult: number }
  | { type: "randomCondition" }
  // ---- 特殊能力（P2b。PLAN 5.3）----
  /** 特殊能力を持つ OB が、同じ区分の部員 1〜2 人に教える */
  | { type: "obTeach"; base: number }
  /** スタッフ 1 人が部員 1 人を指導する（× があれば消すのを優先） */
  | { type: "staffTeach"; base: number; removeChance: number }
  /** 特殊能力を持つ 3 年生が、同じスタイルの後輩 1 人に伝える */
  | { type: "seniorTeach"; base: number }
  /** 熟練度の高い部員 1 人が、スタイルに合う特殊能力で判定する */
  | { type: "selfAwake"; base: number; minProficiency: number }
  /** 部員 1 人が悪い癖（ラフプレー× か 逆足×）を持つ */
  | { type: "badHabit" };

export interface EventDef {
  id: string;
  tone: "good" | "bad";
  title: string;
  text: string;
  effect: EventEffect;
  weight: number;
}

export const EVENTS: EventDef[] = [
  // ---- 良いイベント（青マス）----
  { id: "snack", tone: "good", title: "差し入れ", text: "保護者会から差し入れが届いた。部員の体力が回復した。", effect: { type: "teamFitness", amount: 15 }, weight: 10 },
  { id: "obCoaching", tone: "good", title: "OBの指導", text: "OBが練習を見に来て、何人かを熱心に指導してくれた。", effect: { type: "someExp", count: [2, 4], exp: 22 }, weight: 9 },
  { id: "motivation", tone: "good", title: "やる気アップ", text: "部の雰囲気が良く、みんなのやる気が上がった。", effect: { type: "teamCondition", amount: 1 }, weight: 9 },
  { id: "newspaper", tone: "good", title: "地元紙の取材", text: "地元の新聞が部を取材した。学校の評判が少し上がった。", effect: { type: "reputation", amount: 3 }, weight: 5 },
  { id: "selfTraining", tone: "good", title: "自主練の成果", text: "居残りで自主練をしていた部員が力をつけた。", effect: { type: "someExp", count: [1, 1], exp: 45 }, weight: 8 },
  { id: "goodWeather", tone: "good", title: "絶好の練習日和", text: "グラウンドの状態が良い。次の練習の効率が上がる。", effect: { type: "nextPractice", mult: 1.3 }, weight: 8 },
  { id: "quickRecovery", tone: "good", title: "治療がうまくいった", text: "ケガをしていた部員の回復が早まった。", effect: { type: "healInjuries", days: 6 }, weight: 4 },
  // ---- 特殊能力（P2b）----
  { id: "obTeach", tone: "good", title: "OBの直伝", text: "OBが練習に来て、得意のプレーを教えてくれた。", effect: { type: "obTeach", base: 0.35 }, weight: 5 },
  { id: "staffTeach", tone: "good", title: "スタッフの個別指導", text: "スタッフが部員の1人を付きっきりで指導した。", effect: { type: "staffTeach", base: 0.3, removeChance: 0.4 }, weight: 5 },
  { id: "seniorTeach", tone: "good", title: "先輩の背中", text: "3年生が後輩に自分の技を伝えた。", effect: { type: "seniorTeach", base: 0.25 }, weight: 4 },
  { id: "selfAwake", tone: "good", title: "自主練の開眼", text: "居残り練習で、何かをつかんだ部員がいる。", effect: { type: "selfAwake", base: 0.4, minProficiency: 60 }, weight: 4 },
  // ---- 悪いイベント（赤マス）----
  { id: "rain", tone: "bad", title: "雨で練習中止", text: "大雨でグラウンドが使えない。次の練習の効率が下がる。", effect: { type: "nextPractice", mult: 0.6 }, weight: 10 },
  { id: "injury", tone: "bad", title: "ケガ", text: "練習中に部員がケガをしてしまった。", effect: { type: "injury", days: [5, 18] }, weight: 6 },
  { id: "cold", tone: "bad", title: "風邪が流行", text: "部内で風邪が流行した。何人かの体力と調子が落ちた。", effect: { type: "someFitness", count: [3, 6], amount: -20, condition: -1 }, weight: 8 },
  { id: "slump", tone: "bad", title: "調子を崩す", text: "何人かの部員が調子を崩している。", effect: { type: "someCondition", count: [2, 4], amount: -1 }, weight: 9 },
  { id: "badHabit", tone: "bad", title: "悪い癖", text: "部員の1人に悪い癖がついてしまった。", effect: { type: "badHabit" }, weight: 2 },
  { id: "tired", tone: "bad", title: "疲れがたまる", text: "連日の練習で疲れがたまっている。", effect: { type: "teamFitness", amount: -10 }, weight: 9 },
  // ---- どちらとも言える（白マスで追加で出る）----
  { id: "scrimmage", tone: "good", title: "紅白戦", text: "白熱した紅白戦で、判断と視野が磨かれた。ただし体力は消耗した。", effect: { type: "teamExp", stats: ["decision", "vision"], exp: 6, fitness: -10 }, weight: 6 },
  { id: "pepTalk", tone: "bad", title: "監督の雷", text: "監督の厳しい言葉に、奮起する者もいれば落ち込む者もいた。", effect: { type: "randomCondition" }, weight: 6 },
];

/** 白マスで良いイベントが出る確率 */
export const WHITE_GOOD_CHANCE = 0.5;
/** 白マス専用のイベント ID（白マスでのみ出る） */
export const WHITE_ONLY_EVENTS = ["scrimmage", "pepTalk"];

/** 緑マス：体力回復 */
export const GREEN_RECOVERY = 22;
/** 黄マス：直前の練習で得た経験点の何割を追加するか */
export const YELLOW_BONUS = 0.5;
