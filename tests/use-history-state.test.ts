import assert from "node:assert/strict";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";

// A DOM has to exist BEFORE react-dom is imported, so the imports that need
// it are deferred until after this runs. node --test executes the file body
// top to bottom, so a plain statement here is enough.
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window;
globals.document = dom.window.document;
// navigator is a getter-only property on modern Node's globalThis, so it has
// to be defined rather than assigned.
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globals.HTMLElement = dom.window.HTMLElement;
globals.Node = dom.window.Node;
globals.Element = dom.window.Element;
globals.getComputedStyle = dom.window.getComputedStyle;
globals.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) as unknown as number;
globals.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
// React's act() refuses to run without this.
globals.IS_REACT_ACT_ENVIRONMENT = true;

type Snapshot = { value: string };

let React: typeof import("react");
let renderHook: typeof import("@testing-library/react").renderHook;
let act: typeof import("@testing-library/react").act;
let useHistoryState: typeof import("../lib/sign/useHistoryState.ts").useHistoryState;

before(async () => {
  React = await import("react");
  ({ renderHook, act } = await import("@testing-library/react"));
  ({ useHistoryState } = await import("../lib/sign/useHistoryState.ts"));
});

/**
 * Every case runs inside StrictMode, which is the point.
 *
 * The defect this file exists for -- undo() pushing to the redo stack from
 * inside a setState updater -- was invisible without it: React only
 * re-invokes updaters under StrictMode in development and during concurrent
 * rendering, so the duplicate entry never appeared in a production build. A
 * test suite that did not opt in would have gone green over the bug.
 */
function renderHistory(initial: Snapshot = { value: "a" }) {
  return renderHook(() => useHistoryState<Snapshot>(initial), {
    wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
  });
}

test("set then undo then redo returns the original value", async () => {
  const { result } = renderHistory();
  act(() => result.current.set({ value: "b" }));
  assert.equal(result.current.state.value, "b");

  act(() => result.current.undo());
  assert.equal(result.current.state.value, "a");

  act(() => result.current.redo());
  assert.equal(result.current.state.value, "b");
});

test("two sets, two undos, two redos preserve order", async () => {
  const { result } = renderHistory();
  act(() => result.current.set({ value: "b" }));
  act(() => result.current.set({ value: "c" }));

  act(() => result.current.undo());
  assert.equal(result.current.state.value, "b");
  act(() => result.current.undo());
  assert.equal(result.current.state.value, "a");

  act(() => result.current.redo());
  assert.equal(result.current.state.value, "b");
  act(() => result.current.redo());
  assert.equal(result.current.state.value, "c");
});

// THE regression test. Asserting only that "redo works" would still pass
// with a duplicate on the stack -- the second click would land on the real
// entry. Exhausting the stack is what proves there was exactly one.
test("after ONE undo the redo stack holds exactly one entry", async () => {
  const { result } = renderHistory();
  act(() => result.current.set({ value: "b" }));
  act(() => result.current.undo());

  assert.equal(result.current.canRedo, true, "there should be something to redo");
  act(() => result.current.redo());
  assert.equal(result.current.state.value, "b", "one redo must restore the value");
  assert.equal(result.current.canRedo, false, "the stack must now be empty -- a second entry means it was duplicated");
});

test("a set after an undo clears the redo stack", async () => {
  const { result } = renderHistory();
  act(() => result.current.set({ value: "b" }));
  act(() => result.current.undo());
  assert.equal(result.current.canRedo, true);

  act(() => result.current.set({ value: "c" }));
  assert.equal(result.current.canRedo, false, "a new branch must discard the old future");
  assert.equal(result.current.state.value, "c");
});

test("commit pushes an undo entry and clears redo without touching the live value", async () => {
  const { result } = renderHistory();
  act(() => result.current.set({ value: "b" }));
  act(() => result.current.undo());
  assert.equal(result.current.canRedo, true);

  act(() => result.current.commit({ value: "gesture-start" }));
  assert.equal(result.current.state.value, "a", "commit must not change the live value");
  assert.equal(result.current.canRedo, false);
  assert.equal(result.current.canUndo, true);

  act(() => result.current.undo());
  assert.equal(result.current.state.value, "gesture-start");
});

test("undo and redo on empty stacks are no-ops", async () => {
  const { result } = renderHistory();
  assert.equal(result.current.canUndo, false);
  assert.equal(result.current.canRedo, false);

  act(() => result.current.undo());
  assert.equal(result.current.state.value, "a");
  act(() => result.current.redo());
  assert.equal(result.current.state.value, "a");
  assert.equal(result.current.canUndo, false);
  assert.equal(result.current.canRedo, false);
});

test("canUndo and canRedo track the stacks", async () => {
  const { result } = renderHistory();
  assert.deepEqual({ undo: result.current.canUndo, redo: result.current.canRedo }, { undo: false, redo: false });

  act(() => result.current.set({ value: "b" }));
  assert.deepEqual({ undo: result.current.canUndo, redo: result.current.canRedo }, { undo: true, redo: false });

  act(() => result.current.undo());
  assert.deepEqual({ undo: result.current.canUndo, redo: result.current.canRedo }, { undo: false, redo: true });

  act(() => result.current.redo());
  assert.deepEqual({ undo: result.current.canUndo, redo: result.current.canRedo }, { undo: true, redo: false });
});

test("setLive changes the value without creating a history entry", async () => {
  const { result } = renderHistory();
  act(() => result.current.setLive({ value: "dragging" }));
  assert.equal(result.current.state.value, "dragging");
  assert.equal(result.current.canUndo, false, "a drag frame must not become an undo step");
});

// The property the ref-based rewrite deliberately preserved. The previous
// implementation got it from functional updaters; the current one gets it by
// writing the refs synchronously. Nothing else covers it, and it is the most
// likely thing to break in a future refactor -- a version that read stale
// state would leave the value at "b" here.
test("two calls in the same tick compose -- the second sees the first's result", async () => {
  const { result } = renderHistory();
  act(() => {
    result.current.set({ value: "b" });
    result.current.set({ value: "c" });
  });
  assert.equal(result.current.state.value, "c");

  // Both steps must be individually undoable, not collapsed into one.
  act(() => result.current.undo());
  assert.equal(result.current.state.value, "b");
  act(() => result.current.undo());
  assert.equal(result.current.state.value, "a");
});

test("an updater function in the same tick sees the previous call's value", async () => {
  const { result } = renderHistory({ value: "" });
  act(() => {
    result.current.set((current) => ({ value: `${current.value}x` }));
    result.current.set((current) => ({ value: `${current.value}y` }));
  });
  assert.equal(result.current.state.value, "xy", "the second updater must receive 'x', not ''");
});

test("reset clears both stacks and installs the new value", async () => {
  const { result } = renderHistory();
  act(() => result.current.set({ value: "b" }));
  act(() => result.current.undo());

  act(() => result.current.reset({ value: "fresh" }));
  assert.equal(result.current.state.value, "fresh");
  assert.equal(result.current.canUndo, false);
  assert.equal(result.current.canRedo, false);
});
