import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * SQL injection is prevented structurally: every database call goes through
 * Prisma's query builder (parameterised) or a `Prisma.sql` tagged template
 * (also parameterised). This test fails the build if anyone reintroduces a
 * string-built query - the one way to open a hole.
 */

const SRC = join(__dirname, '..', '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('no raw / unparameterised SQL in the codebase', () => {
  const files = walk(SRC);

  it('finds no $queryRawUnsafe / $executeRawUnsafe calls', () => {
    const offenders = files.filter((f) => /\$(queryRaw|executeRaw)Unsafe/.test(readFileSync(f, 'utf8')));
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every $queryRaw / $executeRaw uses the Prisma.sql tagged template', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // Match `$queryRaw` / `$executeRaw` not immediately followed by a
      // backtick (tagged-template form is `prisma.$queryRaw(Prisma.sql\`...\`)`
      // or `prisma.$queryRaw\`...\``; both are parameterised). Flag the
      // string-argument form `$queryRaw('...' + x)`.
      const re = /\$(?:queryRaw|executeRaw)\s*\(\s*(['"`])/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        // A leading backtick here means a raw template literal passed as an
        // argument (still parameterised via Prisma.sql only if it's Prisma.sql).
        const idx = m.index;
        const context = src.slice(Math.max(0, idx - 40), idx + 40);
        if (!context.includes('Prisma.sql')) offenders.push(`${f}: ${context.trim()}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
