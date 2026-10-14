import { Icon } from "../icons";

/** 縦に持ったときに出す画面（CSS の向きの判定で出し分ける。globals.css） */
export function PortraitNotice() {
  return (
    <div className="portrait-notice bg-pitch-stripes fixed inset-0 z-[100] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="relative h-28 w-28">
        <Icon name="rotate" size={112} className="text-yellow" stroke={1.6} />
      </div>
      <p className="cut-lr font-head bg-telop px-10 py-2 text-lg text-ink">端末を横向きにしてください</p>
      <p className="max-w-72 text-sm font-bold text-text-2">このゲームは横画面で遊びます。画面の向きのロックを外して、横に持ってください。</p>
    </div>
  );
}
