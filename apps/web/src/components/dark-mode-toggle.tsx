"use client";

import { useEffect, useState } from "react";
import { applyTheme, readStoredTheme, storeTheme, type ThemeMode } from "@/lib/theme";

const labels: Record<ThemeMode, string> = {
  light: "מצב בהיר",
  dark: "מצב כהה",
  system: "מצב מערכת",
};

export function DarkModeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    setMode(readStoredTheme());
  }, []);

  function cycle() {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const idx = order.indexOf(mode);
    const next = order[(idx + 1) % order.length] ?? "system";
    setMode(next);
    storeTheme(next);
    applyTheme(next);
  }

  const resolved = mode === "system" ? "מערכת" : mode === "dark" ? "כהה" : "בהיר";

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-border-subtle bg-surface-card px-3 text-sm text-text-secondary transition hover:border-brand-blue-500 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange-500"
      aria-label={`החלפת ערכת צבעים — ${labels[mode]}`}
      title={labels[mode]}
    >
      <span aria-hidden className="text-base">
        {mode === "dark" ? "☾" : mode === "light" ? "☀" : "◐"}
      </span>
      <span className="hidden sm:inline">{resolved}</span>
    </button>
  );
}
