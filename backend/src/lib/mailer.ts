import nodemailer from 'nodemailer';
import type { Coupon, Order, OrderItem } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { recordAudit } from './audit';
import { renderEmailTemplate } from './email-templates';
import { getEffectiveSmtpConfig } from '../modules/settings/smtp-credential.service';
import * as gmailClient from '../modules/mail/gmail.client';
import { DELIVERY_REGIONS } from './regions';

type OrderWithItems = Order & { items: OrderItem[] };

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function regionLabel(region: string | null, lang: 'en' | 'ar'): string {
  const found = DELIVERY_REGIONS.find((r) => r.value === region);
  if (found) return found[lang];
  return region ?? '';
}

// e.g. "12 Hamra St, Sanayeh, Beirut, Beirut" — area is only present on some
// addresses (see Address.area), so it's skipped rather than left blank.
function deliveryLine(order: OrderWithItems, lang: 'en' | 'ar'): string {
  const tail = [order.deliveryArea, order.deliveryCity, regionLabel(order.deliveryRegion, lang)]
    .filter(Boolean)
    .join(', ');
  return `${order.deliveryAddress}, ${tail}`;
}

// Item names/SKUs are a point-in-time snapshot on the order (OrderItem has no
// separate Arabic copy), so they render the same in both language blocks.
function itemLabel(item: OrderItem): string {
  const variant = [item.size, item.color].filter(Boolean).join('/');
  return `${item.productName}${variant ? ` (${variant})` : ''} x${item.quantity}`;
}

// HTML-escape for every value handed to renderEmailTemplate()'s `vars` (and
// still used directly by the callers that build their own small HTML
// fragments, like an items table, before passing them through as one
// pre-built "safe" variable). The `text` bodies never use this — plain text
// has no markup to escape out of. Every interpolation of a
// customer-controlled value (name, address, phone, notes, product name,
// email, SKU) into HTML MUST go through this — output encoding, not the
// input sanitiser, is the real XSS control for the mail path. An admin's own
// template markup is trusted and never passed through here — only the
// values dropped into it are.
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// A send failure is caught and logged, never thrown (see the per-function
// doc comments below) — which previously meant it was only ever visible in
// server console output, invisible to an admin. This makes it visible too,
// without changing that never-throws contract.
function logSendFailure(template: string, to: string, err: unknown): void {
  console.error(`[mailer] failed to send ${template} email`, err);
  void recordAudit({
    entityType: 'email',
    entityID: to,
    action: 'email.send_failed',
    metadata: { template, error: err instanceof Error ? err.message : String(err) },
  });
}

/**
 * Every outgoing email is bilingual: the English copy first, then the Arabic
 * translation of the same content underneath, in the SAME message (not two
 * separate emails). The Arabic block is wrapped with `dir="rtl"`/`lang="ar"`
 * so mail clients render it correctly regardless of the outer document's
 * direction. Exported so email-templates.service.ts's "send test email" can
 * compose a bilingual test message the same way every real sender does.
 */
export function bilingualText(en: string, ar: string): string {
  return `${en}\n\n----------------------------------------\n\n${ar}`;
}

export function bilingualHtml(enHtml: string, arHtml: string): string {
  return `
    <div dir="ltr" lang="en" style="direction: ltr; text-align: left;">
      ${enHtml}
    </div>
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e2e2;">
    <div dir="rtl" lang="ar" style="direction: rtl; text-align: right; font-family: Tahoma, Arial, sans-serif;">
      ${arHtml}
    </div>
  `.trim();
}

export function bilingualSubject(en: string, ar: string): string {
  return `${en} | ${ar}`;
}

/** The subset of nodemailer's Transporter interface every send function
 *  below actually uses — small enough that the Gmail-API path (below) can
 *  implement it too, so none of the 11 send functions need to know or care
 *  which transport is actually backing a given call. */
export interface MailTransport {
  sendMail(msg: { from: string; to: string; subject: string; text: string; html: string }): Promise<{ messageId: string }>;
}

