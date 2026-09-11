-- Admin-configurable sender identity for outgoing customer/owner email,
-- instead of the "from" address being fixed to SMTP_FROM in the environment.
-- null ⇒ mailer.ts falls back to SMTP_FROM.
ALTER TABLE "sitesetting" ADD COLUMN "mailFromName" TEXT;
ALTER TABLE "sitesetting" ADD COLUMN "mailFromEmail" TEXT;
