import nodemailer from 'nodemailer';
import { env } from '../config/env';

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
