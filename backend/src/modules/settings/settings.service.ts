import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import type { UpdateSettingsInput } from './settings.schema';

// The settings row is a singleton — its id is always 1.
const SETTINGS_ID = 1;

const settingsInclude = {
  announcementLines: { orderBy: { sortOrder: 'asc' as const } },
  deliveryRates: { orderBy: { sortOrder: 'asc' as const } },
  heroCtaCollection: { select: { id: true, slug: true, nameEn: true, nameAr: true } },
};

export async function getSettings() {
  const existing = await prisma.siteSetting.findUnique({
    where: { id: SETTINGS_ID },
    include: settingsInclude,
  });
  if (existing) return existing;
  // Self-heal a DB whose singleton row is missing (migration seeds it, so this
  // is only a safety net).
  return prisma.siteSetting.create({ data: { id: SETTINGS_ID }, include: settingsInclude });
}

// Scalar text/url fields: '' or null ⇒ store null; undefined ⇒ leave as-is.
const TEXT_FIELDS = [
  'brandNameEn',
  'brandNameAr',
  'announcementActive',
  'heroEyebrowEn',
  'heroEyebrowAr',
  'heroHeadlineEn',
  'heroHeadlineAr',
  'heroLedeEn',
  'heroLedeAr',
  'heroCtaLabelEn',
  'heroCtaLabelAr',
  'homeMoreHeadingEn',
  'homeMoreHeadingAr',
] as const;

const NULLABLE_FIELDS = [
  'instagramUrl',
  'facebookUrl',
  'tiktokUrl',
  'whatsappUrl',
  'contactEmail',
  'contactPhone',
] as const;

function scalarData(input: UpdateSettingsInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of TEXT_FIELDS) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  for (const key of NULLABLE_FIELDS) {
    if (key in input) {
      const v = input[key];
      out[key] = v === undefined ? undefined : v === '' || v === null ? null : v;
    }
  }
  if ('heroCtaCollectionId' in input) {
    out.heroCtaCollectionID = input.heroCtaCollectionId ? input.heroCtaCollectionId : null;
  }

  // Delivery fee scalars — copy when present; a null threshold clears the rule.
  for (const key of ['deliveryFeeEnabled', 'deliveryFeeFlat', 'freeDeliveryRegions'] as const) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  if ('freeDeliveryThreshold' in input) {
    out.freeDeliveryThreshold = input.freeDeliveryThreshold ?? null;
  }
  return out;
}

export async function updateSettings(input: UpdateSettingsInput) {
  if (input.heroCtaCollectionId) {
    const exists = await prisma.collection.findUnique({
      where: { id: input.heroCtaCollectionId },
      select: { id: true },
    });
    if (!exists) throw new AppError('NOT_FOUND', 'heroCtaCollectionId does not match a collection');
  }

  const data = scalarData(input);

  return prisma.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });

    if (input.announcementLines) {
      await tx.announcementLine.deleteMany({ where: { settingID: SETTINGS_ID } });
      if (input.announcementLines.length > 0) {
        await tx.announcementLine.createMany({
          data: input.announcementLines.map((l, i) => ({
            settingID: SETTINGS_ID,
            textEn: l.textEn,
            textAr: l.textAr,
            sortOrder: i,
          })),
        });
      }
    }

    if (input.deliveryRates) {
      await tx.deliveryRate.deleteMany({ where: { settingID: SETTINGS_ID } });
      if (input.deliveryRates.length > 0) {
        await tx.deliveryRate.createMany({
          data: input.deliveryRates.map((r, i) => ({
            settingID: SETTINGS_ID,
            region: r.region,
            fee: r.fee,
            sortOrder: i,
          })),
        });
      }
    }

    return tx.siteSetting.findUnique({ where: { id: SETTINGS_ID }, include: settingsInclude });
  });
}
