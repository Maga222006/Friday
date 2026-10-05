"use client";
import { useTheme } from "@/lib/useTheme";

const LABEL = { system: "◐ System", light: "☀ Light", dark: "☾ Dark" } as const;

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, cycle } = useTheme();
  return (
    <button onClick={cycle} className={className} title="Theme: system → light → dark">
      {LABEL[theme]}
    </button>
  );
}
