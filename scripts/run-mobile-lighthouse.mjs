import { spawn } from "node:child_process";

const MAX_ATTEMPTS = 2;
const RETRYABLE_RUNTIME_PATTERNS = [
  /\bNO_FCP\b/i,
  /\bPROTOCOL_TIMEOUT\b/i,
  /\bPAGE_HUNG\b/i,
  /\bTARGET_CRASHED\b/i,
  /Chrome.*(?:disconnected|crashed)/i,
];

function runLighthouse() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["--yes", "@lhci/cli@0.15.1", "autorun", "--config=.lighthouserc.cjs"],
      {
        env: process.env,
        stdio: ["inherit", "pipe", "pipe"],
      },
    );

    let output = "";

    const forward = (stream, target) => {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        output += text;
        target.write(text);
      });
    };

    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);

    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

function isRetryableRuntimeFailure(output) {
  return RETRYABLE_RUNTIME_PATTERNS.some((pattern) => pattern.test(output));
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const result = await runLighthouse();

  if (result.code === 0) {
    process.exit(0);
  }

  const retryable = isRetryableRuntimeFailure(result.output);
  if (!retryable || attempt === MAX_ATTEMPTS) {
    process.exit(result.code);
  }

  console.warn(
    `Lighthouse collection hit a transient browser/runtime failure on attempt ${attempt}; retrying once without changing any budget assertions.`,
  );
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

process.exit(1);
