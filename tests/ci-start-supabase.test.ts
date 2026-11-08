import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";

const bootstrap = resolve("scripts/ci-start-supabase.sh");

function runMock(mode: "once" | "always") {
  const dir = mkdtempSync(join(tmpdir(), "lumeo-local-supabase-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    mkdirSync(join(dir, "supabase"));
    writeFileSync(join(dir, "supabase", "config.toml"), 'project_id = "isolated-test"\n');
    const npx = join(bin, "npx");
    writeFileSync(npx, [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'printf "%s\\n" "$*" >> "$MOCK_LOG"',
      'if [[ "$1" == "supabase" && "$2" == "start" ]]; then',
      '  if [[ "$MOCK_MODE" == "always" ]]; then exit 42; fi',
      '  if [[ "$MOCK_MODE" == "once" && ! -f "$MOCK_FIRST_FAILED" ]]; then',
      '    touch "$MOCK_FIRST_FAILED"',
      '    exit 42',
      "  fi",
      "fi",
      "exit 0",
      "",
    ].join("\n"));
    chmodSync(npx, 0o755);
    const sleep = join(bin, "sleep");
    writeFileSync(sleep, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(sleep, 0o755);
    const log = join(dir, "calls.log");
    const child = spawnSync("bash", [bootstrap], {
      cwd: dir,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...process.env,
        PATH: bin + delimiter + (process.env.PATH ?? ""),
        MOCK_LOG: log,
        MOCK_MODE: mode,
        MOCK_FIRST_FAILED: join(dir, "first-failed"),
      },
    });
    return {
      status: child.status,
      stderr: child.stderr,
      stdout: child.stdout,
      calls: readFileSync(log, "utf8").trim().split("\n"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("local Supabase CI bootstrap cleans a failed start and then retries", () => {
  const result = runMock("once");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    "supabase start",
    "supabase stop --no-backup",
    "supabase start",
  ]);
  assert.match(result.stdout, /ready/);
});

test("local Supabase CI bootstrap fails closed after three failed starts", () => {
  const result = runMock("always");
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, [
    "supabase start", "supabase stop --no-backup",
    "supabase start", "supabase stop --no-backup",
    "supabase start", "supabase stop --no-backup",
  ]);
  assert.match(result.stderr, /failed after three attempts/);
});
