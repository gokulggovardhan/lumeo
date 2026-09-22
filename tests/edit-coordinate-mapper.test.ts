import assert from "node:assert/strict";
import test from "node:test";
import { PdfCoordinateMapper } from "../lib/pdf/edit/coordinateMapper.ts";

test("PdfCoordinateMapper round-trips visual point and percent coordinates deterministically", () => {
  const mapper = new PdfCoordinateMapper(612, 792);
  const point = mapper.percentPointToVisualPoint({ xPct: 25, yPct: 12.5 });
  assert.deepEqual(point, { xPt: 153, yPt: 99 });
  const roundTrip = mapper.visualPointToPercentPoint(point);
  assert.ok(Math.abs(roundTrip.xPct - 25) < 1e-12);
  assert.ok(Math.abs(roundTrip.yPct - 12.5) < 1e-12);

  const box = mapper.percentBoxToVisualBox({
    xPct: 10,
    yPct: 20,
    widthPct: 30,
    heightPct: 5,
  });
  assert.deepEqual(box, {
    xPt: 61.2,
    yPt: 158.4,
    widthPt: 183.6,
    heightPt: 39.6,
  });
  const boxRoundTrip = mapper.visualBoxToPercentBox(box);
  assert.ok(Math.abs(boxRoundTrip.xPct - 10) < 1e-12);
  assert.ok(Math.abs(boxRoundTrip.yPct - 20) < 1e-12);
  assert.ok(Math.abs(boxRoundTrip.widthPct - 30) < 1e-12);
  assert.ok(Math.abs(boxRoundTrip.heightPct - 5) < 1e-12);
});

test("PdfCoordinateMapper converts screen points and derives the same baseline used by text detection", () => {
  const mapper = new PdfCoordinateMapper(600, 800);
  assert.deepEqual(
    mapper.screenPointToPercentPoint(150, 300, {
      left: 50,
      top: 100,
      width: 400,
      height: 800,
    }),
    { xPct: 25, yPct: 25 },
  );

  const baseline = mapper.baselineForBox({
    xPct: 0,
    yPct: 10,
    widthPct: 20,
    heightPct: 5,
  });
  assert.ok(Math.abs(baseline - (80 + 40 * 0.85)) < 1e-12);
});

test("PdfCoordinateMapper rejects invalid page geometry and empty screen rectangles", () => {
  assert.throws(() => new PdfCoordinateMapper(0, 792), /finite positive/);
  const mapper = new PdfCoordinateMapper(612, 792);
  assert.equal(
    mapper.screenPointToPercentPoint(1, 1, { left: 0, top: 0, width: 0, height: 10 }),
    null,
  );
});
