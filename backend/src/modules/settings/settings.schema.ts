import { z } from 'zod';
import { httpUrl } from '../../lib/safe-url';
import { REGION_VALUES } from '../../lib/regions';

const money = z.number().min(0).max(100000);

// A URL field: an absolute http(s) URL, or an empty string (cleared), or
// null/omitted. Restricted to http(s) on purpose — these values are rendered
// as `<a href>` in the storefront footer, so `javascript:` / `data:` schemes
// would be stored XSS.
const urlField = httpUrl.or(z.literal('')).nullish();

export const updateSettingsSchema = z.object({
  brandNameEn: z.string().trim().min(1).max(80).optional(),
  brandNameAr: z.string().trim().min(1).max(80).optional(),
  announcementActive: z.boolean().optional(),
  heroEyebrowEn: z.string().trim().max(80).optional(),
  heroEyebrowAr: z.string().trim().max(80).optional(),
  heroHeadlineEn: z.string().trim().max(160).optional(),
  heroHeadlineAr: z.string().trim().max(160).optional(),
  heroLedeEn: z.string().trim().max(280).optional(),
  heroLedeAr: z.string().trim().max(280).optional(),
  heroCtaLabelEn: z.string().trim().max(40).optional(),
  heroCtaLabelAr: z.string().trim().max(40).optional(),
  // '' / null ⇒ clear (fall back to the first nav collection on the storefront).
  heroCtaCollectionId: z.string().uuid().or(z.literal('')).nullish(),
  homeMoreHeadingEn: z.string().trim().max(80).optional(),
  homeMoreHeadingAr: z.string().trim().max(80).optional(),
  instagramUrl: urlField,
  facebookUrl: urlField,
  tiktokUrl: urlField,
  whatsappUrl: urlField,
  contactEmail: z.string().trim().email().or(z.literal('')).nullish(),
  contactPhone: z.string().trim().max(40).or(z.literal('')).nullish(),
  // Replace-all: the given list becomes the whole announcement strip, in order.
  announcementLines: z
    .array(
      z.object({
        textEn: z.string().trim().min(1).max(200),
        textAr: z.string().trim().min(1).max(200),
      })
    )
    .max(10)
    .optional(),

  // ---- Delivery fee ----
  deliveryFeeEnabled: z.boolean().optional(),
  deliveryFeeFlat: money.optional(),
  // null ⇒ clear (no free-over-threshold rule).
  freeDeliveryThreshold: money.nullish(),
  freeDeliveryRegions: z.array(z.enum(REGION_VALUES)).max(REGION_VALUES.length).optional(),
  // Replace-all per-governorate override table. One row per governorate.
  deliveryRates: z
    .array(z.object({ region: z.enum(REGION_VALUES), fee: money }))
    .max(REGION_VALUES.length)
    .optional()
    .superRefine((rates, ctx) => {
      if (!rates) return;
      const seen = new Set<string>();
      rates.forEach((r, i) => {
        if (seen.has(r.region)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, 'region'],
            message: 'duplicate governorate',
          });
        }
        seen.add(r.region);
      });
    }),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
