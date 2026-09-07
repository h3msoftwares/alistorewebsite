import { z } from 'zod';
import { httpUrl } from '../../lib/safe-url';

const money = z.number().min(0).max(100000);

// A delivery region: either one of the built-in Lebanese governorate codes
// (see lib/regions.ts) or an admin-defined custom zone name (e.g. a remote
// town, or "Outside Lebanon"). Free-text so the owner can add zones without a
// deploy — the checkout <select> is populated from these rows.
const regionName = z.string().trim().min(1).max(60);
const MAX_REGIONS = 40;

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
  freeDeliveryRegions: z.array(regionName).max(MAX_REGIONS).optional(),
  // Replace-all per-region override table — one row per governorate or custom
  // zone. A region with no row here pays deliveryFeeFlat.
  deliveryRates: z
    .array(z.object({ region: regionName, fee: money }))
    .max(MAX_REGIONS)
    .optional()
    .superRefine((rates, ctx) => {
      if (!rates) return;
      const seen = new Set<string>();
      rates.forEach((r, i) => {
        if (seen.has(r.region)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, 'region'],
            message: 'duplicate region',
          });
        }
        seen.add(r.region);
      });
    }),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
