# OCR Gate 1 benchmark harness

Throwaway. Exists to produce the numbers recorded in
`docs/superpowers/specs/2026-08-14-ocr-evaluation-spec.md` (§3, Gate 1).
Not linked from anywhere and not part of the product.

The self-hosted assets it loads are deliberately NOT committed -- ~6.6 MB of
binaries that would sit in the repo forever for a one-off measurement. To
re-run:

```bash
mkdir -p public/tessdata public/tesseract
curl -L -o public/tessdata/eng.traineddata.gz \
  https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js public/tesseract/
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm public/tesseract/
cp node_modules/tesseract.js/dist/worker.min.js public/tesseract/
```

Then open /bench-ocr and press Run.

Delete this route, `public/tessdata`, `public/tesseract`, and the
`tesseract.js` dependency once the gate is closed -- unless OCR proceeds, in
which case the self-hosted asset layout above becomes the shipping one.