/**
 * Resolves the outgoing-mail transport. Reads credentials fresh each call
 * (never cached across calls) so a newly-connected/configured account takes
 * effect immediately. Priority order: the Gmail API connection (admin panel
 * "Connect Gmail account" — see modules/mail/gmail.client.ts) > the
 * SmtpCredential DB row (admin panel app-password form) > the SMTP_* env
 * vars. The Gmail API goes first deliberately: it's the only one of the
 * three that works on a host blocking outbound SMTP (Railway's free/hobby
 * tier, confirmed live — see docs/DEPLOYMENT.md), and if an admin has gone
 * to the trouble of connecting it, that's a clear signal it's the intended
 * path.
 *
 * `null` means every send function below becomes a logged no-op instead of
 * throwing, so mail delivery can never change the calling endpoint's
 * response. Exported so email-templates.service.ts's "send test email"
 * shares the exact same connection logic as a real send, rather than
 * building its own.
 */
export async function getTransporter(): Promise<{ transporter: MailTransport; from: string } | null> {
  if (await gmailClient.isConfigured()) {
    const status = await gmailClient.getConnectionStatus();
    if (status.connectedEmail) {
      const transporter: MailTransport = {
        sendMail: async (msg) => {
          const { id } = await gmailClient.sendMail(msg);
          return { messageId: id };
        },
      };
      return { transporter, from: await resolveFrom(status.connectedEmail) };
    }
  }

  const cfg = await getEffectiveSmtpConfig();
  if (!cfg) return null;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // Gmail: 587 = STARTTLS (default), 465 = implicit TLS
    auth: { user: cfg.user, pass: cfg.password },
    // Bound every phase so a wedged relay can't hang a sender for minutes.
    // Senders are already fire-and-forget post-commit, but the checkout-OTP
    // sender's result IS awaited, so an unbounded socket there would stall
    // that request.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return { transporter, from: await resolveFrom(cfg.user) };
}

/**
 * The sender identity for every outgoing email — admin-set from
 * Settings → Brand & contact (`SiteSetting.mailFromName` / `mailFromEmail`),
 * falling back to the effective SMTP account's own address when unset. Note
 * this only changes the `From` header the customer sees — actual delivery
 * still authenticates as the SMTP account's user, so most providers require
 * `mailFromEmail` to be that same address or a domain/sender they've been
 * told to trust.
 */
export async function resolveFrom(fallbackAddress: string): Promise<string> {
  try {
    const s = await prisma.siteSetting.findUnique({
      where: { id: 1 },
      select: { mailFromName: true, mailFromEmail: true },
    });
    if (s?.mailFromEmail) {
      return s.mailFromName ? `${s.mailFromName} <${s.mailFromEmail}>` : s.mailFromEmail;
    }
  } catch (err) {
    console.error('[mailer] failed to load the configured sender address — falling back to the SMTP account', err);
  }
  return fallbackAddress;
}

/**
 * Sends the password-reset email. Deliberately never throws — a delivery
 * failure must never surface differently to the caller than success (that
 * asymmetry would itself be an information leak / DoS vector), so every
 * failure is caught and logged here, not propagated. Returns whether it
 * actually sent, for logging only.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  ttlMinutes: number
): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping password-reset email to', to);
    return false;
  }
  const { transporter, from } = conn;

  const textEn =
    `You requested a password reset for your Ali'sStore account.\n\n` +
    `Reset your password: ${resetUrl}\n\n` +
    `This link expires in ${ttlMinutes} minutes. If you didn't request this, you can ` +
    `safely ignore this email — your password won't be changed.`;
  const textAr =
    `لقد طلبت إعادة تعيين كلمة مرور حساب Ali'sStore الخاص بك.\n\n` +
    `أعد تعيين كلمة المرور: ${resetUrl}\n\n` +
    `تنتهي صلاحية هذا الرابط خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد ` +
    `الإلكتروني بأمان — لن يتم تغيير كلمة المرور الخاصة بك.`;

  const vars = { resetUrl: esc(resetUrl), ttlMinutes: String(ttlMinutes) };
  const rendered = await renderEmailTemplate('password.reset', vars, vars);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(rendered.subjectEn, rendered.subjectAr),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(rendered.htmlEn, rendered.htmlAr),
    });
    console.log('[mailer] password-reset email sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('password-reset', to, err);
    return false;
  }
}

/**
 * Sends the email-verification email for a new registration (or a resend).
 * Same contract as `sendPasswordResetEmail`: never throws, no-op + warn when
 * SMTP is unconfigured, returns whether it actually sent (for logging only) —
 * delivery outcome must never be observable to the caller.
 */
