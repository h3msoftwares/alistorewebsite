import { prisma } from '../config/prisma';

/**
 * The fixed catalogue of admin-editable emails. Each key's default subject/
 * body (what ships until an admin overrides it — see EmailTemplate in
 * schema.prisma) and its {{placeholder}} allowlist live here in code, not
 * the database — only an override, when one exists, is a DB row. Adding a
 * new template means adding one entry here plus a call to
 * renderEmailTemplate() at the actual send site (mailer.ts); nothing else
 * needs to change.
 *
 * Every email is bilingual (see mailer.ts's bilingualSubject/bilingualHtml),
 * so each template carries an EN and an AR default, and an override must
 * supply both. The two languages share ONE {{placeholder}} allowlist —
 * mailer.ts supplies a same-named but (where the content actually differs
 * by language, e.g. "Free" vs "مجانية") different-valued `vars` object per
 * language when it calls renderEmailTemplate().
 */
export type EmailTemplateKey =
  | 'password.reset'
  | 'email.verification'
  | 'order.confirmed'
  | 'order.shipped'
  | 'order.cancelled'
  | 'owner.order_alert'
  | 'owner.order_cancelled_alert'
  | 'checkout.otp'
  | 'loyalty.reward';

export interface EmailTemplateDef {
  /** Admin-facing name, shown in the templates list. */
  label: string;
  /** One line: when this actually gets sent. */
  trigger: string;
  /** The only {{name}}s this template's render call ever supplies — an
   *  admin edit that references anything else is rejected at save time
   *  (see email-templates.service.ts's updateEmailTemplate). Shared by
   *  both languages. */
  variables: string[];
  defaultSubjectEn: string;
  defaultSubjectAr: string;
  defaultBodyEn: string;
  defaultBodyAr: string;
}

