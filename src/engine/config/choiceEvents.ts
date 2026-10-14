/**
 * 選択肢のあるイベント（R2。SPEC 18.3・PHASE_R2_PLAN 5章）。人物マスに止まると 1 つ起きる。
 * ここは文言と数値だけ。誰が出てくるか（起きる条件）と効果の処理は src/engine/choice にある。
 *
 * - intro：最初のせりふ。部員が話すときは話し方の型ごと（config/speech.ts）、スタッフ・OB は 1 つ
 * - 選択肢の results：上から順に確率で決まる（chance を省いた結果は「それ以外」）。
 *   trustBased の選択肢は、話す人の信頼度で 1 つ目の結果の確率が変わる
 * - auto：自動プレイ（balance）が選ぶときの点数（大きいほど選ぶ）
 * - 文中の {lead} {second} {staff} {ob} {pos} は、出てくる人の名字・役割・ポジションに置き換える
 */
import type { Lines, Reaction } from "./speech";
import type { Personality, StatKey, TestPrepPolicy } from "../types";

/** 効果の対象 */
export type ChoiceWho =
  | "lead"
  | "second"
  | "pair"
  | "team"
  | "grade1"
  | "grade3"
  | "lowerGrades"
  | "gks"
  | "otherGks"
  | "top11"
  | "captain"
  | "lowTrust"
  | "lowAcademic"
  | "higher"
  | "lower"
  | "senior";

export type ChoiceEffect =
  /** 調子（chance は 1 人ずつの確率） */
  | { t: "condition"; who: ChoiceWho; amount: number; chance?: number }
  | { t: "trust"; who: ChoiceWho; amount: number }
  | { t: "fitness"; who: ChoiceWho; amount: number }
  /** 経験点。weakKey = ポジションで大事な能力のうち一番低いもの、key2 = ポジションで一番大事な 2 つ、gk = GK の 4 能力 */
  | { t: "exp"; who: ChoiceWho; stats: StatKey[] | "weakKey" | "key2" | "gk"; amount: number }
  | { t: "proficiency"; who: ChoiceWho; amount: number }
  | { t: "academic"; who: ChoiceWho; amount: number }
  | { t: "reputation"; amount: number }
  | { t: "nextPractice"; mult: number }
  /** 練習に出ない日（体力は回復する） */
  | { t: "rest"; who: ChoiceWho; days: number }
  /** ケガ：chance の確率で、対象のうち 1 人がケガをする */
  | { t: "injury"; who: ChoiceWho; chance: number; days: [number, number] }
  /** 希望のポジションの適性を 1 段上げる */
  | { t: "aptitude"; who: ChoiceWho }
  /** 特殊能力の判定（style = スタイルに合うもの、staff = スタッフの能力しだい、ob = OB の技、gk = GK 系） */
  | { t: "learn"; who: ChoiceWho; via: "style" | "staff" | "ob" | "gk"; base: number }
  /** 結果が後で決まる約束 */
  | { t: "promise"; kind: "playNextOfficial" | "winNextOfficial"; who?: ChoiceWho }
  /** 能力に合うスタイルを選び直す（変われば熟練度 0・調子 +1） */
  | { t: "restyle"; who: ChoiceWho }
  /** 卒業のときの進路の出やすさ */
  | { t: "career"; who: ChoiceWho; career: "pro" | "university" }
  /** 体育祭のリレー（本気） */
  | { t: "relay" }
  /** テスト前の方針 */
  | { t: "testPrep"; policy: TestPrepPolicy };

export interface ChoiceResultDef {
  /** この結果になる確率（省くと残り全部） */
  chance?: number;
  /** 性格によってこの結果の確率を変える */
  chanceBy?: Partial<Record<Personality, number>>;
  /** 地の文（選んだ後の出来事） */
  narration: string;
  /** 話していた人の反応（config/speech.ts。staff は大人の返事） */
  reaction: Reaction;
  effects: ChoiceEffect[];
}

export interface ChoiceOptionDef {
  label: string;
  /** 自動プレイ用の点数 */
  auto: number;
  /** 「話を聞く・任せる」系（信頼度で 1 つ目の結果の確率が上下する） */
  trustBased?: boolean;
  /** スタッフ（臨時コーチを除く）がいるときだけ出す */
  requires?: "staff";
  results: ChoiceResultDef[];
}

export interface ChoiceEventDef {
  id: string;
  title: string;
  /** 背景（表示側の SCENE_BACKGROUNDS の名前） */
  bg: string;
  /** 最初の地の文 */
  narration: string;
  /** 誰が話し出すか */
  speaker: "lead" | "staff" | "ob" | "captain";
  /** 最初のせりふ（部員は型ごと、スタッフ・OB は 1 つ） */
  intro: Lines | string;
  options: ChoiceOptionDef[];
  /** 起きやすさ */
  weight: number;
  /** 同じイベントを次に起こすまでの日数（省くと CHOICE.eventGap） */
  gap?: number;
}

export const CHOICE = {
  /** 同じイベントの間隔（日） */
  eventGap: 60,
  /** 同じ選手が対象になる間隔（日） */
  playerGap: 30,
  /** 「レギュラーになれない」：公式戦の出場がこの割合未満 */
  benchShare: 0.3,
  /** 「勉強との両立」：学力がこれ未満 */
  lowAcademic: 40,
  /** 「居残り練習のしすぎ」：体力がこれ未満 */
  tiredFitness: 50,
  /** 「新しい技を覚えたい」：熟練度がこれ以上 */
  skillProficiency: 60,
  /** 「スタイルの迷い」：熟練度がこれ未満 */
  lostProficiency: 30,
  /** 「休養の提案」：平均の体力がこれ未満 */
  restFitness: 60,
  /** 「監督への不満」：平均の信頼度がこれ未満、または公式戦の連敗 */
  complaintTrust: 40,
  complaintLosses: 3,
  /** 「取材の申し込み」：評判がこれ以上 */
  interviewLevel: 2,
  /** 「正 GK 争い」：総合の差がこれ以内 */
  gkGap: 4,
  /** 「下級生の台頭」：1 年の総合が 3 年の総合 − これ 以上 */
  risingGap: 2,
  /** 「信頼度の低い部員」の基準 */
  lowTrust: 45,
  /** 「進路の相談」で決めた進路の出やすさの倍率 */
  careerHintMult: 1.6,
  /** 約束：「次の公式戦で使う」を守った・破った（対象の信頼度） */
  promiseKept: 3,
  promiseBroken: -12,
  /** 約束：「次の公式戦で結果を出す」の勝ち・負け（全員の信頼度） */
  winPromiseWin: 4,
  winPromiseLoss: -4,
};

