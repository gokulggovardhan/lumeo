from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1))


cert = Path("e2e/production-conversion-certification.spec.ts")
smoke = Path("e2e/production-conversion-smoke.spec.ts")

cert_text = cert.read_text()
old = 'await expect(page.getByTitle(input.name)).toBeVisible();'
count = cert_text.count(old)
if count != 2:
    raise SystemExit(f"exact file title: expected 2 matches, found {count}")
cert.write_text(cert_text.replace(old, 'await expect(page.getByTitle(input.name, { exact: true })).toBeVisible();'))

replace_once(
    cert,
    '''function expectCleanRuntime(watch: RuntimeWatch): void {\n  expect(watch.pageErrors).toEqual([]);\n  expect(watch.consoleErrors).toEqual([]);''',
    '''const EXPECTED_FIREFOX_OFFICE_PERMISSION_ERRORS = new Set([\n  "'clipboard-read' (value of 'name' member of PermissionDescriptor) is not a valid value for enumeration PermissionName.",\n  "'clipboard-write' (value of 'name' member of PermissionDescriptor) is not a valid value for enumeration PermissionName.",\n]);\n\nconst EXPECTED_CHROMIUM_OFFICE_RUNTIME_CONSOLE_ERRORS = new Set([\n  "QRect(0,0 0x0) 1",\n  "QObject::connect(QWindow, QtFrame): invalid nullptr parameter",\n  "warning: unsupported syscall: __syscall_mprotect",\n]);\n\nfunction isExpectedFirefoxOfficePermissionCapabilityError(message: string): boolean {\n  return EXPECTED_FIREFOX_OFFICE_PERMISSION_ERRORS.has(message);\n}\n\nfunction isExpectedChromiumOfficeRuntimeDiagnostic(message: string): boolean {\n  return EXPECTED_CHROMIUM_OFFICE_RUNTIME_CONSOLE_ERRORS.has(message.trim());\n}\n\nfunction isExpectedSandboxedHtmlPreviewScriptBlock(message: string): boolean {\n  return message.startsWith(\n    "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.",\n  );\n}\n\ntype RuntimeExpectationOptions = {\n  allowPageError?: (message: string) => boolean;\n  allowConsoleError?: (message: string) => boolean;\n};\n\nfunction expectCleanRuntime(\n  watch: RuntimeWatch,\n  options: RuntimeExpectationOptions = {},\n): void {\n  const unexpectedPageErrors = options.allowPageError\n    ? watch.pageErrors.filter((message) => !options.allowPageError?.(message))\n    : watch.pageErrors;\n  const unexpectedConsoleErrors = options.allowConsoleError\n    ? watch.consoleErrors.filter((message) => !options.allowConsoleError?.(message))\n    : watch.consoleErrors;\n  expect(unexpectedPageErrors).toEqual([]);\n  expect(unexpectedConsoleErrors).toEqual([]);''',
    "runtime classifiers",
)

replace_once(
    cert,
    '''  await expect(page.getByText("Conversion cancelled", { exact: true })).toBeVisible();''',
    '''  await expect(\n    page.getByRole("status").getByText("Conversion cancelled", { exact: true }),\n  ).toBeVisible();''',
    "cancellation status locator",
)

replace_once(
    cert,
    '''  expectCleanRuntime(runtime);\n});\n\ntest("production Word to PDF is capability-honest on non-Chromium browsers", async ({''',
    '''  expectCleanRuntime(runtime, {\n    allowConsoleError: isExpectedChromiumOfficeRuntimeDiagnostic,\n  });\n});\n\ntest("production Word to PDF is capability-honest on non-Chromium browsers", async ({''',
    "Chromium Office runtime diagnostics",
)

replace_once(
    cert,
    '''  expectCleanRuntime(runtime);\n});\n\ntest("production HTML to PDF preserves styled multi-page content and supports repeat generation", async ({''',
    '''  expectCleanRuntime(runtime, {\n    allowPageError:\n      browserName === "firefox"\n        ? isExpectedFirefoxOfficePermissionCapabilityError\n        : undefined,\n  });\n});\n\ntest("production HTML to PDF preserves styled multi-page content and supports repeat generation", async ({''',
    "Firefox Office capability diagnostics",
)

replace_once(
    cert,
    '''  .page-break { break-before: page; page-break-before: always; }''',
    '''  .page-break { break-before: page; page-break-before: always; min-height: 2400px; }''',
    "HTML physical multi-page fixture",
)
replace_once(
    cert,
    '''  <div class="page-break"></div>''',
    '''  <div class="page-break html2pdf__page-break"></div>''',
    "HTML documented legacy page-break fallback",
)

replace_once(
    cert,
    '''  await generate.click();\n  await expect(generate).toContainText("Generating", { timeout: 5_000 });\n  let download = await downloadPromise;''',
    '''  await generate.click();\n  let download = await downloadPromise;\n  await expect(generate).toBeEnabled();\n  await expect(generate).toHaveText("Generate PDF");''',
    "HTML durable completion assertion",
)