export async function sendVerificationEmail(
  to: string,
  verifyUrl: string,
  ttlMinutes: number
): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping verification email to', to);
    return false;
  }
  const { transporter, from } = conn;

  const hours = Math.round(ttlMinutes / 60);
  const validForEn = hours >= 1 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${ttlMinutes} minutes`;
  const validForAr = hours >= 1 ? `${hours} ساعة` : `${ttlMinutes} دقيقة`;

  const textEn =
    `Welcome to Ali'sStore! Confirm your email address to finish setting up your account.\n\n` +
    `Verify your email: ${verifyUrl}\n\n` +
    `This link is valid for ${validForEn}. If you didn't create an account, you can ignore this email.`;
  const textAr =
    `مرحبًا بك في Ali'sStore! قم بتأكيد بريدك الإلكتروني لإكمال إعداد حسابك.\n\n` +
    `تحقق من بريدك الإلكتروني: ${verifyUrl}\n\n` +
    `هذا الرابط صالح لمدة ${validForAr}. إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذا البريد الإلكتروني.`;

  const varsEn = { verifyUrl: esc(verifyUrl), validFor: validForEn };
  const varsAr = { verifyUrl: esc(verifyUrl), validFor: validForAr };
  const rendered = await renderEmailTemplate('email.verification', varsEn, varsAr);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(rendered.subjectEn, rendered.subjectAr),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(rendered.htmlEn, rendered.htmlAr),
    });
    console.log('[mailer] verification email sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('email-verification', to, err);
    return false;
  }
}

/**
 * Sends the order-confirmation email to the customer. `to` is
 * `order.guestEmail` — populated for guests with what they typed at checkout,
 * and for signed-in orders with the account's own email (see
 * order.service.ts's checkout()), so this one function covers both.
 * `orderUrl` is either the guest tracking page (a fresh OrderAccessToken) or,
 * for a logged-in customer, a direct link to their /orders/[id] — a logged-in
 * customer already has a real session, so no bearer-token credential is
 * minted for them. Same never-throws contract as the other mailer functions.
 */
export async function sendOrderConfirmationEmail(
  to: string,
  order: OrderWithItems,
  orderUrl: string
): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping order-confirmation email to', to);
    return false;
  }
  const { transporter, from } = conn;

  const itemLines = order.items.map((i) => `- ${itemLabel(i)} — ${money(Number(i.lineTotal))}`).join('\n');
  const deliveryFeeLineEn = Number(order.deliveryFee) === 0 ? 'Free' : money(Number(order.deliveryFee));
  const deliveryFeeLineAr = Number(order.deliveryFee) === 0 ? 'مجانية' : money(Number(order.deliveryFee));

  const textEn =
    `Hi ${order.deliveryName},\n\n` +
    `Thanks for your order! Here's your confirmation.\n\n` +
    `Order ${order.orderNumber}\n` +
    `Payment: Cash on delivery\n\n` +
    `Items:\n${itemLines}\n\n` +
    `Subtotal: ${money(Number(order.subtotal))}\n` +
    `Delivery: ${deliveryFeeLineEn}\n` +
    `Total: ${money(Number(order.total))}\n\n` +
    `Delivering to:\n` +
    `${order.deliveryName}\n` +
    `${deliveryLine(order, 'en')}\n` +
    `Phone: ${order.deliveryPhone}` +
    (order.deliveryNotes ? `\nDelivery notes: ${order.deliveryNotes}` : '') +
    `\n\nWe'll call ${order.deliveryPhone} to confirm delivery. Thanks for shopping with Ali'sStore!\n\n` +
    `Track this order or cancel it any time before it ships: ${orderUrl}`;

  const textAr =
    `مرحبًا ${order.deliveryName}،\n\n` +
    `شكرًا لطلبك! إليك تأكيد الطلب.\n\n` +
    `الطلب ${order.orderNumber}\n` +
    `الدفع: الدفع عند الاستلام\n\n` +
    `العناصر:\n${itemLines}\n\n` +
    `المجموع الفرعي: ${money(Number(order.subtotal))}\n` +
    `التوصيل: ${deliveryFeeLineAr}\n` +
    `الإجمالي: ${money(Number(order.total))}\n\n` +
    `التوصيل إلى:\n` +
    `${order.deliveryName}\n` +
    `${deliveryLine(order, 'ar')}\n` +
    `الهاتف: ${order.deliveryPhone}` +
    (order.deliveryNotes ? `\nملاحظات التوصيل: ${order.deliveryNotes}` : '') +
    `\n\nسنتصل بك على ${order.deliveryPhone} لتأكيد التوصيل. شكرًا للتسوق مع Ali'sStore!\n\n` +
    `تتبع طلبك أو إلغاؤه في أي وقت قبل شحنه: ${orderUrl}`;

  const itemsTable = order.items
    .map((i) => `<tr><td>${esc(itemLabel(i))}</td><td>${money(Number(i.lineTotal))}</td></tr>`)
    .join('');

  const varsEn = {
    customerName: esc(order.deliveryName),
    orderNumber: esc(order.orderNumber),
    itemsTable,
    subtotal: money(Number(order.subtotal)),
    deliveryFee: deliveryFeeLineEn,
    total: money(Number(order.total)),
    deliveryAddress: esc(deliveryLine(order, 'en')),
    phone: esc(order.deliveryPhone),
    deliveryNotesLine: order.deliveryNotes ? `<br>Delivery notes: ${esc(order.deliveryNotes)}` : '',
    orderUrl: esc(orderUrl),
  };
  const varsAr = {
    ...varsEn,
    deliveryFee: deliveryFeeLineAr,
    deliveryAddress: esc(deliveryLine(order, 'ar')),
    deliveryNotesLine: order.deliveryNotes ? `<br>ملاحظات التوصيل: ${esc(order.deliveryNotes)}` : '',
  };
  const rendered = await renderEmailTemplate('order.confirmed', varsEn, varsAr);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(rendered.subjectEn, rendered.subjectAr),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(rendered.htmlEn, rendered.htmlAr),
    });
    console.log('[mailer] order-confirmation email sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('order-confirmation', to, err);
    return false;
  }
}

