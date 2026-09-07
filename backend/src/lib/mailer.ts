import nodemailer from 'nodemailer';
import type { Order, OrderItem } from '@prisma/client';
import { env } from '../config/env';
import { DELIVERY_REGIONS } from './regions';

type OrderWithItems = Order & { items: OrderItem[] };

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function regionLabel(region: string | null): string {
  return DELIVERY_REGIONS.find((r) => r.value === region)?.en ?? region ?? '';
}

// e.g. "12 Hamra St, Sanayeh, Beirut, Beirut" — area is only present on some
// addresses (see Address.area), so it's skipped rather than left blank.
function deliveryLine(order: OrderWithItems): string {
  const tail = [order.deliveryArea, order.deliveryCity, regionLabel(order.deliveryRegion)]
    .filter(Boolean)
    .join(', ');
  return `${order.deliveryAddress}, ${tail}`;
}

function itemLabel(item: OrderItem): string {
  const variant = [item.size, item.color].filter(Boolean).join('/');
  return `${item.productName}${variant ? ` (${variant})` : ''} x${item.quantity}`;
}

// Built once and reused — nodemailer pools SMTP connections internally.
// `configured` is false in any environment where SMTP hasn't been set up
// (fresh checkout, CI) — sendPasswordResetEmail becomes a logged no-op
// instead of throwing, so nothing about email delivery can ever change the
// forgot-password endpoint's response (see password-reset.service.ts).
const configured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);

