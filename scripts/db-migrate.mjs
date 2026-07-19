// Applies pending Supabase SQL migrations from supabase/migrations/ against a
// real Postgres database, non-interactively.
//
// Requires SUPABASE_DB_URL (a Postgres connection string, e.g. from
// Supabase → Project Settings → Database → Connection string → URI).
// Never commit that value — set it as a local shell env var or a CI secret.
//
// Usage: SUPABASE_DB_URL="postgres://..." npm run db:migrate

import { spawnSync } from "node:child_process";

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error(
    "SUPABASE_DB_URL is not set. Get a connection string from Supabase → " +
      "Project Settings → Database → Connection string → URI, then run:\n" +
      '  SUPABASE_DB_URL="postgres://..." npm run db:migrate\n' +
      "This script never reads or stores that value anywhere but the current process.",
  );
  process.exit(1);
}

const result = spawnSync("npx", ["supabase", "db", "push", "--db-url", dbUrl], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
