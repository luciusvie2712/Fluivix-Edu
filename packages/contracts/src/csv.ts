/** Quote CSV cells and neutralize spreadsheet formulas, including leading whitespace. */
export function safeCsvCell(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