/**
 * Sends the new-order alert to the store owner (OWNER_NOTIFICATION_EMAIL).
 * Same never-throws contract as the other mailer functions.
 */
export async function sendOwnerOrderAlertEmail(to: string, order: OrderWithItems): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping owner order alert for', order.orderNumber);
    return false;
  }
  const { transporter, from } = conn;

  const itemLines = order.items
    .map((i) => `- ${itemLabel(i)} — SKU ${i.variantSKU} — ${money(Number(i.lineTotal))}`)
    .join('\n');

  const textEn =
    `New order placed.\n\n` +
    `Order ${order.orderNumber}\n` +
    `Total: ${money(Number(order.total))} (subtotal ${money(Number(order.subtotal))} + delivery ${money(Number(order.deliveryFee))})\n` +
    `Payment: Cash on delivery — not yet collected\n\n` +
    `Customer: ${order.deliveryName} — ${order.deliveryPhone}` +
    (order.guestEmail ? `\nEmail: ${order.guestEmail}` : '') +
    `\n\nItems:\n${itemLines}\n\n` +
    `Deliver to:\n${deliveryLine(order, 'en')}` +
    (order.deliveryNotes ? `\nDelivery notes: ${order.deliveryNotes}` : '') +
    (order.notes ? `\nCustomer notes: ${order.notes}` : '');

  const textAr =
    `تم تقديم طلب جديد.\n\n` +
    `الطلب ${order.orderNumber}\n` +
    `الإجمالي: ${money(Number(order.total))} (المجموع الفرعي ${money(Number(order.subtotal))} + التوصيل ${money(Number(order.deliveryFee))})\n` +
    `الدفع: الدفع عند الاستلام — لم يتم التحصيل بعد\n\n` +
    `العميل: ${order.deliveryName} — ${order.deliveryPhone}` +
    (order.guestEmail ? `\nالبريد الإلكتروني: ${order.guestEmail}` : '') +
    `\n\nالعناصر:\n${itemLines}\n\n` +
    `التوصيل إلى:\n${deliveryLine(order, 'ar')}` +
    (order.deliveryNotes ? `\nملاحظات التوصيل: ${order.deliveryNotes}` : '') +
    (order.notes ? `\nملاحظات العميل: ${order.notes}` : '');

  const itemsTable = order.items
    .map(
      (i) =>
        `<tr><td>${esc(itemLabel(i))}</td><td>${esc(i.variantSKU)}</td><td>${money(Number(i.lineTotal))}</td></tr>`
    )
    .join('');

  const varsEn = {
    orderNumber: esc(order.orderNumber),
    total: money(Number(order.total)),
    subtotal: money(Number(order.subtotal)),
    deliveryFee: money(Number(order.deliveryFee)),
    customerName: esc(order.deliveryName),
    phone: esc(order.deliveryPhone),
    customerEmailLine: order.guestEmail ? `<br>Email: ${esc(order.guestEmail)}` : '',
    itemsTable,
    deliveryAddress: esc(deliveryLine(order, 'en')),
    deliveryNotesLine: order.deliveryNotes ? `<br>Delivery notes: ${esc(order.deliveryNotes)}` : '',
    customerNotesLine: order.notes ? `<br>Customer notes: ${esc(order.notes)}` : '',
  };
  const varsAr = {
    ...varsEn,
    customerEmailLine: order.guestEmail ? `<br>البريد الإلكتروني: ${esc(order.guestEmail)}` : '',
    deliveryAddress: esc(deliveryLine(order, 'ar')),
    deliveryNotesLine: order.deliveryNotes ? `<br>ملاحظات التوصيل: ${esc(order.deliveryNotes)}` : '',
    customerNotesLine: order.notes ? `<br>ملاحظات العميل: ${esc(order.notes)}` : '',
  };
  const rendered = await renderEmailTemplate('owner.order_alert', varsEn, varsAr);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(rendered.subjectEn, rendered.subjectAr),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(rendered.htmlEn, rendered.htmlAr),
    });
    console.log('[mailer] owner order alert sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('owner-order-alert', to, err);
    return false;
  }
}

