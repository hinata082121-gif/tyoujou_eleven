"use client";

/** 5 段階の帯（学力・信頼度。R2）。value は 0〜4 */
export function LifeBars({ value, label, tone = "yellow", size = "md" }: { value: number; label: string; tone?: "yellow" | "telop"; size?: "sm" | "md" }) {
  const w = size === "sm" ? "h-2 w-[0.3125rem]" : "h-2.5 w-3";
  return (
    <span className={`flex ${size === "sm" ? "gap-px" : "gap-0.5"}`} aria-label={`${label} ${value + 1}/5`} title={`${label} ${value + 1}/5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} className={`${w} -skew-x-12 ${i <= value ? (tone === "yellow" ? "bg-yellow" : "bg-telop") : "bg-panel-3"}`} />
      ))}
    </span>
  );
}
