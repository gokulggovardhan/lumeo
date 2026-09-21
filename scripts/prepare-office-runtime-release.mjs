#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

const ZETAJS_VERSION = "1.2.0";
const ZETAOFFICE_BRANCH = "distro/allotropia/zeta-24-2";
const DEFAULT_SOURCE = "https://cdn.zetaoffice.net/zetaoffice_latest/";
const DEFAULT_OUTPUT = ".runtime/office";
const FILES = {
  "soffice.js": "application/javascript",
  "soffice.wasm": "application/wasm",
  "soffice.data": "application/octet-stream",
  "soffice.data.js.metadata": "application/json",
};

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`--${name} requires a value`);
  }
  return value;
}

function releaseId(value) {
  const normalized = value?.trim();
  if (!normalized || !/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(normalized)) {
    throw new Error(
      "--release must be 3-81 characters using letters, numbers, dots, underscores or hyphens.",
    );
  }
  if (/latest/i.test(normalized)) {
    throw new Error("--release must be immutable and cannot contain 'latest'.");
  }
  return normalized;
}

function baseUrl(value) {
  const parsed = new URL(value || DEFAULT_SOURCE);
  if (parsed.protocol !== "https:") {
    throw new Error("--source must be an HTTPS URL.");
  }
  return parsed.toString().endsWith("/") ? parsed.toString() : `${parsed.toString()}/`;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function download(url, destination) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { "User-Agent": "Lumeo-Office-Runtime-Release/1" },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url} (HTTP ${response.status}).`);
  }

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(destination, { flags: "wx" }),
  );

  return {
    sourceContentType: response.headers.get("content-type"),
    sourceEtag: response.headers.get("etag"),
    sourceLastModified: response.headers.get("last-modified"),
  };
}

const release = releaseId(readArg("release"));
const source = baseUrl(readArg("source", DEFAULT_SOURCE));
const outputRoot = path.resolve(readArg("out", DEFAULT_OUTPUT));
const outputDir = path.join(outputRoot, release);

await mkdir(outputRoot, { recursive: true });
await mkdir(outputDir, { recursive: false }).catch((error) => {
  if (error?.code === "EEXIST") {
    throw new Error(
      `Release directory already exists: ${outputDir}. Immutable releases are never overwritten.`,
    );
  }
  throw error;
});

const manifest = {
  schemaVersion: 1,
  releaseId: release,
  zetaJsVersion: ZETAJS_VERSION,
  zetaOfficeBranch: ZETAOFFICE_BRANCH,
  createdAt: new Date().toISOString(),
  sourceBaseUrl: source,
  files: {},
};

for (const [name, contentType] of Object.entries(FILES)) {
  const destination = path.join(outputDir, name);
  const metadata = await download(new URL(name, source), destination);
  const fileStat = await stat(destination);

  if (!fileStat.size) {
    throw new Error(`Downloaded runtime file is empty: ${name}`);
  }

  manifest.files[name] = {
    bytes: fileStat.size,
    sha256: await sha256(destination),
    contentType,
    ...metadata,
  };

  process.stdout.write(`${name}: ${fileStat.size} bytes\n`);
}

const manifestPath = path.join(outputDir, "lumeo-office-runtime.json");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  flag: "wx",
});

process.stdout.write(`Prepared immutable Office runtime release: ${release}\n`);
process.stdout.write(`Directory: ${outputDir}\n`);
process.stdout.write(`Manifest: ${manifestPath}\n`);
