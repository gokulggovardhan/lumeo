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
const homepage = read("app/page.tsx");
const launcher = read("components/pdf/PdfToolLauncher.tsx");
const ui = read("components/ui/Aura.tsx");
const chrome = read("components/PublicPdfChrome.tsx");
const menu = read("components/public/PublicPdfToolsMenuClient.tsx");
const directory = read("app/pdf-tools/page.tsx");
const errorPage = read("app/pdf-tools/error.tsx");
const maintenanceNotice = read("components/pdf/ToolMaintenanceNotice.tsx");
const footer = read("components/PublicFooter.tsx");
const docs = read("docs/LUMEO_2_DESIGN_SYSTEM.md");
const css = read("app/globals.css");
const mergeTool = read("components/pdf/MergePdfTool.tsx");
const splitTool = read("components/pdf/SplitPdfTool.tsx");
const compressTool = read("components/pdf/CompressPdfTool.tsx");

try {
  assert(packageJson.scripts["verify:lumeo2-public-experience"] === "node scripts/verify-lumeo-2-public-experience.mjs", "verify:lumeo2-public-experience script is missing.");
  assert(packageJson.dependencies.next === "^16.3.0", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.8", "React version changed unexpectedly.");
  assert(packageJson.dependencies["@supabase/supabase-js"] === "^2.112.2", "Supabase JS version changed unexpectedly.");

  for (const component of [
    "L2PublicHeader",
    "L2PublicNavLink",
    "L2MenuSurface",
    "L2FeaturedToolCard",
    "L2ToolCard",
    "L2DirectoryToolCard",
    "L2TrustRail",
    "L2PublicFooter",
    "L2PublicEmptyState",
    "L2PublicErrorState",
  ]) {
    assert(ui.includes(`export function ${component}`) || ui.includes(`export const ${component}`), `Missing Lumeo 2 public primitive: ${component}`);
  }

  assert(homepage.includes("Pick a tool."), "Current homepage headline is missing.");
  assert(!homepage.includes("Start with Merge PDF"), "Homepage must not restore the retired CTA.");
  assert(!/badge/i.test(homepage), "Homepage must not introduce badges.");
  assert(!/\b(ratings?|customers?|users?|downloads?)\b/i.test(homepage), "Homepage must not introduce fake counts or social proof.");

  assert(launcher.includes("getPublicPdfCatalog"), "Homepage tools must remain catalog driven.");
  assert(launcher.includes("resolveLumeoTools"), "Homepage tools must resolve current availability.");
  assert(launcher.includes("buildDiscoveryTiles(resolved)"), "Homepage must render the current resolved discovery-state model.");
  assert(launcher.includes("available ? (") && launcher.includes("<article"), "Unavailable homepage tools must remain visible but non-actionable.");
  assert(footer.includes("All PDF Tools"), "All PDF Tools navigation must remain available.");

  assert(chrome.includes("L2PublicHeader"), "Public navigation must use the Lumeo 2 header surface.");
  assert(chrome.includes("CommandPaletteTrigger"), "Public navigation must keep command search.");
  assert(chrome.includes("PublicPdfToolsMenuClient"), "Public navigation must use the shared responsive PDF tools menu.");

  assert(menu.includes("aria-expanded") && menu.includes("aria-controls") && menu.includes('aria-haspopup="menu"'), "PDF tools menu ARIA semantics are missing.");
  assert(menu.includes('type="button"') && menu.includes("setOpen((value) => !value)"), "PDF tools menu trigger must be a real stateful button.");
  assert(menu.includes("const [open, setOpen] = useState(false)") && menu.includes("buttonRef") && menu.includes("wrapperRef"), "PDF tools menu trigger and panel must share one client-owned state.");
  assert(menu.includes('const MENU_ID = "lumeo-pdf-tools-menu"'), "PDF tools menu must use the stable panel ID.");
  assert(menu.includes("wrapperRef.current?.contains(target)"), "PDF tools menu outside-click handling must include trigger and panel.");
  assert(menu.includes('document.addEventListener("pointerdown", handlePointerDown, true)'), "PDF tools menu must close on outside pointer events.");
  assert(menu.includes("Escape"), "PDF tools menu must close on Escape.");
  assert(menu.includes("setOpen(false);"), "PDF tools menu links must close the menu.");
  assert(menu.includes("View all PDF tools"), "PDF tools menu footer action is missing.");
  assert(menu.includes("md:w-[min(23rem,calc(100vw-2rem))]"), "PDF tools menu must keep its current viewport-safe desktop width.");
  assert(menu.includes("tiles: Tile[]") && menu.includes("{tile.label}") && menu.includes("{tile.description}"), "PDF tools menu must remain data driven.");
  assert(menu.includes("md:max-h-[70vh]"), "PDF tools menu must use controlled viewport-safe height.");
  assert(!menu.includes("md:grid-cols-2"), "PDF tools menu must remain a compact stacked menu.");
  assert(!menu.includes("console."), "PDF tools menu must not contain debug logging.");

  assert(css.includes("--atelier-sage-500") && css.includes("--atelier-brass-400"), "Atelier public palette is missing.");
  assert(footer.includes("rgba(32,36,31,0.72)") && footer.includes("rgba(17,19,16,0.96)"), "Public footer must use Atelier graphite surfaces.");
  assert(![ui, chrome, menu, footer].join("\n").includes("rgba(var(--sky-rgb)"), "Public shared surfaces must not use blue/cyan focus accents.");
  assert(ui.includes("l2-trust-rail-grid") && ui.includes("md:grid-cols-3") && ui.includes("md:justify-center"), "Trust rail must use equal three-column spacing.");
  assert(ui.includes("sm:max-w-[320px]") && css.includes("width: min(100%, 320px);"), "Upload action must be constrained on desktop.");

  assert(directory.includes("getPublicPdfCatalog"), "Directory must remain catalog driven.");
  assert(directory.includes("ToolsExplorer"), "Directory must use the current ToolsExplorer surface.");
  assert(!/\b(popular|ratings?|users?|downloads?)\b/i.test(directory), "Directory must not include fake popularity or counts.");
  assert(errorPage.includes("L2PublicErrorState"), "Directory error state foundation is missing.");

  assert(maintenanceNotice.includes("Undergoing maintenance"), "Maintenance state must stay explicit.");
  assert(maintenanceNotice.includes("Coming soon"), "Coming-soon state must stay explicit.");
  assert(!/AuraUploadSurface|Select files|Start conversion|Convert now/.test(maintenanceNotice), "Unavailable tools must not expose fake operational controls.");

  assert(footer.includes("Tools") && footer.includes("Company") && footer.includes("Legal"), "Footer grouped navigation is missing.");
  assert(footer.includes("Private, browser-first PDF tools."), "Footer product description is missing.");
  assert(css.includes("@media (prefers-reduced-motion: reduce)"), "Reduced-motion support is missing.");
  assert(docs.includes("Homepage Hierarchy") && (docs.includes("What remains for Run 3") || docs.includes("What Remains For Run 3")), "Lumeo 2 public-experience documentation is incomplete.");

  const modified = changedFiles();
  for (const file of modified) {
    assert(!file.startsWith("supabase/migrations/"), `Supabase migration changed: ${file}`);
  }

  assert(mergeTool.includes("PDFDocument.create()") && mergeTool.includes("copyPages"), "Merge algorithm markers changed unexpectedly.");
  assert(splitTool.includes("JSZip") && splitTool.includes("copyPages"), "Split algorithm markers changed unexpectedly.");
  assert(compressTool.includes("Target Size Studio") && compressTool.includes("Under 100 KB") && compressTool.includes("Under 200 KB") && compressTool.includes("Under 400 KB"), "Compress Target Size Studio markers changed unexpectedly.");
  assert(/processing_started|processing_succeeded|processing_failed|download_started/.test([mergeTool, splitTool, compressTool].join("\n")), "Approved analytics lifecycle events must remain present.");

  const scannedSource = [homepage, launcher, ui, chrome, menu, directory, errorPage, maintenanceNotice, footer, docs].join("\n");
  assert(!/console\.(log|info|warn|error)/.test(scannedSource), "Production debug logging must not be added.");
  assert(!/service_role|secret[_-]?key|password\s*=/.test(scannedSource), "No hard-coded secrets may be introduced.");

  console.log("PASS Lumeo public homepage and directory remain catalog driven");
  console.log("PASS navigation, command search, and PDF tools menu remain accessible");
  console.log("PASS unavailable tools remain clearly non-operational");
  console.log("PASS current analytics lifecycle and PDF processing markers remain protected");
  console.log("PASS footer, error, docs, and protected-scope checks passed");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Lumeo 2 public experience verification failed.");
  process.exit(1);
}
