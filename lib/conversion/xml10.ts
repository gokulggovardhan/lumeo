function isValidXml10CodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

export function sanitizeXml10Text(value: string): string {
  let sanitized = "";

  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && isValidXml10CodePoint(codePoint)) {
      sanitized += character;
    }
  }

  return sanitized;
}

export function hasInvalidXml10Characters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || !isValidXml10CodePoint(codePoint)) {
      return true;
    }
  }

  return false;
}
