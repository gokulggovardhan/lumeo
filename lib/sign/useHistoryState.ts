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

import { useCallback, useState } from "react";

const MAX_HISTORY = 50;

export function useHistoryState<T>(initial: T) {
  const [state, setState] = useState<T>(initial);
  const [undoStack, setUndoStack] = useState<T[]>([]);
  const [redoStack, setRedoStack] = useState<T[]>([]);

  const set = useCallback((updater: T | ((current: T) => T)) => {
    setState((current) => {
      const next = typeof updater === "function" ? (updater as (current: T) => T)(current) : updater;
      setUndoStack((stack) => [...stack.slice(-(MAX_HISTORY - 1)), current]);
      setRedoStack([]);
      return next;
    });
  }, []);

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
    setUndoStack((stack) => [...stack.slice(-(MAX_HISTORY - 1)), previous]);
    setRedoStack([]);
  }, []);

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
