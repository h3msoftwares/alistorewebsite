import nodemailer from 'nodemailer';
import type { Coupon, Order, OrderItem } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { DELIVERY_REGIONS } from './regions';
import { getEffectiveSmtpConfig } from '../modules/settings/smtp-credential.service';

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

// HTML-escape for the `html` email bodies. The `text` bodies never use this.
// Every interpolation of a customer-controlled value (name, address, phone,
// notes, product name, email, SKU) into an `html` template MUST go through
// this — output encoding, not the input sanitiser, is the real XSS control
// for the mail path.
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

/**
 * Every outgoing email is bilingual: the English copy first, then the Arabic
 * translation of the same content underneath, in the SAME message (not two
 * separate emails) — see the admin's Task 1 request. The Arabic block is
 * wrapped with `dir="rtl"`/`lang="ar"` so mail clients render it correctly
 * regardless of the outer document's direction.
 */
function bilingualText(en: string, ar: string): string {
  return `${en}\n\n----------------------------------------\n\n${ar}`;
}

function bilingualHtml(enHtml: string, arHtml: string): string {
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

function bilingualSubject(en: string, ar: string): string {
  return `${en} | ${ar}`;
}

/**
 * Builds the nodemailer transporter for outgoing mail. Reads credentials
 * fresh each call (never cached across calls) so an admin-configured
 * send-as account (Task 2 — `SmtpCredential`, DB-encrypted app password)
 * takes effect immediately, falling back to the `SMTP_*` env vars when
 * nothing has been configured in the admin panel. `configured: false` means
 * every send function below becomes a logged no-op instead of throwing, so
 * mail delivery can never change the calling endpoint's response.
 */
async function getTransporter(): Promise<{ transporter: ReturnType<typeof nodemailer.createTransport>; from: string } | null> {
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
    `You requested a password reset for your Ali's Store account.\n\n` +
    `Reset your password: ${resetUrl}\n\n` +
    `This link expires in ${ttlMinutes} minutes. If you didn't request this, you can ` +
    `safely ignore this email — your password won't be changed.`;
  const textAr =
    `لقد طلبت إعادة تعيين كلمة مرور حساب Ali's Store الخاص بك.\n\n` +
    `أعد تعيين كلمة المرور: ${resetUrl}\n\n` +
    `تنتهي صلاحية هذا الرابط خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد ` +
    `الإلكتروني بأمان — لن يتم تغيير كلمة المرور الخاصة بك.`;

  const htmlEn = `
    <p>You requested a password reset for your Ali's Store account.</p>
    <p><a href="${esc(resetUrl)}">Reset your password</a></p>
    <p>This link expires in ${ttlMinutes} minutes. If you didn't request this, you can
    safely ignore this email — your password won't be changed.</p>
  `.trim();
  const htmlAr = `
    <p>لقد طلبت إعادة تعيين كلمة مرور حساب Ali's Store الخاص بك.</p>
    <p><a href="${esc(resetUrl)}">إعادة تعيين كلمة المرور</a></p>
    <p>تنتهي صلاحية هذا الرابط خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد
    الإلكتروني بأمان — لن يتم تغيير كلمة المرور الخاصة بك.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject("Reset your Ali's Store password", 'إعادة تعيين كلمة مرور Ali\'s Store الخاصة بك'),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] password-reset email sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send password-reset email', err);
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
    `Welcome to Ali's Store! Confirm your email address to finish setting up your account.\n\n` +
    `Verify your email: ${verifyUrl}\n\n` +
    `This link is valid for ${validForEn}. If you didn't create an account, you can ignore this email.`;
  const textAr =
    `مرحبًا بك في Ali's Store! قم بتأكيد بريدك الإلكتروني لإكمال إعداد حسابك.\n\n` +
    `تحقق من بريدك الإلكتروني: ${verifyUrl}\n\n` +
    `هذا الرابط صالح لمدة ${validForAr}. إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذا البريد الإلكتروني.`;

  const htmlEn = `
    <p>Welcome to Ali's Store! Confirm your email address to finish setting up your account.</p>
    <p><a href="${esc(verifyUrl)}">Verify your email</a></p>
    <p>This link is valid for ${validForEn}. If you didn't create an account, you can ignore this email.</p>
  `.trim();
  const htmlAr = `
    <p>مرحبًا بك في Ali's Store! قم بتأكيد بريدك الإلكتروني لإكمال إعداد حسابك.</p>
    <p><a href="${esc(verifyUrl)}">تحقق من بريدك الإلكتروني</a></p>
    <p>هذا الرابط صالح لمدة ${validForAr}. إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذا البريد الإلكتروني.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject("Verify your Ali's Store email", 'تحقق من بريدك الإلكتروني الخاص بـ Ali\'s Store'),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] verification email sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send verification email', err);
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
  const deliveryFeeLine = Number(order.deliveryFee) === 0 ? 'Free' : money(Number(order.deliveryFee));
  const deliveryFeeLineAr = Number(order.deliveryFee) === 0 ? 'مجانية' : money(Number(order.deliveryFee));

  const textEn =
    `Hi ${order.deliveryName},\n\n` +
    `Thanks for your order! Here's your confirmation.\n\n` +
    `Order ${order.orderNumber}\n` +
    `Payment: Cash on delivery\n\n` +
    `Items:\n${itemLines}\n\n` +
    `Subtotal: ${money(Number(order.subtotal))}\n` +
    `Delivery: ${deliveryFeeLine}\n` +
    `Total: ${money(Number(order.total))}\n\n` +
    `Delivering to:\n` +
    `${order.deliveryName}\n` +
    `${deliveryLine(order, 'en')}\n` +
    `Phone: ${order.deliveryPhone}` +
    (order.deliveryNotes ? `\nDelivery notes: ${order.deliveryNotes}` : '') +
    `\n\nWe'll call ${order.deliveryPhone} to confirm delivery. Thanks for shopping with Ali's Store!\n\n` +
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
    `\n\nسنتصل بك على ${order.deliveryPhone} لتأكيد التوصيل. شكرًا للتسوق مع Ali's Store!\n\n` +
    `تتبع طلبك أو إلغاؤه في أي وقت قبل شحنه: ${orderUrl}`;

  const itemRows = order.items
    .map((i) => `<tr><td>${esc(itemLabel(i))}</td><td>${money(Number(i.lineTotal))}</td></tr>`)
    .join('');

  const htmlEn = `
    <p>Hi ${esc(order.deliveryName)},</p>
    <p>Thanks for your order! Here's your confirmation.</p>
    <p><strong>Order ${esc(order.orderNumber)}</strong><br>Payment: Cash on delivery</p>
    <table>${itemRows}</table>
    <p>
      Subtotal: ${money(Number(order.subtotal))}<br>
      Delivery: ${deliveryFeeLine}<br>
      <strong>Total: ${money(Number(order.total))}</strong>
    </p>
    <p>
      Delivering to:<br>
      ${esc(order.deliveryName)}<br>
      ${esc(deliveryLine(order, 'en'))}<br>
      Phone: ${esc(order.deliveryPhone)}
      ${order.deliveryNotes ? `<br>Delivery notes: ${esc(order.deliveryNotes)}` : ''}
    </p>
    <p>We'll call ${esc(order.deliveryPhone)} to confirm delivery. Thanks for shopping with Ali's Store!</p>
    <p><a href="${esc(orderUrl)}">Track this order or cancel it</a> any time before it ships.</p>
  `.trim();

  const htmlAr = `
    <p>مرحبًا ${esc(order.deliveryName)}،</p>
    <p>شكرًا لطلبك! إليك تأكيد الطلب.</p>
    <p><strong>الطلب ${esc(order.orderNumber)}</strong><br>الدفع: الدفع عند الاستلام</p>
    <table>${itemRows}</table>
    <p>
      المجموع الفرعي: ${money(Number(order.subtotal))}<br>
      التوصيل: ${deliveryFeeLineAr}<br>
      <strong>الإجمالي: ${money(Number(order.total))}</strong>
    </p>
    <p>
      التوصيل إلى:<br>
      ${esc(order.deliveryName)}<br>
      ${esc(deliveryLine(order, 'ar'))}<br>
      الهاتف: ${esc(order.deliveryPhone)}
      ${order.deliveryNotes ? `<br>ملاحظات التوصيل: ${esc(order.deliveryNotes)}` : ''}
    </p>
    <p>سنتصل بك على ${esc(order.deliveryPhone)} لتأكيد التوصيل. شكرًا للتسوق مع Ali's Store!</p>
    <p><a href="${esc(orderUrl)}">تتبع طلبك أو إلغاؤه</a> في أي وقت قبل شحنه.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(`Order confirmed — ${order.orderNumber}`, `تم تأكيد الطلب — ${order.orderNumber}`),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] order-confirmation email sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send order-confirmation email', err);
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

  const itemRows = order.items
    .map(
      (i) =>
        `<tr><td>${esc(itemLabel(i))}</td><td>${esc(i.variantSKU)}</td><td>${money(Number(i.lineTotal))}</td></tr>`
    )
    .join('');

  const htmlEn = `
    <p><strong>New order placed.</strong></p>
    <p>
      Order ${esc(order.orderNumber)}<br>
      Total: ${money(Number(order.total))} (subtotal ${money(Number(order.subtotal))} + delivery ${money(Number(order.deliveryFee))})<br>
      Payment: Cash on delivery — not yet collected
    </p>
    <p>
      Customer: ${esc(order.deliveryName)} — ${esc(order.deliveryPhone)}
      ${order.guestEmail ? `<br>Email: ${esc(order.guestEmail)}` : ''}
    </p>
    <table>${itemRows}</table>
    <p>
      Deliver to:<br>
      ${esc(deliveryLine(order, 'en'))}
      ${order.deliveryNotes ? `<br>Delivery notes: ${esc(order.deliveryNotes)}` : ''}
      ${order.notes ? `<br>Customer notes: ${esc(order.notes)}` : ''}
    </p>
  `.trim();

  const htmlAr = `
    <p><strong>تم تقديم طلب جديد.</strong></p>
    <p>
      الطلب ${esc(order.orderNumber)}<br>
      الإجمالي: ${money(Number(order.total))} (المجموع الفرعي ${money(Number(order.subtotal))} + التوصيل ${money(Number(order.deliveryFee))})<br>
      الدفع: الدفع عند الاستلام — لم يتم التحصيل بعد
    </p>
    <p>
      العميل: ${esc(order.deliveryName)} — ${esc(order.deliveryPhone)}
      ${order.guestEmail ? `<br>البريد الإلكتروني: ${esc(order.guestEmail)}` : ''}
    </p>
    <table>${itemRows}</table>
    <p>
      التوصيل إلى:<br>
      ${esc(deliveryLine(order, 'ar'))}
      ${order.deliveryNotes ? `<br>ملاحظات التوصيل: ${esc(order.deliveryNotes)}` : ''}
      ${order.notes ? `<br>ملاحظات العميل: ${esc(order.notes)}` : ''}
    </p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(
        `New order ${order.orderNumber} — ${money(Number(order.total))} (COD)`,
        `طلب جديد ${order.orderNumber} — ${money(Number(order.total))} (الدفع عند الاستلام)`
      ),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] owner order alert sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send owner order alert', err);
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

  const htmlEn = `
    <p>Hi ${esc(order.deliveryName)},</p>
    <p>
      Your order <strong>${esc(order.orderNumber)}</strong> has been cancelled, and the total
      (${money(Number(order.total))}) won't be charged since payment was cash on delivery.
    </p>
    <p>If this wasn't you, or you have any questions, get in touch and we'll sort it out.</p>
  `.trim();
  const htmlAr = `
    <p>مرحبًا ${esc(order.deliveryName)}،</p>
    <p>
      تم إلغاء طلبك <strong>${esc(order.orderNumber)}</strong>، ولن يتم تحصيل الإجمالي
      (${money(Number(order.total))}) نظرًا لأن الدفع كان عند الاستلام.
    </p>
    <p>إذا لم يكن هذا أنت، أو كان لديك أي أسئلة، تواصل معنا وسنقوم بحل الأمر.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(`Order cancelled — ${order.orderNumber}`, `تم إلغاء الطلب — ${order.orderNumber}`),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] order-cancelled email sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send order-cancelled email', err);
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

  const htmlEn = `
    <p>Hi ${esc(order.deliveryName)},</p>
    <p>
      Good news — your order <strong>${esc(order.orderNumber)}</strong> has shipped and is on its way to
      ${esc(deliveryLine(order, 'en'))}.
    </p>
    <p>${etaEn}</p>
    <p><a href="${esc(trackUrl)}">Track your order</a></p>
    <p>Payment is cash on delivery — please have ${money(Number(order.total))} ready.</p>
  `.trim();
  const htmlAr = `
    <p>مرحبًا ${esc(order.deliveryName)}،</p>
    <p>
      أخبار سارة — تم شحن طلبك <strong>${esc(order.orderNumber)}</strong> وهو في طريقه إلى
      ${esc(deliveryLine(order, 'ar'))}.
    </p>
    <p>${etaAr}</p>
    <p><a href="${esc(trackUrl)}">تتبع طلبك</a></p>
    <p>الدفع عند الاستلام — يرجى تجهيز ${money(Number(order.total))}.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(
        `Your order has shipped — ${order.orderNumber}`,
        `تم شحن طلبك — ${order.orderNumber}`
      ),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] order-shipped email sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send order-shipped email', err);
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

  const htmlEn = `
    <p><strong>Order cancelled.</strong></p>
    <p>
      Order ${esc(order.orderNumber)}<br>
      Total: ${money(Number(order.total))}<br>
      Customer: ${esc(order.deliveryName)} — ${esc(order.deliveryPhone)}
      ${order.guestEmail ? `<br>Email: ${esc(order.guestEmail)}` : ''}
    </p>
  `.trim();
  const htmlAr = `
    <p><strong>تم إلغاء الطلب.</strong></p>
    <p>
      الطلب ${esc(order.orderNumber)}<br>
      الإجمالي: ${money(Number(order.total))}<br>
      العميل: ${esc(order.deliveryName)} — ${esc(order.deliveryPhone)}
      ${order.guestEmail ? `<br>البريد الإلكتروني: ${esc(order.guestEmail)}` : ''}
    </p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(`Order cancelled ${order.orderNumber}`, `تم إلغاء الطلب ${order.orderNumber}`),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] owner cancellation alert sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send owner cancellation alert', err);
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
    `Your Ali's Store verification code is ${code}.\n\n` +
    `It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.`;
  const textAr =
    `رمز التحقق الخاص بك في Ali's Store هو ${code}.\n\n` +
    `تنتهي صلاحيته خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد الإلكتروني.`;

  const htmlEn = `
    <p>Your Ali's Store verification code is:</p>
    <p style="font-size: 1.5em; font-weight: bold; letter-spacing: 0.1em;">${esc(code)}</p>
    <p>It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.</p>
  `.trim();
  const htmlAr = `
    <p>رمز التحقق الخاص بك في Ali's Store هو:</p>
    <p style="font-size: 1.5em; font-weight: bold; letter-spacing: 0.1em;">${esc(code)}</p>
    <p>تنتهي صلاحيته خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد الإلكتروني.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(
        `${code} is your Ali's Store verification code`,
        `${code} هو رمز التحقق الخاص بك في Ali's Store`
      ),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] checkout-OTP email sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send checkout-OTP email', err);
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

  const reward = coupon.type === 'PERCENT' ? `${Number(coupon.value)}% off` : `${money(Number(coupon.value))} off`;
  const rewardAr =
    coupon.type === 'PERCENT' ? `خصم ${Number(coupon.value)}%` : `خصم ${money(Number(coupon.value))}`;
  const expiryEn = coupon.endsAt ? ` It's valid until ${coupon.endsAt.toDateString()}.` : '';
  const expiryAr = coupon.endsAt ? ` صالح حتى ${coupon.endsAt.toDateString()}.` : '';

  const textEn =
    `Thank you for being a loyal customer!\n\n` +
    `You've earned a reward for "${rule.nameEn}": ${reward} your next order.\n\n` +
    `Use this code at checkout: ${coupon.code}\n` +
    `${expiryEn}`.trim();
  const textAr =
    `شكرًا لكونك عميلًا مخلصًا!\n\n` +
    `لقد ربحت مكافأة عن "${rule.nameAr}": ${rewardAr} على طلبك القادم.\n\n` +
    `استخدم هذا الرمز عند الدفع: ${coupon.code}\n` +
    `${expiryAr}`.trim();

  const htmlEn = `
    <p>Thank you for being a loyal customer!</p>
    <p>You've earned a reward for <strong>${esc(rule.nameEn)}</strong>: ${esc(reward)} your next order.</p>
    <p style="font-size: 1.25em; font-weight: bold; letter-spacing: 0.05em;">${esc(coupon.code)}</p>
    ${expiryEn ? `<p>${esc(expiryEn.trim())}</p>` : ''}
  `.trim();
  const htmlAr = `
    <p>شكرًا لكونك عميلًا مخلصًا!</p>
    <p>لقد ربحت مكافأة عن <strong>${esc(rule.nameAr)}</strong>: ${esc(rewardAr)} على طلبك القادم.</p>
    <p style="font-size: 1.25em; font-weight: bold; letter-spacing: 0.05em;">${esc(coupon.code)}</p>
    ${expiryAr ? `<p>${esc(expiryAr.trim())}</p>` : ''}
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(`A reward for you, from Ali's Store`, `مكافأة لك، من Ali's Store`),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] loyalty-reward email sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send loyalty-reward email', err);
    return false;
  }
}

/**
 * Sent to the NEW address when a signed-in user requests an account email
 * change (Task 3) — proof of control: `User.email` is only updated once this
 * link is clicked (see account/email-change.service.ts's confirmEmailChange).
 * Same never-throws contract as the other mailer functions.
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
    `You requested to change the email address on your Ali's Store account to this one.\n\n` +
    `Confirm this change: ${confirmUrl}\n\n` +
    `This link expires in ${ttlMinutes} minutes. If you didn't request this, you can safely ` +
    `ignore this email — your account email won't be changed.`;
  const textAr =
    `لقد طلبت تغيير عنوان البريد الإلكتروني لحسابك في Ali's Store إلى هذا العنوان.\n\n` +
    `أكد هذا التغيير: ${confirmUrl}\n\n` +
    `تنتهي صلاحية هذا الرابط خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد ` +
    `الإلكتروني بأمان — لن يتم تغيير البريد الإلكتروني لحسابك.`;

  const htmlEn = `
    <p>You requested to change the email address on your Ali's Store account to this one.</p>
    <p><a href="${esc(confirmUrl)}">Confirm this change</a></p>
    <p>This link expires in ${ttlMinutes} minutes. If you didn't request this, you can safely
    ignore this email — your account email won't be changed.</p>
  `.trim();
  const htmlAr = `
    <p>لقد طلبت تغيير عنوان البريد الإلكتروني لحسابك في Ali's Store إلى هذا العنوان.</p>
    <p><a href="${esc(confirmUrl)}">أكد هذا التغيير</a></p>
    <p>تنتهي صلاحية هذا الرابط خلال ${ttlMinutes} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد
    الإلكتروني بأمان — لن يتم تغيير البريد الإلكتروني لحسابك.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject('Confirm your new Ali\'s Store email', 'أكد بريدك الإلكتروني الجديد في Ali\'s Store'),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] email-change confirmation sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send email-change confirmation', err);
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
    `Someone requested to change the email address on your Ali's Store account to ${newEmail}.\n\n` +
    `If this was you, no action is needed — the change takes effect once that address confirms it.\n\n` +
    `If this wasn't you, change your password immediately and contact us.`;
  const textAr =
    `طلب شخص ما تغيير عنوان البريد الإلكتروني لحسابك في Ali's Store إلى ${newEmail}.\n\n` +
    `إذا كنت أنت من طلب ذلك، فلا حاجة لاتخاذ أي إجراء — يسري التغيير بمجرد تأكيده من ذلك العنوان.\n\n` +
    `إذا لم يكن هذا أنت، فقم بتغيير كلمة المرور الخاصة بك فورًا وتواصل معنا.`;

  const htmlEn = `
    <p>Someone requested to change the email address on your Ali's Store account to <strong>${esc(newEmail)}</strong>.</p>
    <p>If this was you, no action is needed — the change takes effect once that address confirms it.</p>
    <p>If this wasn't you, change your password immediately and contact us.</p>
  `.trim();
  const htmlAr = `
    <p>طلب شخص ما تغيير عنوان البريد الإلكتروني لحسابك في Ali's Store إلى <strong>${esc(newEmail)}</strong>.</p>
    <p>إذا كنت أنت من طلب ذلك، فلا حاجة لاتخاذ أي إجراء — يسري التغيير بمجرد تأكيده من ذلك العنوان.</p>
    <p>إذا لم يكن هذا أنت، فقم بتغيير كلمة المرور الخاصة بك فورًا وتواصل معنا.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(
        'Email change requested on your Ali\'s Store account',
        'تم طلب تغيير البريد الإلكتروني لحسابك في Ali\'s Store'
      ),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] email-change request notice sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send email-change request notice', err);
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
    `The email address on your Ali's Store account has been changed to ${newEmail}.\n\n` +
    `This address will no longer receive notifications for that account.\n\n` +
    `If this wasn't you, contact us immediately.`;
  const textAr =
    `تم تغيير عنوان البريد الإلكتروني لحسابك في Ali's Store إلى ${newEmail}.\n\n` +
    `لن يستقبل هذا العنوان بعد الآن إشعارات ذلك الحساب.\n\n` +
    `إذا لم يكن هذا أنت، تواصل معنا فورًا.`;

  const htmlEn = `
    <p>The email address on your Ali's Store account has been changed to <strong>${esc(newEmail)}</strong>.</p>
    <p>This address will no longer receive notifications for that account.</p>
    <p>If this wasn't you, contact us immediately.</p>
  `.trim();
  const htmlAr = `
    <p>تم تغيير عنوان البريد الإلكتروني لحسابك في Ali's Store إلى <strong>${esc(newEmail)}</strong>.</p>
    <p>لن يستقبل هذا العنوان بعد الآن إشعارات ذلك الحساب.</p>
    <p>إذا لم يكن هذا أنت، تواصل معنا فورًا.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: bilingualSubject(
        'Your Ali\'s Store account email was changed',
        'تم تغيير البريد الإلكتروني لحسابك في Ali\'s Store'
      ),
      text: bilingualText(textEn, textAr),
      html: bilingualHtml(htmlEn, htmlAr),
    });
    console.log('[mailer] email-changed notice sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send email-changed notice', err);
    return false;
  }
}