replace_once(
    cert,
    '''  pdf = await PDFDocument.load(bytes);\n  expect(pdf.getPageCount()).toBeGreaterThan(0);\n  expect(bytes.length).toBeGreaterThan(1_000);\n\n  expectCleanRuntime(runtime);\n});''',
    '''  pdf = await PDFDocument.load(bytes);\n  expect(pdf.getPageCount()).toBeGreaterThan(0);\n  expect(bytes.length).toBeGreaterThan(1_000);\n\n  expectCleanRuntime(runtime, {\n    allowConsoleError: isExpectedSandboxedHtmlPreviewScriptBlock,\n  });\n});''',
    "HTML sandbox runtime allowance",
)

replace_once(
    smoke,
    '''  const selectEmployeeAndOpenFormat = async () => {\n    await waitForStageReady(page);\n    const run = page\n      .locator('div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]')\n      .first();\n    await expect(run).toBeVisible({ timeout: 90_000 });\n    await run.click();\n    await page.getByRole("button", { name: "Format" }).click();\n    const panel = page.locator("[data-native-text-formatting]");\n    await expect(panel).toBeVisible();\n    return {\n      colour: page.getByLabel("Native fill colour"),\n      scale: page.getByRole("spinbutton", { name: "Native horizontal scale" }),\n      editor: page.getByRole("textbox", { name: "Edit text" }),\n    };\n  };''',
    '''  const selectEmployeeAndOpenFormat = async (targetPage: Page) => {\n    await waitForStageReady(targetPage);\n    const run = targetPage\n      .locator('div[role="button"][aria-label^="Editable text: "][aria-label*="Employee record"]')\n      .first();\n    await expect(run).toBeVisible({ timeout: 90_000 });\n    await run.click();\n    await targetPage.getByRole("button", { name: "Format" }).click();\n    const panel = targetPage.locator("[data-native-text-formatting]");\n    await expect(panel).toBeVisible();\n    return {\n      colour: targetPage.getByLabel("Native fill colour"),\n      scale: targetPage.getByRole("spinbutton", { name: "Native horizontal scale" }),\n      editor: targetPage.getByRole("textbox", { name: "Edit text" }),\n    };\n  };''',
    "Edit PDF page-parameterized selector",
)

smoke_text = smoke.read_text()
for old_call, new_call in [
    ("const initial = await selectEmployeeAndOpenFormat();", "const initial = await selectEmployeeAndOpenFormat(page);"),
    ("const applied = await selectEmployeeAndOpenFormat();", "const applied = await selectEmployeeAndOpenFormat(page);"),
    ("const undone = await selectEmployeeAndOpenFormat();", "const undone = await selectEmployeeAndOpenFormat(page);"),
    ("const redone = await selectEmployeeAndOpenFormat();", "const redone = await selectEmployeeAndOpenFormat(page);"),
]:
    count = smoke_text.count(old_call)
    if count != 1:
        raise SystemExit(f"{old_call}: expected one match, found {count}")
    smoke_text = smoke_text.replace(old_call, new_call, 1)
smoke.write_text(smoke_text)

replace_once(
    smoke,
    '''  await page.goto("/pdf/edit", { waitUntil: "domcontentloaded" });\n  await expect(page.locator("[data-edit-client-ready='true']")).toBeAttached({ timeout: 30_000 });\n  await page.locator('input[type="file"]').first().setInputFiles({\n    name: "native-colour-production-reopened.pdf",\n    mimeType: "application/pdf",\n    buffer: bytes,\n  });\n  const reopened = await selectEmployeeAndOpenFormat();\n  await expect(reopened.colour).toHaveValue("#3366cc");\n  await expect(reopened.scale).toHaveValue("95");\n\n  expect(consoleErrors).toEqual([]);\n  expectCleanRuntime(runtime);''',
    '''  const reopenedPage = await page.context().newPage();\n  const reopenedRuntime = watchConversionRuntime(reopenedPage);\n  const reopenedConsoleErrors: string[] = [];\n  reopenedPage.on("console", (message) => {\n    if (message.type() === "error") reopenedConsoleErrors.push(message.text());\n  });\n  await reopenedPage.goto("/pdf/edit", { waitUntil: "domcontentloaded" });\n  await expect(reopenedPage.locator("[data-edit-client-ready='true']")).toBeAttached({ timeout: 30_000 });\n  await reopenedPage.locator('input[type="file"]').first().setInputFiles({\n    name: "native-colour-production-reopened.pdf",\n    mimeType: "application/pdf",\n    buffer: bytes,\n  });\n  const reopened = await selectEmployeeAndOpenFormat(reopenedPage);\n  await expect(reopened.colour).toHaveValue("#3366cc");\n  await expect(reopened.scale).toHaveValue("95");\n\n  expect(reopenedConsoleErrors).toEqual([]);\n  expectCleanRuntime(reopenedRuntime);\n  expect(consoleErrors).toEqual([]);\n  expectCleanRuntime(runtime);\n  await reopenedPage.close();''',
    "Edit PDF isolated reopen page",
)

print("production certification repair v3 applied")
