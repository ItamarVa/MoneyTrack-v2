"use client";

/**
 * Detects whether the app runs inside an iframe (Home Assistant add-on ingress shows it under
 * HA's own top bar and sidebar). Starts false for SSR/hydration, flips after mount, and mirrors
 * the result on <html data-embedded> so CSS can react. A cross-origin parent makes `window.top`
 * access throw, which also means embedded. Used by AppShell, BottomNav, MoreSheet, Sidebar.
 */
import { useEffect, useState } from "react";

export function detectEmbedded(win: Pick<Window, "self" | "top">): boolean {
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}

export function useEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    const value = detectEmbedded(window);
    setEmbedded(value);
    if (value) {
      document.documentElement.dataset.embedded = "";
    }
  }, []);

  return embedded;
}