const transporter = configured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // Gmail: 587 = STARTTLS (default), 465 = implicit TLS
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    })
  : null;

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
  if (!transporter) {
    console.warn('[mailer] SMTP is not configured — skipping password-reset email to', to);
    return false;
  }

  const text =
    `You requested a password reset for your Ali's Store account.\n\n` +
    `Reset your password: ${resetUrl}\n\n` +
    `This link expires in ${ttlMinutes} minutes. If you didn't request this, you can ` +
    `safely ignore this email — your password won't be changed.`;

  const html = `
    <p>You requested a password reset for your Ali's Store account.</p>
    <p><a href="${resetUrl}">Reset your password</a></p>
    <p>This link expires in ${ttlMinutes} minutes. If you didn't request this, you can
    safely ignore this email — your password won't be changed.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: "Reset your Ali's Store password",
      text,
      html,
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
  if (!transporter) {
    console.warn('[mailer] SMTP is not configured — skipping verification email to', to);
    return false;
  }

  const hours = Math.round(ttlMinutes / 60);
  const validFor = hours >= 1 ? `${hours} hour${hours === 1 ? '' : 's'}` : `${ttlMinutes} minutes`;

  const text =
    `Welcome to Ali's Store! Confirm your email address to finish setting up your account.\n\n` +
    `Verify your email: ${verifyUrl}\n\n` +
    `This link is valid for ${validFor}. If you didn't create an account, you can ignore this email.`;

  const html = `
    <p>Welcome to Ali's Store! Confirm your email address to finish setting up your account.</p>
    <p><a href="${verifyUrl}">Verify your email</a></p>
    <p>This link is valid for ${validFor}. If you didn't create an account, you can ignore this email.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: "Verify your Ali's Store email",
      text,
      html,
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
 * order.service.ts's checkout()), so this one function covers both. Same
 * never-throws contract as the other mailer functions.
 */
export async function sendOrderConfirmationEmail(to: string, order: OrderWithItems): Promise<boolean> {
  if (!transporter) {
    console.warn('[mailer] SMTP is not configured — skipping order-confirmation email to', to);
    return false;
  }

  const itemLines = order.items.map((i) => `- ${itemLabel(i)} — ${money(Number(i.lineTotal))}`).join('\n');
  const deliveryFeeLine = Number(order.deliveryFee) === 0 ? 'Free' : money(Number(order.deliveryFee));

  const text =
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
    `${deliveryLine(order)}\n` +
    `Phone: ${order.deliveryPhone}` +
    (order.deliveryNotes ? `\nDelivery notes: ${order.deliveryNotes}` : '') +
    `\n\nWe'll call ${order.deliveryPhone} to confirm delivery. Thanks for shopping with Ali's Store!`;

  const itemRows = order.items
    .map((i) => `<tr><td>${itemLabel(i)}</td><td>${money(Number(i.lineTotal))}</td></tr>`)
    .join('');

  const html = `
    <p>Hi ${order.deliveryName},</p>
    <p>Thanks for your order! Here's your confirmation.</p>
    <p><strong>Order ${order.orderNumber}</strong><br>Payment: Cash on delivery</p>
    <table>${itemRows}</table>
    <p>
      Subtotal: ${money(Number(order.subtotal))}<br>
      Delivery: ${deliveryFeeLine}<br>
      <strong>Total: ${money(Number(order.total))}</strong>
    </p>
    <p>
      Delivering to:<br>
      ${order.deliveryName}<br>
      ${deliveryLine(order)}<br>
      Phone: ${order.deliveryPhone}
      ${order.deliveryNotes ? `<br>Delivery notes: ${order.deliveryNotes}` : ''}
    </p>
    <p>We'll call ${order.deliveryPhone} to confirm delivery. Thanks for shopping with Ali's Store!</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: `Order confirmed — ${order.orderNumber}`,
      text,
      html,
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
  if (!transporter) {
    console.warn('[mailer] SMTP is not configured — skipping owner order alert for', order.orderNumber);
    return false;
  }

  const itemLines = order.items
    .map((i) => `- ${itemLabel(i)} — SKU ${i.variantSKU} — ${money(Number(i.lineTotal))}`)
    .join('\n');

  const text =
    `New order placed.\n\n` +
    `Order ${order.orderNumber}\n` +
    `Total: ${money(Number(order.total))} (subtotal ${money(Number(order.subtotal))} + delivery ${money(Number(order.deliveryFee))})\n` +
    `Payment: Cash on delivery — not yet collected\n\n` +
    `Customer: ${order.deliveryName} — ${order.deliveryPhone}` +
    (order.guestEmail ? `\nEmail: ${order.guestEmail}` : '') +
    `\n\nItems:\n${itemLines}\n\n` +
    `Deliver to:\n${deliveryLine(order)}` +
    (order.deliveryNotes ? `\nDelivery notes: ${order.deliveryNotes}` : '') +
    (order.notes ? `\nCustomer notes: ${order.notes}` : '');

  const itemRows = order.items
    .map((i) => `<tr><td>${itemLabel(i)}</td><td>${i.variantSKU}</td><td>${money(Number(i.lineTotal))}</td></tr>`)
    .join('');

  const html = `
    <p><strong>New order placed.</strong></p>
    <p>
      Order ${order.orderNumber}<br>
      Total: ${money(Number(order.total))} (subtotal ${money(Number(order.subtotal))} + delivery ${money(Number(order.deliveryFee))})<br>
      Payment: Cash on delivery — not yet collected
    </p>
    <p>
      Customer: ${order.deliveryName} — ${order.deliveryPhone}
      ${order.guestEmail ? `<br>Email: ${order.guestEmail}` : ''}
    </p>
    <table>${itemRows}</table>
    <p>
      Deliver to:<br>
      ${deliveryLine(order)}
      ${order.deliveryNotes ? `<br>Delivery notes: ${order.deliveryNotes}` : ''}
      ${order.notes ? `<br>Customer notes: ${order.notes}` : ''}
    </p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: `New order ${order.orderNumber} — ${money(Number(order.total))} (COD)`,
      text,
      html,
    });
    console.log('[mailer] owner order alert sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send owner order alert', err);
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
  if (!transporter) {
    console.warn('[mailer] SMTP is not configured — skipping checkout-OTP email to', to);
    return false;
  }

  const text =
    `Your Ali's Store verification code is ${code}.\n\n` +
    `It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.`;

  const html = `
    <p>Your Ali's Store verification code is:</p>
    <p style="font-size: 1.5em; font-weight: bold; letter-spacing: 0.1em;">${code}</p>
    <p>It expires in ${ttlMinutes} minutes. If you didn't request this, you can ignore this email.</p>
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: `${code} is your Ali's Store verification code`,
      text,
      html,
    });
    console.log('[mailer] checkout-OTP email sent', info.messageId);
    return true;
  } catch (err) {
    console.error('[mailer] failed to send checkout-OTP email', err);
    return false;
  }
}
