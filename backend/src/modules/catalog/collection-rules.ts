import type { CollectionRuleField, CollectionRuleOperator, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { productInCategoryPathFilter } from './category-tree';
import { activePromotions, promotionCoverageFilter } from '../discounts/promotion.service';

// Structured, validated rule -> Prisma-where translation for AUTOMATED/HYBRID
// collections. Never interprets `value` as SQL or code — every field has a
// fixed, checked shape, and an unsupported operator or malformed value is a
// 400, not a query. Matches this codebase's existing security bar (7.1's
// injection findings all passed; kept that way here).

export interface RuleRow {
  groupNumber: number;
  field: CollectionRuleField;
  operator: CollectionRuleOperator;
  value: Prisma.JsonValue;
}

function badValue(field: string, expected: string): never {
  throw new AppError('VALIDATION_ERROR', `Rule value for ${field} must be ${expected}`);
}

function unsupportedOperator(field: string, operator: string): never {
  throw new AppError('VALIDATION_ERROR', `Operator ${operator} is not supported for ${field}`);
}

function asNumber(field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) badValue(field, 'a number');
  return value as number;
}

function asStringArray(field: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string') || value.length === 0) {
    badValue(field, 'a non-empty array of strings');
  }
  return value as string[];
}

function asDateString(field: string, value: unknown): Date {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) badValue(field, 'an ISO date string');
  return new Date(value as string);
}

function asEnumValue<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    badValue(field, `one of ${allowed.join(', ')}`);
  }
  return value as T;
}

/** Translates one rule into a Prisma `where` fragment. Async: CATEGORY needs
 *  the target categories' `path` (for descendant matching), and
 *  HAS_ACTIVE_PROMOTION needs the currently-active promotions — both cheap,
 *  small lookups, same shape as the rest of this catalog's read-time
 *  computations. */
async function ruleToFilter(rule: RuleRow): Promise<Prisma.ProductWhereInput> {
  switch (rule.field) {
    case 'PRODUCT_STATUS': {
      if (rule.operator !== 'EQUALS') unsupportedOperator(rule.field, rule.operator);
      const status = asEnumValue(rule.field, rule.value, ['ACTIVE', 'ARCHIVED'] as const);
      return status === 'ACTIVE' ? { isActive: true, deletedAt: null } : { deletedAt: { not: null } };
    }

    case 'CATEGORY': {
      if (rule.operator !== 'IN') unsupportedOperator(rule.field, rule.operator);
      const obj =
        rule.value && typeof rule.value === 'object' && !Array.isArray(rule.value)
          ? (rule.value as Record<string, unknown>)
          : undefined;
      const categoryIds = asStringArray(rule.field, obj ? obj.categoryIds : rule.value);
      const includeDescendants = obj?.includeDescendants === true;
      const categories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { path: true },
      });
      if (categories.length === 0) return { id: { in: [] } };
      return { OR: categories.map((c) => productInCategoryPathFilter(c.path, includeDescendants)) };
    }

    case 'PRICE':
    case 'COMPARE_AT_PRICE': {
      const column = rule.field === 'PRICE' ? 'price' : 'compareAtPrice';
      const num = asNumber(rule.field, rule.value);
      switch (rule.operator) {
        case 'EQUALS':
          return { [column]: num };
        case 'NOT_EQUALS':
          return { NOT: { [column]: num } };
        case 'GREATER_THAN':
          return { [column]: { gt: num } };
        case 'GREATER_THAN_OR_EQUAL':
          return { [column]: { gte: num } };
        case 'LESS_THAN':
          return { [column]: { lt: num } };
        case 'LESS_THAN_OR_EQUAL':
          return { [column]: { lte: num } };
        default:
          unsupportedOperator(rule.field, rule.operator);
      }
      break;
    }

    case 'CREATED_AT': {
      const date = asDateString(rule.field, rule.value);
      switch (rule.operator) {
        case 'EQUALS':
          return { dateCreated: date };
        case 'GREATER_THAN':
          return { dateCreated: { gt: date } };
        case 'GREATER_THAN_OR_EQUAL':
          return { dateCreated: { gte: date } };
        case 'LESS_THAN':
          return { dateCreated: { lt: date } };
        case 'LESS_THAN_OR_EQUAL':
          return { dateCreated: { lte: date } };
        default:
          unsupportedOperator(rule.field, rule.operator);
      }
      break;
    }

    case 'HAS_ACTIVE_PROMOTION': {
      if (rule.operator !== 'EXISTS') unsupportedOperator(rule.field, rule.operator);
      const promotions = await activePromotions();
      return promotionCoverageFilter(promotions);
    }

    case 'STOCK_STATUS': {
      if (rule.operator !== 'EQUALS') unsupportedOperator(rule.field, rule.operator);
      const status = asEnumValue(rule.field, rule.value, ['IN_STOCK', 'OUT_OF_STOCK'] as const);
      return status === 'IN_STOCK'
        ? { variants: { some: { stockQuantity: { gt: 0 } } } }
        : { variants: { every: { stockQuantity: { lte: 0 } } } };
    }
  }
}

/** Rules with the same `groupNumber` are ANDed together; different
 *  `groupNumber`s are ORed — standard rule-group semantics. No rules at all
 *  ⇒ an empty result (an AUTOMATED collection with nothing configured shows
 *  nothing, it doesn't fall back to "everything"). */
export async function evaluateCollectionRules(rules: RuleRow[]): Promise<Prisma.ProductWhereInput> {
  if (rules.length === 0) return { id: { in: [] } };

  const groups = new Map<number, RuleRow[]>();
  for (const rule of rules) {
    const bucket = groups.get(rule.groupNumber) ?? [];
    bucket.push(rule);
    groups.set(rule.groupNumber, bucket);
  }

  const groupFilters: Prisma.ProductWhereInput[] = [];
  for (const groupRules of groups.values()) {
    const andFilters = await Promise.all(groupRules.map(ruleToFilter));
    groupFilters.push(andFilters.length === 1 ? andFilters[0] : { AND: andFilters });
  }
  return groupFilters.length === 1 ? groupFilters[0] : { OR: groupFilters };
}

/** The full membership filter for one collection, honoring its `type`:
 *   - MANUAL    → CollectionProduct rows only (membership is always INCLUDE
 *                 in practice for a pure-manual collection).
 *   - AUTOMATED → rules only; CollectionProduct rows are ignored entirely.
 *   - HYBRID    → rules, plus manual INCLUDE on top, minus manual EXCLUDE.
 */
export async function collectionMembershipFilter(collection: {
  id: string;
  type: 'MANUAL' | 'AUTOMATED' | 'HYBRID';
}): Promise<Prisma.ProductWhereInput> {
  if (collection.type === 'MANUAL') {
    return { collectionLinks: { some: { collectionID: collection.id, membership: 'INCLUDE' } } };
  }

  const rules = await prisma.collectionRule.findMany({
    where: { collectionID: collection.id },
    orderBy: [{ groupNumber: 'asc' }, { sortOrder: 'asc' }],
  });
  const ruleFilter = await evaluateCollectionRules(rules);

  if (collection.type === 'AUTOMATED') return ruleFilter;

  // HYBRID: (rules OR manual-include) AND NOT manual-exclude.
  return {
    AND: [
      { OR: [ruleFilter, { collectionLinks: { some: { collectionID: collection.id, membership: 'INCLUDE' } } }] },
      { NOT: { collectionLinks: { some: { collectionID: collection.id, membership: 'EXCLUDE' } } } },
    ],
  };
}
