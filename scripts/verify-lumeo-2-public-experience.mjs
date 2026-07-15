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
const loading = read("app/pdf-tools/loading.tsx");
const errorPage = read("app/pdf-tools/error.tsx");
const placeholder = read("components/pdf/PdfToolPlaceholder.tsx");
const footer = read("components/PublicFooter.tsx");
const docs = read("docs/LUMEO_2_DESIGN_SYSTEM.md");
const css = read("app/globals.css");
const mergeTool = read("components/pdf/MergePdfTool.tsx");
const splitTool = read("components/pdf/SplitPdfTool.tsx");
const compressTool = read("components/pdf/CompressPdfTool.tsx");

try {
  assert(packageJson.scripts["verify:lumeo2-public-experience"] === "node scripts/verify-lumeo-2-public-experience.mjs", "verify:lumeo2-public-experience script is missing.");
  assert(packageJson.dependencies.next === "^16.2.10", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.7", "React version changed unexpectedly.");
  assert(packageJson.dependencies["@supabase/supabase-js"] === "^2.110.2", "Supabase JS version changed unexpectedly.");
  assert(packageJson.dependencies.firebase === "^12.16.0", "Firebase version changed unexpectedly.");

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
    "L2SkeletonCard",
  ]) {
    assert(ui.includes(`export function ${component}`) || ui.includes(`export const ${component}`), `Missing Lumeo 2 public primitive: ${component}`);
  }

  assert(homepage.includes("Documents, beautifully handled."), "Homepage headline is missing.");
  assert(homepage.includes("Fast PDF tools that work privately in your browser."), "Homepage supporting line is missing.");
  assert(!homepage.includes("Start with Merge PDF"), "Homepage must not place a CTA above tools.");
  assert(!/badge/i.test(homepage), "Homepage must not introduce badges.");
  assert(!/\b(ratings?|customers?|users?|downloads?|processed)\b/i.test(homepage), "Homepage must not introduce fake counts or social proof.");
  assert(homepage.includes("L2TrustRail"), "Homepage trust rail is missing.");

  assert(launcher.includes("getPublicHomepageTools"), "Homepage tools must remain catalog driven.");
  assert(launcher.includes("configuredTools.slice(0, 5)"), "Homepage must keep exactly five configured slots.");
  assert(launcher.includes("All PDF Tools"), "Permanent All PDF Tools card is missing.");
  assert(launcher.includes("featured={index === 0}"), "Featured card must derive from the first configured tool.");
  assert(launcher.includes("allTools={index === 5}"), "Permanent sixth card marker is missing.");
  assert(!launcher.includes("undefined"), "Homepage launcher should not render an empty sixth position.");

  assert(chrome.includes("L2PublicHeader"), "Public navigation must use Lumeo 2 header surface.");
  assert(chrome.includes("L2MobileNavClient"), "Mobile navigation drawer is missing.");
  assert(menu.includes("aria-expanded") && menu.includes("aria-controls") && menu.includes("aria-haspopup=\"menu\""), "PDF tools menu ARIA semantics are missing.");
  assert(menu.includes("const [open, setOpen] = useState(false)") && menu.includes("buttonRef") && menu.includes("wrapperRef"), "PDF tools menu trigger and panel must share one client-owned state.");
  assert(menu.includes("const MENU_ID = \"lumeo-pdf-tools-menu\""), "PDF tools menu must use the stable panel ID.");
  assert(menu.includes("wrapperRef.current?.contains(target)"), "PDF tools menu outside-click handling must not treat the trigger or panel as outside.");
  assert(menu.includes("document.addEventListener(\"pointerdown\", handlePointerDown, true)"), "PDF tools menu must close on outside pointer events.");
  assert(menu.includes("Escape"), "PDF tools menu must close on Escape.");
  assert(menu.includes("onClick={() => {") && menu.includes("setOpen(false);"), "PDF tools menu links must close the menu.");
  assert(menu.includes("View all PDF tools"), "PDF tools menu footer action is missing.");
  assert(menu.includes("md:grid-cols-2"), "PDF tools menu must support two-column desktop layout.");
  assert(menu.includes("aria-controls={MENU_ID}") && menu.includes("id={MENU_ID}"), "PDF tools menu trigger aria-controls must point to the real panel.");
  assert(!menu.includes("console."), "PDF tools menu must not contain debug logging.");
  assert(ui.includes("l2-trust-rail-grid") && ui.includes("sm:grid-cols-3") && ui.includes("sm:justify-center"), "Trust rail must use equal three-column spacing on comfortable viewports.");
  assert(ui.includes("sm:max-w-[320px]") && css.includes("width: min(100%, 320px);"), "Upload action must be constrained on desktop.");
  assert(ui.includes("l2-directory-card-surface") && css.includes(".l2-directory-card-surface"), "Directory cards must use the shared raised surface styling.");

  assert(directory.includes("getPublicPdfCatalog"), "Directory must remain catalog driven.");
  assert(directory.includes("L2DirectoryToolCard"), "Directory must use Lumeo 2 directory cards.");
  assert(!/\b(popular|ratings?|users?|downloads?)\b/i.test(directory), "Directory must not include fake popularity or counts.");
  assert(loading.includes("L2SkeletonCard"), "Directory loading skeletons are missing.");
  assert(errorPage.includes("L2PublicErrorState"), "Directory error state foundation is missing.");

  assert(placeholder.includes("Non-operational preview"), "Placeholder tools must be clearly non-operational.");
  assert(placeholder.includes("No files can be selected or processed"), "Placeholder must not look like a working upload tool.");
  assert(placeholder.includes("Browse PDF tools") && placeholder.includes("Back home"), "Placeholder actions are missing.");
  assert(!placeholder.includes("AuraUploadSurface"), "Placeholder must not show a fake upload area.");

  assert(footer.includes("Tools") && footer.includes("Company") && footer.includes("Legal"), "Footer grouped navigation is missing.");
  assert(footer.includes("Private, browser-first PDF tools."), "Footer product description is missing.");
  assert(css.includes("@media (prefers-reduced-motion: reduce)"), "Reduced-motion support is missing.");
  assert(docs.includes("Homepage Hierarchy") && (docs.includes("What remains for Run 3") || docs.includes("What Remains For Run 3")), "Lumeo 2 public-experience documentation is incomplete.");

  const modified = changedFiles();
  for (const file of modified) {
    assert(!file.startsWith("supabase/migrations/"), `Supabase migration changed: ${file}`);
    assert(!file.startsWith("components/analytics/") && !file.startsWith("lib/analytics/"), `Analytics V1 file changed: ${file}`);
  }

  assert(mergeTool.includes("PDFDocument.create()") && mergeTool.includes("copyPages"), "Merge algorithm markers changed unexpectedly.");
  assert(splitTool.includes("JSZip") && splitTool.includes("copyPages"), "Split algorithm markers changed unexpectedly.");
  assert(compressTool.includes("Target Size Studio") && compressTool.includes("Under 100 KB") && compressTool.includes("Under 200 KB") && compressTool.includes("Under 400 KB"), "Compress Target Size Studio markers changed unexpectedly.");
  assert(!/processing_started|processing_succeeded|processing_failed|download_started/.test([mergeTool, splitTool, compressTool].join("\n")), "Analytics lifecycle events must not be reintroduced.");

  const scannedSource = [homepage, launcher, ui, chrome, menu, directory, loading, errorPage, placeholder, footer, docs].join("\n");
  assert(!/console\.(log|info|warn|error)/.test(scannedSource), "Production debug logging must not be added.");
  assert(!/service_role|secret[_-]?key|password\s*=/.test(scannedSource), "No hard-coded secrets may be introduced.");

  console.log("PASS Lumeo 2 homepage uses catalog-driven five-plus-one composition");
  console.log("PASS navigation and PDF tools menu use accessible Lumeo 2 surfaces");
  console.log("PASS PDF tools directory remains catalog-driven");
  console.log("PASS placeholder tools are clearly non-operational");
  console.log("PASS footer, loading, error, docs, and protected-scope checks passed");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Lumeo 2 public experience verification failed.");
  process.exit(1);
}
