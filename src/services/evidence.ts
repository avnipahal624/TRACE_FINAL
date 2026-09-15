// Local evidence validation & analysis:
// - file size / type checks
// - SHA-256 content hash for duplicate detection
// - dimension read (web only via Image() ; native: skipped safely)
// - basic image-quality flags
//
// NEVER claims that AI proved anything. Signals only.

export type EvidenceAnalysis = {
  ok: boolean;
  hash?: string;
  size?: number;
  width?: number;
  height?: number;
  mime?: string;
  exif_present: boolean;
  signals: { key: string; label: string; ok: boolean; note?: string }[];
};

function detectMime(dataUri: string): string | undefined {
  const m = dataUri.match(/^data:([^;,]+)/);
  return m ? m[1] : undefined;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string | undefined> {
  try {
    const g: any = (globalThis as any).crypto;
    if (g?.subtle?.digest) {
      const buf = await g.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* fall through */ }
  return undefined;
}

async function bytesFromDataUri(uri: string): Promise<{ bytes?: ArrayBuffer; size?: number; mime?: string }> {
  try {
    const res = await fetch(uri);
    const blob = await res.blob();
    const bytes = await blob.arrayBuffer();
    return { bytes, size: bytes.byteLength, mime: blob.type };
  } catch {
    return {};
  }
}

async function readDimensions(uri: string): Promise<{ w?: number; h?: number }> {
  if (typeof (globalThis as any).Image !== "function") return {};
  try {
    return await new Promise((resolve) => {
      const img = new (globalThis as any).Image();
      img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      img.onerror = () => resolve({});
      img.src = uri;
    });
  } catch { return {}; }
}

export async function analyzeLocal(uri: string): Promise<EvidenceAnalysis> {
  const mime = detectMime(uri);
  const { bytes, size } = await bytesFromDataUri(uri);
  const hash = bytes ? await sha256Hex(bytes) : undefined;
  const { w, h } = await readDimensions(uri);
  const signals: EvidenceAnalysis["signals"] = [];
  const isImage = !mime || mime.startsWith("image/");
  signals.push({ key: "type", label: `Type: ${mime || "unknown"}`, ok: isImage });
  signals.push({ key: "size", label: size ? `Size: ${Math.round(size / 1024)} KB` : "Size unknown", ok: !!size && size >= 20_000 && size <= 20_000_000 });
  if (w && h) signals.push({ key: "dim", label: `Dimensions: ${w}×${h}`, ok: w >= 320 && h >= 240 });
  if (hash) signals.push({ key: "hash", label: "Content hash computed", ok: true });
  else signals.push({ key: "hash", label: "Content hash unavailable", ok: false, note: "Native platforms without subtle crypto" });
  return { ok: isImage && (size ?? 0) > 5_000, hash, size, width: w, height: h, mime, exif_present: false, signals };
}