export const EMAIL_TEMPLATE_DEFS: Record<EmailTemplateKey, EmailTemplateDef> = {
  'password.reset': {
    label: 'Password reset',
    trigger: 'A customer or admin requests a password reset.',
    variables: ['resetUrl', 'ttlMinutes'],
    defaultSubjectEn: "Reset your Ali'sStore password",
    defaultSubjectAr: 'إعادة تعيين كلمة مرور Ali\'s Store الخاصة بك',
    defaultBodyEn: `
<p>You requested a password reset for your Ali'sStore account.</p>
<p><a href="{{resetUrl}}">Reset your password</a></p>
<p>This link expires in {{ttlMinutes}} minutes. If you didn't request this, you can
safely ignore this email — your password won't be changed.</p>
    `.trim(),
    defaultBodyAr: `
<p>لقد طلبت إعادة تعيين كلمة مرور حساب Ali'sStore الخاص بك.</p>
<p><a href="{{resetUrl}}">إعادة تعيين كلمة المرور</a></p>
<p>تنتهي صلاحية هذا الرابط خلال {{ttlMinutes}} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد
الإلكتروني بأمان — لن يتم تغيير كلمة المرور الخاصة بك.</p>
    `.trim(),
  },
  'email.verification': {
    label: 'Email verification',
    trigger: 'A new registration, or a resend of the verification link.',
    variables: ['verifyUrl', 'validFor'],
    defaultSubjectEn: "Verify your Ali'sStore email",
    defaultSubjectAr: 'تحقق من بريدك الإلكتروني الخاص بـ Ali\'s Store',
    defaultBodyEn: `
<p>Welcome to Ali'sStore! Confirm your email address to finish setting up your account.</p>
<p><a href="{{verifyUrl}}">Verify your email</a></p>
<p>This link is valid for {{validFor}}. If you didn't create an account, you can ignore this email.</p>
    `.trim(),
    defaultBodyAr: `
<p>مرحبًا بك في Ali'sStore! قم بتأكيد بريدك الإلكتروني لإكمال إعداد حسابك.</p>
<p><a href="{{verifyUrl}}">تحقق من بريدك الإلكتروني</a></p>
<p>هذا الرابط صالح لمدة {{validFor}}. إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذا البريد الإلكتروني.</p>
    `.trim(),
  },
  'order.confirmed': {
    label: 'Order confirmation',
    trigger: 'A customer completes checkout.',
    variables: [
      'customerName',
      'orderNumber',
      'itemsTable',
      'subtotal',
      'deliveryFee',
      'total',
      'deliveryAddress',
      'phone',
      'deliveryNotesLine',
      'orderUrl',
    ],
    defaultSubjectEn: 'Order confirmed — {{orderNumber}}',
    defaultSubjectAr: 'تم تأكيد الطلب — {{orderNumber}}',
    defaultBodyEn: `
<p>Hi {{customerName}},</p>
<p>Thanks for your order! Here's your confirmation.</p>
<p><strong>Order {{orderNumber}}</strong><br>Payment: Cash on delivery</p>
<table>{{itemsTable}}</table>
<p>
  Subtotal: {{subtotal}}<br>
  Delivery: {{deliveryFee}}<br>
  <strong>Total: {{total}}</strong>
</p>
<p>
  Delivering to:<br>
  {{customerName}}<br>
  {{deliveryAddress}}<br>
  Phone: {{phone}}
  {{deliveryNotesLine}}
</p>
<p>We'll call {{phone}} to confirm delivery. Thanks for shopping with Ali'sStore!</p>
<p><a href="{{orderUrl}}">Track this order or cancel it</a> any time before it ships.</p>
    `.trim(),
    defaultBodyAr: `
<p>مرحبًا {{customerName}}،</p>
<p>شكرًا لطلبك! إليك تأكيد الطلب.</p>
<p><strong>الطلب {{orderNumber}}</strong><br>الدفع: الدفع عند الاستلام</p>
<table>{{itemsTable}}</table>
<p>
  المجموع الفرعي: {{subtotal}}<br>
  التوصيل: {{deliveryFee}}<br>
  <strong>الإجمالي: {{total}}</strong>
</p>
<p>
  التوصيل إلى:<br>
  {{customerName}}<br>
  {{deliveryAddress}}<br>
  الهاتف: {{phone}}
  {{deliveryNotesLine}}
</p>
<p>سنتصل بك على {{phone}} لتأكيد التوصيل. شكرًا للتسوق مع Ali'sStore!</p>
<p><a href="{{orderUrl}}">تتبع طلبك أو إلغاؤه</a> في أي وقت قبل شحنه.</p>
    `.trim(),
  },
  'order.shipped': {
    label: 'Order shipped',
    trigger: "An admin marks an order's status as Shipped.",
    variables: ['customerName', 'orderNumber', 'deliveryAddress', 'etaLine', 'trackUrl', 'total'],
    defaultSubjectEn: 'Your order has shipped — {{orderNumber}}',
    defaultSubjectAr: 'تم شحن طلبك — {{orderNumber}}',
    defaultBodyEn: `
<p>Hi {{customerName}},</p>
<p>
  Good news — your order <strong>{{orderNumber}}</strong> has shipped and is on its way to
  {{deliveryAddress}}.
</p>
<p>{{etaLine}}</p>
<p><a href="{{trackUrl}}">Track your order</a></p>
<p>Payment is cash on delivery — please have {{total}} ready.</p>
    `.trim(),
    defaultBodyAr: `
<p>مرحبًا {{customerName}}،</p>
<p>
  أخبار سارة — تم شحن طلبك <strong>{{orderNumber}}</strong> وهو في طريقه إلى
  {{deliveryAddress}}.
</p>
<p>{{etaLine}}</p>
<p><a href="{{trackUrl}}">تتبع طلبك</a></p>
<p>الدفع عند الاستلام — يرجى تجهيز {{total}}.</p>
    `.trim(),
  },
  'order.cancelled': {
    label: 'Order cancelled',
    trigger: 'An admin cancels an order (customer copy).',
    variables: ['customerName', 'orderNumber', 'total'],
    defaultSubjectEn: 'Order cancelled — {{orderNumber}}',
    defaultSubjectAr: 'تم إلغاء الطلب — {{orderNumber}}',
    defaultBodyEn: `
<p>Hi {{customerName}},</p>
<p>
  Your order <strong>{{orderNumber}}</strong> has been cancelled, and the total
  ({{total}}) won't be charged since payment was cash on delivery.
</p>
<p>If this wasn't you, or you have any questions, get in touch and we'll sort it out.</p>
    `.trim(),
    defaultBodyAr: `
<p>مرحبًا {{customerName}}،</p>
<p>
  تم إلغاء طلبك <strong>{{orderNumber}}</strong>، ولن يتم تحصيل الإجمالي
  ({{total}}) نظرًا لأن الدفع كان عند الاستلام.
</p>
<p>إذا لم يكن هذا أنت، أو كان لديك أي أسئلة، تواصل معنا وسنقوم بحل الأمر.</p>
    `.trim(),
  },
  'owner.order_alert': {
    label: 'New order alert (owner)',
    trigger: 'A customer completes checkout (store owner copy).',
    variables: [
      'orderNumber',
      'total',
      'subtotal',
      'deliveryFee',
      'customerName',
      'phone',
      'customerEmailLine',
      'itemsTable',
      'deliveryAddress',
      'deliveryNotesLine',
      'customerNotesLine',
    ],
    defaultSubjectEn: 'New order {{orderNumber}} — {{total}} (COD)',
    defaultSubjectAr: 'طلب جديد {{orderNumber}} — {{total}} (الدفع عند الاستلام)',
    defaultBodyEn: `
<p><strong>New order placed.</strong></p>
<p>
  Order {{orderNumber}}<br>
  Total: {{total}} (subtotal {{subtotal}} + delivery {{deliveryFee}})<br>
  Payment: Cash on delivery — not yet collected
</p>
<p>
  Customer: {{customerName}} — {{phone}}
  {{customerEmailLine}}
</p>
<table>{{itemsTable}}</table>
<p>
  Deliver to:<br>
  {{deliveryAddress}}
  {{deliveryNotesLine}}
  {{customerNotesLine}}
</p>
    `.trim(),
    defaultBodyAr: `
<p><strong>تم تقديم طلب جديد.</strong></p>
<p>
  الطلب {{orderNumber}}<br>
  الإجمالي: {{total}} (المجموع الفرعي {{subtotal}} + التوصيل {{deliveryFee}})<br>
  الدفع: الدفع عند الاستلام — لم يتم التحصيل بعد
</p>
<p>
  العميل: {{customerName}} — {{phone}}
  {{customerEmailLine}}
</p>
<table>{{itemsTable}}</table>
<p>
  التوصيل إلى:<br>
  {{deliveryAddress}}
  {{deliveryNotesLine}}
  {{customerNotesLine}}
</p>
    `.trim(),
  },
  'owner.order_cancelled_alert': {
    label: 'Order cancelled alert (owner)',
    trigger: 'An admin cancels an order (store owner copy).',
    variables: ['orderNumber', 'total', 'customerName', 'phone', 'customerEmailLine'],
    defaultSubjectEn: 'Order cancelled {{orderNumber}}',
    defaultSubjectAr: 'تم إلغاء الطلب {{orderNumber}}',
    defaultBodyEn: `
<p><strong>Order cancelled.</strong></p>
<p>
  Order {{orderNumber}}<br>
  Total: {{total}}<br>
  Customer: {{customerName}} — {{phone}}
  {{customerEmailLine}}
</p>
    `.trim(),
    defaultBodyAr: `
<p><strong>تم إلغاء الطلب.</strong></p>
<p>
  الطلب {{orderNumber}}<br>
  الإجمالي: {{total}}<br>
  العميل: {{customerName}} — {{phone}}
  {{customerEmailLine}}
</p>
    `.trim(),
  },
  'checkout.otp': {
    label: 'Checkout verification code',
    trigger: 'A guest verifies their email at checkout.',
    variables: ['code', 'ttlMinutes'],
    defaultSubjectEn: "{{code}} is your Ali'sStore verification code",
    defaultSubjectAr: '{{code}} هو رمز التحقق الخاص بك في Ali\'s Store',
    defaultBodyEn: `
<p>Your Ali'sStore verification code is:</p>
<p style="font-size: 1.5em; font-weight: bold; letter-spacing: 0.1em;">{{code}}</p>
<p>It expires in {{ttlMinutes}} minutes. If you didn't request this, you can ignore this email.</p>
    `.trim(),
    defaultBodyAr: `
<p>رمز التحقق الخاص بك في Ali'sStore هو:</p>
<p style="font-size: 1.5em; font-weight: bold; letter-spacing: 0.1em;">{{code}}</p>
<p>تنتهي صلاحيته خلال {{ttlMinutes}} دقيقة. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد الإلكتروني.</p>
    `.trim(),
  },
  'loyalty.reward': {
    label: 'Loyalty reward earned',
    trigger: 'A registered customer crosses a loyalty-program milestone.',
    variables: ['ruleName', 'reward', 'couponCode', 'expiryLine'],
    defaultSubjectEn: "A reward for you, from Ali'sStore",
    defaultSubjectAr: 'مكافأة لك، من Ali\'s Store',
    defaultBodyEn: `
<p>Thank you for being a loyal customer!</p>
<p>You've earned a reward for <strong>{{ruleName}}</strong>: {{reward}} your next order.</p>
<p style="font-size: 1.25em; font-weight: bold; letter-spacing: 0.05em;">{{couponCode}}</p>
{{expiryLine}}
    `.trim(),
    defaultBodyAr: `
<p>شكرًا لكونك عميلًا مخلصًا!</p>
<p>لقد ربحت مكافأة عن <strong>{{ruleName}}</strong>: {{reward}} على طلبك القادم.</p>
<p style="font-size: 1.25em; font-weight: bold; letter-spacing: 0.05em;">{{couponCode}}</p>
{{expiryLine}}
    `.trim(),
  },
};

