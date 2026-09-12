'use client';

import type { ReactNode } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';

const LAST_UPDATED_EN = '12 September 2026';
const LAST_UPDATED_AR = '١٢ أيلول ٢٠٢٦';

// Fallback used only when the owner hasn't set an Instagram URL in
// /admin/settings — matches the handle referenced in the policy text.
const DEFAULT_INSTAGRAM_URL = 'https://instagram.com/as_alistore';

export function PrivacyView({ locale }: { locale: 'en' | 'ar' }) {
  const { data: settings } = useSettings();
  const ar = locale === 'ar';
  const brand = ar
    ? settings?.brandNameAr || DEFAULT_BRAND_NAME_AR
    : settings?.brandNameEn || DEFAULT_BRAND_NAME_EN;

  const contact = {
    email: settings?.contactEmail || null,
    phone: settings?.contactPhone || null,
    instagramUrl: settings?.instagramUrl || DEFAULT_INSTAGRAM_URL,
  };

  return (
    <div className="container section" style={{ maxWidth: '44rem' }}>
      <article className="prose" dir={ar ? 'rtl' : 'ltr'} style={{ maxWidth: 'none' }}>
        {ar ? (
          <ArabicPrivacy brand={brand} contact={contact} />
        ) : (
          <EnglishPrivacy brand={brand} contact={contact} />
        )}
      </article>
    </div>
  );
}

interface Contact {
  email: string | null;
  phone: string | null;
  instagramUrl: string;
}

function emailNode(email: string | null): ReactNode {
  return email ? <a href={`mailto:${email}`}>{email}</a> : null;
}
function phoneNode(phone: string | null): ReactNode {
  return phone ? <a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a> : null;
}

function EnglishPrivacy({ brand, contact }: { brand: string; contact: Contact }) {
  return (
    <>
      <h1>Privacy Policy — {brand}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>Last updated: {LAST_UPDATED_EN}</p>

      <p>
        {brand} (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) operates this website (the
        &quot;Site&quot;) to sell clothing products, including lingerie, men&apos;s clothing, and
        children&apos;s pajamas. This Privacy Policy explains what personal information we collect,
        how we use it, and the choices you have. By using the Site, you agree to the practices
        described here.
      </p>
      <p>
        This policy is intended to comply with applicable Lebanese law, including Law No. 81/2018 on
        Electronic Transactions and Personal Data.
      </p>

      <h2>1. Information We Collect</h2>
      <p>We collect the following types of information:</p>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, phone number, and password (if
          you create an account) — or, if you choose to sign in with Google, the name and email
          address Google shares with us. Account creation is optional — guest checkout is available.
        </li>
        <li>
          <strong>Order information:</strong> delivery address, phone number, and order details
          (items, sizes, colors, quantities) needed to process and deliver your order.
        </li>
        <li>
          <strong>Payment information:</strong> we currently accept Cash on Delivery only. We do not
          collect or store credit/debit card numbers or other payment card data. If online payment
          options are added in the future, this policy will be updated accordingly.
        </li>
        <li>
          <strong>Fraud-prevention data:</strong> the IP address associated with your order and with
          any email verification code (OTP) you request at checkout. We use this to screen for
          blacklisted contacts and unusually rapid repeat orders before an order is accepted.
        </li>
        <li>
          <strong>Browsing and cookie data:</strong> information collected automatically through
          cookies, such as items in your shopping cart, login session data, language/region
          preference, and general usage patterns.
        </li>
        <li>
          <strong>Analytics data:</strong> aggregated, non-identifying data about how visitors use
          the Site (pages viewed, time spent, general location by IP), collected through Google
          Analytics — only if you accept optional cookies (see Section 3).
        </li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Process, confirm, and deliver your orders</li>
        <li>Communicate with you about your order or account</li>
        <li>Maintain your shopping cart and login session</li>
        <li>Respond to customer service inquiries</li>
        <li>Improve the Site&apos;s content, layout, and performance using analytics</li>
        <li>
          Detect and prevent fraud or abuse (e.g., screening orders and verification requests
          against blacklisted contacts, or against unusual order velocity)
        </li>
        <li>Comply with legal and accounting obligations (e.g., recordkeeping for tax purposes)</li>
      </ul>
      <p>
        We do not use your information for automated decision-making that produces legal effects, and
        we do not sell your personal data to third parties.
      </p>

      <h2>3. Cookies</h2>
      <p>The Site uses cookies to:</p>
      <ul>
        <li>Keep items in your cart as you browse</li>
        <li>Keep you logged in during your session</li>
        <li>Remember your language preference (English/Arabic)</li>
        <li>Gather anonymous analytics about Site usage</li>
      </ul>
      <p>
        You can control or disable cookies through your browser settings. Disabling essential cookies
        may affect features like the shopping cart or login.
      </p>

      <h2>4. Sharing of Information</h2>
      <p>We share personal information only in the following limited circumstances:</p>
      <ul>
        <li>
          <strong>Delivery:</strong> with the person or team fulfilling and delivering your order, to
          the extent needed to complete delivery.
        </li>
        <li>
          <strong>Google:</strong> if you accept optional cookies, Google Analytics receives
          aggregated usage data (see Section 1); if you sign in with Google, Google acts as your
          identity provider. Google processes this data under its own privacy policy.
        </li>
        <li>
          <strong>Legal requirements:</strong> if required by law, regulation, or a valid legal
          request from Lebanese authorities.
        </li>
      </ul>
      <p>
        We do not sell, rent, or trade your personal information to third parties for their own
        marketing purposes.
      </p>

      <h2>5. Data Retention</h2>
      <p>We retain personal information for as long as necessary to:</p>
      <ul>
        <li>Fulfill the purpose it was collected for (e.g., completing and supporting an order)</li>
        <li>Comply with legal, tax, or accounting obligations</li>
        <li>Resolve disputes or enforce our agreements</li>
      </ul>
      <p>
        When information is no longer needed for these purposes, we take reasonable steps to delete
        or anonymize it.
      </p>

      <h2>6. Data Security</h2>
      <p>
        We apply reasonable technical and organizational measures to protect your personal
        information, including secure password storage and authentication practices for registered
        accounts. However, no method of transmission or storage over the internet is completely
        secure, and we cannot guarantee absolute security.
      </p>

      <h2>7. Your Rights</h2>
      <p>Under applicable Lebanese data protection law, you may have the right to:</p>
      <ul>
        <li>Access the personal information we hold about you</li>
        <li>Request correction of inaccurate information</li>
        <li>Request deletion of your account and associated personal information</li>
        <li>
          Withdraw consent for optional data uses (e.g., account creation), where applicable
        </li>
      </ul>
      <p>To exercise these rights, contact us using the details in Section 9.</p>

      <h2>8. Children&apos;s Information</h2>
      <p>
        The Site is not directed at children, and we do not knowingly collect personal information
        directly from children. Purchases of children&apos;s items (such as kids&apos; pajamas) are
        expected to be made by a parent or guardian, who is responsible for the account and order
        information provided.
      </p>

      <h2>9. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy or wish to exercise your rights, contact us
        at:
      </p>
      <ContactBlock brand={brand} contact={contact} lang="en" />

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time, for example when we add new features
        such as online payment. Changes will be posted on this page with an updated &quot;Last
        updated&quot; date. Continued use of the Site after changes are posted constitutes acceptance
        of the updated policy.
      </p>
    </>
  );
}

