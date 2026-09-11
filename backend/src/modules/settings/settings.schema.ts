import { z } from 'zod';
import { httpUrl } from '../../lib/safe-url';

const money = z.number().min(0).max(100000);

// A delivery region: either one of the built-in Lebanese governorate codes
// (see lib/regions.ts) or an admin-defined custom zone name (e.g. a remote
// town, or "Outside Lebanon"). Free-text so the owner can add zones without a
// deploy — the checkout <select> is populated from these rows.
const regionName = z.string().trim().min(1).max(60);
const MAX_REGIONS = 40;

// "HH:MM", 24-hour.
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be a HH:MM time');

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

  // ---- Optional "Our story" page ----
  // '' / null clears the field; with title + body both empty in a language the
  // storefront falls back to the other language, and with all four empty the
  // page (and its footer link) is hidden. `storyImageUrl` shows beside the text.
  storyTitleEn: z.string().trim().max(120).or(z.literal('')).nullish(),
  storyTitleAr: z.string().trim().max(120).or(z.literal('')).nullish(),
  storyBodyEn: z.string().trim().max(8000).or(z.literal('')).nullish(),
  storyBodyAr: z.string().trim().max(8000).or(z.literal('')).nullish(),
  storyImageUrl: httpUrl.or(z.literal('')).nullish(),
  storyImageFileId: z.string().trim().max(200).or(z.literal('')).nullish(),

  // ---- Built-in "smart" home-page rows ----
  // Replace-all: the given rows overwrite the matching showcase types (by
  // `type`); types not sent are left as-is. Off by default; `sortOrder` slots
  // an active row into the featured-row order.
  showcases: z
    .array(
      z.object({
        type: z.enum(['BEST_SELLERS', 'NEW_ARRIVALS', 'ON_SALE']),
        isActive: z.boolean().default(false),
        sortOrder: z.number().int().min(0).max(9999).default(0),
        labelEn: z.string().trim().max(60).or(z.literal('')).nullish(),
        labelAr: z.string().trim().max(60).or(z.literal('')).nullish(),
      })
    )
    .max(3)
    .optional()
    .superRefine((rows, ctx) => {
      if (!rows) return;
      const seen = new Set<string>();
      rows.forEach((r, i) => {
        if (seen.has(r.type)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'type'], message: 'duplicate showcase type' });
        }
        seen.add(r.type);
      });
    }),

  // ---- Customer-review images (home page strip) ----
  // Replace-all: the given list becomes the whole strip, in order. Each row
  // must carry an http(s) image URL; `imageFileId` lets a removed image be
  // cleaned up from ImageKit.
  reviewImages: z
    .array(
      z.object({
        imageUrl: httpUrl,
        imageFileId: z.string().trim().max(200).or(z.literal('')).nullish(),
      })
    )
    .max(30)
    .optional(),

  instagramUrl: urlField,
  facebookUrl: urlField,
  tiktokUrl: urlField,
  whatsappUrl: urlField,
  contactEmail: z.string().trim().email().or(z.literal('')).nullish(),
  contactPhone: z.string().trim().max(40).or(z.literal('')).nullish(),

  // ---- Outgoing-email sender identity ----
  // '' / null ⇒ clear (mailer.ts falls back to SMTP_FROM from the environment).
  mailFromName: z.string().trim().max(120).or(z.literal('')).nullish(),
  mailFromEmail: z.string().trim().email().max(320).or(z.literal('')).nullish(),

  // ---- "Visit us" store locations ----
  // Replace-all: the given list becomes the whole set of stores, in order.
  // Each location carries its own opening hours (a day not listed = closed);
  // dayOfWeek 0 = Monday … 6 = Sunday.
  storeLocations: z
    .array(
      z.object({
        nameEn: z.string().trim().max(80).or(z.literal('')).nullish(),
        nameAr: z.string().trim().max(80).or(z.literal('')).nullish(),
        addressEn: z.string().trim().max(300).or(z.literal('')).nullish(),
        addressAr: z.string().trim().max(300).or(z.literal('')).nullish(),
        // Rendered as an <a href> ("Get directions") — same http(s)-only guard
        // as the footer links.
        mapUrl: urlField,
        imageUrl: urlField,
        imageFileId: z.string().trim().max(200).or(z.literal('')).nullish(),
        hours: z
          .array(
            z.object({
              dayOfWeek: z.number().int().min(0).max(6),
              opensAt: timeOfDay,
              closesAt: timeOfDay,
            })
          )
          .max(7)
          .superRefine((days, ctx) => {
            const seen = new Set<number>();
            days.forEach((d, i) => {
              if (seen.has(d.dayOfWeek)) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: [i, 'dayOfWeek'],
                  message: 'duplicate day',
                });
              }
              seen.add(d.dayOfWeek);
              if (d.closesAt <= d.opensAt) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: [i, 'closesAt'],
                  message: 'closing time must be after opening time',
                });
              }
            });
          })
          .optional(),
      })
    )
    .max(20)
    .optional(),
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
