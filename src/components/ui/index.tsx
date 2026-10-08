"use client";

import type { ReactNode } from "react";
import type { Rank, SchoolRank } from "@/engine/types";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const styles: Record<Variant, string> = {
    primary: "bg-pitch text-white active:bg-pitch-dark disabled:bg-gray-300",
    secondary: "bg-white text-pitch-dark border border-pitch/40 active:bg-green-50 disabled:text-gray-400",
    danger: "bg-white text-red-700 border border-red-300 active:bg-red-50",
    ghost: "bg-transparent text-pitch-dark active:bg-green-50",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

const RANK_COLORS: Record<string, string> = {
  SS: "bg-fuchsia-600 text-white",
  S: "bg-rose-600 text-white",
  A: "bg-orange-500 text-white",
  B: "bg-amber-400 text-amber-950",
  C: "bg-lime-500 text-lime-950",
  D: "bg-emerald-500 text-white",
  E: "bg-sky-500 text-white",
  F: "bg-slate-400 text-white",
  G: "bg-slate-300 text-slate-700",
};

export function RankBadge({ rank, size = "md" }: { rank: Rank | SchoolRank; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "h-5 min-w-5 text-[11px]" : size === "lg" ? "h-9 min-w-9 text-lg" : "h-6 min-w-6 text-xs";
  return <span className={`inline-flex items-center justify-center rounded-md px-1 font-black ${sz} ${RANK_COLORS[rank]}`}>{rank}</span>;
}

export function Bar({ value, max = 100, color = "bg-pitch", className = "" }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-gray-200 ${className}`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function fitnessColor(v: number) {
  return v >= 70 ? "bg-emerald-500" : v >= 45 ? "bg-amber-400" : "bg-red-500";
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`min-h-9 flex-1 rounded-md px-1 text-xs font-bold ${value === o ? "bg-white text-pitch-dark shadow" : "text-gray-500"}`}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ children, onClose, title }: { children: ReactNode; onClose?: () => void; title?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-4 pb-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {title && <h2 className="mb-3 text-base font-black">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 flex min-h-12 items-center gap-2 bg-pitch-dark px-3 text-white">
      {onBack && (
        <button type="button" onClick={onBack} className="-ml-1 min-h-11 min-w-11 rounded-lg text-lg" aria-label="戻る">
          ←
        </button>
      )}
      <h1 className="flex-1 truncate text-base font-black">{title}</h1>
      {right}
    </div>
  );
}
