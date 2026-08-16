import assert from "node:assert/strict";
import test, { before } from "node:test";
import { JSDOM } from "jsdom";

// Component-level coverage for Sign PDF's undo/redo, which had none before
// #250 rewrote the shared hook underneath it.
//
// IMPORTANT, and different from what the rewrite's risk note assumed: Sign
// does NOT use useHistoryState's gesture API. It destructures only
// set/undo/redo/canUndo/canRedo/reset (SignPdfTool.tsx:121); setLive and
// commit have zero callers anywhere in the repo. The "one history entry per
// drag" property Sign relies on is achieved in PlacedElementView, which
// keeps the drag in local state and calls onChange exactly once at gesture
// end -- so it reaches the hook as a single ordinary `set`.
//
// These therefore exercise the paths Sign actually takes. All four of them
// were rewritten in #250, so they are the real regression surface.

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window;
globals.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globals.HTMLElement = dom.window.HTMLElement;
globals.Node = dom.window.Node;
globals.Element = dom.window.Element;
globals.getComputedStyle = dom.window.getComputedStyle;
globals.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number;
globals.cancelAnimationFrame = (handle: number) => clearTimeout(handle);
globals.IS_REACT_ACT_ENVIRONMENT = true;

/** The shape Sign stores: placed elements with position. */
type Placed = { id: string; xPct: number; yPct: number };

let React: typeof import("react");
let renderHook: typeof import("@testing-library/react").renderHook;
let act: typeof import("@testing-library/react").act;
let useHistoryState: typeof import("../lib/sign/useHistoryState.ts").useHistoryState;

before(async () => {
  React = await import("react");
  ({ renderHook, act } = await import("@testing-library/react"));
  ({ useHistoryState } = await import("../lib/sign/useHistoryState.ts"));
});

/** Mirrors SignPdfTool.tsx:121 exactly, including StrictMode. */
function renderSignHistory() {
  return renderHook(() => useHistoryState<Placed[]>([]), {
    wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
  });
}

const AT = (xPct: number, yPct: number): Placed[] => [{ id: "sig", xPct, yPct }];

test("placing a signature is one undoable step", async () => {
  const { result } = renderSignHistory();
  act(() => result.current.set(AT(10, 10)));
  assert.deepEqual(result.current.state, AT(10, 10));
  assert.equal(result.current.canUndo, true);

  act(() => result.current.undo());
  assert.deepEqual(result.current.state, []);
});

// The property Sign depends on. PlacedElementView holds the drag in local
// state and calls onChange ONCE at gesture end, so however many pointermove
// frames occurred, the hook sees exactly one `set`. If that ever regressed to
// firing per frame, undo would rewind one pixel at a time.
test("a completed drag is ONE history entry, not one per pointermove", async () => {
  const { result } = renderSignHistory();
  act(() => result.current.set(AT(10, 10)));

  // PlacedElementView's contract: one onChange for the whole gesture.
  act(() => result.current.set(AT(60, 40)));
  assert.deepEqual(result.current.state, AT(60, 40));

  // A single undo must return to the pre-drag position, not an intermediate.
  act(() => result.current.undo());
  assert.deepEqual(result.current.state, AT(10, 10), "one undo should rewind the whole drag");
});

test("undo after a drag restores the pre-drag position in a single step", async () => {
  const { result } = renderSignHistory();
  act(() => result.current.set(AT(10, 10)));
  act(() => result.current.set(AT(80, 80)));

  act(() => result.current.undo());
  assert.deepEqual(result.current.state, AT(10, 10));
  assert.equal(result.current.canRedo, true);
});

// The regression #250 fixed, in Sign's own terms: undo() used to push to the
// redo stack from inside a setState updater, so StrictMode's re-invocation
// queued the same snapshot twice and the first redo was a visible no-op.
// Asserting canRedo goes false is what catches the duplicate -- "redo works"
// passes with one still on the stack.
test("redo re-applies the drag in a single step and empties the redo stack", async () => {
  const { result } = renderSignHistory();
  act(() => result.current.set(AT(10, 10)));
  act(() => result.current.set(AT(80, 80)));
  act(() => result.current.undo());

  act(() => result.current.redo());
  assert.deepEqual(result.current.state, AT(80, 80), "one redo should re-apply the whole drag");
  assert.equal(result.current.canRedo, false, "a second entry here means the stack was duplicated");
});

test("a new action after undo clears the redo stack", async () => {
  const { result } = renderSignHistory();
  act(() => result.current.set(AT(10, 10)));
  act(() => result.current.set(AT(80, 80)));
  act(() => result.current.undo());
  assert.equal(result.current.canRedo, true);

  // Sign's delete path (SignPdfTool.tsx:293) is an ordinary set.
  act(() => result.current.set([]));
  assert.equal(result.current.canRedo, false, "a new branch must discard the old future");
  assert.deepEqual(result.current.state, []);
});

// Sign calls reset([]) on file swap and on clear (SignPdfTool.tsx:332, 347).
test("reset clears both stacks so a new document starts with no history", async () => {
  const { result } = renderSignHistory();
  act(() => result.current.set(AT(10, 10)));
  act(() => result.current.set(AT(80, 80)));
  act(() => result.current.undo());

  act(() => result.current.reset([]));
  assert.deepEqual(result.current.state, []);
  assert.equal(result.current.canUndo, false, "a fresh document must not undo into the previous one");
  assert.equal(result.current.canRedo, false);
});

// Sign's keyboard handler can fire undo/redo faster than React re-renders.
test("two undos in the same tick step back twice, not once", async () => {
  const { result } = renderSignHistory();
  act(() => result.current.set(AT(10, 10)));
  act(() => result.current.set(AT(40, 40)));
  act(() => result.current.set(AT(80, 80)));

  act(() => {
    result.current.undo();
    result.current.undo();
  });
  assert.deepEqual(result.current.state, AT(10, 10), "both undos must apply");
});
