import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectAaeXml, inspectSampleDirectory } from "../lib/heic-to-jpeg/inspection/index.ts";

const VALID_AAE = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>adjustmentFormatIdentifier</key><string>com.apple.photo</string>
  <key>adjustmentFormatVersion</key><string>1.0</string>
  <key>cropRect</key><string>0,0,0.8,0.8</string>
  <key>exposure</key><real>0.25</real>
  <key>futureAdjustmentWarp</key><string>preserve-me</string>
</dict></plist>`;

async function withTempFolder(run: (folder: string) => Promise<void>): Promise<void> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "lumeo-heic-phase0-"));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test("groups extensions case-insensitively and retains orphan companion files", async () => {
  await withTempFolder(async (folder) => {
    const samples = path.join(folder, "samples");
    const nested = path.join(samples, "nested");
    const output = path.join(folder, "output");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(samples, "IMG_1024.HEIC"), Buffer.from("corrupt-heic"));
    await writeFile(path.join(nested, "img_1024.AAE"), VALID_AAE);
    await writeFile(path.join(samples, "Img_1024.MOV"), Buffer.from("corrupt-mov"));
    await writeFile(path.join(samples, "ORPHAN.AAE"), "<broken");

    const { report, decisionTable } = await inspectSampleDirectory({ sourceFolder: samples, outputFolder: output, validationMode: "synthetic" });
    assert.equal(report.summary.totalFiles, 4);
    assert.equal(report.summary.totalGroups, 2);
    assert.equal(report.summary.realSampleCount, 0);
    assert.equal(report.summary.phase0Gate, "BLOCKED");
    assert.equal(report.groups.find((group) => group.basename === "IMG_1024")?.signature, "HEIC+AAE+MOV");
    assert.equal(report.groups.find((group) => group.basename === "ORPHAN")?.signature, "orphan-AAE");
    assert.deepEqual(decisionTable.rows, []);
  });
});

test("AAE parser preserves unknown adjustment keys and never claims a duplicate", () => {
  const result = inspectAaeXml(VALID_AAE);
  assert.equal(result.parseStatus, "parsed");
  assert.equal(result.classification, "possible-unbaked-delta");
  assert.ok(result.cropRotationEvidence.includes("cropRect"));
  assert.ok(result.exposureColorEvidence.includes("exposure"));
  assert.deepEqual(result.unknownAdjustments, [{ key: "futureAdjustmentWarp", value: "preserve-me" }]);
  assert.notEqual(result.classification, "duplicate-of-rendered-image");
});

test("malformed XML and corrupt HEIC remain isolated in schema-valid JSON output", async () => {
  await withTempFolder(async (folder) => {
    const samples = path.join(folder, "samples");
    const output = path.join(folder, "output");
    await mkdir(samples, { recursive: true });
    await writeFile(path.join(samples, "BROKEN.HEIC"), Buffer.from([0, 1, 2, 3]));
    await writeFile(path.join(samples, "BROKEN.AAE"), "<plist><dict>");

    const { report } = await inspectSampleDirectory({ sourceFolder: samples, outputFolder: output, validationMode: "synthetic" });
    const group = report.groups[0];
    assert.equal(group.heif.inspectionStatus, "failed");
    assert.equal(group.aae.parseStatus, "malformed");
    assert.equal(group.editAssessment.manualVerificationRequired, true);
    assert.equal(group.transferRepresentation.value, "unknown");
    assert.ok(group.warnings.length > 0);

    const diskReport = JSON.parse(await readFile(path.join(output, "report.json"), "utf8")) as { schemaVersion: number; groups: unknown[] };
    const diskDecisionTable = JSON.parse(await readFile(path.join(output, "decision-table.json"), "utf8")) as { verificationStatus: string; rows: unknown[] };
    assert.equal(diskReport.schemaVersion, 1);
    assert.equal(diskReport.groups.length, 1);
    assert.equal(diskDecisionTable.verificationStatus, "UNVERIFIED");
    assert.deepEqual(diskDecisionTable.rows, []);
  });
});

test("empty real sample folder emits null rates and an unverified blocked gate", async () => {
  await withTempFolder(async (folder) => {
    const samples = path.join(folder, "samples");
    const output = path.join(folder, "output");
    await mkdir(samples, { recursive: true });
    const { report, decisionTable } = await inspectSampleDirectory({ sourceFolder: samples, outputFolder: output });
    assert.equal(report.summary.realSampleCount, 0);
    assert.equal(report.summary.aaeFrequency, null);
    assert.equal(report.summary.hdrDetectionRate, null);
    assert.equal(report.summary.livePhotoPairingRate, null);
    assert.equal(report.summary.verificationStatus, "UNVERIFIED");
    assert.equal(report.summary.phase0Gate, "BLOCKED");
    assert.deepEqual(decisionTable.rows, []);
  });
});
