import { access } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

const routes = [
  "/",
  "/pdf",
  "/pdf-tools",
  "/pdf/merge",
  "/pdf/split",
  "/pdf/compress",
  "/pdf/jpg-to-pdf",
  "/pdf/pdf-to-jpg",
  "/guides",
  "/about",
  "/privacy",
  "/terms",
  "/contact",
  "/security",
  "/accessibility",
  "/sitemap.xml",
  "/robots.txt",
  "/opengraph-image",
  "/twitter-image",
];

const imageRoutes = new Set([
  "/opengraph-image",
  "/twitter-image",
]);

const projectRoot = process.cwd();

const buildIdPath = path.join(
  projectRoot,
  ".next",
  "BUILD_ID",
);

const nextBin = path.join(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

function reservePort(preferredPort = 3199) {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.unref();

    server.once("error", (error) => {
      if (error.code !== "EADDRINUSE") {
        reject(error);
        return;
      }

      const fallback = createServer();

      fallback.unref();
      fallback.once("error", reject);

      fallback.listen(0, "127.0.0.1", () => {
        const address = fallback.address();

        const port =
          typeof address === "object" && address
            ? address.port
            : 0;

        fallback.close(() => resolve(port));
      });
    });

    server.listen(preferredPort, "127.0.0.1", () => {
      server.close(() => resolve(preferredPort));
    });
  });
}

function stopServer(child) {
  if (
    !child ||
    child.exitCode !== null ||
    !child.pid
  ) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync(
      "taskkill",
      [
        "/pid",
        String(child.pid),
        "/T",
        "/F",
      ],
      {
        stdio: "ignore",
        timeout: 5000,
        windowsHide: true,
      },
    );
  } else {
    child.kill("SIGTERM");
  }

  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
}

async function waitForServer(
  baseUrl,
  child,
  timeoutMs = 30000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Next.js server exited with code ${child.exitCode}.`,
      );
    }

    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 300),
    );
  }

  throw new Error(
    "Timed out waiting for the Next.js production server.",
  );
}

async function verifyRoute(baseUrl, route) {
  const response = await fetch(
    `${baseUrl}${route}`,
    {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    },
  );

  if (response.status !== 200) {
    throw new Error(
      `${route} returned HTTP ${response.status}.`,
    );
  }

  const contentType =
    response.headers.get("content-type") ?? "";

  if (
    imageRoutes.has(route) &&
    !contentType.startsWith("image/")
  ) {
    throw new Error(
      `${route} returned ${
        contentType || "no content type"
      }, expected image/*.`,
    );
  }

  const suffix = imageRoutes.has(route)
    ? ` (${contentType})`
    : "";

  console.log(
    `PASS ${route} HTTP ${response.status}${suffix}`,
  );
}

async function main() {
  await access(buildIdPath).catch(() => {
    throw new Error(
      "Production build not found. Run `npm.cmd run build` before `npm.cmd run verify:public`.",
    );
  });

  const port = await reservePort();

  const baseUrl =
    `http://127.0.0.1:${port}`;

  let serverOutput = "";
  let serverError = "";

  const child = spawn(
    process.execPath,
    [
      nextBin,
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
      windowsHide: true,
    },
  );

  child.stdout.on("data", (chunk) => {
    serverOutput =
      `${serverOutput}${chunk}`.slice(-4000);
  });

  child.stderr.on("data", (chunk) => {
    serverError =
      `${serverError}${chunk}`.slice(-4000);
  });

  try {
    await waitForServer(baseUrl, child);

    for (const route of routes) {
      await verifyRoute(baseUrl, route);
    }

    console.log(
      `Verified ${routes.length} public routes on ${baseUrl}.`,
    );
  } catch (error) {
    if (serverOutput.trim()) {
      console.error(serverOutput.trim());
    }

    if (serverError.trim()) {
      console.error(serverError.trim());
    }

    throw error;
  } finally {
    stopServer(child);
  }
}

main().catch((error) => {
  console.error(
    `Public route verification failed: ${error.message}`,
  );

  process.exitCode = 1;
});
