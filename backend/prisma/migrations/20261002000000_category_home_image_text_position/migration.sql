-- Where the text + CTA sit over the full-bleed home image banner
-- (showOnHomeAsImage): "<top|middle|bottom>-<start|center|end>", with
-- start/end logical so the layout mirrors under RTL. Owner-set in the admin
-- category form.

ALTER TABLE "category" ADD COLUMN "homeImageTextPosition" TEXT NOT NULL DEFAULT 'middle-start';
