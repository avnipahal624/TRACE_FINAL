// Auto-save report draft to local storage every 5 seconds.
// Draft is scoped per user so switching accounts never leaks a draft.

import { useEffect, useRef, useState } from "react";
import { storage } from "@/src/utils/storage";

const KEY_PREFIX = "trace.draft.report.";
const AUTOSAVE_MS = 5000;

export type Draft = {
  step: number;
  category: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  mode: "civic" | "women";
  location: any;
  evidence_urls: string[];
  updated_at: string;
};

function keyFor(userId: string | undefined) {
  return KEY_PREFIX + (userId || "anon");
}

export async function loadDraft(userId?: string): Promise<Draft | null> {
  const raw = await storage.getItem<string>(keyFor(userId), "");
  if (!raw) return null;
  try { return JSON.parse(raw) as Draft; } catch { return null; }
}

export async function clearDraft(userId?: string) {
  await storage.removeItem(keyFor(userId));
}

async function writeDraft(userId: string | undefined, d: Draft) {
  await storage.setItem(keyFor(userId), JSON.stringify(d));
}

/** Autosaves the given draft snapshot every 5s; also flushes on unmount. */
export function useDraftAutosave(userId: string | undefined, draft: Draft, enabled: boolean) {
  const latest = useRef(draft);
  useEffect(() => { latest.current = draft; }, [draft]);

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      writeDraft(userId, { ...latest.current, updated_at: new Date().toISOString() });
    }, AUTOSAVE_MS);
    return () => {
      clearInterval(t);
      // final flush
      writeDraft(userId, { ...latest.current, updated_at: new Date().toISOString() });
    };
  }, [userId, enabled]);
}

/** One-time load of an existing draft (for resume prompt). */
export function useExistingDraft(userId: string | undefined) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      const d = await loadDraft(userId);
      setDraft(d);
      setLoaded(true);
    })();
  }, [userId]);
  return { draft, loaded };
}
