import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Static guard for Task 1 ("every email sent to a user goes out in English
// first, then the Arabic translation, in the SAME email"): every exported
// `send*Email` function must build its subject/text/html through the shared
// bilingual* helpers rather than a single-language template, and the file
// must actually contain a substantial amount of Arabic copy (not just empty
// wrapper calls).
describe('mailer bilingual coverage (Task 1)', () => {
  const src = readFileSync(join(__dirname, '../../src/lib/mailer.ts'), 'utf8');

  it('every exported send*Email function composes bilingualSubject/Text/Html', () => {
    const fnNames = [...src.matchAll(/export async function (send\w+Email)\(/g)].map((m) => m[1]);
    expect(fnNames.length).toBeGreaterThanOrEqual(9); // the 6 original + 3 email-change functions

    for (const name of fnNames) {
      const start = src.indexOf(`export async function ${name}(`);
      // Each function is terminated by the next top-level `export async
      // function` (or EOF) — good enough for this straight-line file.
      const nextExportIdx = src.indexOf('\nexport async function ', start + 1);
      const body = src.slice(start, nextExportIdx === -1 ? src.length : nextExportIdx);

      expect(body, `${name} should call bilingualSubject(...)`).toMatch(/subject:\s*bilingualSubject\(/);
      expect(body, `${name} should call bilingualText(...)`).toMatch(/text:\s*bilingualText\(/);
      expect(body, `${name} should call bilingualHtml(...)`).toMatch(/html:\s*bilingualHtml\(/);
    }
  });

  it('contains substantial Arabic-script copy, not just empty wrapper calls', () => {
    const arabicChars = src.match(/[؀-ۿ]/g) ?? [];
    // A generous floor — real Arabic sentences across 9+ emails run into the
    // thousands of Arabic-script characters; a handful would mean the
    // Arabic strings were stubbed out rather than actually translated.
    expect(arabicChars.length).toBeGreaterThan(500);
  });
});
