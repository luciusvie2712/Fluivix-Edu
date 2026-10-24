export const CSV_MAX_BYTES = 512 * 1024;
export const CSV_MAX_ROWS = 5000;
export const studentCsvColumns = [
  "studentCode",
  "fullName",
  "dateOfBirth",
  "contactEmail",
  "contactPhone",
  "notesPrivate",
] as const;

/** Strict RFC4180 subset: UTF-8 text, comma separated, quoted commas/newlines,
 * CRLF or LF. Reject malformed quotes, ragged rows and unknown headers. */
export function parseStudentCsv(input: string): Array<Record<string, string>> {
  if (Buffer.byteLength(input, "utf8") > CSV_MAX_BYTES)
    throw new Error("CSV_TOO_LARGE");
  for (const character of input) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 65533)
      throw new Error("CSV_INVALID_UTF8_OR_CONTROL");
  }
  const text = input.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const pushField = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    if (rows.length > CSV_MAX_ROWS + 1) throw new Error("CSV_TOO_MANY_ROWS");
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += ch;
    } else if (ch === ",") pushField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] !== "\n")
        throw new Error("CSV_INVALID_NEWLINE");
      if (ch === "\r") i++;
      pushRow();
    } else if (ch === '"' && field.length === 0 && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw new Error("CSV_INVALID_QUOTE");
      field += ch;
    }
  }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  if (field.length || row.length || closed) pushRow();
  const header = rows.shift();
  if (
    !header ||
    !header.includes("studentCode") ||
    !header.includes("fullName") ||
    new Set(header).size !== header.length ||
    header.some((v) => !(studentCsvColumns as readonly string[]).includes(v))
  )
    throw new Error("CSV_INVALID_HEADER");
  if (!rows.length) throw new Error("CSV_EMPTY");
  return rows.map((values) => {
    if (values.length !== header.length) throw new Error("CSV_COLUMN_COUNT");
    return Object.fromEntries(
      header
        .map((key, index) => [key, values[index]!.trim()])
        .filter(([, value]) => value !== ""),
    );
  });
}

/** Every exported cell, including user names, must be formula-safe. */
export function safeCsvCell(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