/** Plausible sample values for every template's variables, per language —
 *  powers the admin panel's live preview and its "send test email" button,
 *  so an admin can see roughly real bilingual output without needing a live
 *  order/coupon on hand. */
export const SAMPLE_VARS_EN: Record<EmailTemplateKey, Record<string, string>> = {
  'password.reset': { resetUrl: 'https://example.com/en/reset-password?token=sample', ttlMinutes: '30' },
  'email.verification': { verifyUrl: 'https://example.com/en/verify-email?token=sample', validFor: '24 hours' },
  'order.confirmed': {
    customerName: 'Layla Haddad',
    orderNumber: 'ALI-10234',
    itemsTable: '<tr><td>Classic White Sneakers (M/White) x1</td><td>$45.00</td></tr>',
    subtotal: '$45.00',
    deliveryFee: '$3.00',
    total: '$48.00',
    deliveryAddress: '12 Hamra St, Sanayeh, Beirut, Beirut',
    phone: '+961 71 234 567',
    deliveryNotesLine: '<br>Delivery notes: Leave with doorman',
    orderUrl: 'https://example.com/en/orders/lookup',
  },
  'order.shipped': {
    customerName: 'Layla Haddad',
    orderNumber: 'ALI-10234',
    deliveryAddress: '12 Hamra St, Sanayeh, Beirut, Beirut',
    etaLine: 'Estimated delivery: about 2 days.',
    trackUrl: 'https://example.com/en/orders/lookup',
    total: '$48.00',
  },
  'order.cancelled': { customerName: 'Layla Haddad', orderNumber: 'ALI-10234', total: '$48.00' },
  'owner.order_alert': {
    orderNumber: 'ALI-10234',
    total: '$48.00',
    subtotal: '$45.00',
    deliveryFee: '$3.00',
    customerName: 'Layla Haddad',
    phone: '+961 71 234 567',
    customerEmailLine: '<br>Email: layla@example.com',
    itemsTable: '<tr><td>Classic White Sneakers (M/White) x1</td><td>SKU-001</td><td>$45.00</td></tr>',
    deliveryAddress: '12 Hamra St, Sanayeh, Beirut, Beirut',
    deliveryNotesLine: '<br>Delivery notes: Leave with doorman',
    customerNotesLine: '',
  },
  'owner.order_cancelled_alert': {
    orderNumber: 'ALI-10234',
    total: '$48.00',
    customerName: 'Layla Haddad',
    phone: '+961 71 234 567',
    customerEmailLine: '<br>Email: layla@example.com',
  },
  'checkout.otp': { code: '482913', ttlMinutes: '10' },
  'loyalty.reward': {
    ruleName: 'Every 5th order',
    reward: '10% off',
    couponCode: '4821-0937-6650',
    expiryLine: "<p>It's valid until Sat Dec 12 2026.</p>",
  },
};

