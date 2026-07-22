# Word to PDF converter service

Standalone LibreOffice-backed converter for Lumeo's Word to PDF tool. Lives
outside the main app because Vercel's standard Next.js deployment does not
build a Dockerfile for the app itself, so there's nowhere on Vercel to run
`soffice`.

## Deploy (Render, free tier)

1. Push this repo to GitHub (already done).
2. In Render: New -> Blueprint -> point at this repo -> it will pick up
   `services/word-to-pdf-converter/render.yaml`.
3. Set these environment variables (Render's Blueprint UI will prompt for
   `CONVERT_SECRET` since it's marked `sync: false`; add `ALLOWED_FILE_HOST`
   manually):
   - `CONVERT_SECRET` -- a long random value (e.g. `openssl rand -hex 32`)
   - `ALLOWED_FILE_HOST` -- your Supabase project's exact hostname, e.g.
     `abcxyz.supabase.co` (the host part of your `NEXT_PUBLIC_SUPABASE_URL`).
     The service refuses to fetch any other host, even with a valid
     `CONVERT_SECRET` -- it won't start at all without this set.
4. Once deployed, copy the service's public URL.

## Wire it into the main app

In the Lumeo Vercel project, set:

- `WORD_TO_PDF_CONVERTER_URL` -- the Render service URL (e.g.
  `https://lumeo-word-to-pdf-converter.onrender.com`)
- `WORD_TO_PDF_CONVERTER_SECRET` -- the same value as `CONVERT_SECRET` above

`app/api/tools/word-to-pdf/route.ts` calls `${WORD_TO_PDF_CONVERTER_URL}/convert`
with that secret in the `x-convert-secret` header.

## Keep it warm (optional but recommended)

Render's free tier spins the service down after ~15 min idle; the first
request after that pays a 30-50s cold-start tax (container boot + LibreOffice
init). Two pingers cover this, and it's fine to run both:

1. **`.github/workflows/converter-keep-warm.yml`** (already in this repo) --
   pings `/healthz` every ~10 min via GitHub Actions cron. No setup needed,
   but GitHub cron can drift or occasionally skip a run under load.
2. **cron-job.org backup** (belt-and-braces, for stricter punctuality):
   1. Create a free account at [cron-job.org](https://cron-job.org).
   2. Dashboard -> **Create cronjob**.
   3. Title: `Lumeo Render Keeper`.
   4. URL: `https://lumeo-word-to-pdf-converter.onrender.com/healthz`
      (swap in your own Render URL if it differs).
   5. Schedule: **every 10 minutes**.
   6. Save.

`/healthz` is a public, unauthenticated GET -- no secret needed for either
pinger. Keeping one free service warm this way stays within Render's 750
instance-hours/month.

## Notes

- The service only ever fetches URLs the main app hands it (short-lived
  Supabase signed URLs derived server-side) -- never a client-supplied URL --
  and additionally refuses any host other than `ALLOWED_FILE_HOST`.
