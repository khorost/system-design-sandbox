/** Strip HTML tags from a string */
export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

/** Sanitize a label: strip HTML, trim, truncate to 100 chars */
export function sanitizeLabel(label: string): string {
  return stripHtml(label).trim().slice(0, 100);
}

/** Sanitize a string value: strip HTML, trim, truncate to maxLength */
export function sanitizeString(value: string, maxLength = 500): string {
  return stripHtml(value).trim().slice(0, maxLength);
}

/** Sanitize all string values in a config object (shallow). Numbers/booleans pass through. */
export function sanitizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    result[key] = typeof value === 'string' ? sanitizeString(value) : value;
  }
  return result;
}