const L = (polite: string, hot: string, blunt: string, cheerful: string, timid: string): Lines => ({ polite, hot, blunt, cheerful, timid });

/** 人物マスで起きるイベント（26 種） */
export const CHOICE_EVENTS: ChoiceEventDef[] = [
  // ================= 部員の悩み（1 人） =================
  {
    id: "positionWorry",
    title: "ポジションの悩み",
    bg: "clubroom",
    narration: "練習の後、{lead}が監督のところへやって来た。",
    speaker: "lead",
    intro: L(
      "監督、少しよろしいですか。{pos}をやってみたいと思っているんです。",
      "監督！ おれ、{pos}をやらせてほしいっす！ 絶対そっちの方が向いてますって！",
      "……{pos}、やってみたいんすけど。",
      "監督～、おれ{pos}やってみたいんすよ！ ぜったい楽しいと思うんす！",
      "あ、あの……{pos}を、やってみたいなって……。だめ、ですよね……？",
    ),
    options: [
      {
        label: "挑戦させる",
        auto: 1,
        results: [{ narration: "{lead}は{pos}の練習に加わった。", reaction: "glad", effects: [{ t: "aptitude", who: "lead" }, { t: "trust", who: "lead", amount: 5 }, { t: "proficiency", who: "lead", amount: -15 }] }],
      },
      {
        label: "今の場所で勝負しろ",
        auto: 1.5,
        results: [{ narration: "{lead}は今のポジションの練習に戻っていった。", reaction: "hurt", effects: [{ t: "proficiency", who: "lead", amount: 8 }, { t: "trust", who: "lead", amount: -5 }] }],
      },
      {
        label: "話を聞くだけにする",
        auto: 0.8,
        results: [{ narration: "監督は{lead}の話を最後まで聞いた。", reaction: "unsure", effects: [{ t: "trust", who: "lead", amount: 3 }, { t: "condition", who: "lead", amount: -1 }] }],
      },
    ],
    weight: 5,
  },
  {
    id: "benchWorry",
    title: "レギュラーになれない",
    bg: "groundDusk",
    narration: "居残り練習をしている{lead}に、監督が声をかけた。",
    speaker: "lead",
    intro: L(
      "どうすれば試合に出られるのか、ずっと考えています。何が足りないんでしょうか。",
      "監督、おれ、なんで試合に出られないんすか！ 誰よりも練習してるつもりっす！",
      "……試合、出たいっす。",
      "いや～、ベンチも楽しいっすけど、やっぱ試合出たいっすね～。",
      "ぼく、このまま試合に出られないのかな、って……。",
    ),
    options: [
      {
        label: "励ます",
        auto: 1,
        results: [
          { chance: 0.5, narration: "{lead}の表情が明るくなった。", reaction: "glad", effects: [{ t: "trust", who: "lead", amount: 5 }, { t: "condition", who: "lead", amount: 1 }] },
          { narration: "{lead}は小さくうなずいた。", reaction: "thanks", effects: [{ t: "trust", who: "lead", amount: 5 }] },
        ],
      },
      {
        label: "足りないものを一緒に考える",
        auto: 1.6,
        results: [{ narration: "二人で課題を洗い出し、日が暮れるまで練習した。", reaction: "fired", effects: [{ t: "exp", who: "lead", stats: "weakKey", amount: 25 }, { t: "fitness", who: "lead", amount: -10 }] }],
      },
      {
        label: "突き放す",
        auto: 0.6,
        results: [
          { chance: 0.6, chanceBy: { passionate: 0.8, competitive: 0.8 }, narration: "{lead}の目つきが変わった。", reaction: "fired", effects: [{ t: "condition", who: "lead", amount: 2 }] },
          { narration: "{lead}はうつむいたまま帰っていった。", reaction: "hurt", effects: [{ t: "condition", who: "lead", amount: -1 }, { t: "trust", who: "lead", amount: -8 }] },
        ],
      },
    ],
    weight: 6,
  },
  {
    id: "studyBalance",
    title: "勉強との両立",
    bg: "classroom",
    narration: "{lead}が、返ってきた小テストを手に相談に来た。",
    speaker: "lead",
    intro: L(
      "最近、授業についていけていなくて……。部活と勉強を両立する方法を考えたいんです。",
      "監督、勉強がヤバいっす！ でもサッカーは休みたくないんすよ！",
      "……勉強、まずいっす。",
      "いや～、テストがやばくて！ 赤点取ったら補習なんすよね～。",
      "あの……成績が下がってて……。親にも言われて……。",
    ),
    options: [
      {
        label: "数日休ませて勉強させる",
        auto: 1.2,
        results: [{ narration: "{lead}は3日間、部活を休んで勉強に集中した。", reaction: "thanks", effects: [{ t: "academic", who: "lead", amount: 8 }, { t: "rest", who: "lead", days: 3 }] }],
      },
      {
        label: "先輩に見てもらう",
        auto: 1.3,
        results: [{ narration: "勉強の得意な{second}が、練習の後に{lead}の勉強を見ることになった。", reaction: "glad", effects: [{ t: "academic", who: "lead", amount: 4 }, { t: "fitness", who: "second", amount: -5 }, { t: "trust", who: "pair", amount: 3 }] }],
      },
      {
        label: "サッカーに集中しろ",
        auto: 0.7,
        results: [{ narration: "{lead}はそのまま練習に戻った。", reaction: "fired", effects: [{ t: "condition", who: "lead", amount: 1 }, { t: "academic", who: "lead", amount: -3 }] }],
      },
    ],
    weight: 5,
  },
  {
    id: "slumpTalk",
    title: "スランプ",
    bg: "clubroom",
    narration: "{lead}が部室で一人、ボールを見つめていた。",
    speaker: "lead",
    intro: L(
      "何をやってもうまくいかないんです。自分のプレーが分からなくなってしまって。",
      "くそっ、なんでうまくいかねえんだ……！ 監督、おれどうしたらいいんすか！",
      "……全然、だめっす。",
      "あはは……最近ぜんぜんダメっすね、おれ。笑えないっす……。",
      "ぼく、もうだめかもしれません……。",
    ),
    options: [
      {
        label: "休ませる",
        auto: 1.4,
        results: [{ narration: "{lead}は2日間、ボールから離れて休んだ。", reaction: "thanks", effects: [{ t: "fitness", who: "lead", amount: 30 }, { t: "condition", who: "lead", amount: 1 }, { t: "rest", who: "lead", days: 2 }] }],
      },
      {
        label: "基礎からやり直す",
        auto: 1.2,
        results: [
          { chance: 0.5, narration: "基礎練習を重ねるうちに、{lead}の動きに切れが戻ってきた。", reaction: "fired", effects: [{ t: "exp", who: "lead", stats: "key2", amount: 12 }, { t: "condition", who: "lead", amount: 1 }] },
          { narration: "{lead}は黙々と基礎練習を続けた。", reaction: "calm", effects: [{ t: "exp", who: "lead", stats: "key2", amount: 12 }] },
        ],
      },
      {
        label: "試合で使い続けると約束する",
        auto: 0.9,
        results: [{ narration: "監督の言葉に、{lead}は顔を上げた。", reaction: "glad", effects: [{ t: "trust", who: "lead", amount: 8 }, { t: "promise", kind: "playNextOfficial", who: "lead" }] }],
      },
    ],
    weight: 5,
  },
  {
    id: "careerTalk",
    title: "進路の相談",
    bg: "classroom",
    narration: "放課後、{lead}が進路の調査票を持って監督を訪ねてきた。",
    speaker: "lead",
    intro: L(
      "卒業後の進路で迷っています。監督のご意見を聞かせていただけますか。",
      "監督、おれ、卒業してもサッカー続けたいっす！ でも、どこで続けるか迷ってて！",
      "……進路、どうしたらいいっすかね。",
      "進路調査、まだ白紙なんすよ～。監督、どう思います？",
      "あの……進路のことで……。ぼく、どうしたらいいのか分からなくて……。",
    ),
    options: [
      {
        label: "プロを目指せ",
        auto: 1,
        results: [{ narration: "{lead}は、プロを目指すと心に決めた。", reaction: "fired", effects: [{ t: "condition", who: "lead", amount: 1 }, { t: "academic", who: "lead", amount: -3 }, { t: "career", who: "lead", career: "pro" }] }],
      },
      {
        label: "大学で続けろ",
        auto: 1,
        results: [{ narration: "{lead}は、大学でサッカーを続ける道を考え始めた。", reaction: "calm", effects: [{ t: "academic", who: "lead", amount: 5 }, { t: "career", who: "lead", career: "university" }] }],
      },
      {
        label: "自分で決めなさい",
        auto: 1.1,
        trustBased: true,
        results: [
          { chance: 0.5, chanceBy: { diligent: 0.8, calm: 0.8 }, narration: "{lead}は、自分の進路を自分で考えると決めた。", reaction: "thanks", effects: [{ t: "trust", who: "lead", amount: 8 }] },
          { narration: "{lead}は少し考え込んだ様子で帰っていった。", reaction: "unsure", effects: [{ t: "trust", who: "lead", amount: 5 }] },
        ],
      },
    ],
    weight: 6,
    gap: 20,
  },
  {
    id: "injuryReturn",
    title: "ケガ明けの焦り",
    bg: "ground",
    narration: "ケガから戻ったばかりの{lead}が、全体練習に入りたいと言ってきた。",
    speaker: "lead",
    intro: L(
      "もう痛みはありません。休んでいた分を、早く取り戻したいんです。",
      "監督、もう大丈夫っす！ 早く全体練習に戻らせてください！",
      "……もう、いけます。",
      "完全復活っす！ 見てくださいよ、ほら！",
      "あの……もう、練習に戻っても大丈夫でしょうか……？",
    ),
    options: [
      {
        label: "少しずつ戻す",
        auto: 1.3,
        results: [{ narration: "{lead}は2日間、別メニューで体を慣らすことになった。", reaction: "calm", effects: [{ t: "fitness", who: "lead", amount: 10 }, { t: "rest", who: "lead", days: 2 }] }],
      },
      {
        label: "すぐ全体練習へ",
        auto: 0.9,
        results: [
          { chance: 0.1, narration: "張り切った{lead}は、同じところを痛めてしまった。", reaction: "sorry", effects: [{ t: "injury", who: "lead", chance: 1, days: [3, 8] }] },
          { narration: "{lead}は元気に全体練習に戻った。", reaction: "glad", effects: [{ t: "exp", who: "lead", stats: "key2", amount: 15 }] },
        ],
      },
    ],
    weight: 4,
    gap: 30,
  },
  {
    id: "freshmanLonely",
    title: "新入生がなじめない",
    bg: "clubroom",
    narration: "1年生の{lead}が、部室の隅で一人で着替えている。",
    speaker: "lead",
    intro: L(
      "先輩たちとどう話せばいいのか、まだよく分からなくて……。",
      "いや、別に平気っすよ！ ……ほんとは、ちょっと寂しいっすけど。",
      "……一人の方が、楽なんで。",
      "あれ、おれ浮いてます？ あはは……そうっすよね～。",
      "ぼ、ぼく、まだ誰とも話せてなくて……。",
    ),
    options: [
      {
        label: "先輩に面倒を見させる",
        auto: 1.2,
        results: [{ narration: "3年生の{second}が、{lead}を練習の後の食事に誘った。", reaction: "glad", effects: [{ t: "condition", who: "pair", amount: 1 }, { t: "fitness", who: "second", amount: -5 }] }],
      },
      {
        label: "監督が話を聞く",
        auto: 1.1,
        results: [{ narration: "監督は{lead}とゆっくり話をした。", reaction: "thanks", effects: [{ t: "trust", who: "lead", amount: 10 }] }],
      },
      {
        label: "様子を見る",
        auto: 0.6,
        results: [
          { chance: 0.5, narration: "数日後、{lead}は同じ学年の部員と笑い合っていた。", reaction: "glad", effects: [{ t: "condition", who: "lead", amount: 1 }] },
          { narration: "{lead}は、まだ部になじめずにいる。", reaction: "unsure", effects: [{ t: "condition", who: "lead", amount: -1 }, { t: "trust", who: "lead", amount: -3 }] },
        ],
      },
    ],
    weight: 6,
  },
  {
    id: "overwork",
    title: "居残り練習のしすぎ",
    bg: "groundNight",
    narration: "照明の消えかけたグラウンドで、{lead}がまだボールを蹴っている。",
    speaker: "lead",
    intro: L(
      "もう少しだけやらせてください。今日つかんだ感覚を、忘れたくないんです。",
      "まだまだいけますって！ 監督、あと30分だけ！",
      "……あと少しだけ。",
      "いやー、なんか今日は止まらないんすよ！",
      "す、すみません……。でも、みんなに追いつきたくて……。",
    ),
    options: [
      {
        label: "認める",
        auto: 0.9,
        results: [
          { chance: 0.12, narration: "無理がたたって、{lead}は足を痛めてしまった。", reaction: "sorry", effects: [{ t: "injury", who: "lead", chance: 1, days: [3, 7] }] },
          { narration: "{lead}は夜遅くまで練習を続けた。", reaction: "fired", effects: [{ t: "exp", who: "lead", stats: "key2", amount: 12 }, { t: "fitness", who: "lead", amount: -20 }] },
        ],
      },
      {
        label: "止める",
        auto: 1.2,
        results: [
          { chance: 1, chanceBy: { passionate: 0, competitive: 0 }, narration: "{lead}はしぶしぶ練習を切り上げた。", reaction: "calm", effects: [{ t: "fitness", who: "lead", amount: 15 }] },
          { narration: "{lead}は不満そうに練習を切り上げた。", reaction: "hurt", effects: [{ t: "fitness", who: "lead", amount: 15 }, { t: "condition", who: "lead", amount: -1 }, { t: "trust", who: "lead", amount: -3 }] },
        ],
      },
    ],
    weight: 5,
  },
  {
    id: "newTrick",
    title: "新しい技を覚えたい",
    bg: "groundDusk",
    narration: "{lead}が、目を輝かせて監督のところへ来た。",
    speaker: "lead",
    intro: L(
      "新しい技に挑戦したいんです。練習に付き合っていただけませんか。",
      "監督、新しい技、覚えたいっす！ 一緒に練習してください！",
      "……覚えたい技があるんすけど。",
      "監督、見ててくださいよ！ これ、ものにしたいんすよ！",
      "あの……新しいことに挑戦してみたくて……。",
    ),
    options: [
      {
        label: "付き合う（監督が特訓）",
        auto: 1.3,
        results: [{ narration: "監督は{lead}の特訓に付き合った。", reaction: "fired", effects: [{ t: "learn", who: "lead", via: "style", base: 0.35 }, { t: "fitness", who: "lead", amount: -15 }] }],
      },
      {
        label: "スタッフに任せる",
        auto: 1.1,
        requires: "staff",
        results: [{ narration: "{staff}が{lead}を指導することになった。", reaction: "calm", effects: [{ t: "learn", who: "lead", via: "staff", base: 0.35 }] }],
      },
      {
        label: "今は基礎を固めろ",
        auto: 0.7,
        results: [{ narration: "{lead}は基礎練習に戻った。", reaction: "unsure", effects: [{ t: "exp", who: "lead", stats: "key2", amount: 8 }, { t: "trust", who: "lead", amount: -3 }] }],
      },
    ],
    weight: 4,
  },
  {
    id: "styleLost",
    title: "スタイルの迷い",
    bg: "meeting",
    narration: "{lead}が、自分のプレーの映像を見ながら首をかしげている。",
    speaker: "lead",
    intro: L(
      "今のプレースタイルが、自分に合っているのか分からなくなってきました。",
      "なんか、しっくりこないんすよ！ おれのプレーって、これでいいんすかね！",
      "……今のやり方、合ってない気がします。",
      "うーん、なんかピンとこないんすよね～、今のスタイル。",
      "ぼく、今のプレーのままでいいのかなって……。",
    ),
    options: [
      {
        label: "今のスタイルを貫け",
        auto: 1.1,
        results: [{ narration: "{lead}は、今のスタイルを磨くことにした。", reaction: "fired", effects: [{ t: "proficiency", who: "lead", amount: 12 }] }],
      },
      {
        label: "合うスタイルを一緒に探す",
        auto: 1,
        results: [{ narration: "監督と{lead}は、能力に合うプレーを一緒に考えた。", reaction: "thanks", effects: [{ t: "restyle", who: "lead" }, { t: "trust", who: "lead", amount: 3 }] }],
      },
    ],
    weight: 4,
  },
  {
    id: "captainWorry",
    title: "キャプテンの悩み",
    bg: "clubroom",
    narration: "キャプテンの{lead}が、深刻な顔で部室に残っていた。",
    speaker: "lead",
    intro: L(
      "最近、部がまとまっていない気がします。キャプテンとして、どうすればいいでしょうか。",
      "監督、最近みんなの気持ちがバラバラなんすよ！ おれ、どうしたらいいんすか！",
      "……部がまとまってないっす。",
      "なんか最近、部の空気が微妙なんすよね～。おれじゃ盛り上げきれなくて。",
      "ぼくがキャプテンで、本当にいいんでしょうか……。",
    ),
    options: [
      {
        label: "監督から全員に話す",
        auto: 1,
        results: [
          { chance: 0.5, narration: "監督の話で、部の空気が引き締まった。", reaction: "calm", effects: [{ t: "condition", who: "team", amount: 1 }, { t: "trust", who: "lead", amount: -3 }] },
          { narration: "監督が全員の前で話をした。", reaction: "unsure", effects: [{ t: "trust", who: "lead", amount: -3 }] },
        ],
      },
      {
        label: "キャプテンに任せる",
        auto: 1.1,
        trustBased: true,
        results: [
          { chance: 0.3, narration: "{lead}の呼びかけで、部が一つになった。", reaction: "fired", effects: [{ t: "trust", who: "lead", amount: 8 }, { t: "condition", who: "team", amount: 1 }] },
          { narration: "{lead}は自分なりに部をまとめようとしている。", reaction: "fired", effects: [{ t: "trust", who: "lead", amount: 8 }] },
        ],
      },
      {
        label: "3年生で話し合わせる",
        auto: 0.9,
        results: [{ narration: "3年生だけで話し合いが行われた。", reaction: "calm", effects: [{ t: "condition", who: "grade3", amount: 1 }, { t: "condition", who: "lowerGrades", amount: -1, chance: 0.3 }] }],
      },
    ],
    weight: 3,
  },

  // ================= 部員どうし =================
  {
    id: "quarrel",
    title: "ケンカの仲裁",
    bg: "clubroom",
    narration: "部室から言い争う声が聞こえる。{lead}と{second}がにらみ合っていた。",
    speaker: "lead",
    intro: L(
      "監督、聞いてください。{second}が紅白戦で、わざと危ないタックルをしてきたんです。",
      "監督、聞いてくださいよ！ {second}のやつ、紅白戦でわざと削ってきたんすよ！ 絶対許せねえ！",
      "……{second}が、わざと削ってきたんで。",
      "ちょっと監督～！ {second}がひどいんすよ！ 紅白戦でガツンと来て！",
      "あ、あの……{second}くんが、紅白戦で……その、すごく強く当たってきて……。",
    ),
    options: [
      {
        label: "2人とも叱る",
        auto: 0.7,
        results: [{ narration: "監督は2人を厳しく叱った。", reaction: "sorry", effects: [{ t: "condition", who: "pair", amount: -1 }, { t: "trust", who: "pair", amount: -3 }] }],
      },
      {
        label: "2人の話を聞いて、仲直りさせる",
        auto: 1.2,
        trustBased: true,
        results: [
          { chance: 0.6, narration: "お互いの言い分を聞くうちに、2人は握手を交わした。", reaction: "sorry", effects: [{ t: "trust", who: "pair", amount: 5 }, { t: "condition", who: "pair", amount: 1 }] },
          { narration: "2人は一応和解したが、{second}はまだ納得していない様子だ。", reaction: "unsure", effects: [{ t: "trust", who: "pair", amount: 5 }, { t: "condition", who: "second", amount: -1 }] },
        ],
      },
      {
        label: "紅白戦で白黒つけさせる",
        auto: 1,
        results: [{ narration: "2人は紅白戦で真っ向からぶつかり合った。", reaction: "fired", effects: [{ t: "exp", who: "pair", stats: ["decision", "physical"], amount: 12 }, { t: "fitness", who: "pair", amount: -10 }, { t: "condition", who: "higher", amount: 1 }, { t: "condition", who: "lower", amount: -1 }] }],
      },
    ],
    weight: 5,
  },
  {
    id: "gradeClash",
    title: "学年の衝突",
    bg: "clubroom",
    narration: "片付けの当番をめぐって、1年の{lead}と3年の{second}がもめている。",
    speaker: "lead",
    intro: L(
      "片付けを1年だけに押し付けるのは、おかしいと思います。",
      "なんで片付けは全部1年なんすか！ 納得いかないっすよ！",
      "……片付け、1年ばっかりなんで。",
      "監督～、片付けって1年だけの仕事なんすか～？",
      "あの……片付けのことで、ちょっと……。",
    ),
    options: [
      {
        label: "3年生の肩を持つ",
        auto: 0.8,
        results: [{ narration: "部の決まりは今のままになった。", reaction: "hurt", effects: [{ t: "condition", who: "second", amount: 1 }, { t: "condition", who: "lead", amount: -1 }] }],
      },
      {
        label: "1年生の肩を持つ",
        auto: 0.8,
        results: [{ narration: "片付けは学年で分担することになった。", reaction: "glad", effects: [{ t: "condition", who: "lead", amount: 1 }, { t: "condition", who: "second", amount: -1 }, { t: "trust", who: "second", amount: -3 }] }],
      },
      {
        label: "部のルールを決め直す",
        auto: 1.2,
        results: [{ narration: "全員で話し合い、部のルールを決め直した。", reaction: "calm", effects: [{ t: "trust", who: "team", amount: 2 }, { t: "nextPractice", mult: 0.8 }] }],
      },
    ],
    weight: 4,
  },
  {
    id: "gkRivalry",
    title: "正GK争い",
    bg: "ground",
    narration: "GKの{lead}と{second}が、ゴール前で黙々とシュートを受け続けている。",
    speaker: "lead",
    intro: L(
      "監督、正ゴールキーパーはどうやって決めるんですか。はっきりさせてほしいです。",
      "監督！ ゴールを守るのはおれっすよね！ はっきりさせてください！",
      "……正GK、どっちなんすか。",
      "監督～、正GK決めちゃってくださいよ！ おれっすよね？",
      "あ、あの……正GKって、もう決まっているんでしょうか……。",
    ),
    options: [
      {
        label: "競わせる",
        auto: 1.2,
        results: [{ narration: "2人は毎日、居残りでシュートを受け合うようになった。", reaction: "fired", effects: [{ t: "exp", who: "pair", stats: "gk", amount: 15 }, { t: "condition", who: "pair", amount: 1, chance: 0.5 }, { t: "condition", who: "pair", amount: -1, chance: 0.3 }] }],
      },
      {
        label: "正GKを決めて伝える",
        auto: 1,
        results: [{ narration: "監督は{higher}を正GKに指名した。", reaction: "calm", effects: [{ t: "condition", who: "higher", amount: 1 }, { t: "trust", who: "higher", amount: 5 }, { t: "condition", who: "lower", amount: -1 }, { t: "trust", who: "lower", amount: -5 }] }],
      },
    ],
    weight: 3,
  },
  {
    id: "risingJunior",
    title: "下級生の台頭",
    bg: "ground",
    narration: "1年の{lead}が、3年の{second}とレギュラーを争うまでになってきた。",
    speaker: "lead",
    intro: L(
      "先輩には負けたくありません。試合で使ってください。",
      "監督、おれ、{second}先輩にも負けてないっすよ！ 使ってください！",
      "……先輩より、やれます。",
      "監督、おれ最近キレッキレじゃないっすか？ そろそろ出番っすよね！",
      "ぼく……先輩に勝てるなんて思っていないですけど……試合には、出たいです……。",
    ),
    options: [
      {
        label: "1年生を抜てきする",
        auto: 1,
        results: [{ narration: "{lead}を次の試合で使うと伝えた。{second}は悔しそうに唇をかんだ。", reaction: "glad", effects: [{ t: "condition", who: "lead", amount: 1 }, { t: "proficiency", who: "lead", amount: 5 }, { t: "condition", who: "second", amount: -1 }] }],
      },
      {
        label: "3年生を立てる",
        auto: 1,
        results: [{ narration: "今は{second}を使うと伝えた。", reaction: "hurt", effects: [{ t: "trust", who: "second", amount: 5 }, { t: "condition", who: "lead", amount: -1 }] }],
      },
      {
        label: "競わせる",
        auto: 1.2,
        results: [{ narration: "2人は練習で激しくポジションを争った。", reaction: "fired", effects: [{ t: "exp", who: "pair", stats: "key2", amount: 10 }, { t: "fitness", who: "pair", amount: -8 }] }],
      },
    ],
    weight: 4,
  },
  {
    id: "morningPractice",
    title: "早朝練習をしたい",
    bg: "gate",
    narration: "{lead}たちが、朝練をさせてほしいと申し出てきた。",
    speaker: "lead",
    intro: L(
      "授業の前に、自主的に練習する時間がほしいんです。",
      "監督、朝練やらせてください！ 1日でも早くうまくなりたいんす！",
      "……朝、グラウンド使わせてください。",
      "朝練、やりたいっす！ 早起きは苦手っすけど！",
      "あの……朝、少しだけ練習してもいいでしょうか……。",
    ),
    options: [
      {
        label: "認める",
        auto: 1,
        results: [{ narration: "{lead}たちは、毎朝グラウンドに集まるようになった。", reaction: "glad", effects: [{ t: "exp", who: "pair", stats: "key2", amount: 15 }, { t: "fitness", who: "pair", amount: -10 }, { t: "academic", who: "pair", amount: -2 }] }],
      },
      {
        label: "認めない",
        auto: 0.8,
        results: [{ narration: "朝は授業に備えて休むよう伝えた。", reaction: "hurt", effects: [{ t: "trust", who: "pair", amount: -3 }, { t: "fitness", who: "pair", amount: 5 }] }],
      },
    ],
    weight: 4,
  },

  // ================= スタッフから =================
  {
    id: "headPlan",
    title: "練習方針の提案",
    bg: "meeting",
    narration: "ヘッドコーチの{staff}が、練習の計画表を持ってきた。",
    speaker: "staff",
    intro: "監督、しばらく戦術の確認を中心にしてはどうでしょう。判断の速さが、まだ足りません。",
    options: [
      {
        label: "採用する",
        auto: 1,
        results: [{ narration: "しばらく戦術中心の練習を行った。", reaction: "calm", effects: [{ t: "exp", who: "team", stats: ["decision", "vision"], amount: 10 }, { t: "nextPractice", mult: 0.8 }] }],
      },
      {
        label: "一部だけ取り入れる",
        auto: 1.1,
        results: [{ narration: "練習の最後に、戦術の確認を足すことにした。", reaction: "calm", effects: [{ t: "exp", who: "team", stats: ["decision"], amount: 4 }, { t: "nextPractice", mult: 0.95 }] }],
      },
      {
        label: "見送る",
        auto: 0.9,
        results: [{ narration: "今の練習を続けることにした。", reaction: "unsure", effects: [{ t: "nextPractice", mult: 1.05 }] }],
      },
    ],
    weight: 3,
  },
  {
    id: "physicalRest",
    title: "休養の提案",
    bg: "infirmary",
    narration: "フィジカルコーチの{staff}が、体力の記録を見て声をかけてきた。",
    speaker: "staff",
    intro: "監督、部員たちの疲労がかなりたまっています。思い切って休ませませんか。",
    options: [
      {
        label: "受け入れる（2日休み）",
        auto: 1.2,
        results: [{ narration: "2日間、練習を休みにした。", reaction: "calm", effects: [{ t: "rest", who: "team", days: 2 }, { t: "fitness", who: "team", amount: 25 }] }],
      },
      {
        label: "1日だけ休む",
        auto: 1.1,
        results: [{ narration: "1日だけ練習を休みにした。", reaction: "calm", effects: [{ t: "rest", who: "team", days: 1 }, { t: "fitness", who: "team", amount: 12 }] }],
      },
      {
        label: "練習を続ける",
        auto: 0.6,
        results: [{ narration: "疲れを押して練習を続けた。", reaction: "unsure", effects: [{ t: "nextPractice", mult: 1.1 }, { t: "injury", who: "team", chance: 0.03, days: [3, 8] }] }],
      },
    ],
    weight: 4,
  },
  {
    id: "gkSpecial",
    title: "GKの特訓の提案",
    bg: "ground",
    narration: "GKコーチの{staff}が、ゴール前で手招きをしている。",
    speaker: "staff",
    intro: "監督、GKを鍛える特別メニューを考えました。やらせてみませんか。",
    options: [
      {
        label: "GK全員に",
        auto: 1.2,
        results: [{ narration: "GKたちは特別メニューで汗を流した。", reaction: "calm", effects: [{ t: "exp", who: "gks", stats: "gk", amount: 20 }, { t: "learn", who: "gks", via: "gk", base: 0.12 }, { t: "fitness", who: "gks", amount: -15 }] }],
      },
      {
        label: "正GKだけに",
        auto: 1,
        results: [{ narration: "正GKの{lead}が、付きっきりで鍛えられた。", reaction: "calm", effects: [{ t: "exp", who: "lead", stats: "gk", amount: 30 }, { t: "learn", who: "lead", via: "gk", base: 0.2 }, { t: "condition", who: "otherGks", amount: -1 }] }],
      },
      {
        label: "見送る",
        auto: 0.7,
        results: [{ narration: "今回は見送ることにした。", reaction: "calm", effects: [{ t: "fitness", who: "gks", amount: 10 }] }],
      },
    ],
    weight: 3,
  },
  {
    id: "videoStudy",
    title: "映像の勉強会",
    bg: "meeting",
    narration: "分析担当の{staff}が、対戦相手の映像を用意してきた。",
    speaker: "staff",
    intro: "監督、映像を使った勉強会を開きたいと思います。対象はどうしましょう。",
    options: [
      {
        label: "全員で",
        auto: 1.1,
        results: [{ narration: "部員全員で映像を見て、意見を出し合った。", reaction: "calm", effects: [{ t: "exp", who: "team", stats: ["decision"], amount: 8 }, { t: "fitness", who: "team", amount: 5 }, { t: "nextPractice", mult: 0.9 }] }],
      },
      {
        label: "主力だけ",
        auto: 1,
        results: [{ narration: "主力の11人が、映像で相手の弱点を確かめた。", reaction: "calm", effects: [{ t: "exp", who: "top11", stats: ["decision"], amount: 12 }] }],
      },
      {
        label: "見送る",
        auto: 0.8,
        results: [{ narration: "今回は練習を優先した。", reaction: "calm", effects: [{ t: "nextPractice", mult: 1.05 }] }],
      },
    ],
    weight: 3,
  },

  // ================= 外から・チーム全体 =================
  {
    id: "obVisit",
    title: "OBの訪問",
    bg: "gate",
    narration: "OBの{ob}が、久しぶりにグラウンドへ顔を出した。",
    speaker: "ob",
    intro: "監督、ご無沙汰しています。後輩たちの様子を見に来ました。何か手伝えることはありますか。",
    options: [
      {
        label: "練習に入ってもらう",
        auto: 1.2,
        results: [{ narration: "{ob}が練習に入り、得意のプレーを見せてくれた。", reaction: "glad", effects: [{ t: "learn", who: "lead", via: "ob", base: 0.35 }, { t: "nextPractice", mult: 0.9 }] }],
      },
      {
        label: "話だけしてもらう",
        auto: 1,
        results: [{ narration: "{ob}が、高校時代の思い出を語ってくれた。", reaction: "glad", effects: [{ t: "condition", who: "team", amount: 1, chance: 0.3 }] }],
      },
      {
        label: "断る",
        auto: 0.5,
        results: [{ narration: "今日は練習に集中したいと伝えた。", reaction: "calm", effects: [{ t: "nextPractice", mult: 1.05 }] }],
      },
    ],
    weight: 3,
  },
  {
    id: "clinicRequest",
    title: "サッカー教室の依頼",
    bg: "ground",
    narration: "地元の少年団から、サッカー教室を開いてほしいという依頼が届いた。",
    speaker: "captain",
    intro: L(
      "少年団の子どもたちに教えるのも、良い経験になると思います。",
      "子どもたちに教えるの、楽しそうっすね！ やりましょうよ！",
      "……監督が決めてください。",
      "子どもたちと遊べるんすか！ やりたいっす！",
      "ぼ、ぼくに教えられるかな……。",
    ),
    options: [
      {
        label: "全員で行く",
        auto: 1,
        results: [{ narration: "部員全員で、子どもたちにサッカーを教えた。", reaction: "glad", effects: [{ t: "reputation", amount: 3 }, { t: "rest", who: "team", days: 1 }, { t: "condition", who: "team", amount: 1, chance: 0.3 }] }],
      },
      {
        label: "3年生だけ行かせる",
        auto: 1.1,
        results: [{ narration: "3年生が少年団に出向いた。", reaction: "calm", effects: [{ t: "reputation", amount: 2 }, { t: "rest", who: "grade3", days: 1 }, { t: "trust", who: "grade3", amount: 3 }] }],
      },
      {
        label: "断る",
        auto: 0.7,
        results: [{ narration: "今回は依頼を断った。", reaction: "calm", effects: [{ t: "nextPractice", mult: 1.05 }] }],
      },
    ],
    weight: 3,
  },
  {
    id: "interview",
    title: "取材の申し込み",
    bg: "gate",
    narration: "地元のテレビ局から、部を取材したいという申し込みがあった。",
    speaker: "captain",
    intro: L(
      "取材ですか。部のことを知ってもらう良い機会だと思います。",
      "テレビっすか！ おれ、映りたいっす！",
      "……カメラ、苦手っす。",
      "マジっすか！ おれ、テレビデビューっすか！",
      "テ、テレビなんて……緊張します……。",
    ),
    options: [
      {
        label: "受ける",
        auto: 1.1,
        results: [{ narration: "取材の様子が、地元のニュースで流れた。", reaction: "glad", effects: [{ t: "reputation", amount: 4 }, { t: "condition", who: "team", amount: 1, chance: 0.15 }, { t: "condition", who: "team", amount: -1, chance: 0.1 }] }],
      },
      {
        label: "キャプテンだけ",
        auto: 1,
        results: [{ narration: "キャプテンの{lead}が代表して取材を受けた。", reaction: "fired", effects: [{ t: "reputation", amount: 2 }, { t: "condition", who: "captain", amount: 1 }] }],
      },
      {
        label: "断る",
        auto: 0.6,
        results: [{ narration: "今は練習に集中したいと伝えた。", reaction: "calm", effects: [{ t: "condition", who: "team", amount: 1, chance: 0.2 }] }],
      },
    ],
    weight: 3,
  },
  {
    id: "complaint",
    title: "監督への不満",
    bg: "clubroom",
    narration: "部室の前を通りかかると、監督のやり方への不満が聞こえてきた。キャプテンの{lead}が気まずそうに出てくる。",
    speaker: "captain",
    intro: L(
      "監督……みんな、今のやり方に少し戸惑っているみたいです。",
      "監督、正直に言います！ みんな、今のままじゃ納得できてないっす！",
      "……みんな、不満があるみたいっす。",
      "あー……監督、聞こえちゃいました？ みんな、ちょっとモヤモヤしてて……。",
      "あの……みんなが、その……監督のことで……。",
    ),
    options: [
      {
        label: "方針を説明する",
        auto: 1.1,
        results: [{ narration: "練習を休みにして、監督が自分の考えを一人ひとりに説明した。", reaction: "thanks", effects: [{ t: "trust", who: "lowTrust", amount: 8 }, { t: "rest", who: "team", days: 1 }] }],
      },
      {
        label: "結果で示す",
        auto: 0.9,
        results: [{ narration: "次の公式戦の結果で示すと、監督は言い切った。", reaction: "fired", effects: [{ t: "promise", kind: "winNextOfficial" }] }],
      },
      {
        label: "部員の意見を聞く",
        auto: 1,
        results: [{ narration: "部員一人ひとりの意見を聞く時間を作った。", reaction: "thanks", effects: [{ t: "trust", who: "team", amount: 4 }, { t: "nextPractice", mult: 0.9 }] }],
      },
    ],
    weight: 4,
  },
  {
    id: "rainyDay",
    title: "雨の日の過ごし方",
    bg: "rain",
    narration: "朝から雨が降り続いている。グラウンドは使えそうにない。",
    speaker: "captain",
    intro: L(
      "監督、今日はどうしましょうか。",
      "監督、雨っすね！ 今日は何やるんすか！",
      "……雨っすね。",
      "雨っすね～。今日は何するんすか？",
      "あの……今日の練習は……。",
    ),
    options: [
      {
        label: "室内で筋トレ",
        auto: 1,
        results: [{ narration: "トレーニングルームで筋力トレーニングを行った。", reaction: "calm", effects: [{ t: "exp", who: "team", stats: ["physical"], amount: 8 }, { t: "fitness", who: "team", amount: -5 }] }],
      },
      {
        label: "ミーティング",
        auto: 1,
        results: [{ narration: "教室を借りて、戦術のミーティングを行った。", reaction: "calm", effects: [{ t: "exp", who: "team", stats: ["decision"], amount: 8 }] }],
      },
      {
        label: "休みにする",
        auto: 1,
        results: [{ narration: "今日は休みにして、体を休めた。", reaction: "glad", effects: [{ t: "fitness", who: "team", amount: 15 }] }],
      },
    ],
    weight: 3,
    gap: 30,
  },
  {
    id: "campNight",
    title: "合宿の夜",
    bg: "groundNight",
    narration: "合宿の最後の夜。部員たちは宿舎に戻ってきた。",
    speaker: "captain",
    intro: L(
      "監督、最後の夜はどう過ごしましょうか。",
      "監督、最後の夜っすね！ 何かやりましょうよ！",
      "……最後の夜っすね。",
      "監督～、最後の夜くらい楽しみましょうよ！",
      "あの……明日で合宿も終わりですね……。",
    ),
    options: [
      {
        label: "夜にミーティング",
        auto: 1,
        results: [{ narration: "夜遅くまで、合宿の成果を振り返った。", reaction: "calm", effects: [{ t: "exp", who: "team", stats: ["decision"], amount: 6 }, { t: "trust", who: "team", amount: 2 }, { t: "fitness", who: "team", amount: -5 }] }],
      },
      {
        label: "早く寝かせる",
        auto: 1.1,
        results: [{ narration: "早めに消灯して、疲れを取らせた。", reaction: "calm", effects: [{ t: "fitness", who: "team", amount: 10 }] }],
      },
      {
        label: "自由時間にする",
        auto: 1,
        results: [{ narration: "部員たちは遅くまで語り合っていた。", reaction: "glad", effects: [{ t: "trust", who: "team", amount: 3 }, { t: "condition", who: "team", amount: 1, chance: 0.3 }] }],
      },
    ],
    weight: 0,
  },
  {
    id: "seniorAdvice",
    title: "先輩からの助言",
    bg: "groundDusk",
    narration: "3年の{second}が、伸び悩む{lead}に声をかけようか迷っている。",
    speaker: "lead",
    intro: L(
      "先輩たちに、もっと教えてもらいたいと思っています。",
      "監督、先輩たちの技、盗みたいっす！",
      "……先輩に、教わりたいっす。",
      "先輩たちのプレー、マジでかっこいいんすよね～。",
      "先輩に、話しかけてもいいのかな……。",
    ),
    options: [
      {
        label: "先輩に指導を頼む",
        auto: 1.1,
        results: [{ narration: "{second}が、{lead}に自分の技を教え始めた。", reaction: "glad", effects: [{ t: "exp", who: "lead", stats: "key2", amount: 12 }, { t: "fitness", who: "second", amount: -5 }, { t: "trust", who: "second", amount: 3 }] }],
      },
      {
        label: "自分で盗めと言う",
        auto: 0.9,
        results: [
          { chance: 0.5, narration: "{lead}は先輩のプレーを食い入るように見つめていた。", reaction: "fired", effects: [{ t: "exp", who: "lead", stats: "key2", amount: 8 }, { t: "condition", who: "lead", amount: 1 }] },
          { narration: "{lead}は何をすればいいのか分からない様子だ。", reaction: "unsure", effects: [{ t: "trust", who: "lead", amount: -3 }] },
        ],
      },
    ],
    weight: 4,
  },
];

