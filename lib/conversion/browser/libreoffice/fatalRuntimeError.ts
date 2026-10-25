/**
 * Recognize a fatal Zeta/LibreOffice WebAssembly trap, not ordinary conversion
 * errors. The Office helper cannot be safely restarted inside the same page:
 * callers must stop the conversion and ask the user to reload.
 */
export function isFatalOfficeRuntimeError(
  message: string,
  filename = "",
  stack = "",
): boolean {
  const details = `${filename}\n${stack}`;
  const fromOfficeRuntime =
    /(?:\/office-runtime\/|soffice\.(?:wasm|js))/i.test(details);
  const isFatalTrap =
    /(?:operation does not support unaligned accesses|memory access out of bounds|unreachable|out of bounds memory access|invalid atomic access)/i.test(message);
  return fromOfficeRuntime && isFatalTrap;
}
