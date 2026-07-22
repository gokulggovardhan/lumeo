// Standalone Word-to-PDF converter. Runs on a real container host (Render,
// Fly.io, etc.) instead of Vercel, because Vercel's standard Next.js
// deployment does not build a Dockerfile for the app itself -- there is no
// LibreOffice binary available in that runtime. The Next.js API route
// (app/api/tools/word-to-pdf/route.ts) calls this service over HTTP with a
// Supabase signed URL it derived itself.
//
// No framework dependency on purpose: this container only needs to accept
// one POST, shell out to soffice, and stream a PDF back.
"use strict";

const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { mkdtemp, readdir, readFile, rm, stat, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const crypto = require("node:crypto");

const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 8080;
const CONVERT_SECRET = process.env.CONVERT_SECRET || "";
const LIBREOFFICE_BINARY = process.env.LIBREOFFICE_BINARY || "soffice";
const CONVERSION_TIMEOUT_MS = 90_000;
const MAX_BODY_BYTES = 10 * 1024;

// Each conversion spawns a full LibreOffice process (~150-250MB peak). On a
// small instance, letting every inbound request spawn one at once is a
// straight path to OOM -- the box crashes and takes every in-flight request
// with it. Instead: cap how many convert concurrently, hold a bounded queue
// of waiters, and reject anything past that with 503 so callers back off and
// retry rather than knocking the instance over. All tunable via env so a
// bigger instance can raise the ceiling without a code change.
const MAX_CONCURRENT = Math.max(1, Number(process.env.MAX_CONCURRENT_CONVERSIONS) || 1);
const MAX_QUEUE = Math.max(0, Number(process.env.MAX_CONVERT_QUEUE) || 6);
const QUEUE_WAIT_MS = Math.max(1_000, Number(process.env.CONVERT_QUEUE_WAIT_MS) || 30_000);

if (!CONVERT_SECRET) {
  console.error("CONVERT_SECRET is not set. Refusing to start: every request would be unauthenticated.");
  process.exit(1);
}

// The shared secret authenticates the *caller* (our own Next.js API route),
// but fileUrl is still a value from that request body -- a leaked secret
// or a bug upstream could otherwise turn this into an SSRF proxy into
// this host's internal network. ALLOWED_FILE_HOST is the actual boundary:
// only this exact, operator-configured hostname is ever fetched, regardless
// of auth. Set it to your Supabase project's hostname (from SUPABASE_URL,
// e.g. "abcxyz.supabase.co") -- not a wildcard, so a compromised or
// misconfigured request can never widen it.
const ALLOWED_FILE_HOST = process.env.ALLOWED_FILE_HOST || "";

if (!ALLOWED_FILE_HOST) {
  console.error("ALLOWED_FILE_HOST is not set. Refusing to start: fileUrl fetches would have no host restriction.");
  process.exit(1);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

// Constant-time compare so this never degrades into a timing side-channel
// on the shared secret.
function secretsMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// --- Stale temp-dir sweep ---------------------------------------------------
// Each conversion cleans up its own workDir/profileDir in a `finally`, but a
// killed/restarted process mid-conversion skips that. Left unchecked across
// a long-lived container (this box stays warm for hours via the keep-warm
// ping), orphaned LibreOffice profile dirs accumulate in /tmp and can
// eventually starve disk space, which makes soffice exit 0 while silently
// failing to write its output -- the exact failure mode this sweep prevents
// from ever building up. Runs at startup and every 10 minutes; anything
// matching our own prefixes and older than 15 minutes is safe to remove
// (no legitimate conversion runs anywhere near that long).
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const SWEEP_MAX_AGE_MS = 15 * 60 * 1000;
const SWEEP_PREFIXES = ["word2pdf-", "pdf2word-", "lo-profile-"];

async function sweepStaleTempDirs() {
  let entries;
  try {
    entries = await readdir(tmpdir());
  } catch (error) {
    console.error("sweep: could not read tmpdir:", error.message);
    return;
  }

  const now = Date.now();
  for (const entry of entries) {
    if (!SWEEP_PREFIXES.some((prefix) => entry.startsWith(prefix))) continue;
    const entryPath = join(tmpdir(), entry);
    try {
      const info = await stat(entryPath);
      if (now - info.mtimeMs < SWEEP_MAX_AGE_MS) continue;
      await rm(entryPath, { recursive: true, force: true });
      console.log(`sweep: removed stale temp dir ${entry}`);
    } catch (error) {
      console.error(`sweep: could not remove ${entry}:`, error.message);
    }
  }
}

// --- Conversion concurrency gate -------------------------------------------
// `active` counts running conversions; `waiters` holds queued requests. A
// released slot is handed directly to the next waiter (active stays put),
// so the count never dips and re-rises under contention.
let active = 0;
const waiters = [];

function busyError() {
  const error = new Error("The converter is busy right now. Please try again in a moment.");
  error.code = "BUSY";
  return error;
}

function acquireSlot() {
  return new Promise((resolve, reject) => {
    if (active < MAX_CONCURRENT) {
      active += 1;
      resolve();
      return;
    }
    if (waiters.length >= MAX_QUEUE) {
      reject(busyError());
      return;
    }
    const timer = setTimeout(() => {
      const index = waiters.findIndex((w) => w.timer === timer);
      if (index !== -1) waiters.splice(index, 1);
      reject(busyError());
    }, QUEUE_WAIT_MS);
    waiters.push({ resolve, timer });
  });
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve(); // hand our slot straight to the waiter; active unchanged
  } else {
    active = Math.max(0, active - 1);
  }
}

// Runs soffice and returns its parsed output path, or throws a
// conversion-failure error. Centralizes the "did it actually produce the
// file it claims to" check: soffice can exit 0 while writing nothing (seen
// in practice under low-resource containers -- a starved/killed rendering
// subprocess doesn't always propagate as a non-zero exit from the wrapper
// process). stdout/stderr are always logged on failure so a silent no-op
// is diagnosable instead of surfacing as a bare ENOENT.
async function runSoffice({ jobId, profileDir, workDir, inputPath, outputPath, extraArgs = [] }) {
  // Deliberately NOT pre-created: soffice's -env:UserInstallation performs
  // its own first-run profile bootstrap (config, cache, lock files) when
  // that directory doesn't already exist. Pre-creating it here (even empty)
  // was tried as a defensive measure and instead broke every conversion --
  // soffice exited 0 but failed internally with "source file could not be
  // loaded", 100% reproducible. Confirmed by reverting this one line.

  // TEMPORARY diagnostics: "source file could not be loaded" is soffice's
  // own stderr message, printed even though it exits 0 (well-documented
  // --convert-to limitation -- it doesn't reliably return non-zero on a
  // per-file failure). Logging disk/memory state and the actual input file
  // as soffice is about to see it, to distinguish "input never got written
  // correctly" from "container is out of disk/memory" from "soffice itself
  // is broken on this box". Remove once the real cause is confirmed.
  try {
    const inputStat = await stat(inputPath);
    console.log(`[${jobId}] input file before soffice: ${inputPath} size=${inputStat.size}`);
  } catch (statError) {
    console.error(`[${jobId}] input file missing before soffice ran: ${statError.message}`);
  }
  try {
    const df = await execFileAsync("df", ["-h", "/tmp"]);
    console.log(`[${jobId}] disk: ${df.stdout.trim()}`);
  } catch (dfError) {
    console.error(`[${jobId}] df failed: ${dfError.message}`);
  }
  try {
    const free = await execFileAsync("free", ["-m"]);
    console.log(`[${jobId}] memory: ${free.stdout.trim()}`);
  } catch (freeError) {
    console.error(`[${jobId}] free failed: ${freeError.message}`);
  }

  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync(
      LIBREOFFICE_BINARY,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=file://${profileDir}`,
        ...extraArgs,
        "--outdir",
        workDir,
        inputPath,
      ],
      { timeout: CONVERSION_TIMEOUT_MS },
    );
    stdout = result.stdout || "";
    stderr = result.stderr || "";
  } catch (execError) {
    console.error(
      `[${jobId}] soffice exited with an error. stdout: ${execError.stdout || ""} stderr: ${execError.stderr || ""}`,
    );
    throw new Error("CONVERSION_FAILED");
  }

  try {
    return await readFile(outputPath);
  } catch (readError) {
    // soffice reported success (exit 0) but the expected output never
    // showed up. Log everything soffice said -- this is the case a bare
    // "Conversion failed" message can't diagnose after the fact, since
    // the temp dirs are gone by the time anyone looks.
    console.error(
      `[${jobId}] soffice exited 0 but produced no output at ${outputPath}. stdout: ${stdout} stderr: ${stderr} readError: ${readError.message}`,
    );
    throw new Error("CONVERSION_FAILED");
  }
}