/**
 * Sends the cancellation confirmation to the customer. Same `to` /
 * never-throws contract as sendOrderConfirmationEmail.
 */
export async function sendOrderCancelledEmail(to: string, order: OrderWithItems): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping order-cancelled email to', to);
    return false;
  }
  const { transporter, from } = conn;

  const textEn =
    `Hi ${order.deliveryName},\n\n` +
    `Your order ${order.orderNumber} has been cancelled, and the total (${money(Number(order.total))}) ` +
    `won't be charged since payment was cash on delivery.\n\n` +
    `If this wasn't you, or you have any questions, get in touch and we'll sort it out.`;
  const textAr =
    `مرحبًا ${order.deliveryName}،\n\n` +
    `تم إلغاء طلبك ${order.orderNumber}، ولن يتم تحصيل الإجمالي (${money(Number(order.total))}) ` +
    `نظرًا لأن الدفع كان عند الاستلام.\n\n` +
    `إذا لم يكن هذا أنت، أو كان لديك أي أسئلة، تواصل معنا وسنقوم بحل الأمر.`;

  const vars = {
    customerName: esc(order.deliveryName),
    orderNumber: esc(order.orderNumber),
    total: money(Number(order.total)),
  };
  const rendered = await renderEmailTemplate('order.cancelled', vars, vars);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(rendered.subjectEn, rendered.subjectAr),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(rendered.htmlEn, rendered.htmlAr),
    });
    console.log('[mailer] order-cancelled email sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('order-cancelled', to, err);
    return false;
  }
}

/**
 * Tells the customer their order has shipped, with the admin-set delivery
 * estimate when there is one. Same `to` / never-throws contract as
 * sendOrderConfirmationEmail.
 */
export async function sendOrderShippedEmail(
  to: string,
  order: OrderWithItems,
  estimatedDeliveryDays?: number | null
): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping order-shipped email to', to);
    return false;
  }
  const { transporter, from } = conn;

  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  const trackUrl = order.userID ? `${base}/en/orders/${order.id}` : `${base}/en/orders/lookup`;
  const etaEn =
    estimatedDeliveryDays != null
      ? `Estimated delivery: about ${estimatedDeliveryDays} ${estimatedDeliveryDays === 1 ? 'day' : 'days'}.`
      : `We'll be in touch about the delivery timing.`;
  const etaAr =
    estimatedDeliveryDays != null
      ? `التوصيل المتوقع: حوالي ${estimatedDeliveryDays} ${estimatedDeliveryDays === 1 ? 'يوم' : 'أيام'}.`
      : `سنتواصل معك بخصوص موعد التوصيل.`;

  const textEn =
    `Hi ${order.deliveryName},\n\n` +
    `Good news — your order ${order.orderNumber} has shipped and is on its way to ${deliveryLine(order, 'en')}.\n` +
    `${etaEn}\n\n` +
    `Track your order: ${trackUrl}\n\n` +
    `Payment is cash on delivery — please have ${money(Number(order.total))} ready.`;
  const textAr =
    `مرحبًا ${order.deliveryName}،\n\n` +
    `أخبار سارة — تم شحن طلبك ${order.orderNumber} وهو في طريقه إلى ${deliveryLine(order, 'ar')}.\n` +
    `${etaAr}\n\n` +
    `تتبع طلبك: ${trackUrl}\n\n` +
    `الدفع عند الاستلام — يرجى تجهيز ${money(Number(order.total))}.`;

  const varsEn = {
    customerName: esc(order.deliveryName),
    orderNumber: esc(order.orderNumber),
    deliveryAddress: esc(deliveryLine(order, 'en')),
    etaLine: etaEn,
    trackUrl: esc(trackUrl),
    total: money(Number(order.total)),
  };
  const varsAr = {
    ...varsEn,
    deliveryAddress: esc(deliveryLine(order, 'ar')),
    etaLine: etaAr,
  };
  const rendered = await renderEmailTemplate('order.shipped', varsEn, varsAr);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(rendered.subjectEn, rendered.subjectAr),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(rendered.htmlEn, rendered.htmlAr),
    });
    console.log('[mailer] order-shipped email sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('order-shipped', to, err);
    return false;
  }
}