function ArabicPrivacy({ brand, contact }: { brand: string; contact: Contact }) {
  return (
    <>
      <h1>سياسة الخصوصية — {brand}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>آخر تحديث: {LAST_UPDATED_AR}</p>

      <p>
        يقوم متجر {brand} («نحن»، «المتجر») بتشغيل هذا الموقع الإلكتروني («الموقع») لبيع منتجات
        الألبسة، بما في ذلك الملابس الداخلية النسائية، وملابس الرجال، وبيجامات الأطفال. توضّح سياسة
        الخصوصية هذه المعلومات الشخصية التي نجمعها، وكيفية استخدامها، والخيارات المتاحة لك. باستخدامك
        للموقع، فإنك توافق على الممارسات الموضحة هنا.
      </p>
      <p>
        تهدف هذه السياسة إلى الامتثال للقوانين اللبنانية المعمول بها، بما في ذلك القانون رقم 81/2018
        المتعلق بالمعاملات الإلكترونية والبيانات ذات الطابع الشخصي.
      </p>

      <h2>١. المعلومات التي نجمعها</h2>
      <p>نجمع جميع أنواع المعلومات التالية:</p>
      <ul>
        <li>
          <strong>معلومات الحساب:</strong> الاسم، البريد الإلكتروني، رقم الهاتف، وكلمة المرور (في حال
          إنشاء حساب) — أو، في حال اخترت تسجيل الدخول عبر Google، الاسم والبريد الإلكتروني اللذان
          تشاركهما Google معنا. إنشاء الحساب اختياري، ويمكنك إتمام الطلب كزائر دون تسجيل.
        </li>
        <li>
          <strong>معلومات الطلب:</strong> عنوان التوصيل، رقم الهاتف، وتفاصيل الطلب (المنتجات،
          المقاسات، الألوان، الكميات) اللازمة لمعالجة طلبك وتوصيله.
        </li>
        <li>
          <strong>معلومات الدفع:</strong> نعتمد حاليًا على الدفع عند الاستلام فقط، ولا نقوم بجمع أو
          تخزين أرقام بطاقات الائتمان أو أي بيانات دفع أخرى. في حال إضافة خيارات دفع إلكتروني
          مستقبلاً، سيتم تحديث هذه السياسة وفقًا لذلك.
        </li>
        <li>
          <strong>بيانات منع الاحتيال:</strong> عنوان IP المرتبط بطلبك وبأي رمز تحقق (OTP) عبر البريد
          الإلكتروني تطلبه عند الدفع. نستخدم هذه البيانات لفحص جهات الاتصال المحظورة والطلبات المتكررة
          بشكل غير معتاد قبل قبول الطلب.
        </li>
        <li>
          <strong>بيانات التصفح وملفات تعريف الارتباط (الكوكيز):</strong> معلومات تُجمع تلقائيًا عبر
          ملفات تعريف الارتباط، مثل محتويات سلة التسوق، بيانات جلسة تسجيل الدخول، تفضيل اللغة/المنطقة،
          وأنماط الاستخدام العامة.
        </li>
        <li>
          <strong>بيانات التحليلات:</strong> بيانات مجمّعة وغير معرّفة للهوية حول كيفية استخدام الزوار
          للموقع (الصفحات المُشاهدة، الوقت المستغرق، الموقع الجغرافي التقريبي عبر عنوان IP)، وتُجمع عبر
          خدمة Google Analytics — فقط في حال موافقتك على ملفات تعريف الارتباط الاختيارية (انظر القسم ٣).
        </li>
      </ul>

      <h2>٢. كيفية استخدام معلوماتك</h2>
      <p>نستخدم المعلومات التي نجمعها من أجل:</p>
      <ul>
        <li>معالجة طلباتك وتأكيدها وتوصيلها</li>
        <li>التواصل معك بخصوص طلبك أو حسابك</li>
        <li>الحفاظ على سلة التسوق وجلسة تسجيل الدخول الخاصة بك</li>
        <li>الرد على استفسارات خدمة العملاء</li>
        <li>تحسين محتوى الموقع وتصميمه وأدائه باستخدام أدوات التحليل</li>
        <li>
          كشف الاحتيال أو إساءة الاستخدام ومنعهما (مثل فحص الطلبات وطلبات التحقق مقابل جهات الاتصال
          المحظورة، أو معدّل طلبات غير معتاد)
        </li>
        <li>الامتثال للالتزامات القانونية والمحاسبية (مثل حفظ السجلات لأغراض ضريبية)</li>
      </ul>
      <p>
        نحن لا نستخدم معلوماتك في عمليات اتخاذ قرار آلية تنتج عنها آثار قانونية، ولا نقوم ببيع بياناتك
        الشخصية لأطراف ثالثة.
      </p>

      <h2>٣. ملفات تعريف الارتباط (الكوكيز)</h2>
      <p>يستخدم الموقع ملفات تعريف الارتباط من أجل:</p>
      <ul>
        <li>الاحتفاظ بمحتويات سلة التسوق أثناء تصفحك</li>
        <li>إبقائك مسجّل الدخول خلال جلستك</li>
        <li>تذكّر تفضيل اللغة الخاص بك (عربي/إنجليزي)</li>
        <li>جمع بيانات تحليلية مجهولة الهوية حول استخدام الموقع</li>
      </ul>
      <p>
        يمكنك التحكم بملفات تعريف الارتباط أو تعطيلها من إعدادات المتصفح الخاص بك. تعطيل ملفات تعريف
        الارتباط الأساسية قد يؤثر على بعض الميزات مثل سلة التسوق أو تسجيل الدخول.
      </p>

      <h2>٤. مشاركة المعلومات</h2>
      <p>نقوم بمشاركة المعلومات الشخصية فقط في الحالات المحدودة التالية:</p>
      <ul>
        <li>
          <strong>التوصيل:</strong> مع الشخص أو الفريق المسؤول عن تجهيز وتوصيل طلبك، وبالقدر اللازم
          لإتمام عملية التوصيل.
        </li>
        <li>
          <strong>Google:</strong> في حال موافقتك على ملفات تعريف الارتباط الاختيارية، تتلقى خدمة
          Google Analytics بيانات استخدام مجمّعة (انظر القسم ١)؛ وفي حال تسجيل الدخول عبر Google، تعمل
          Google كمزوّد لهويتك. تعالج Google هذه البيانات وفق سياسة الخصوصية الخاصة بها.
        </li>
        <li>
          <strong>المتطلبات القانونية:</strong> في حال طلب ذلك بموجب القانون أو التنظيمات أو طلب
          قانوني صادر عن السلطات اللبنانية المختصة.
        </li>
      </ul>
      <p>
        نحن لا نبيع أو نؤجّر أو نتاجر بمعلوماتك الشخصية مع أطراف ثالثة لأغراضها التسويقية الخاصة.
      </p>

      <h2>٥. الاحتفاظ بالبيانات</h2>
      <p>نحتفظ بالمعلومات الشخصية للمدة اللازمة من أجل:</p>
      <ul>
        <li>تحقيق الغرض الذي جُمِعت من أجله (مثل إتمام الطلب ومتابعته)</li>
        <li>الامتثال للالتزامات القانونية أو الضريبية أو المحاسبية</li>
        <li>تسوية النزاعات أو تطبيق اتفاقياتنا</li>
      </ul>
      <p>
        عند عدم الحاجة إلى المعلومات لهذه الأغراض، نتخذ خطوات معقولة لحذفها أو إخفاء هويتها.
      </p>

      <h2>٦. أمن البيانات</h2>
      <p>
        نطبّق تدابير تقنية وتنظيمية معقولة لحماية معلوماتك الشخصية، بما في ذلك تخزين آمن لكلمات المرور
        وممارسات مصادقة موثوقة للحسابات المسجّلة. مع ذلك، لا توجد طريقة نقل أو تخزين عبر الإنترنت آمنة
        بشكل كامل، ولا يمكننا ضمان الأمان المطلق.
      </p>

      <h2>٧. حقوقك</h2>
      <p>بموجب قانون حماية البيانات اللبناني المعمول به، قد يكون لديك الحق في:</p>
      <ul>
        <li>الاطلاع على المعلومات الشخصية التي نحتفظ بها عنك</li>
        <li>طلب تصحيح المعلومات غير الدقيقة</li>
        <li>طلب حذف حسابك والمعلومات الشخصية المرتبطة به</li>
        <li>سحب موافقتك على الاستخدامات الاختيارية للبيانات (مثل إنشاء حساب)، حيثما ينطبق ذلك</li>
      </ul>
      <p>لممارسة هذه الحقوق، يرجى التواصل معنا عبر التفاصيل الواردة في القسم ٩.</p>

      <h2>٨. معلومات الأطفال</h2>
      <p>
        الموقع غير موجّه للأطفال، ولا نقوم عن علم بجمع معلومات شخصية مباشرة من الأطفال. من المتوقع أن
        تتم عمليات شراء منتجات الأطفال (مثل بيجامات الأطفال) من قِبل أحد الوالدين أو الوصي، والذي
        يتحمل مسؤولية معلومات الحساب والطلب المقدّمة.
      </p>

      <h2>٩. تواصل معنا</h2>
      <p>
        إذا كانت لديك أسئلة حول سياسة الخصوصية هذه أو ترغب بممارسة حقوقك، يرجى التواصل معنا عبر:
      </p>
      <ContactBlock brand={brand} contact={contact} lang="ar" />

      <h2>١٠. التعديلات على هذه السياسة</h2>
      <p>
        قد نقوم بتحديث سياسة الخصوصية هذه من وقت لآخر، على سبيل المثال عند إضافة ميزات جديدة مثل الدفع
        الإلكتروني. سيتم نشر أي تعديلات على هذه الصفحة مع تحديث تاريخ «آخر تحديث». ويُعتبر استمرارك في
        استخدام الموقع بعد نشر التعديلات موافقة منك على السياسة المحدّثة.
      </p>
    </>
  );
}

/** The contact details in Section 9 — email and phone come from the owner's
 *  site settings (/admin/settings → Brand & contact); each line is shown only
 *  when that value is set. */
function ContactBlock({
  brand,
  contact,
  lang,
}: {
  brand: string;
  contact: Contact;
  lang: 'en' | 'ar';
}) {
  const ar = lang === 'ar';
  const email = emailNode(contact.email);
  const phone = phoneNode(contact.phone);
  const handle = '@as_alistore';

  return (
    <p>
      <strong>{brand}</strong>
      {email && (
        <>
          <br />
          {ar ? 'البريد الإلكتروني: ' : 'Email: '}
          {email}
        </>
      )}
      {phone && (
        <>
          <br />
          {ar ? 'الهاتف: ' : 'Phone: '}
          {phone}
        </>
      )}
      <br />
      {ar ? 'إنستغرام: ' : 'Instagram: '}
      <a href={contact.instagramUrl} target="_blank" rel="noreferrer noopener">
        {handle}
      </a>
      {!email && !phone && (
        <>
          <br />
          {ar
            ? 'ولمزيد من تفاصيل التواصل، يرجى مراجعة تذييل الموقع.'
            : 'For additional contact details, please see the site footer.'}
        </>
      )}
    </p>
  );
}
