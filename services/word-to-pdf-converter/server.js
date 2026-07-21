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
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const crypto = require("node:crypto");

const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 8080;
const CONVERT_SECRET = process.env.CONVERT_SECRET || "";
const LIBREOFFICE_BINARY = process.env.LIBREOFFICE_BINARY || "soffice";
const CONVERSION_TIMEOUT_MS = 90_000;
const MAX_BODY_BYTES = 10 * 1024;
// The shared secret authenticates the *caller* (our own Next.js API route),
// but fileUrl is still a value from that request body -- a leaked secret
// or a bug upstream could otherwise turn this into an SSRF proxy into
// Render's internal network. This allowlist is the actual boundary: only
// URLs on a Supabase storage host are ever fetched, regardless of auth.
const ALLOWED_FILE_HOST_SUFFIX = process.env.ALLOWED_FILE_HOST_SUFFIX || "supabase.co";

function isAllowedFileUrl(fileUrl) {
  let parsed;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    (parsed.hostname === ALLOWED_FILE_HOST_SUFFIX || parsed.hostname.endsWith(`.${ALLOWED_FILE_HOST_SUFFIX}`))
  );
}

if (!CONVERT_SECRET) {
  console.error("CONVERT_SECRET is not set. Refusing to start: every request would be unauthenticated.");
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

async function convertWordToPdf({ fileUrl, fileName }) {
  if (!isAllowedFileUrl(fileUrl)) {
    throw new Error("File URL is not from an allowed host.");
  }

  const jobId = crypto.randomUUID();
  const workDir = await mkdtemp(join(tmpdir(), `word2pdf-${jobId}-`));
  const profileDir = join(tmpdir(), `lo-profile-${jobId}`);
  const extension = fileName.toLowerCase().endsWith(".doc") ? "doc" : "docx";
  const inputPath = join(workDir, `input.${extension}`);
  const outputPath = join(workDir, "input.pdf");

  try {
    let response;
    try {
      response = await fetch(fileUrl);
    } catch {
      throw new Error("Could not download the uploaded file for conversion.");
    }
    if (!response.ok) {
      throw new Error("Could not download the uploaded file for conversion.");
    }
    await writeFile(inputPath, Buffer.from(await response.arrayBuffer()));

    try {
      await execFileAsync(
        LIBREOFFICE_BINARY,
        [
          "--headless",
          "--norestore",
          `-env:UserInstallation=file://${profileDir}`,
          "--convert-to",
          "pdf",
          "--outdir",
          workDir,
          inputPath,
        ],
        { timeout: CONVERSION_TIMEOUT_MS },
      );
    } catch {
      throw new Error("Conversion failed. The document may be corrupted, password-protected, or in an unsupported format.");
    }

    return await readFile(outputPath);
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

  if (req.method !== "POST" || req.url !== "/convert") {
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
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";

  if (!fileUrl || !fileName) {
    sendJson(res, 400, { ok: false, message: "Missing fileUrl or fileName." });
    return;
  }

  try {
    const pdfBuffer = await convertWordToPdf({ fileUrl, fileName });
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.byteLength,
    });
    res.end(pdfBuffer);
  } catch (conversionError) {
    console.error("conversion failed:", conversionError);
    sendJson(res, 502, { ok: false, message: conversionError.message || "Conversion failed." });
  }
});

server.listen(PORT, () => {
  console.log(`word-to-pdf converter listening on :${PORT}`);
});
