// Simple online/offline detector for both native and web.
// Native: use fetch HEAD probe every 10s.
// Web: also listens to browser online/offline events for instant flips.
import { useEffect, useState } from "react";
import { Platform } from "react-native";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

async function probe(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(BASE + "/api/", { method: "GET", signal: ctrl.signal, cache: "no-store" as any });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

let listeners = new Set<(v: boolean) => void>();
let currentOnline = true;

async function refresh() {
  const v = await probe();
  if (v !== currentOnline) {
    currentOnline = v;
    listeners.forEach((l) => l(v));
  }
}

let started = false;
function ensureStarted() {
  if (started) return;
  started = true;
  refresh();
  setInterval(refresh, 12_000);
  if (Platform.OS === "web") {
    window.addEventListener("online", async () => {
      // Optimistically flip online, then confirm with a probe.
      if (!currentOnline) { currentOnline = true; listeners.forEach((l) => l(true)); }
      refresh();
    });
    window.addEventListener("offline", () => {
      currentOnline = false;
      listeners.forEach((l) => l(false));
    });
  }
}

export function useNetworkStatus() {
  const [online, setOnline] = useState<boolean>(currentOnline);
  useEffect(() => {
    ensureStarted();
    const fn = (v: boolean) => setOnline(v);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return { online };
}

export function isOnline() { ensureStarted(); return currentOnline; }
export function forceRefresh() { return refresh(); }