async function convertWordToPdf({ fileUrl, fileName }) {
  const jobId = crypto.randomUUID();
  const workDir = await mkdtemp(join(tmpdir(), `word2pdf-${jobId}-`));
  const profileDir = join(tmpdir(), `lo-profile-${jobId}`);
  const extension = fileName.toLowerCase().endsWith(".doc") ? "doc" : "docx";
  const inputPath = join(workDir, `input.${extension}`);
  // Temporary root-cause isolation switch: DIAG_CONVERT_TARGET lets us swap
  // the export format at runtime (no redeploy of logic) to tell apart a
  // broken DOCX *import* filter from a broken PDF *export* filter -- the
  // working PDF->Word direction already proves DOCX export and PDF import
  // both work, so only these two are still unverified. Remove once the
  // real fix lands.
  const diagTarget = process.env.DIAG_CONVERT_TARGET || "pdf";
  const outputPath = join(workDir, `input.${diagTarget}`);

  try {
    const parsedFileUrl = new URL(fileUrl);
    if (parsedFileUrl.protocol !== "https:" || parsedFileUrl.hostname !== ALLOWED_FILE_HOST) {
      throw new Error("File URL is not from an allowed host.");
    }

    // False positive below, documented here since the suppression comment
    // on that line has to stay short: CodeQL's request-forgery query flags
    // that fetch purely because fileUrl originated from a request body --
    // verified it doesn't credit the strict-equality hostname check just
    // above as a sanitizer, only a check against the whole value. That
    // check is real and load-bearing: protocol must be https and hostname
    // must exactly equal the operator-configured ALLOWED_FILE_HOST (no
    // wildcard/suffix match), and the process refuses to start at all if
    // that env var is unset. Verified locally with a running container: a
    // metadata-endpoint URL and a same-suffix-but-wrong-subdomain URL (e.g.
    // evil.supabase.co when ALLOWED_FILE_HOST=abcxyz.supabase.co) are both
    // rejected before the fetch runs; the exact configured host reaches it
    // as intended.
    let response;
    try {
      response = await fetch(parsedFileUrl); // codeql[js/request-forgery] fileUrl's host is strictly validated above
    } catch {
      throw new Error("Could not download the uploaded file for conversion.");
    }
    if (!response.ok) {
      throw new Error("Could not download the uploaded file for conversion.");
    }
    await writeFile(inputPath, Buffer.from(await response.arrayBuffer()));

    try {
      return await runSoffice({
        jobId,
        profileDir,
        workDir,
        inputPath,
        outputPath,
        // Forces the exact import filter instead of relying on soffice's
        // extension-based auto-detection, which was silently failing on
        // every .docx here ("source file could not be loaded", exit 0) --
        // the same class of fix already proven on the PDF->Word direction
        // (--infilter=writer_pdf_import). Filter names per LibreOffice's
        // own registry: "MS Word 2007 XML" for .docx, "MS Word 97" for .doc.
        extraArgs: [
          `--infilter=${extension === "doc" ? "MS Word 97" : "MS Word 2007 XML"}`,
          "--convert-to",
          diagTarget,
        ],
      });
    } catch {
      throw new Error("Conversion failed. The document may be corrupted, password-protected, or in an unsupported format.");
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  }
}

async function convertPdfToWord({ fileUrl }) {
  const jobId = crypto.randomUUID();
  const workDir = await mkdtemp(join(tmpdir(), `pdf2word-${jobId}-`));
  const profileDir = join(tmpdir(), `lo-profile-${jobId}`);
  const inputPath = join(workDir, "input.pdf");
  const outputPath = join(workDir, "input.docx");

  try {
    const parsedFileUrl = new URL(fileUrl);
    if (parsedFileUrl.protocol !== "https:" || parsedFileUrl.hostname !== ALLOWED_FILE_HOST) {
      throw new Error("File URL is not from an allowed host.");
    }

    // See convertWordToPdf's identical check above for the full false-positive
    // note -- same sanitizer, same suppression, duplicated intentionally so
    // each function keeps its own self-contained, independently-verifiable
    // validated-fetch block rather than a shared helper (CodeQL's data-flow
    // tracking reported a shared fetch() reached from two call sites as a
    // structurally distinct/unsuppressed alert even with the identical
    // inline suppression comment in place -- verified by testing that exact
    // refactor in CI).
    let response;
    try {
      response = await fetch(parsedFileUrl); // codeql[js/request-forgery] fileUrl's host is strictly validated above
    } catch {
      throw new Error("Could not download the uploaded file for conversion.");
    }
    if (!response.ok) {
      throw new Error("Could not download the uploaded file for conversion.");
    }
    await writeFile(inputPath, Buffer.from(await response.arrayBuffer()));

    try {
      return await runSoffice({
        jobId,
        profileDir,
        workDir,
        inputPath,
        outputPath,
        // Forces LibreOffice to hand the PDF to Writer's text/layout
        // importer instead of Draw -- without this, --convert-to docx on
        // a .pdf can silently produce a docx containing one embedded
        // image per page instead of editable text.
        extraArgs: ["--infilter=writer_pdf_import", "--convert-to", "docx"],
      });
    } catch {
      throw new Error(
        "Conversion failed. The document may be corrupted, password-protected, image-only, or in an unsupported format.",
      );
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const isWordToPdf = req.method === "POST" && req.url === "/convert";
  const isPdfToWord = req.method === "POST" && req.url === "/convert-pdf-to-word";

  if (!isWordToPdf && !isPdfToWord) {
    sendJson(res, 404, { ok: false, message: "Not found." });
    return;
  }

  const providedSecret = req.headers["x-convert-secret"];
  if (typeof providedSecret !== "string" || !secretsMatch(providedSecret, CONVERT_SECRET)) {
    sendJson(res, 401, { ok: false, message: "Unauthorized." });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (parseError) {
    sendJson(res, 400, { ok: false, message: parseError.message });
    return;
  }

  const fileUrl = typeof body.fileUrl === "string" ? body.fileUrl.trim() : "";
  if (!fileUrl) {
    sendJson(res, 400, { ok: false, message: "Missing fileUrl." });
    return;
  }

  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  if (isWordToPdf && !fileName) {
    sendJson(res, 400, { ok: false, message: "Missing fileName." });
    return;
  }

  // One gate shared by both conversion directions: each conversion spawns a
  // full LibreOffice process regardless of which way it's converting, so
  // letting word-to-pdf and pdf-to-word run under separate counters would
  // let two heavy processes run at once on this box and double peak RAM.
  try {
    await acquireSlot();
  } catch {
    // Over capacity: tell the caller to back off instead of piling on.
    const payload = JSON.stringify({
      ok: false,
      message: "The converter is busy right now. Please try again in a moment.",
    });
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "Retry-After": "5",
    });
    res.end(payload);
    return;
  }

  try {
    if (isWordToPdf) {
      const pdfBuffer = await convertWordToPdf({ fileUrl, fileName });
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": pdfBuffer.byteLength,
      });
      res.end(pdfBuffer);
    } else {
      const docxBuffer = await convertPdfToWord({ fileUrl });
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Length": docxBuffer.byteLength,
      });
      res.end(docxBuffer);
    }
  } catch (conversionError) {
    console.error("conversion failed:", conversionError);
    sendJson(res, 502, { ok: false, message: conversionError.message || "Conversion failed." });
  } finally {
    releaseSlot();
  }
});

server.listen(PORT, () => {
  console.log(`word-to-pdf / pdf-to-word converter listening on :${PORT}`);
  sweepStaleTempDirs();
  setInterval(sweepStaleTempDirs, SWEEP_INTERVAL_MS).unref();
  execFileAsync(LIBREOFFICE_BINARY, ["--version"])
    .then((result) => console.log(`soffice version: ${result.stdout.trim()}`))
    .catch((error) => console.error(`soffice --version failed: ${error.message}`));
});
