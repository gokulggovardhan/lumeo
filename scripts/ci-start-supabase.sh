#!/usr/bin/env bash
# Isolated GitHub Actions Supabase bootstrap, never a production migration.
# Recover boundedly from transient OCI registry throttling and partially
# initialized local containers without bypassing any later test assertions.
set -euo pipefail

if [[ ! -f supabase/config.toml ]]; then
  echo "Local Supabase config missing; run supabase init first." >&2
  exit 1
fi

for attempt in 1 2 3; do
  echo "Starting isolated local Supabase (attempt ${attempt}/3)"
  if npx supabase start; then
    echo "Isolated local Supabase is ready."
    exit 0
  fi

  echo "Local Supabase failed to initialize; cleaning up partial containers." >&2
  # This only targets the local project in this disposable CI runner.
  npx supabase stop --no-backup || true

  if (( attempt < 3 )); then
    sleep "$((attempt * 20))"
  fi
done

echo "Local Supabase bootstrap failed after three attempts; CI remains failing." >&2
exit 1
