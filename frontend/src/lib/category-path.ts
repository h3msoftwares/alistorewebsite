import type { Category } from './types';

/** Builds an id -> "Root › Child › ..." breadcrumb lookup (ancestor names
 *  only, not including the category's own name) from one flat category
 *  list — every admin category picker already fetches the whole tree as one
 *  array (root and leaf categories together), so this needs no extra
 *  request. Exists because several same-named categories can live under
 *  different roots (a "Shoes" under Women, Men, AND Kids) — depth-only
 *  indentation can't tell an admin which one a given row actually is. */
export function buildCategoryPaths(categories: Category[], isAr: boolean): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const separator = isAr ? ' « ' : ' › ';
  const cache = new Map<string, string[]>();

  function ancestorNames(id: string): string[] {
    const cached = cache.get(id);
    if (cached) return cached;
    const cat = byId.get(id);
    const parent = cat?.parentID ? byId.get(cat.parentID) : undefined;
    const names = parent ? [...ancestorNames(parent.id), isAr ? parent.nameAr : parent.nameEn] : [];
    cache.set(id, names);
    return names;
  }

  const paths = new Map<string, string>();
  for (const c of categories) paths.set(c.id, ancestorNames(c.id).join(separator));
  return paths;
}
