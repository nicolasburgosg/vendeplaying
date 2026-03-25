import type { ReactNode } from "react";

const tones = {
  neutral: "border-line text-muted bg-transparent",
  success: "border-success/30 bg-success/8 text-success",
  accent: "border-accent/20 bg-accent/8 text-accent-strong",
  warning: "border-amber-300 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
