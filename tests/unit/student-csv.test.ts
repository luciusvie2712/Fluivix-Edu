import { describe, expect, it } from "vitest";
import { CSV_MAX_BYTES, parseStudentCsv } from "../../apps/api/src/student-csv";
import { safeCsvCell } from "../../packages/contracts/src/csv";
describe("bounded student CSV input", () => {
  it("accepts BOM, escaped quotes, Vietnamese and embedded commas/newlines", () => {
    expect(
      parseStudentCsv(
        '\ufeffstudentCode,fullName,notesPrivate\r\nA01,"Nguyễn, An","Nói ""chào""\nDòng hai"\r\n',
      ),
    ).toEqual([
      {
        studentCode: "A01",
        fullName: "Nguyễn, An",
        notesPrivate: 'Nói "chào"\nDòng hai',
      },
    ]);
  });
  it.each([
    ["studentCode,fullName,unknown\nA,An,x", "CSV_INVALID_HEADER"],
    ["studentCode,studentCode,fullName\nA,A,An", "CSV_INVALID_HEADER"],
    ['studentCode,fullName\nA,"An', "CSV_UNCLOSED_QUOTE"],
    ['studentCode,fullName\nA,"An"x', "CSV_INVALID_QUOTE"],
    ["studentCode,fullName\nA,An,extra", "CSV_COLUMN_COUNT"],
    ["studentCode,fullName\nA,\ufffd", "CSV_INVALID_UTF8_OR_CONTROL"],
    ["studentCode,fullName", "CSV_EMPTY"],
  ])("rejects malformed input: %s", (csv, error) => {
    expect(() => parseStudentCsv(csv)).toThrow(error);
  });
  it("enforces row and UTF-8 byte limits", () => {
    expect(() =>
      parseStudentCsv("studentCode,fullName\n" + "A,An\n".repeat(5001)),
    ).toThrow("CSV_TOO_MANY_ROWS");
    expect(() => parseStudentCsv("ế".repeat(CSV_MAX_BYTES / 2))).toThrow(
      "CSV_TOO_LARGE",
    );
  });
  it("neutralizes spreadsheet formulas in every exported cell", () => {
    expect(safeCsvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');
    expect(safeCsvCell("Nguyễn An")).toBe('"Nguyễn An"');
  });
});
