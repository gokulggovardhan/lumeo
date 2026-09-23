from pathlib import Path

path = Path("e2e/edit-vinext.spec.ts")
text = path.read_text()
old = '''  await initial.colour.evaluate((node) => {
    const input = node as HTMLInputElement;
    input.value = "#3366cc";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
'''
new = '''  await initial.colour.evaluate((node) => {
    const input = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Browser did not expose the native input value setter.");
    setter.call(input, "#3366cc");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected one colour-input interaction anchor, found {count}")
path.write_text(text.replace(old, new, 1))
print("native colour e2e input interaction fixed")
