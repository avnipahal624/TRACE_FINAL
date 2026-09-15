// Offline report queue + sync engine.
// Reports created while offline get a local OFF-XXXXX id and sit in AsyncStorage.
// On reconnect, syncOfflineQueue() posts each with an idempotency_key so retries never duplicate.

import { storage } from "@/src/utils/storage";
import { api } from "../api";

export type QueuedReport = {
  local_id: string;                 // OFF-XXXXX (used as UI id + partial idempotency)
  idempotency_key: string;          // stable UUID used server-side
  status: "queued" | "syncing" | "synced" | "error";
  error?: string;
  server_case_number?: string;
  server_case_id?: string;
  created_at_local: string;
  payload: {
    category: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    mode: "civic" | "women";
    location: any;
    evidence_urls: string[];
    evidence_meta: any[];
  };
};

const KEY = "trace.offline.queue.v1";

function b62(n: number, len: number): string {
  const A = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let x = "";
  for (let i = 0; i < len; i++) { x = A[n % A.length] + x; n = Math.floor(n / A.length); }
  return x;
}

export function localCaseId(): string {
  const n = Math.floor(Math.random() * 60_466_176); // 36^5
  return "OFF-" + b62(n, 5);
}

function uuid(): string {
  const g: any = (globalThis as any).crypto;
  if (g && typeof g.randomUUID === "function") return g.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

async function readAll(): Promise<QueuedReport[]> {
  const raw = await storage.getItem<string>(KEY, "");
  if (!raw) return [];
  try { return JSON.parse(raw) as QueuedReport[]; } catch { return []; }
}

async function writeAll(items: QueuedReport[]) {
  await storage.setItem(KEY, JSON.stringify(items));
}

export async function enqueue(payload: QueuedReport["payload"]): Promise<QueuedReport> {
  const item: QueuedReport = {
    local_id: localCaseId(),
    idempotency_key: uuid(),
    status: "queued",
    created_at_local: new Date().toISOString(),
    payload,
  };
  const all = await readAll();
  all.unshift(item);
  await writeAll(all);
  return item;
}

export async function listQueue(): Promise<QueuedReport[]> {
  return await readAll();
}

export async function removeQueued(local_id: string) {
  const all = await readAll();
  await writeAll(all.filter((x) => x.local_id !== local_id));
}

let syncing = false;
type SyncResult = { attempted: number; synced: number; errors: number };

export async function syncOfflineQueue(): Promise<SyncResult> {
  if (syncing) return { attempted: 0, synced: 0, errors: 0 };
  syncing = true;
  try {
    const items = await readAll();
    const queued = items.filter((i) => i.status !== "synced");
    if (queued.length === 0) return { attempted: 0, synced: 0, errors: 0 };
    let synced = 0, errors = 0;
    for (const it of queued) {
      it.status = "syncing";
      await writeAll(items);
      try {
        const r = await api<{ case: any; duplicated?: boolean }>("/cases/sync", {
          method: "POST",
          body: JSON.stringify({ idempotency_key: it.idempotency_key, ...it.payload, created_at_local: it.created_at_local }),
        });
        it.status = "synced";
        it.server_case_number = r.case?.case_number;
        it.server_case_id = r.case?.id;
        synced++;
      } catch (e: any) {
        it.status = "error";
        it.error = e?.message || "Sync failed";
        errors++;
      }
      await writeAll(items);
    }
    // clean up synced older than a minute so cases list doesn't double-count
    const now = Date.now();
    const cleaned = items.filter((i) => !(i.status === "synced" && now - new Date(i.created_at_local).getTime() > 15_000));
    await writeAll(cleaned);
    return { attempted: queued.length, synced, errors };
  } finally {
    syncing = false;
  }
}
