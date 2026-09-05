-- Owner-editable storefront chrome: brand name, announcement strip, home
-- hero copy, footer social/contact links. One singleton row (id = 1) seeded
-- with the values that were hardcoded in the frontend, so the storefront
-- looks identical out of the box.

CREATE TABLE "sitesetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "brandNameEn" TEXT NOT NULL DEFAULT 'Ali''s Store',
    "brandNameAr" TEXT NOT NULL DEFAULT 'متجر علي',
    "announcementActive" BOOLEAN NOT NULL DEFAULT true,
    "heroEyebrowEn" TEXT NOT NULL DEFAULT 'Limited stock',
    "heroEyebrowAr" TEXT NOT NULL DEFAULT 'كمية محدودة',
    "heroHeadlineEn" TEXT NOT NULL DEFAULT 'Buy it before someone else does.',
    "heroHeadlineAr" TEXT NOT NULL DEFAULT 'خدها قبل ما حدا غيرك ياخدها.',
    "heroLedeEn" TEXT NOT NULL DEFAULT 'Women, men and kids — clothing you actually wear, paid for on delivery.',
    "heroLedeAr" TEXT NOT NULL DEFAULT 'نساء ورجال وأطفال — ملابس ترتديها فعلاً، وتدفع عند الاستلام.',
    "heroCtaLabelEn" TEXT NOT NULL DEFAULT 'Discover',
    "heroCtaLabelAr" TEXT NOT NULL DEFAULT 'اكتشف الآن',
    "heroCtaCollectionID" UUID,
    "homeMoreHeadingEn" TEXT NOT NULL DEFAULT 'More to explore',
    "homeMoreHeadingAr" TEXT NOT NULL DEFAULT 'المزيد لاكتشافه',
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "tiktokUrl" TEXT,
    "whatsappUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "lastEdit" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sitesetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "announcementline" (
    "id" UUID NOT NULL,
    "settingID" INTEGER NOT NULL,
    "textEn" TEXT NOT NULL,
    "textAr" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "announcementline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcementline_settingID_idx" ON "announcementline"("settingID");

ALTER TABLE "sitesetting" ADD CONSTRAINT "sitesetting_heroCtaCollectionID_fkey"
    FOREIGN KEY ("heroCtaCollectionID") REFERENCES "collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "announcementline" ADD CONSTRAINT "announcementline_settingID_fkey"
    FOREIGN KEY ("settingID") REFERENCES "sitesetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the singleton + the three announcement lines the storefront shipped with.
INSERT INTO "sitesetting" ("id", "lastEdit") VALUES (1, NOW());
INSERT INTO "announcementline" ("id", "settingID", "textEn", "textAr", "sortOrder") VALUES
    ('10000000-0000-4000-8000-000000000001', 1, 'Free delivery inside the city on orders over $30', 'توصيل مجاني داخل المدينة للطلبات فوق 30$', 0),
    ('10000000-0000-4000-8000-000000000002', 1, 'Cash on delivery — pay when it arrives', 'الدفع عند الاستلام — ادفع عند وصول الطلب', 1),
    ('10000000-0000-4000-8000-000000000003', 1, 'New season styles just landed', 'تشكيلة الموسم الجديد وصلت الآن', 2);
