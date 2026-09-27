import assert from "node:assert/strict";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";
import {
  contiguousRunRange,
  useNativeTextSelectionState,
} from "../components/pdf/edit/useNativeTextSelectionState.ts";

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

let React: typeof import("react");
let renderHook: typeof import("@testing-library/react").renderHook;
let act: typeof import("@testing-library/react").act;

before(async () => {
  React = await import("react");
  ({ renderHook, act } = await import("@testing-library/react"));
});

test("contiguousRunRange starts a fresh single-run selection", () => {
  assert.deepEqual(contiguousRunRange(null, 4, false), [4]);
  assert.deepEqual(contiguousRunRange(2, 4, false), [4]);
});

test("contiguousRunRange extends forward from the existing anchor", () => {
  assert.deepEqual(contiguousRunRange(2, 5, true), [2, 3, 4, 5]);
});

test("contiguousRunRange extends backward while preserving document order", () => {
  assert.deepEqual(contiguousRunRange(5, 2, true), [2, 3, 4, 5]);
});

test("contiguousRunRange without an anchor remains a single-run selection", () => {
  assert.deepEqual(contiguousRunRange(null, 7, true), [7]);
});

test("rapid Shift selection extends from the immediately preceding anchor before React rerenders", () => {
  const { result } = renderHook(() => useNativeTextSelectionState(), {
    wrapper: ({ children }) =>
      React.createElement(React.StrictMode, null, children),
  });
  const runs = [{ str: "alpha" }, { str: "beta" }];

  let firstRange: number[] = [];
  let extendedRange: number[] = [];
  act(() => {
    firstRange = result.current.selectDetectedRun(0, false, runs, null);
    // Deliberately extend in the SAME act/render turn. Before the ref-backed
    // anchor fix this second call still observed selectionAnchorIndex=null
    // and collapsed to [1], which WebKit exposed in the vinext regression.
    extendedRange = result.current.selectDetectedRun(1, true, runs, null);
  });

  assert.deepEqual(firstRange, [0]);
  assert.deepEqual(extendedRange, [0, 1]);
  assert.deepEqual(result.current.selectedRunIndices, [0, 1]);
  assert.equal(result.current.selectionAnchorIndex, 0);
});