export const SAMPLE_VARS_AR: Record<EmailTemplateKey, Record<string, string>> = {
  'password.reset': { resetUrl: 'https://example.com/ar/reset-password?token=sample', ttlMinutes: '30' },
  'email.verification': { verifyUrl: 'https://example.com/ar/verify-email?token=sample', validFor: '24 ساعة' },
  'order.confirmed': {
    customerName: 'ليلى حداد',
    orderNumber: 'ALI-10234',
    itemsTable: '<tr><td>Classic White Sneakers (M/White) x1</td><td>$45.00</td></tr>',
    subtotal: '$45.00',
    deliveryFee: '$3.00',
    total: '$48.00',
    deliveryAddress: '12 شارع الحمرا، الصنائع، بيروت، بيروت',
    phone: '+961 71 234 567',
    deliveryNotesLine: '<br>ملاحظات التوصيل: اترك مع البواب',
    orderUrl: 'https://example.com/ar/orders/lookup',
  },
  'order.shipped': {
    customerName: 'ليلى حداد',
    orderNumber: 'ALI-10234',
    deliveryAddress: '12 شارع الحمرا، الصنائع، بيروت، بيروت',
    etaLine: 'التوصيل المتوقع: حوالي يومين.',
    trackUrl: 'https://example.com/ar/orders/lookup',
    total: '$48.00',
  },
  'order.cancelled': { customerName: 'ليلى حداد', orderNumber: 'ALI-10234', total: '$48.00' },
  'owner.order_alert': {
    orderNumber: 'ALI-10234',
    total: '$48.00',
    subtotal: '$45.00',
    deliveryFee: '$3.00',
    customerName: 'ليلى حداد',
    phone: '+961 71 234 567',
    customerEmailLine: '<br>البريد الإلكتروني: layla@example.com',
    itemsTable: '<tr><td>Classic White Sneakers (M/White) x1</td><td>SKU-001</td><td>$45.00</td></tr>',
    deliveryAddress: '12 شارع الحمرا، الصنائع، بيروت، بيروت',
    deliveryNotesLine: '<br>ملاحظات التوصيل: اترك مع البواب',
    customerNotesLine: '',
  },
  'owner.order_cancelled_alert': {
    orderNumber: 'ALI-10234',
    total: '$48.00',
    customerName: 'ليلى حداد',
    phone: '+961 71 234 567',
    customerEmailLine: '<br>البريد الإلكتروني: layla@example.com',
  },
  'checkout.otp': { code: '482913', ttlMinutes: '10' },
  'loyalty.reward': {
    ruleName: 'كل طلب خامس',
    reward: 'خصم 10%',
    couponCode: '4821-0937-6650',
    expiryLine: '<p>صالح حتى Sat Dec 12 2026.</p>',
  },
};

