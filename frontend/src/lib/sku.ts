// Auto-generated product SKUs: "<ROOT>-<CATEGORY>-<NAME>-<NNNN>", e.g.
// "WOM-DRE-LSD-4821" for "Linen Summer Dress" in Women › Dresses. Readable
// at a glance in the warehouse, short, and ASCII-only. The 4-digit suffix
// keeps two similarly-named products in one category apart; the backend's
// unique constraint is still the real guarantee (a clash just fails the
// save and the admin rerolls). Variant SKUs extend this one with size and
// colour (see components/admin/variants-matrix.tsx).

const STOPWORDS = new Set(['a', 'an', 'and', 'the', 'of', 'for', 'with', 'in', 'on', 'by', 'to', '&']);

/** A-Z/0-9 words of `text`, upper-cased, accents folded, stopwords dropped. */
function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9&]+/)
    .filter((w) => w && !STOPWORDS.has(w.toLowerCase()))
    .map((w) => w.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean);
}

/** 3-letter code for a category name: "Dresses" → "DRE", "T Shirts" → "TSH". */
export function categoryCode(name: string): string {
  return words(name).join('').slice(0, 3);
}

/** Name code: the initials of up to 4 significant words, topped up from the
 *  first word to at least 3 characters — "Linen Summer Dress" → "LSD",
 *  "Hoodie" → "HOO", "Silk Scarf" → "SSI". */
export function nameCode(name: string): string {
  const w = words(name);
  if (w.length === 0) return '';
  const initials = w.slice(0, 4).map((x) => x[0]).join('');
  return initials.length >= 3 ? initials : (initials + w[0].slice(1)).slice(0, 3);
}

export function randomSkuSuffix(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

/** `categoryPath` is root → leaf names (e.g. ["Women", "Dresses"]); only the
 *  root and the leaf are used, and the leaf is skipped when it is the root. */
export function generateProductSku({
  name,
  categoryPath,
  suffix,
}: {
  name: string;
  categoryPath: string[];
  suffix: string;
}): string {
  const root = categoryPath[0];
  const leaf = categoryPath.length > 1 ? categoryPath[categoryPath.length - 1] : undefined;
  const parts = [
    root ? categoryCode(root) : '',
    leaf ? categoryCode(leaf) : '',
    nameCode(name) || 'PRD',
    suffix,
  ];
  return parts.filter(Boolean).join('-');
}
