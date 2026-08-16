"use client";

// lib/sign/useHistoryState.ts
//
// Generic undo/redo over a single piece of state. Used for the placed-
// elements array in the Sign PDF workspace, but has no PDF-specific
// knowledge -- reusable anywhere a linear undo/redo stack is useful.
//
// Stacks live in state (not refs) so canUndo/canRedo stay accurate across
// renders -- a ref-based stack would silently go stale in the UI since
// mutating a ref never triggers a re-render.

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_HISTORY = 50;

// Optional, backward-compatible size cap: when both `maxTotalSize` and
// `sizeOf` are given, the undo stack is trimmed (oldest entries dropped
// first) so the SUM of sizeOf(entry) across it never exceeds
// maxTotalSize -- on top of, not instead of, the existing MAX_HISTORY
// entry-count cap. Omitted entirely (as every pre-existing caller does),
// this is a no-op and behavior is byte-for-byte identical to before: only a
// caller that opts in (Edit PDF, whose undo entries can each carry a full
// re-saved PDF) pays for or is affected by this.
export type HistorySizeOptions<T> = {
  maxTotalSize?: number;
  sizeOf?: (value: T) => number;
};

// Pure trimming algorithm, extracted so it has a regression test independent
// of any React/hook-testing harness (this project has none). Drops entries
// from the FRONT (oldest) of `stack` until the sum of sizeOf(entry) is at or
// under maxTotalSize, or only one entry remains -- see useHistoryState's own
// trimToSizeBudget for why the last entry is never dropped even over
// budget.
export function trimHistoryToSizeBudget<T>(stack: T[], maxTotalSize: number, sizeOf: (value: T) => number): T[] {
  let total = stack.reduce((sum, item) => sum + sizeOf(item), 0);
  let trimmed = stack;
  while (total > maxTotalSize && trimmed.length > 1) {
    total -= sizeOf(trimmed[0]);
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

export function useHistoryState<T>(initial: T, options?: HistorySizeOptions<T>) {
  const [state, setState] = useState<T>(initial);
  const [undoStack, setUndoStack] = useState<T[]>([]);
  const [redoStack, setRedoStack] = useState<T[]>([]);
  // Read via ref (not closed over directly) so set/undo/redo below
  // stay referentially stable across renders regardless of whether the
  // caller passes a fresh options object/sizeOf closure each render --
  // matches this hook's existing "stable callback identity" contract, which
  // callers rely on in their own effect dependency arrays.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Wrapped in useCallback (empty deps -- it only ever touches optionsRef,
  // itself stable) so referencing it from set's own dep array below
  // doesn't make THEIR identity change every render either.
  const trimToSizeBudget = useCallback((stack: T[]): T[] => {
    const opts = optionsRef.current;
    if (!opts?.maxTotalSize || !opts.sizeOf) return stack;
    return trimHistoryToSizeBudget(stack, opts.maxTotalSize, opts.sizeOf);
  }, []);

  // The three pieces of history are mirrored into refs and the refs are the
  // AUTHORITY; the useState copies exist only so React re-renders.
  //
  // This replaced an implementation where undo() pushed to the redo stack
  // from inside a setState updater (and redo() to the undo stack from inside
  // its own). State updaters must be pure. React re-invokes them -- under
  // StrictMode in development, and during concurrent rendering -- so a single
  // Undo pushed the same snapshot onto the redo stack twice. The first Redo
  // then popped a duplicate and restored the state already on screen: a
  // visible no-op that took two clicks to get past. Found by an e2e test that
  // asserted a redaction came back after Undo/Redo; it reproduced against the
  // dev server and not against a production build, which is exactly the shape
  // an impure updater produces.
  //
  // Writing the refs synchronously also keeps two calls in the same tick
  // composing correctly, which is what the functional updaters used to buy.
  const stateRef = useRef<T>(initial);
  const undoRef = useRef<T[]>([]);
  const redoRef = useRef<T[]>([]);

  const applyHistory = useCallback((next: T, nextUndo: T[], nextRedo: T[]) => {
    stateRef.current = next;
    undoRef.current = nextUndo;
    redoRef.current = nextRedo;
    setState(next);
    setUndoStack(nextUndo);
    setRedoStack(nextRedo);
  }, []);

  const set = useCallback((updater: T | ((current: T) => T)) => {
    const current = stateRef.current;
    const next = typeof updater === "function" ? (updater as (current: T) => T)(current) : updater;
    applyHistory(next, trimToSizeBudget([...undoRef.current.slice(-(MAX_HISTORY - 1)), current]), []);
  }, [applyHistory, trimToSizeBudget]);

  const undo = useCallback(() => {
    const stack = undoRef.current;
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    applyHistory(previous, stack.slice(0, -1), [...redoRef.current, stateRef.current]);
  }, [applyHistory]);

  const redo = useCallback(() => {
    const stack = redoRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    applyHistory(next, [...undoRef.current, stateRef.current], stack.slice(0, -1));
  }, [applyHistory]);

  const reset = useCallback((next: T) => {
    applyHistory(next, [], []);
  }, [applyHistory]);

  return {
    state,
    set,
    undo,
    redo,
    reset,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
