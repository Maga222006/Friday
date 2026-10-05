"use client";
import { useCallback, useEffect, useState } from "react";

import { THEME_KEY } from "./theme";

export { THEME_KEY };
export type Theme = "system" | "light" | "dark";

const read = (): Theme => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
};

const apply = (theme: Theme) => {
  const dark =
    theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
};

/** system → light → dark; the initial class is set before paint in layout.tsx. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(read()); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage isn't available during SSR
  }, []);

  // while on "system", follow the OS switching between light and dark
  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "system" ? "light" : t === "light" ? "dark" : "system";
      try {
        if (next === "system") localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, next);
      } catch {
        /* private mode: still switch for this page */
      }
      apply(next);
      return next;
    });
  }, []);

  return { theme, cycle };
}
