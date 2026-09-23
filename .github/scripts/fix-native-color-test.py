from pathlib import Path

path = Path("tests/edit-native-paint-document.test.ts")
text = path.read_text()
old = '''  const raw = reloaded.context.lookup(contents, PDFRawStream);
  const decoded = new TextDecoder().decode(decodePDFRawStream(raw).decode());
'''
new = '''  const raw = reloaded.context.lookup(contents);
  assert.ok(raw instanceof PDFRawStream);
  const decoded = new TextDecoder().decode(decodePDFRawStream(raw).decode());
'''
if text.count(old) != 1:
    raise SystemExit(f"expected one structural lookup anchor, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
print("native colour structural test typing fixed")