/** 学校行事の選択（テスト前・体育祭・文化祭） */
export const SCHOOL_CHOICES: Record<"testPrep" | "sportsDay" | "culturalFestival", ChoiceEventDef> = {
  testPrep: {
    id: "testPrep",
    title: "テスト前",
    bg: "exam",
    narration: "{test}まで、あと3日。部員たちの顔に焦りが見える。",
    speaker: "captain",
    intro: L(
      "監督、テスト前の練習はどうしますか。",
      "監督、テストが近いっす！ 練習、どうするんすか！",
      "……テスト、近いっすね。",
      "テストっすね～……。監督、練習どうします？",
      "あの……テストが心配で……。練習はどうしましょうか……。",
    ),
    options: [
      {
        label: "部活を休んで勉強",
        auto: 0.9,
        results: [{ narration: "テストまでの3日間、部活を休んで勉強することにした。", reaction: "thanks", effects: [{ t: "testPrep", policy: "study" }] }],
      },
      {
        label: "練習を短くする",
        auto: 1.2,
        results: [{ narration: "テストまでの3日間、練習を短くすることにした。", reaction: "calm", effects: [{ t: "testPrep", policy: "short" }] }],
      },
      {
        label: "いつもどおり練習",
        auto: 0.8,
        results: [{ narration: "テストの前でも、いつもどおり練習することにした。", reaction: "unsure", effects: [{ t: "testPrep", policy: "normal" }] }],
      },
    ],
    weight: 0,
  },
  sportsDay: {
    id: "sportsDay",
    title: "体育祭",
    bg: "sportsDay",
    narration: "今日は体育祭。最後の部活対抗リレーには、サッカー部も出場する。",
    speaker: "captain",
    intro: L(
      "監督、部活対抗リレーは本気で勝ちにいってもいいですか。",
      "監督！ 部活対抗リレー、今年こそ陸上部に勝ちたいっす！ 本気でいっていいすか？",
      "……リレー、勝ちにいきます？",
      "リレーっすよリレー！ 監督、本気出しちゃっていいっすか？",
      "あの……リレー、どのくらい本気で走ればいいでしょうか……。",
    ),
    options: [
      {
        label: "本気で勝ちにいく",
        auto: 1,
        results: [{ narration: "サッカー部は全力でバトンをつないだ。", reaction: "fired", effects: [{ t: "relay" }] }],
      },
      {
        label: "ケガのないよう、楽しむ程度に",
        auto: 1.1,
        results: [{ narration: "サッカー部は笑顔でリレーを走りきった。", reaction: "glad", effects: [{ t: "condition", who: "team", amount: 1, chance: 0.3 }, { t: "injury", who: "team", chance: 0.02, days: [3, 7] }] }],
      },
    ],
    weight: 0,
  },
  culturalFestival: {
    id: "culturalFestival",
    title: "文化祭",
    bg: "festival",
    narration: "文化祭の準備が始まった。サッカー部も何か出し物をすることになった。",
    speaker: "captain",
    intro: L(
      "監督、部の出し物はどうしましょうか。",
      "監督、文化祭っすよ！ 部で何かやりましょうよ！",
      "……出し物、どうします？",
      "文化祭っすね！ 何やります？ 何やります？",
      "あの……部の出し物、どうしましょう……。",
    ),
    options: [
      {
        label: "サッカー教室（近所の子ども向け）",
        auto: 1.1,
        results: [{ narration: "グラウンドでサッカー教室を開き、子どもたちでにぎわった。", reaction: "glad", effects: [{ t: "reputation", amount: 4 }, { t: "fitness", who: "team", amount: -5 }] }],
      },
      {
        label: "部の展示",
        auto: 1,
        results: [{ narration: "部の歴史をまとめた展示に、たくさんの人が足を止めた。", reaction: "calm", effects: [{ t: "reputation", amount: 2 }, { t: "trust", who: "team", amount: 2 }, { t: "academic", who: "lowAcademic", amount: 2 }] }],
      },
      {
        label: "クラスの出し物を優先",
        auto: 0.9,
        results: [{ narration: "部員たちはそれぞれのクラスの出し物を楽しんだ。", reaction: "glad", effects: [{ t: "reputation", amount: 2 }, { t: "condition", who: "team", amount: 1, chance: 0.4 }] }],
      },
    ],
    weight: 0,
  },
};

/** スタッフ・OB が選んだ後に返す一言（反応の種類ごと） */
export const ADULT_REACTIONS: Record<Reaction, string> = {
  glad: "ありがとうございます。きっと良い経験になります。",
  fired: "分かりました。全力でやらせます。",
  thanks: "ご理解いただき、ありがとうございます。",
  hurt: "……そうですか。残念ですが、従います。",
  unsure: "分かりました。様子を見ながら進めましょう。",
  calm: "分かりました。そのように進めます。",
  sorry: "申し訳ありません。私の見立てが甘かったようです。",
  angry: "……分かりました。",
};