/**
 * Sends the cancellation alert to the store owner (OWNER_NOTIFICATION_EMAIL).
 * Same never-throws contract as the other mailer functions.
 */
export async function sendOwnerOrderCancelledAlertEmail(to: string, order: OrderWithItems): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping owner cancellation alert for', order.orderNumber);
    return false;
  }
  const { transporter, from } = conn;

  const textEn =
    `Order cancelled.\n\n` +
    `Order ${order.orderNumber}\n` +
    `Total: ${money(Number(order.total))}\n` +
    `Customer: ${order.deliveryName} — ${order.deliveryPhone}` +
    (order.guestEmail ? `\nEmail: ${order.guestEmail}` : '');
  const textAr =
    `تم إلغاء الطلب.\n\n` +
    `الطلب ${order.orderNumber}\n` +
    `الإجمالي: ${money(Number(order.total))}\n` +
    `العميل: ${order.deliveryName} — ${order.deliveryPhone}` +
    (order.guestEmail ? `\nالبريد الإلكتروني: ${order.guestEmail}` : '');

  const varsEn = {
    orderNumber: esc(order.orderNumber),
    total: money(Number(order.total)),
    customerName: esc(order.deliveryName),
    phone: esc(order.deliveryPhone),
    customerEmailLine: order.guestEmail ? `<br>Email: ${esc(order.guestEmail)}` : '',
  };
  const varsAr = {
    ...varsEn,
    customerEmailLine: order.guestEmail ? `<br>البريد الإلكتروني: ${esc(order.guestEmail)}` : '',
  };
  const rendered = await renderEmailTemplate('owner.order_cancelled_alert', varsEn, varsAr);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(rendered.subjectEn, rendered.subjectAr),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(rendered.htmlEn, rendered.htmlAr),
    });
    console.log('[mailer] owner cancellation alert sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('owner-cancellation-alert', to, err);
    return false;
  }
}

/**
 * Sends the checkout email-OTP code. Unlike every other function in this
 * file, the caller (checkout-otp.service.ts) treats a `false` return as a
 * hard failure of the request, not a silent no-op — the email *is* the
 * deliverable here, so if it can't go out the client needs to know rather
 * than being told "check your inbox" for a code that never arrived.
 */
export async function sendCheckoutOtpEmail(to: string, code: string, ttlMinutes: number): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping checkout-OTP email to', to);
    return false;
  }
  const { transporter, from } = conn;

  const textEn =
    `Your Ali'sStore verification code is ${code}.\n\n` +
    `It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.`;
  const textAr =
    `رمز التحقق الخاص بك في Ali'sStore هو ${code}.\n\n` +
    `تنتهي صلاحيته خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد الإلكتروني.`;

  const vars = { code: esc(code), ttlMinutes: String(ttlMinutes) };
  const rendered = await renderEmailTemplate('checkout.otp', vars, vars);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(rendered.subjectEn, rendered.subjectAr),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(rendered.htmlEn, rendered.htmlAr),
    });
    console.log('[mailer] checkout-OTP email sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('checkout-otp', to, err);
    return false;
  }
}

/**
 * Tells a customer they've earned a loyalty-program coupon (see
 * loyalty.service.ts's checkLoyaltyThreshold). Same never-throws contract as
 * the other mailer functions — a failed send never fails the order-status
 * update that triggered it.
 */
