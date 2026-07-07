export function sanitizeText(text: string): string {
  return text
    .replace(/\\+$/g, '')           // Strip trailing backslashes
    .replace(/\\n/g, '\n')          // Normalize escaped newlines to real ones
    .replace(/\\"/g, '"')           // Normalize escaped quotes
    .replace(/\\\\/g, '')           // Remove literal double-backslashes
    .replace(/\n{3,}/g, '\n\n')     // Collapse excessive newlines
    .trim();
}

/**
 * Clean and realign an array of alternatives from AI output.
 * Handles: wrong letter prefixes (e.g. "B)" in slot C), continuation
 * fragments starting with commas, various prefix formats.
 */
export function sanitizeAlternatives(alts: string[]): string[] {
  // Strip ANY letter prefix from each alternative (A-E in various formats)
  const stripPrefix = (s: string) =>
    s.replace(/^[A-Ea-e]\)\s*/,     '')  // A) ...
     .replace(/^[A-Ea-e]\.\s*/,     '')  // A. ...
     .replace(/^\([A-Ea-e]\)\s*/,   '')  // (A) ...
     .replace(/^[A-Ea-e]\s*[-–—]\s*/, '') // A - ...
     .replace(/^,\s*/,              '')  // , continuation fragment
     .trim();

  const cleaned = alts.map(alt => sanitizeText(stripPrefix(alt || '')));

  // Ensure we always have exactly 5 slots
  while (cleaned.length < 5) {
    cleaned.push('');
  }

  return cleaned.slice(0, 5);
}

