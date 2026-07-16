import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function changedFiles() {
  const output = execFileSync("git", ["diff", "--name-only"], { cwd: root, encoding: "utf8" });
  return output.split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll("\\", "/"));
}

const packageJson = JSON.parse(read("package.json"));
const workspace = read("components/pdf/workspace/ToolWorkspace.tsx");
const css = read("app/globals.css");
const tokens = read("lib/design-system/tokens.ts");
const mergePage = read("app/pdf/merge/page.tsx");
const splitPage = read("app/pdf/split/page.tsx");
const compressPage = read("app/pdf/compress/page.tsx");
const mergeTool = read("components/pdf/MergePdfTool.tsx");
const splitTool = read("components/pdf/SplitPdfTool.tsx");
const compressTool = read("components/pdf/CompressPdfTool.tsx");
const docs = read("docs/LUMEO_2_DESIGN_SYSTEM.md");

try {
  assert(packageJson.scripts["verify:lumeo2-workspaces"] === "node scripts/verify-lumeo-2-workspaces.mjs", "verify:lumeo2-workspaces script is missing.");
  assert(packageJson.dependencies.next === "^16.2.10", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.7", "React version changed unexpectedly.");
  assert(packageJson.dependencies["@supabase/supabase-js"] === "^2.110.2", "Supabase JS version changed unexpectedly.");
  assert(packageJson.dependencies.firebase === "^12.16.0", "Firebase version changed unexpectedly.");

  for (const component of [
    "L2ToolPageHeader",
    "L2ToolWorkspace",
    "L2ToolMainColumn",
    "L2ToolSettingsPanel",
    "L2ToolSectionHeader",
    "L2UploadStage",
    "L2FileList",
    "L2FileCard",
    "L2DocumentProfile",
    "L2SettingsGroup",
    "L2OptionRow",
    "L2ModeSelector",
    "L2AdvancedDisclosure",
    "L2ActionArea",
    "L2ProgressState",
    "L2ResultState",
    "L2PrivacyNote",
  ]) {
    assert(workspace.includes(`export function ${component}`), `Missing workspace primitive: ${component}`);
    assert(tokens.includes(component), `Workspace token list missing: ${component}`);
  }

  for (const [name, page, className] of [
    ["Merge", mergePage, "aura-merge-tool"],
    ["Split", splitPage, "aura-split-tool"],
    ["Compress", compressPage, "aura-compress-tool"],
  ]) {
    assert(page.includes("L2ToolPageHeader"), `${name} route must use L2ToolPageHeader.`);
    assert(page.includes("max-w-[1240px]"), `${name} route must use the Run 3 workspace width.`);
    assert(page.includes("l2-live-tool-workspace"), `${name} route must use the shared live workspace wrapper.`);
    assert(page.includes(className), `${name} route-specific workspace class is missing.`);
  }

  assert(css.includes(".l2-live-tool-workspace"), "Scoped live workspace CSS is missing.");
  assert(css.includes(".l2-tool-settings-panel"), "Settings panel CSS is missing.");
  assert(css.includes("top: 96px"), "Desktop sticky settings offset is missing.");
  assert(css.includes("@media (max-width: 1023px)") && css.includes("position: static"), "Mobile sticky reset is missing.");
  assert(css.includes("@media (prefers-reduced-motion: reduce)"), "Reduced-motion support is missing.");
  assert(workspace.includes("Private by design · Browser-only · Cleared after download"), "Exact privacy note is missing.");
  assert(css.includes("--atelier-sage-500") && css.includes("--atelier-brass-400"), "Atelier workspace palette is missing.");
  assert(!workspace.includes("rgba(var(--sky-rgb)"), "Workspace shared primitives must not use blue/cyan focus accents.");
  assert(workspace.includes("max-w-[560px]") && workspace.includes("text-[var(--text-muted)]"), "Workspace privacy note must be compact and secondary.");
  assert(workspace.includes("type=\"file\""), "Shared upload primitive must render a real file input.");
  assert(workspace.includes("accept={accept}"), "Shared upload primitive must pass the configured PDF accept value.");
  assert(workspace.includes("multiple={multiple}"), "Shared upload primitive must control multiple-file behavior.");
  assert(workspace.includes("inputRef.current?.click()"), "Shared upload primitive must open the native file chooser from the select action.");
  assert(workspace.includes("event.currentTarget.files"), "Shared upload primitive must forward selected files.");
  assert(workspace.includes("event.currentTarget.value = \"\""), "Shared upload primitive must reset the input value after selection.");
  assert(workspace.includes("onDragEnter={handleDragEnter}") && workspace.includes("onDragOver={handleDragOver}") && workspace.includes("onDrop={handleDrop}"), "Shared upload primitive must own drag/drop handlers.");
  assert(workspace.includes("event.dataTransfer.dropEffect = \"copy\""), "Shared upload primitive must mark file drops as copy operations.");
  assert(workspace.includes("onFilesSelected?.(event.dataTransfer.files)"), "Shared upload primitive must forward dropped files.");

  for (const [name, source] of [
    ["MergePdfTool", mergeTool],
    ["SplitPdfTool", splitTool],
    ["CompressPdfTool", compressTool],
  ]) {
    for (const component of ["L2ToolWorkspace", "L2ToolMainColumn", "L2ToolSettingsPanel", "L2UploadStage", "L2ActionArea", "L2PrivacyNote"]) {
      assert(source.includes(component), `${name} must use ${component} internally.`);
    }
    assert(source.includes("l2-tool-empty-state"), `${name} must use the compact empty-state class.`);
    assert(source.includes("l2-tool-deep-workspace"), `${name} must use the deep workspace class.`);
    assert(source.includes("lumeo-primary-action"), `${name} must mark its dominant action.`);
  }

  assert(mergeTool.includes("Merge options"), "Merge settings panel heading is missing.");
  assert(mergeTool.includes("inputId=\"merge-pdf-upload\"") && mergeTool.includes("onFilesSelected={(selectedFiles)") && mergeTool.includes("multiple"), "Merge must use the shared multi-file upload contract.");
  assert(mergeTool.includes("One combined PDF using the file order shown."), "Merge must describe the truthful combined output.");
  assert(mergeTool.includes("Move ${item.file.name} up") && mergeTool.includes("Remove ${item.file.name}"), "Merge file controls must keep accessible labels.");
  assert(!/quality|metadata removal|compression|archive/i.test(mergeTool.match(/<L2ToolSettingsPanel title="Merge options"[\s\S]*?<\/L2ToolSettingsPanel>/)?.[0] ?? ""), "Merge settings panel includes invented settings.");

  assert(splitTool.includes("Document tray") && splitTool.includes("Source PDF"), "Split must retain one-document profile language.");
  assert(splitTool.includes("inputId=\"split-pdf-upload\"") && splitTool.includes("multiple={false}") && splitTool.includes("onFilesSelected={handleFiles}"), "Split must use the shared one-file upload contract.");
  for (const splitMode of ['"extract"', '"ranges"', '"everyPage"', '"everyN"', '"remove"']) {
    assert(splitTool.includes(splitMode), `Split mode constant changed unexpectedly: ${splitMode}`);
  }
  assert(splitTool.includes("Examples: 1-3, 5, odd, even, all, or 1-end."), "Split page-range helper changed unexpectedly.");

  assert(mergeTool.includes("PDFDocument.create()") && mergeTool.includes("copyPages"), "Merge PDF creation markers changed unexpectedly.");
  assert(splitTool.includes("JSZip") && splitTool.includes("copyPages"), "Split ZIP/page-copy markers changed unexpectedly.");
  assert(compressTool.includes("Target Size Studio"), "Target Size Studio must remain present.");
  assert(compressTool.includes("inputId=\"compress-pdf-upload\"") && compressTool.includes("multiple={false}") && compressTool.includes("onFilesSelected={handleFiles}"), "Compress must use the shared one-file upload contract.");
  assert(compressTool.includes("Under 100 KB") && compressTool.includes("Under 200 KB") && compressTool.includes("Under 400 KB"), "Target presets changed unexpectedly.");
  assert(compressTool.includes("220") && compressTool.includes("0.86") && compressTool.includes("150") && compressTool.includes("0.74") && compressTool.includes("96") && compressTool.includes("0.58"), "Compression profile values changed unexpectedly.");
  assert(compressTool.includes("Grayscale") && compressTool.includes("Quality mode") && compressTool.includes("Target size"), "Compress controls changed unexpectedly.");
  assert(compressTool.includes("Target achieved") && compressTool.includes("Closest safe result") && compressTool.includes("Compression not beneficial") && compressTool.includes("Unable to process"), "Target status wording changed unexpectedly.");

  const analyticsLifecycleEvents = /processing_started|processing_succeeded|processing_failed|download_started/;
  assert(!analyticsLifecycleEvents.test([mergeTool, splitTool, compressTool].join("\n")), "Analytics V1 must remain tool_opened only in Run 3.");

  assert(docs.includes("Tool Workspace Lifecycle"), "Run 3 workspace documentation is missing.");
  assert(docs.includes("Deep Workspace Implementation"), "Run 4 deep workspace documentation is missing.");
  assert(docs.includes("What remains for Run 5") || docs.includes("What Remains For Run 5"), "Run 5 handoff documentation is missing.");

  const modified = changedFiles();
  for (const file of modified) {
    assert(!file.startsWith("supabase/migrations/"), `Supabase migration changed: ${file}`);
    assert(!file.startsWith("components/analytics/") && !file.startsWith("lib/analytics/"), `Analytics V1 file changed: ${file}`);
  }

  const scannedSource = [workspace, css, tokens, mergePage, splitPage, compressPage, mergeTool, splitTool, compressTool, docs].join("\n");
  assert(!/console\.(log|info|warn|error)/.test(scannedSource), "Production debug logging must not be added.");
  assert(!/service_role|secret[_-]?key|password\s*=/.test(scannedSource), "No hard-coded secrets may be introduced.");

  console.log("PASS Lumeo 2 workspace primitives are present");
  console.log("PASS Merge, Split, and Compress routes use the shared L2 workspace shell");
  console.log("PASS Merge, Split, and Compress internals use shared L2 workspace primitives");
  console.log("PASS sticky desktop and mobile stack safeguards are present");
  console.log("PASS protected processing, analytics, migration, and dependency constraints passed");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Lumeo 2 workspace verification failed.");
  process.exit(1);
}