export async function sendLoyaltyRewardEmail(
  to: string,
  rule: { nameEn: string; nameAr: string },
  coupon: Coupon
): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping loyalty-reward email to', to);
    return false;
  }
  const { transporter, from } = conn;

  const rewardEn = coupon.type === 'PERCENT' ? `${Number(coupon.value)}% off` : `${money(Number(coupon.value))} off`;
  const rewardAr =
    coupon.type === 'PERCENT' ? `خصم ${Number(coupon.value)}%` : `خصم ${money(Number(coupon.value))}`;
  const expiryEn = coupon.endsAt ? ` It's valid until ${coupon.endsAt.toDateString()}.` : '';
  const expiryAr = coupon.endsAt ? ` صالح حتى ${coupon.endsAt.toDateString()}.` : '';

  const textEn =
    `Thank you for being a loyal customer!\n\n` +
    `You've earned a reward for "${rule.nameEn}": ${rewardEn} your next order.\n\n` +
    `Use this code at checkout: ${coupon.code}\n` +
    `${expiryEn}`.trim();
  const textAr =
    `شكرًا لكونك عميلًا مخلصًا!\n\n` +
    `لقد ربحت مكافأة عن "${rule.nameAr}": ${rewardAr} على طلبك القادم.\n\n` +
    `استخدم هذا الرمز عند الدفع: ${coupon.code}\n` +
    `${expiryAr}`.trim();

  const varsEn = {
    ruleName: esc(rule.nameEn),
    reward: esc(rewardEn),
    couponCode: esc(coupon.code),
    expiryLine: expiryEn ? `<p>${esc(expiryEn.trim())}</p>` : '',
  };
  const varsAr = {
    ruleName: esc(rule.nameAr),
    reward: esc(rewardAr),
    couponCode: esc(coupon.code),
    expiryLine: expiryAr ? `<p>${esc(expiryAr.trim())}</p>` : '',
  };
  const rendered = await renderEmailTemplate('loyalty.reward', varsEn, varsAr);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(rendered.subjectEn, rendered.subjectAr),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(rendered.htmlEn, rendered.htmlAr),
    });
    console.log('[mailer] loyalty-reward email sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('loyalty-reward', to, err);
    return false;
  }
}

/**
 * Sent to the NEW address when a signed-in user requests an account email
 * change — proof of control: `User.email` is only updated once this link is
 * clicked (see account/email-change.service.ts's confirmEmailChange). Same
 * never-throws contract as the other mailer functions. Not template-driven
 * (unlike the nine senders above) — account-security notices, kept as
 * hardcoded bilingual copy like the rest of the auth flow.
 */
