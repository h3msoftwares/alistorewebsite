import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { toNumber } from '../../lib/money';
import { createCoupon } from '../discounts/coupon.service';
import { sendLoyaltyRewardEmail } from '../../lib/mailer';
import type { CreateLoyaltyRuleInput, UpdateLoyaltyRuleInput } from './loyalty.schema';

// ---- Admin CRUD ----

export function listLoyaltyRules() {
  return prisma.loyaltyRule.findMany({ orderBy: { dateCreated: 'desc' } });
}

function validateShape(input: { rewardType?: 'PERCENT' | 'AMOUNT'; rewardValue?: number }) {
  if (input.rewardType === 'PERCENT' && input.rewardValue != null && (input.rewardValue <= 0 || input.rewardValue > 100)) {
    throw new AppError('VALIDATION_ERROR', 'A percentage reward must be between 0 and 100');
  }
}

export async function createLoyaltyRule(input: CreateLoyaltyRuleInput) {
  validateShape(input);
  return prisma.loyaltyRule.create({
    data: {
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      metric: input.metric,
      threshold: input.threshold,
      isActive: input.isActive,
      rewardType: input.rewardType,
      rewardValue: input.rewardValue,
      couponValidDays: input.couponValidDays ?? null,
    },
  });
}

export async function updateLoyaltyRule(id: string, input: UpdateLoyaltyRuleInput) {
  const existing = await prisma.loyaltyRule.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Loyalty rule not found');
  validateShape({
    rewardType: input.rewardType ?? existing.rewardType,
    rewardValue: input.rewardValue ?? toNumber(existing.rewardValue),
  });
  return prisma.loyaltyRule.update({
    where: { id },
    data: {
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
      ...(input.metric !== undefined ? { metric: input.metric } : {}),
      ...(input.threshold !== undefined ? { threshold: input.threshold } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.rewardType !== undefined ? { rewardType: input.rewardType } : {}),
      ...(input.rewardValue !== undefined ? { rewardValue: input.rewardValue } : {}),
      ...(input.couponValidDays !== undefined ? { couponValidDays: input.couponValidDays ?? null } : {}),
    },
  });
}

export async function deleteLoyaltyRule(id: string) {
  const existing = await prisma.loyaltyRule.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Loyalty rule not found');
  await prisma.loyaltyRule.delete({ where: { id } });
}

// ---- Trigger: called right after an order transitions to DELIVERED ----

/** A customer's lifetime standing against one metric, over DELIVERED orders
 *  only — cancelled/returned orders never count toward loyalty. */
async function currentMetricValue(metric: 'ORDER_COUNT' | 'TOTAL_SPENT', userID: string): Promise<number> {
  if (metric === 'ORDER_COUNT') {
    return prisma.order.count({ where: { userID, status: 'DELIVERED' } });
  }
  const agg = await prisma.order.aggregate({ where: { userID, status: 'DELIVERED' }, _sum: { total: true } });
  return toNumber(agg._sum.total ?? 0);
}

/** Checks every active LoyaltyRule against this customer's new standing and
 *  awards (generates + emails a coupon for) any newly-crossed milestone.
 *  Registered customers only (`order.userID` required) — a milestone is
 *  tracked against a persistent identity, which a guest checkout has none
 *  of. Never throws — a broken loyalty rule must not fail the order update
 *  that triggered it; every failure is caught and logged by the caller. */
export async function checkLoyaltyThreshold(order: { userID: string | null }): Promise<void> {
  if (!order.userID) return;
  const userID = order.userID;

  const rules = await prisma.loyaltyRule.findMany({ where: { isActive: true } });
  if (!rules.length) return;

  for (const rule of rules) {
    await processRule(rule, userID);
  }
}

async function processRule(
  rule: Awaited<ReturnType<typeof listLoyaltyRules>>[number],
  userID: string
): Promise<void> {
  const threshold = toNumber(rule.threshold);
  if (threshold <= 0) return;

  const metricValue = await currentMetricValue(rule.metric, userID);
  // Milestone N is "reached N * threshold of the metric" — a customer who
  // jumps several milestones in one order (e.g. one huge order crossing a
  // $-spent threshold twice over) only ever gets the single newest
  // milestone, not one coupon per skipped milestone (deliberate — see the
  // LoyaltyAward schema doc comment).
  const currentMilestone = Math.floor(metricValue / threshold);
  if (currentMilestone < 1) return;

  const lastAward = await prisma.loyaltyAward.findFirst({
    where: { ruleID: rule.id, userID },
    orderBy: { milestoneNumber: 'desc' },
  });
  if (currentMilestone <= (lastAward?.milestoneNumber ?? 0)) return;

  const user = await prisma.user.findUnique({ where: { id: userID } });
  // Nothing to send the reward to — a phone-only account, for instance.
  // Don't award (and don't burn a milestone) so it can still fire once the
  // customer adds an email.
  if (!user?.email) return;

  const coupon = await createCoupon({
    type: rule.rewardType,
    value: toNumber(rule.rewardValue),
    isActive: true,
    maxPerCustomer: 1,
    endsAt: rule.couponValidDays
      ? new Date(Date.now() + rule.couponValidDays * 24 * 60 * 60 * 1000).toISOString()
      : null,
  });

  try {
    await prisma.loyaltyAward.create({
      data: { ruleID: rule.id, userID, milestoneNumber: currentMilestone, couponID: coupon.id },
    });
  } catch (e) {
    // Another concurrent DELIVERED transition for this same customer already
    // awarded this exact milestone (the @@unique backstop) — extremely rare
    // (one admin action per order), but if it happens the coupon we just
    // made is a harmless, unused duplicate. Delete it rather than leave an
    // un-emailed orphan coupon lying around.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      await prisma.coupon.delete({ where: { id: coupon.id } }).catch(() => {});
      return;
    }
    throw e;
  }

  await sendLoyaltyRewardEmail(user.email, { nameEn: rule.nameEn, nameAr: rule.nameAr }, coupon);
}
