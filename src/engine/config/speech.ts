/**
 * せりふの話し方（R2。SPEC 18.3・PHASE_R2_PLAN 5.3）。性格 8 種を、話し方の型 5 種に分ける。
 * せりふは型ごとに書き、同じ型の中では性格で語尾を少しだけ変える（personalityTail）。
 */
import type { Personality } from "../types";

export const SPEECH_STYLES = ["polite", "hot", "blunt", "cheerful", "timid"] as const;
export type SpeechStyle = (typeof SPEECH_STYLES)[number];
/** 型ごとのせりふ */
export type Lines = Record<SpeechStyle, string>;

/** 性格 → 話し方の型 */
export const PERSONALITY_SPEECH: Record<Personality, SpeechStyle> = {
  diligent: "polite",
  calm: "polite",
  passionate: "hot",
  competitive: "hot",
  craftsman: "blunt",
  moodMaker: "cheerful",
  inspired: "cheerful",
  cautious: "timid",
};

/** 部員の反応の種類（選択肢を選んだ後のひとこと） */
export const REACTIONS = ["glad", "fired", "thanks", "hurt", "unsure", "calm", "sorry", "angry"] as const;
export type Reaction = (typeof REACTIONS)[number];

/** 反応のせりふ（型ごと）。{coach} は「監督」 */
export const REACTION_LINES: Record<Reaction, Lines> = {
  glad: {
    polite: "ありがとうございます。そう言ってもらえると、気持ちが楽になります。",
    hot: "よっしゃ！ その言葉を待ってたんですよ！",
    blunt: "……どうも。助かります。",
    cheerful: "やった！ 監督、話が分かる～！",
    timid: "ほ、本当ですか……？ よかった……。",
  },
  fired: {
    polite: "分かりました。結果で応えます。",
    hot: "燃えてきた……！ 絶対やってやりますよ！",
    blunt: "……やります。見ててください。",
    cheerful: "よーし、なんかいける気がしてきたっす！",
    timid: "が、がんばってみます……。自信はないですけど……。",
  },
  thanks: {
    polite: "話を聞いてくださって、ありがとうございました。",
    hot: "監督、マジで感謝っす！ この恩は試合で返します！",
    blunt: "……ありがとうございます。少し、すっきりしました。",
    cheerful: "聞いてもらえて、めっちゃ楽になりました！",
    timid: "ちゃんと聞いてもらえて……うれしかったです。",
  },
  hurt: {
    polite: "……分かりました。納得はしていませんが、従います。",
    hot: "なんでですか！ ……くそっ、分かりましたよ。",
    blunt: "……そうっすか。",
    cheerful: "え～……そっか、そうなるか～……。",
    timid: "……すみません。わがままを言いました……。",
  },
  unsure: {
    polite: "そうですね……。もう少し、自分でも考えてみます。",
    hot: "うーん……なんか、すっきりしないっすね。",
    blunt: "……考えときます。",
    cheerful: "うーん、まあ、なんとかなるっすかね？",
    timid: "そ、そうですよね……。どうしたらいいのか……。",
  },
  calm: {
    polite: "はい、分かりました。",
    hot: "了解っす！",
    blunt: "……うっす。",
    cheerful: "りょーかいっす！",
    timid: "は、はい……。分かりました。",
  },
  sorry: {
    polite: "申し訳ありませんでした。以後、気をつけます。",
    hot: "すいませんでした！ 熱くなりすぎました！",
    blunt: "……すんません。",
    cheerful: "ごめんなさい！ 反省してます、マジで！",
    timid: "ご、ごめんなさい……。",
  },
  angry: {
    polite: "……それは、あんまりだと思います。",
    hot: "納得いかねえっすよ、そんなの！",
    blunt: "……勝手にしてください。",
    cheerful: "えー、それはないっすよ監督～！",
    timid: "……そんな……。",
  },
};

/** 同じ型の中で、性格で言い方を変えるせりふ（冷静沈着は「〜だと思います」、ひらめき型は「ピンときた」など） */
export const REACTION_OVERRIDES: Partial<Record<Reaction, Partial<Record<Personality, string>>>> = {
  fired: {
    calm: "分かりました。それが一番の近道だと思います。",
    inspired: "あ、今ピンときました！ やってみるっす！",
    competitive: "負けっぱなしは性に合わないんで。やりますよ。",
  },
  glad: {
    calm: "ありがとうございます。それが正しい判断だと思います。",
    inspired: "おっ、なんか今のでひらめいたかも！",
  },
  hurt: {
    calm: "……分かりました。監督の考えも、理解はできると思います。",
    competitive: "……次は、文句を言わせない結果を出します。",
  },
  unsure: {
    calm: "どちらが正しいのか、まだ判断がつかないと思います。",
    inspired: "うーん、ピンとこないっす……。",
  },
};
