import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PERMISSION_AREAS, type PermissionArea } from '../../src/lib/permissions';

// Read the frontend catalog without importing React, frontend aliases or its
// dependencies. Cross-project parity belongs here so a frontend-only install
// never needs the backend's Prisma client just to type-check its tests.
function frontendCatalog(): Pick<PermissionArea, 'area' | 'levels'>[] {
  const file = resolve(__dirname, '../../../frontend/src/lib/rbac.tsx');
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((variable) => ts.isIdentifier(variable.name) && variable.name.text === 'PERMISSION_AREAS');
  const catalog = declaration?.initializer;
  if (!catalog || !ts.isArrayLiteralExpression(catalog)) {
    throw new Error('Frontend PERMISSION_AREAS must be a literal array for the parity check');
  }

  return catalog.elements.map((entry) => {
    if (!ts.isObjectLiteralExpression(entry)) throw new Error('Expected a literal permission area');
    const property = (name: string) => entry.properties.find(
      (node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node)
        && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
        && node.name.text === name,
    )?.initializer;
    const area = property('area');
    const levels = property('levels');
    if (!area || !ts.isStringLiteral(area) || !levels || !ts.isArrayLiteralExpression(levels)) {
      throw new Error('Expected literal area and levels in frontend PERMISSION_AREAS');
    }
    return {
      area: area.text,
      levels: levels.elements.map((level) => {
        if (!ts.isStringLiteral(level) || (level.text !== 'view' && level.text !== 'manage')) {
          throw new Error(`Invalid permission level for ${area.text}`);
        }
        return level.text;
      }),
    };
  });
}

describe('permission catalog parity', () => {
  it('mirrors every backend permission area and level in the frontend', () => {
    const normalize = (areas: Pick<PermissionArea, 'area' | 'levels'>[]) => areas
      .map(({ area, levels }) => ({ area, levels: [...levels].sort() }))
      .sort((a, b) => a.area.localeCompare(b.area));
    expect(normalize(frontendCatalog())).toEqual(normalize(PERMISSION_AREAS));
  });
});
