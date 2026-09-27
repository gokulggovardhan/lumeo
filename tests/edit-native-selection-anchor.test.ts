import assert from "node:assert/strict";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window;
globals.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
globals.HTMLElement = dom.window.HTMLElement;
globals.Node = dom.window.Node;
globals.Element = dom.window.Element;
globals.getComputedStyle = dom.window.getComputedStyle;
globals.IS_REACT_ACT_ENVIRONMENT = true;

let renderHook: typeof import("@testing-library/react").renderHook;
let act: typeof import("@testing-library/react").act;
let useNativeTextSelectionState:
  typeof import("../components/pdf/edit/useNativeTextSelectionState.ts").useNativeTextSelectionState;

before(async () => {
  ({ renderHook, act } = await import("@testing-library/react"));
  ({ useNativeTextSelectionState } = await import(
    "../components/pdf/edit/useNativeTextSelectionState.ts"
  ));
});

const runs = [
  { str: "A" },
  { str: "B" },
  { str: "C" },
  { str: "D" },
  { str: "E" },
] as const;

test("rapid same-task Shift selection observes the immediately established anchor", () => {
  const { result } = renderHook(() => useNativeTextSelectionState());

  let extended: number[] = [];
  act(() => {
    const select = result.current.selectDetectedRun;
    assert.deepEqual(select(1, false, runs, null), [1]);
    // Deliberately call the SAME callback before React can commit/render the
    // first state update. A state-only anchor sees null here and returns [3].
    extended = select(3, true, runs, null);
  });

  assert.deepEqual(extended, [1, 2, 3]);
  assert.deepEqual(result.current.selectedRunIndices, [1, 2, 3]);
  assert.equal(result.current.editDraftText, "BCD");
});

test("clearSelection clears the synchronous anchor immediately", () => {
  const { result } = renderHook(() => useNativeTextSelectionState());

  let extended: number[] = [];
  act(() => {
    result.current.selectDetectedRun(1, false, runs, null);
    result.current.clearSelection();
    extended = result.current.selectDetectedRun(3, true, runs, null);
  });

  assert.deepEqual(extended, [3]);
  assert.deepEqual(result.current.selectedRunIndices, [3]);
});

test("selectRunIndices seeds the synchronous anchor for an immediate extension", () => {
  const { result } = renderHook(() => useNativeTextSelectionState());

  let extended: number[] = [];
  act(() => {
    result.current.selectRunIndices({
      indices: [2],
      runs,
      pageTextModel: null,
    });
    extended = result.current.selectDetectedRun(4, true, runs, null);
  });

  assert.deepEqual(extended, [2, 3, 4]);
  assert.deepEqual(result.current.selectedRunIndices, [2, 3, 4]);
  assert.equal(result.current.editDraftText, "CDE");
});
