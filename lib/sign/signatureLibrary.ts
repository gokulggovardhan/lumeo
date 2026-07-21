// lib/sign/signatureLibrary.ts
//
// Signature library persistence -- localStorage only, no account, no
// server round-trip. Pure functions over a plain array so they're easy to
// unit-reason-about and to call from any component without a shared
// store/context.

import type { SavedSignature, SignatureSourceKind } from "@/lib/sign/types";

const STORAGE_KEY = "lumeo.sign.signatures.v1";
const MAX_SIGNATURES = 12;

// localStorage is writable by anything with script access to this origin
// (another extension, a future bug elsewhere on the page) -- a value read
// back from it and handed straight to an <img src> is not provably safe
// just because our own writer only ever puts safe values there.
//
// A boolean .test() gate in a .filter() predicate lets the *original*
// unmodified string continue flowing to that sink -- static analysis
// doesn't credit a filter for "cleaning" the values it lets through, it
// only cares about the value's own construction. Rebuilding the dataUrl
// from regex capture groups (rather than passing the input straight
// through) is what actually breaks that flow: the string handed to the
// sink is a freshly-constructed literal, not the localStorage value.
const SAFE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/;

export function sanitizeDataUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = SAFE_DATA_URL_PATTERN.exec(value);
  if (!match) return null;
  const [, format, payload] = match;
  return `data:image/${format};base64,${payload}`;
}

function readAll(): SavedSignature[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: SavedSignature[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object" || typeof item.id !== "string") continue;
      const safeDataUrl = sanitizeDataUrl(item.dataUrl);
      if (!safeDataUrl) continue;
      result.push({ ...item, dataUrl: safeDataUrl } as SavedSignature);
    }
    return result;
  } catch {
    return [];
  }
}

function writeAll(signatures: SavedSignature[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(signatures));
    return true;
  } catch {
    // Storage full or blocked (private browsing) -- the signature the user
    // is actively using still works this session, it just won't persist.
    // Callers that tell the user "saved" (SignPdfTool's toast) need this
    // return value -- a swallowed failure here previously meant a false
    // "Signature saved" toast for a write that never actually landed.
    return false;
  }
}

export function listSignatures(): SavedSignature[] {
  return readAll().sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    const aRecent = a.lastUsedAt ?? a.createdAt;
    const bRecent = b.lastUsedAt ?? b.createdAt;
    return bRecent - aRecent;
  });
}

export function saveSignature(input: {
  name: string;
  dataUrl: string;
  aspectRatio: number;
  source: SignatureSourceKind;
}): { signature: SavedSignature; persisted: boolean } {
  const all = readAll();
  const isFirst = all.length === 0;
  const next: SavedSignature = {
    id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim() || "Untitled signature",
    dataUrl: input.dataUrl,
    aspectRatio: input.aspectRatio,
    source: input.source,
    isDefault: isFirst,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
  const trimmed = [...all, next].slice(-MAX_SIGNATURES);
  const persisted = writeAll(trimmed);
  return { signature: next, persisted };
}

export function renameSignature(id: string, name: string) {
  const all = readAll();
  writeAll(all.map((item) => (item.id === id ? { ...item, name: name.trim() || item.name } : item)));
}

export function deleteSignature(id: string) {
  const all = readAll();
  const target = all.find((item) => item.id === id);
  const remaining = all.filter((item) => item.id !== id);
  if (target?.isDefault && remaining.length > 0) {
    remaining[0] = { ...remaining[0], isDefault: true };
  }
  writeAll(remaining);
}

export function setDefaultSignature(id: string) {
  const all = readAll();
  writeAll(all.map((item) => ({ ...item, isDefault: item.id === id })));
}

export function markSignatureUsed(id: string) {
  const all = readAll();
  writeAll(all.map((item) => (item.id === id ? { ...item, lastUsedAt: Date.now() } : item)));
}

export function getDefaultSignature(): SavedSignature | null {
  return listSignatures().find((item) => item.isDefault) ?? null;
}