export async function sendEmailChangeConfirmationEmail(
  to: string,
  confirmUrl: string,
  ttlMinutes: number
): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping email-change confirmation to', to);
    return false;
  }
  const { transporter, from } = conn;

  const textEn =
    `You requested to change the email address on your Ali'sStore account to this one.\n\n` +
    `Confirm this change: ${confirmUrl}\n\n` +
    `This link expires in ${ttlMinutes} minutes. If you didn't request this, you can safely ` +
    `ignore this email — your account email won't be changed.`;
  const textAr =
    `لقد طلبت تغيير عنوان البريد الإلكتروني لحسابك في Ali'sStore إلى هذا العنوان.\n\n` +
    `أكد هذا التغيير: ${confirmUrl}\n\n` +
    `تنتهي صلاحية هذا الرابط خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد ` +
    `الإلكتروني بأمان — لن يتم تغيير البريد الإلكتروني لحسابك.`;

  const htmlEn = `
    <p>You requested to change the email address on your Ali'sStore account to this one.</p>
    <p><a href="${esc(confirmUrl)}">Confirm this change</a></p>
    <p>This link expires in ${ttlMinutes} minutes. If you didn't request this, you can safely
    ignore this email — your account email won't be changed.</p>
  `.trim();
  const htmlAr = `
    <p>لقد طلبت تغيير عنوان البريد الإلكتروني لحسابك في Ali'sStore إلى هذا العنوان.</p>
    <p><a href="${esc(confirmUrl)}">أكد هذا التغيير</a></p>
    <p>تنتهي صلاحية هذا الرابط خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد
    الإلكتروني بأمان — لن يتم تغيير البريد الإلكتروني لحسابك.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject("Confirm your new Ali's Store email", 'أكد بريدك الإلكتروني الجديد في Ali\'s Store'),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] email-change confirmation sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('email-change-confirmation', to, err);
    return false;
  }
}

/**
 * Security notice sent to the OLD address the moment an email change is
 * REQUESTED (before it's confirmed) — so the real account owner finds out
 * even if a hijacked/borrowed session is what made the request, and has a
 * chance to react before the new address is ever confirmed. Same
 * never-throws, fire-and-forget contract as the other mailer functions —
 * this is a notice, not the deliverable, so a failure here must never block
 * or fail the request itself.
 */
export async function sendEmailChangeRequestedNoticeEmail(to: string, newEmail: string): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping email-change request notice to', to);
    return false;
  }
  const { transporter, from } = conn;

  const textEn =
    `Someone requested to change the email address on your Ali'sStore account to ${newEmail}.\n\n` +
    `If this was you, no action is needed — the change takes effect once that address confirms it.\n\n` +
    `If this wasn't you, change your password immediately and contact us.`;
  const textAr =
    `طلب شخص ما تغيير عنوان البريد الإلكتروني لحسابك في Ali'sStore إلى ${newEmail}.\n\n` +
    `إذا كنت أنت من طلب ذلك، فلا حاجة لاتخاذ أي إجراء — يسري التغيير بمجرد تأكيده من ذلك العنوان.\n\n` +
    `إذا لم يكن هذا أنت، فقم بتغيير كلمة المرور الخاصة بك فورًا وتواصل معنا.`;

  const htmlEn = `
    <p>Someone requested to change the email address on your Ali'sStore account to <strong>${esc(newEmail)}</strong>.</p>
    <p>If this was you, no action is needed — the change takes effect once that address confirms it.</p>
    <p>If this wasn't you, change your password immediately and contact us.</p>
  `.trim();
  const htmlAr = `
    <p>طلب شخص ما تغيير عنوان البريد الإلكتروني لحسابك في Ali'sStore إلى <strong>${esc(newEmail)}</strong>.</p>
    <p>إذا كنت أنت من طلب ذلك، فلا حاجة لاتخاذ أي إجراء — يسري التغيير بمجرد تأكيده من ذلك العنوان.</p>
    <p>إذا لم يكن هذا أنت، فقم بتغيير كلمة المرور الخاصة بك فورًا وتواصل معنا.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(
        "Email change requested on your Ali's Store account",
        'تم طلب تغيير البريد الإلكتروني لحسابك في Ali\'s Store'
      ),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] email-change request notice sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('email-change-requested-notice', to, err);
    return false;
  }
}

/**
 * Final security notice sent to the OLD address once an email change has
 * actually been CONFIRMED and applied — the account no longer uses that
 * address at all after this. Same fire-and-forget contract as the request
 * notice above.
 */
export async function sendEmailChangedNoticeEmail(to: string, newEmail: string): Promise<boolean> {
  const conn = await getTransporter();
  if (!conn) {
    console.warn('[mailer] SMTP is not configured — skipping email-changed notice to', to);
    return false;
  }
  const { transporter, from } = conn;

  const textEn =
    `The email address on your Ali'sStore account has been changed to ${newEmail}.\n\n` +
    `This address will no longer receive notifications for that account.\n\n` +
    `If this wasn't you, contact us immediately.`;
  const textAr =
    `تم تغيير عنوان البريد الإلكتروني لحسابك في Ali'sStore إلى ${newEmail}.\n\n` +
    `لن يستقبل هذا العنوان بعد الآن إشعارات ذلك الحساب.\n\n` +
    `إذا لم يكن هذا أنت، تواصل معنا فورًا.`;

  const htmlEn = `
    <p>The email address on your Ali'sStore account has been changed to <strong>${esc(newEmail)}</strong>.</p>
    <p>This address will no longer receive notifications for that account.</p>
    <p>If this wasn't you, contact us immediately.</p>
  `.trim();
  const htmlAr = `
    <p>تم تغيير عنوان البريد الإلكتروني لحسابك في Ali'sStore إلى <strong>${esc(newEmail)}</strong>.</p>
    <p>لن يستقبل هذا العنوان بعد الآن إشعارات ذلك الحساب.</p>
    <p>إذا لم يكن هذا أنت، تواصل معنا فورًا.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(
        "Your Ali's Store account email was changed",
        'تم تغيير البريد الإلكتروني لحسابك في Ali\'s Store'
      ),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] email-changed notice sent', info.messageId);
    return true;
  } catch (err) {
    logSendFailure('email-changed-notice', to, err);
    return false;
  }
}
