/** 私服の色（OB・スカウトの候補。ID から毎回同じ色を選ぶ。表示だけ） */
const CASUAL = ["#5d6b7a", "#8a6f4d", "#3f5a7a", "#7a4545", "#4d6b52", "#b9b2a0", "#2f3a46", "#6b5a7a"];

export function casualColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CASUAL[h % CASUAL.length];
}