/** Every `{{name}}` reference actually present in a template string — used
 *  to validate an admin's edit against that key's allowlist before saving. */
export function referencedVariables(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(/\{\{(\w+)\}\}/g)) found.add(m[1]);
  return [...found];
}

/** Plain, non-throwing substitution: `{{name}}` -> `vars[name]`, or left
 *  exactly as-is when `name` isn't supplied — never eval'd, never treated as
 *  code. Callers are responsible for HTML-escaping any value that isn't
 *  already-safe markup before it goes into `vars` (see mailer.ts, which
 *  reuses the same `esc()` it always has) — this function does no escaping
 *  of its own, the same way the hardcoded template literals it replaces
 *  didn't either. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in vars ? vars[name] : match));
}

export interface RenderedEmailTemplate {
  subjectEn: string;
  subjectAr: string;
  htmlEn: string;
  htmlAr: string;
}

/** Loads `key`'s current subject/body in both languages (an admin override
 *  if one exists, else the coded defaults) and interpolates `varsEn`/
 *  `varsAr` into the matching language. This is what every mailer.ts sender
 *  calls instead of building its own template literal; the caller composes
 *  the final bilingual message with bilingualSubject()/bilingualHtml(). */
export async function renderEmailTemplate(
  key: EmailTemplateKey,
  varsEn: Record<string, string>,
  varsAr: Record<string, string>
): Promise<RenderedEmailTemplate> {
  const def = EMAIL_TEMPLATE_DEFS[key];
  const override = await prisma.emailTemplate.findUnique({ where: { key } });
  return {
    subjectEn: interpolate(override?.subjectEn ?? def.defaultSubjectEn, varsEn),
    subjectAr: interpolate(override?.subjectAr ?? def.defaultSubjectAr, varsAr),
    htmlEn: interpolate(override?.htmlBodyEn ?? def.defaultBodyEn, varsEn),
    htmlAr: interpolate(override?.htmlBodyAr ?? def.defaultBodyAr, varsAr),
  };
}
