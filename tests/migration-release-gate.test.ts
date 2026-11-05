import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/lumeo-ci.yml", "utf8");

test("production database changes wait for both release and Admin browser gates", () => {
  const marker = "\n  migrate:\n";
  const parts = workflow.split(marker);

  assert.equal(parts.length, 2, "CI must define exactly one migration job");

  const migrationJob = parts[1];
  assert.match(
    migrationJob,
    /^    needs: \[validate, admin-browser-e2e\]$/m,
    "production migrations must wait for BOTH independent validation jobs",
  );
  assert.match(
    migrationJob,
    /^    if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m,
    "production migrations must not run on pull requests",
  );
  assert.match(migrationJob, /npm run db:migrate/);
});

test("both prerequisite jobs retain substantive browser and PDF validation", () => {
  assert.match(workflow, /^  workspace-release-gate:$/m);
  assert.match(workflow, /^  validate:$/m);
  assert.match(workflow, /^    needs: workspace-release-gate$/m);
  assert.match(workflow, /name: Validate Lumeo PDF Workspace/);
  assert.match(workflow, /^  admin-browser-e2e:$/m);
  assert.match(workflow, /npm run test:e2e:admin/);
});
