"use client";

/**
 * 画面の基本の部品（docs/DESIGN.md）。色・角・影は globals.css の基本値だけを使う。
 */
import { useEffect, useState, type ReactNode } from "react";
import type { Rank, SchoolRank } from "@/engine/types";
import { Icon, type IconName } from "../icons";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON: Record<Variant, string> = {
  primary: "bg-yellow text-ink shadow-hard disabled:bg-panel-3 disabled:text-text-3 disabled:shadow-none",
  secondary: "bg-telop text-ink shadow-hard disabled:bg-panel-3 disabled:text-text-3 disabled:shadow-none",
  danger: "bg-red text-white shadow-hard disabled:bg-panel-3 disabled:text-text-3",
  ghost: "bg-panel-2 text-text border border-line-2 disabled:text-text-3",
};

/** ボタン。押すと沈む（.pressable）。斜めに切った形にするときは cut を付ける */
export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
  icon,
  small,
  cut,
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  icon?: IconName;
  small?: boolean;
  cut?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`pressable inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-black ${small ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm"} ${cut ? "cut-r pr-6" : ""} ${BUTTON[variant]} ${className}`}
    >
      {icon && <Icon name={icon} size={small ? 14 : 16} />}
      {children}
    </button>
  );
}

/** 丸い（四角い）アイコンだけのボタン */
export function IconButton({ name, onClick, label, className = "", variant = "ghost", disabled }: { name: IconName; onClick?: () => void; label: string; className?: string; variant?: Variant; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} disabled={disabled} className={`pressable inline-flex min-h-11 min-w-11 items-center justify-center ${BUTTON[variant]} ${className}`}>
      <Icon name={name} size={18} />
    </button>
  );
}

export const RANK_BG: Record<string, string> = {
  SS: "bg-rank-ss",
  S: "bg-rank-s",
  A: "bg-rank-a",
  B: "bg-rank-b",
  C: "bg-rank-c",
  D: "bg-rank-d",
  E: "bg-rank-e",
  F: "bg-rank-f",
  G: "bg-rank-g",
};
export const RANK_TEXT: Record<string, string> = {
  SS: "text-rank-ss",
  S: "text-rank-s",
  A: "text-rank-a",
  B: "text-rank-b",
  C: "text-rank-c",
  D: "text-rank-d",
  E: "text-rank-e",
  F: "text-rank-f",
  G: "text-rank-g",
};

/** ランクの札（斜めの四角） */
export function RankBadge({ rank, size = "md" }: { rank: Rank | SchoolRank; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-[1.125rem] min-w-[1.375rem] text-[0.75rem]" : size === "lg" ? "h-9 min-w-10 text-xl" : "h-6 min-w-7 text-sm";
  return <span className={`font-num inline-flex -skew-x-12 items-center justify-center px-1 font-bold text-ink ${sz} ${RANK_BG[rank]}`}>{rank}</span>;
}

/** 横のバー（斜めに切る） */
export function Bar({ value, max = 100, color = "bg-yellow", className = "" }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`h-2 w-full -skew-x-[20deg] bg-panel-3 ${className}`}>
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function fitnessColor(v: number) {
  return v >= 70 ? "bg-fit-high" : v >= 45 ? "bg-fit-mid" : "bg-fit-low";
}
export function fitnessText(v: number) {
  return v >= 70 ? "text-good" : v >= 45 ? "text-warn" : "text-bad";
}

/** 切り替え（選んでいるものは黄色） */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
  className = "",
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
  className?: string;
}) {
  return (
    <div className={`flex gap-0.5 bg-panel p-0.5 ${className}`}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`pressable min-h-9 flex-1 px-2 text-xs font-black ${value === o ? "bg-yellow text-ink" : "bg-panel-2 text-text-2"}`}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

/** オン・オフのスイッチ */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="pressable flex min-h-11 w-full items-center justify-between gap-3 bg-panel-2 px-3 text-left text-sm">
      <span>{label}</span>
      <span className={`font-num flex h-6 w-14 shrink-0 -skew-x-12 items-center justify-center text-xs font-bold ${checked ? "bg-yellow text-ink" : "bg-panel-3 text-text-3"}`}>{checked ? "ON" : "OFF"}</span>
    </button>
  );
}

