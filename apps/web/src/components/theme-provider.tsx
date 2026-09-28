"use client";

import { useEffect } from "react";
import { applyTheme, readStoredTheme } from "@/lib/theme";

/** Inline script id — must match layout.tsx */
export const THEME_INIT_SCRIPT = `(function(){try{var k="mt-theme";var m=localStorage.getItem(k)||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, []);

  return children;
}
