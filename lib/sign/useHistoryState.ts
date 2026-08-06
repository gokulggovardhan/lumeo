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
  // Read via ref (not closed over directly) so set/commit/undo/redo below
  // stay referentially stable across renders regardless of whether the
  // caller passes a fresh options object/sizeOf closure each render --
  // matches this hook's existing "stable callback identity" contract, which
  // callers rely on in their own effect dependency arrays.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  // Wrapped in useCallback (empty deps -- it only ever touches optionsRef,
  // itself stable) so referencing it from set/commit's own dep arrays below
  // doesn't make THEIR identity change every render either.
  const trimToSizeBudget = useCallback((stack: T[]): T[] => {
    const opts = optionsRef.current;
    if (!opts?.maxTotalSize || !opts.sizeOf) return stack;
    return trimHistoryToSizeBudget(stack, opts.maxTotalSize, opts.sizeOf);
  }, []);

  const set = useCallback((updater: T | ((current: T) => T)) => {
    setState((current) => {
      const next = typeof updater === "function" ? (updater as (current: T) => T)(current) : updater;
      setUndoStack((stack) => trimToSizeBudget([...stack.slice(-(MAX_HISTORY - 1)), current]));
      setRedoStack([]);
      return next;
    });
  }, [trimToSizeBudget]);

  // Updates the live value only -- no history entry. Meant for continuous
  // updates (drag/resize frames) where pushing on every frame would flood
  // the undo stack; pair with `commit` once the gesture ends.
  const setLive = useCallback((updater: T | ((current: T) => T)) => {
    setState((current) => (typeof updater === "function" ? (updater as (current: T) => T)(current) : updater));
  }, []);

  // Pushes `previous` onto the undo stack without touching the live value --
  // call once a drag/resize gesture ends, with the state captured before the
  // gesture started.
  const commit = useCallback((previous: T) => {
    setUndoStack((stack) => trimToSizeBudget([...stack.slice(-(MAX_HISTORY - 1)), previous]));
    setRedoStack([]);
  }, [trimToSizeBudget]);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setState((current) => {
        setRedoStack((redo) => [...redo, current]);
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setState((current) => {
        setUndoStack((undo) => [...undo, current]);
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const reset = useCallback((next: T) => {
    setUndoStack([]);
    setRedoStack([]);
    setState(next);
  }, []);

  return {
    state,
    set,
    setLive,
    commit,
    undo,
    redo,
    reset,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
