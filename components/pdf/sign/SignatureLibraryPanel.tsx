"use client";

// components/pdf/sign/SignatureLibraryPanel.tsx
//
// Saved-signature grid: pick one to place, rename, delete, star as
// default. Pure presentation over lib/sign/signatureLibrary's CRUD --
// the parent owns re-fetching the list after each mutation so this stays
// a simple, easily-testable list view.

import { useState } from "react";
import type { SavedSignature } from "@/lib/sign/types";

export function SignatureLibraryPanel({
  signatures,
  onUse,
  onRename,
  onDelete,
  onSetDefault,
  onCreateNew,
}: {
  signatures: SavedSignature[];
  onUse: (signature: SavedSignature) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  onCreateNew: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)]/34">
          Your signatures
        </p>
        <button
          type="button"
          onClick={onCreateNew}
          className="rounded-full border border-[var(--text-primary)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]/60 transition hover:border-[var(--lumeo-gold)]/40 hover:text-[var(--text-primary)]"
        >
          + New
        </button>
      </div>

      {signatures.length === 0 ? (
        <p className="mt-2 text-xs leading-5 text-[var(--text-primary)]/38">
          No saved signatures yet. Create one and save it for next time.
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {signatures.map((signature) => (
            <div
              key={signature.id}
              className="group relative rounded-lg border border-[var(--text-primary)]/10 bg-white p-1.5"
            >
              <button
                type="button"
                onClick={() => onUse(signature)}
                aria-label={`Use signature ${signature.name}`}
                className="flex h-12 w-full items-center justify-center overflow-hidden rounded"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signature.dataUrl} alt={signature.name} className="max-h-full max-w-full object-contain" />
              </button>

              {signature.isDefault ? (
                <span aria-label="Default signature" className="absolute left-1.5 top-1.5 text-[10px] text-[var(--lumeo-gold-300)]">
                  ★
                </span>
              ) : null}

              {renamingId === signature.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => {
                    onRename(signature.id, renameValue);
                    setRenamingId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onRename(signature.id, renameValue);
                      setRenamingId(null);
                    }
                    if (event.key === "Escape") setRenamingId(null);
                  }}
                  className="mt-1 w-full rounded border border-[var(--lumeo-gold)]/40 bg-[var(--atelier-surface-1)] px-1 py-0.5 text-[11px] text-[var(--text-primary)] outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(signature.id);
                    setRenameValue(signature.name);
                  }}
                  className="mt-1 block w-full truncate text-left text-[11px] font-semibold text-[var(--text-primary)]/70 hover:text-[var(--text-primary)]"
                  title="Click to rename"
                >
                  {signature.name}
                </button>
              )}

              <div className="mt-1 flex items-center justify-between gap-1 opacity-0 transition group-hover:opacity-100">
                {!signature.isDefault ? (
                  <button
                    type="button"
                    onClick={() => onSetDefault(signature.id)}
                    className="text-[10px] font-semibold text-[var(--text-primary)]/44 hover:text-[var(--lumeo-gold-300)]"
                  >
                    Set default
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => onDelete(signature.id)}
                  aria-label={`Delete ${signature.name}`}
                  className="text-[10px] font-semibold text-[var(--text-danger)]/70 hover:text-[var(--text-danger)]"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