/** 見出しの帯（明るい地に斜めの切り込み） */
export function Band({ children, sub, className = "", tone = "telop", right }: { children: ReactNode; sub?: ReactNode; className?: string; tone?: "telop" | "yellow" | "red"; right?: ReactNode }) {
  const bg = tone === "yellow" ? "bg-yellow text-ink" : tone === "red" ? "bg-red text-white" : "bg-telop text-ink";
  return (
    <div className={`flex items-end gap-2 ${className}`}>
      <h2 className={`cut-r font-head inline-flex items-baseline gap-2 py-0.5 pl-2.5 pr-6 text-[0.9375rem] leading-snug ${bg}`}>
        {children}
        {sub && <span className="font-body text-[0.6875rem] font-bold text-ink-2">{sub}</span>}
      </h2>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

/** 暗い地の枠（中身の入れ物） */
export function Panel({ children, className = "", title, sub, right }: { children: ReactNode; className?: string; title?: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <section className={`flex min-h-0 flex-col ${className}`}>
      {title && <Band sub={sub} right={right} className="mb-1">{title}</Band>}
      <div className="min-h-0 flex-1 bg-panel p-2">{children}</div>
    </section>
  );
}

/** 小さな札（特殊能力など） */
export function Chip({ children, className = "", onClick, tone = "telop" }: { children: ReactNode; className?: string; onClick?: () => void; tone?: "telop" | "yellow" | "dark" | "red" }) {
  const bg = tone === "yellow" ? "bg-yellow text-ink" : tone === "dark" ? "bg-panel-3 text-text" : tone === "red" ? "bg-red text-white" : "bg-telop text-ink";
  const cls = `cut-r inline-flex items-center gap-1 py-0.5 pl-1.5 pr-3.5 text-[0.6875rem] font-black ${bg} ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`pressable ${cls}`}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}

/**
 * 画面いっぱいの枠：芝の背景、上に見出しの帯（戻るボタン）、中身。
 * 中身はセーフエリアの内側に置き、画面全体はスクロールさせない
 */
export function Screen({ title, sub, onBack, right, children, className = "", bodyClassName = "" }: { title?: ReactNode; sub?: ReactNode; onBack?: () => void; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <main className={`bg-pitch-stripes fixed inset-0 flex flex-col ${className}`}>
      {(title || onBack) && <Header title={title ?? ""} sub={sub} onBack={onBack} right={right} />}
      <div className={`flex min-h-0 flex-1 flex-col pb-[max(0.5rem,var(--safe-b))] pl-[max(0.5rem,var(--safe-l))] pr-[max(0.5rem,var(--safe-r))] ${title || onBack ? "pt-2" : "pt-[max(0.5rem,var(--safe-t))]"} ${bodyClassName}`}>{children}</div>
    </main>
  );
}

/** 画面の見出し（左に戻る、帯の題名、右に操作） */
export function Header({ title, sub, onBack, right }: { title: ReactNode; sub?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="flex min-h-11 shrink-0 items-center gap-2 pl-[max(0.5rem,var(--safe-l))] pr-[max(0.5rem,var(--safe-r))] pt-[max(0.375rem,var(--safe-t))]">
      {onBack && <IconButton name="back" label="戻る" onClick={onBack} variant="ghost" className="!min-h-9 !min-w-9 bg-panel" />}
      <h1 className="cut-r font-head flex min-w-0 items-baseline gap-2 truncate bg-yellow py-1 pl-3 pr-8 text-base text-ink">
        <span className="truncate">{title}</span>
        {sub && <span className="font-body truncate text-[0.6875rem] font-bold text-ink-2">{sub}</span>}
      </h1>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/**
 * 重ねて出す枠（確認・詳細）。横画面なので中央に出し、中身だけスクロールする。
 * wide = 画面いっぱい近くまで広げる
 */
export function Sheet({ children, onClose, title, wide = false }: { children: ReactNode; onClose?: () => void; title?: string; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 pb-[max(0.5rem,var(--safe-b))] pl-[max(0.5rem,var(--safe-l))] pr-[max(0.5rem,var(--safe-r))] pt-2" onClick={onClose}>
      <div className={`anim-fade-up flex max-h-full w-full flex-col border-2 border-line-2 bg-panel shadow-hard-lg ${wide ? "max-w-[56rem]" : "max-w-[34rem]"}`} onClick={(e) => e.stopPropagation()}>
        {(title || onClose) && (
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel-2 py-1 pl-0 pr-1">
            {title && <h2 className="cut-r font-head bg-telop py-1 pl-3 pr-7 text-sm text-ink">{title}</h2>}
            {onClose && <IconButton name="close" label="閉じる" onClick={onClose} className="!min-h-9 !min-w-9 ml-auto border-0 bg-transparent" />}
          </div>
        )}
        <div className="scroll-y min-h-0 flex-1 p-3">{children}</div>
      </div>
    </div>
  );
}

/** 短い知らせ（数秒で消える） */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed bottom-[max(1rem,var(--safe-b))] left-1/2 z-50 -translate-x-1/2">
      <div className="cut-lr anim-fade-up bg-telop px-8 py-2 text-sm font-black text-ink shadow-hard">{message}</div>
    </div>
  );
}

/** 文章を 1 行で見せ、はみ出すときは「…」。タップで全文 */
export function Truncated({ text, className = "", title = "全文" }: { text: string; className?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`block w-full min-w-0 truncate text-left ${className}`}>
        {text}
      </button>
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <p className="text-sm leading-relaxed">{text}</p>
        </Sheet>
      )}
    </>
  );
}

/** 空の表示 */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="p-3 text-sm text-text-3">{children}</p>;
}

/** 表の行（タップできる） */
export function Row({ children, onClick, active, className = "" }: { children: ReactNode; onClick?: () => void; active?: boolean; className?: string }) {
  const cls = `flex min-h-11 w-full items-center gap-2 border-b border-line px-2 text-left text-sm ${active ? "bg-panel-3" : ""} ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`pressable ${cls}`}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** 小さな見出し（枠の中） */
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`mb-1 text-[0.6875rem] font-black tracking-wider text-yellow ${className}`}>{children}</h3>;
}

/** 数字の大きな表示 */
export function Stat({ label, value, className = "" }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={`bg-panel-2 px-2 py-1 ${className}`}>
      <div className="text-[0.6875rem] font-bold text-text-3">{label}</div>
      <div className="font-num text-lg font-bold leading-tight">{value}</div>
    </div>
  );
}
