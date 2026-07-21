import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const LIBREOFFICE_BINARY = process.env.LIBREOFFICE_BINARY || "soffice";
const CONVERSION_TIMEOUT_MS = 90_000;

export class WordToPdfConversionError extends Error {}

export type WordToPdfResult = {
  buffer: Buffer;
  fileName: string;
};

function pdfFileNameFor(originalName: string) {
  const stem = originalName.replace(/\.[^/.]+$/, "").trim() || "document";
  return `${stem}.pdf`;
}

// Downloads the .docx from the Supabase signed URL and runs it through
// headless LibreOffice. Every call gets its own UUID, temp input path, and
// LibreOffice user profile (-env:UserInstallation) so concurrent conversions
// on the same container instance can never collide or corrupt each other's
// state -- LibreOffice's user profile is not safe to share across
// simultaneously running processes.
export async function convertWordToPdf({
  fileUrl,
  fileName,
}: {
  fileUrl: string;
  fileName: string;
}): Promise<WordToPdfResult> {
  const jobId = crypto.randomUUID();
  const workDir = await mkdtemp(join(tmpdir(), `lumeo-word2pdf-${jobId}-`));
  const profileDir = join(tmpdir(), `lo-profile-${jobId}`);
  const extension = fileName.toLowerCase().endsWith(".doc") ? "doc" : "docx";
  const inputPath = join(workDir, `input.${extension}`);
  const outputPath = join(workDir, "input.pdf");

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new WordToPdfConversionError("Could not download the uploaded file for conversion.");
    }
    const inputBytes = Buffer.from(await response.arrayBuffer());
    await writeFile(inputPath, inputBytes);

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
      throw new WordToPdfConversionError(
        "Conversion failed. The document may be corrupted, password-protected, or in an unsupported format.",
      );
    }

    const buffer = await readFile(outputPath).catch(() => {
      throw new WordToPdfConversionError("Conversion did not produce a PDF file.");
    });

    return { buffer, fileName: pdfFileNameFor(fileName) };
  } finally {
    await rm(workDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  }
}
