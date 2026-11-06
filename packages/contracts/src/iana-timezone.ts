/** Intl also accepts numeric offsets whose sign PostgreSQL interprets oppositely.
 * Keep the caller's valid IANA spelling; never silently rename a centre zone. */
export function isNamedIanaTimezone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+./-]*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
