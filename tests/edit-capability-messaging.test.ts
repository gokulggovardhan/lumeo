import assert from "node:assert/strict";
import test from "node:test";
import {
  userMessageForTextCapability,
  type DocumentTextCapabilityCategory,
} from "../lib/pdf/edit/textCapabilityClassifier.ts";

const cases: Array<{
  category: DocumentTextCapabilityCategory;
  safelyRewritable?: boolean;
  expected: RegExp;
}> = [
  { category: "NATIVE_TEXT", expected: /safe in-place editing/i },
  { category: "SCANNED_IMAGE", expected: /image scan.*no native PDF text/i },
  { category: "HYBRID_TEXT_AND_IMAGE", expected: /mixes native PDF text with image content/i },
  {
    category: "NATIVE_TEXT_WITH_ENCODING_LIMITATIONS",
    expected: /character mapping.*editing is disabled/i,
  },
  {
    category: "NATIVE_TEXT_WITH_FONT_LIMITATIONS",
    expected: /character-width information.*editing is disabled/i,
  },
  { category: "COMPLEX_VECTOR_TEXT", expected: /skewed or complex transform.*read-only/i },
  { category: "TYPE3_TEXT", expected: /custom-drawn PDF font.*not yet proven safe/i },
  {
    category: "FORM_XOBJECT_TEXT",
    safelyRewritable: true,
    expected: /reusable PDF form object.*isolated safely/i,
  },
  { category: "CLIPPED_TEXT", expected: /clipping mask.*read-only/i },
  { category: "VERTICAL_TEXT", expected: /vertical writing.*not yet proven safe/i },
  { category: "UNKNOWN_OR_UNSAFE", expected: /cannot prove a safe native text-edit path/i },
];

for (const item of cases) {
  test(`capability messaging: ${item.category} has a plain-language product explanation`, () => {
    const message = userMessageForTextCapability(
      item.category,
      item.safelyRewritable ?? false,
    );

    assert.match(message, item.expected);
    assert.ok(message.length > 20);
    assert.ok(!message.includes(item.category));
    assert.ok(!message.includes("_"));
  });
}

test("capability messaging distinguishes safe and unsafe Form XObject cases", () => {
  const safe = userMessageForTextCapability("FORM_XOBJECT_TEXT", true);
  const unsafe = userMessageForTextCapability("FORM_XOBJECT_TEXT", false);

  assert.notEqual(safe, unsafe);
  assert.match(safe, /can edit/i);
  assert.match(unsafe, /read-only/i);
});
