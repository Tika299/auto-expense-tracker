export function normalizeText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}
