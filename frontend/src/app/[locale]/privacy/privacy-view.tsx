'use client';

import type { ReactNode } from 'react';
import { useSettings } from '@/hooks/use-settings';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';

const LAST_UPDATED_EN = '7 September 2026';
const LAST_UPDATED_AR = '7 سبتمبر 2026';

export function PrivacyView({ locale }: { locale: 'en' | 'ar' }) {
  const { data: settings } = useSettings();
  const ar = locale === 'ar';
  const brand = ar
    ? settings?.brandNameAr || DEFAULT_BRAND_NAME_AR
    : settings?.brandNameEn || DEFAULT_BRAND_NAME_EN;
  const contactEmail = settings?.contactEmail || null;

  return (
    <div className="container section" style={{ maxWidth: '44rem' }}>
      <article className="prose" dir={ar ? 'rtl' : 'ltr'} style={{ maxWidth: 'none' }}>
        {ar ? (
          <ArabicPrivacy brand={brand} contactEmail={contactEmail} />
        ) : (
          <EnglishPrivacy brand={brand} contactEmail={contactEmail} />
        )}
      </article>
    </div>
  );
}

function contactNode(contactEmail: string | null, fallback: string): ReactNode {
  return contactEmail ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : <>{fallback}</>;
}

function EnglishPrivacy({ brand, contactEmail }: { brand: string; contactEmail: string | null }) {
  const contact = contactNode(contactEmail, 'the contact details shown in our site footer');
  return (
    <>
      <h1>Privacy Policy — {brand}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>Last updated: {LAST_UPDATED_EN}</p>

      <p>
        This Privacy Policy explains how {brand} (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;)
        collects, uses, and protects your personal information when you use our website and services.
      </p>

      <h2>1. Information We Collect</h2>
      <p>
        <strong>Account information.</strong> When you register, we collect your name, email address,
        and password (see Section 4 on how passwords are stored). Email verification is required
        before you can sign in. You may optionally add a phone number in your account settings.
      </p>
      <p>
        <strong>Delivery information.</strong> To fulfil Cash on Delivery orders we collect a delivery
        address — phone number, street address, city, delivery region, and optionally an area and
        delivery notes. The recipient name defaults to your account name. Signed-in shoppers may
        store multiple addresses and edit or remove them at any time from account settings.
      </p>
      <p>
        <strong>Guest checkout.</strong> You can order without an account. In that case we still
        collect the delivery details above plus a contact email, we verify that email with a
        one-time code, and we store the resulting order. A short-lived cookie holds your cart before
        you check out, and your confirmation email contains a private link (and an order-number +
        contact lookup) so you can track that order later.
      </p>
      <p>
        <strong>Order and shopping data.</strong> We keep a record of items in your cart, products
        you favourite/wishlist (stored on our servers when signed in; in your browser only when
        not), and your order history — items purchased, prices, delivery snapshot, and order status.
      </p>
      <p>
        <strong>Technical and log data.</strong> We automatically collect your IP address,
        browser/device information (user-agent), and timestamps, and use them to: keep the service
        available and secure, apply rate limits, detect suspicious login activity, run fraud/abuse
        checks at checkout (including matching an order&apos;s phone, email or IP against a block-list
        and flagging unusually rapid ordering for staff review), and maintain audit logs of
        account-sensitive actions (sign-ins, password changes, administrative actions).
      </p>
      <p>
        <strong>Cookies.</strong> We use:
      </p>
      <ul>
        <li>
          <strong>Strictly necessary cookies</strong> — an authentication cookie to keep you signed
          in (HttpOnly), a security cookie for cross-site-request-forgery protection, and a guest
          cart-session cookie. The site cannot function without these, so they are not subject to
          the choice below.
        </li>
        <li>
          <strong>Analytics cookies (Google Analytics 4)</strong> — set only if you choose
          &quot;Accept All&quot; in our cookie banner and analytics is configured for this store.
          Google Analytics then sets its own cookies (e.g. <code>_ga</code>) to measure aggregate,
          non-identifying usage. Choosing &quot;Necessary Only&quot; leaves them off, and if
          analytics is not configured none are set regardless.
        </li>
        <li>
          <strong>hCaptcha</strong> — on the checkout email-verification step we load hCaptcha, an
          anti-bot service, which may set its own cookies and process your interaction and IP to
          tell humans from automated abuse.
        </li>
      </ul>
      <p style={{ color: 'var(--color-text-muted)' }}>
        We do not use advertising or cross-site tracking cookies. On your first visit a banner lets
        you choose &quot;Accept All&quot; or &quot;Necessary Only&quot;; you can change that choice
        at any time from &quot;Cookie preferences&quot; in the site footer.
      </p>

      <h2>2. How We Use Your Information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>create and manage your account;</li>
        <li>process, deliver, and let you track your Cash on Delivery orders;</li>
        <li>
          communicate with you about your account, orders, or security (email verification, checkout
          verification codes, password reset, order-status and cancellation notifications);
        </li>
        <li>keep the platform secure — fraud and abuse prevention, rate limiting, audit logging;</li>
        <li>understand aggregate usage so we can improve the store.</li>
      </ul>
      <p>
        We do not sell your personal information to third parties, and we do not share it for
        third-party advertising.
      </p>

      <h2>3. Payment Information</h2>
      <p>
        We currently accept <strong>Cash on Delivery only</strong>. We do not collect, process, or
        store any card or online-payment information. If online payment is added in future, this
        section will be updated with the relevant payment-processor and data-handling disclosures.
      </p>

      <h2>4. How We Protect Your Information</h2>
      <p>
        We take reasonable technical and organisational measures to protect your personal
        information. Passwords are never stored in a readable form. Sign-in sessions and
        account-sensitive actions are protected using established security practices, and
        administrative access is limited to authorised staff and monitored.
      </p>
      <p>
        No method of transmission over the internet or method of electronic storage is completely
        secure, so we cannot guarantee absolute security.
      </p>

      <h2>5. Email Communications</h2>
      <p>
        We send <strong>transactional emails only</strong> — account verification, checkout
        verification codes, password reset, order confirmation (which includes a tracking link), and
        order status/cancellation notices. We do not send marketing or promotional emails, and we
        would not do so without your separate, explicit opt-in (with an unsubscribe option).
      </p>

      <h2>6. Third Parties Who Process Data For Us</h2>
      <p>We rely on a small number of service providers who process data only on our behalf:</p>
      <ul>
        <li>
          <strong>Email delivery provider</strong> — sends the transactional emails above; receives
          the recipient address and message content.
        </li>
        <li>
          <strong>hCaptcha</strong> — bot protection on the checkout verification step.
        </li>
        <li>
          <strong>Google Analytics</strong> — aggregate usage analytics, when enabled for this store.
        </li>
        <li>
          <strong>Image hosting / CDN</strong> — serves product images; does not receive your
          personal information.
        </li>
      </ul>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Some of these providers may process data on servers outside your country.
      </p>

      <h2>7. Data Retention</h2>
      <p>
        We retain your account and order information for as long as your account is active and for
        as long as needed to fulfil orders, comply with legal or tax obligations, resolve disputes,
        and enforce our agreements. Order records in particular may be kept for several years for
        accounting purposes. We do not currently run automatic deletion; specific retention periods
        can be provided on request.
      </p>

      <h2>8. Your Rights</h2>
      <p>You may:</p>
      <ul>
        <li>
          access and update your name, phone number, and delivery addresses at any time from your
          account settings, and change your password there;
        </li>
        <li>
          request deletion of your account and associated personal data by contacting us at {contact}{' '}
          — account deletion is handled manually by our team (there is no self-service delete yet),
          subject to records we must keep for legal or tax reasons;
        </li>
        <li>request a copy of the personal data we hold about you by contacting us at {contact}.</li>
      </ul>

      <h2>9. Children&apos;s Privacy</h2>
      <p>
        Our services are not directed to children under 16, and we do not knowingly collect personal
        information from children. We sell children&apos;s clothing on the assumption that a parent
        or guardian is the account holder and purchaser. If you believe a child has provided us
        personal information, contact us and we will delete it.
      </p>

      <h2>10. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will post the updated policy on this
        page with a new &quot;Last updated&quot; date, and for significant changes we will take
        reasonable steps to notify you.
      </p>

      <h2>11. Contact</h2>
      <p>For any privacy question or request, contact us at {contact}.</p>
    </>
  );
}

function ArabicPrivacy({ brand, contactEmail }: { brand: string; contactEmail: string | null }) {
  const contact = contactNode(contactEmail, 'تفاصيل التواصل الموضّحة في تذييل الموقع');
  return (
    <>
      <h1>سياسة الخصوصية — {brand}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>آخر تحديث: {LAST_UPDATED_AR}</p>

      <p>
        توضّح سياسة الخصوصية هذه كيف يقوم {brand} («نحن»، «لنا») بجمع معلوماتك الشخصية واستخدامها
        وحمايتها عند استخدامك لموقعنا وخدماتنا.
      </p>

      <h2>١. المعلومات التي نجمعها</h2>
      <p>
        <strong>معلومات الحساب.</strong> عند التسجيل، نجمع اسمك وبريدك الإلكتروني وكلمة المرور (راجع
        القسم ٤ لمعرفة كيفية تخزين كلمات المرور). ويلزم تأكيد البريد الإلكتروني قبل أن تتمكّن من تسجيل
        الدخول. ويمكنك اختياريًا إضافة رقم هاتف من إعدادات حسابك.
      </p>
      <p>
        <strong>معلومات التوصيل.</strong> لتنفيذ طلبات الدفع عند الاستلام، نجمع عنوان التوصيل — رقم
        الهاتف وعنوان الشارع والمدينة ومنطقة التوصيل، واختياريًا المنطقة وملاحظات التوصيل. ويكون اسم
        المستلِم افتراضيًا هو اسم حسابك. ويمكن للمتسوّقين المسجّلين حفظ عدّة عناوين وتعديلها أو حذفها في
        أي وقت من إعدادات الحساب.
      </p>
      <p>
        <strong>الشراء كضيف.</strong> يمكنك الطلب دون إنشاء حساب. في هذه الحالة نجمع تفاصيل التوصيل
        أعلاه بالإضافة إلى بريد إلكتروني للتواصل، ونتحقّق منه عبر رمز لمرّة واحدة، ونحتفظ بالطلب الناتج.
        ويحفظ ملف تعريف ارتباط قصير الأمد سلّتك قبل إتمام الطلب، ويحتوي بريد التأكيد على رابط خاص
        (وإمكانية البحث برقم الطلب وبيانات التواصل) لتتمكّن من تتبّع الطلب لاحقًا.
      </p>
      <p>
        <strong>بيانات الطلبات والتسوّق.</strong> نحتفظ بسجلّ للعناصر الموجودة في سلّتك، والمنتجات
        التي تضيفها إلى المفضّلة/قائمة الرغبات (تُحفظ على خوادمنا عند تسجيل الدخول، وفي متصفّحك فقط
        بخلاف ذلك)، وسجلّ طلباتك — العناصر المشتراة والأسعار ولقطة بيانات التوصيل وحالة الطلب.
      </p>
      <p>
        <strong>البيانات الفنية وسجلّات الدخول.</strong> نجمع تلقائيًا عنوان بروتوكول الإنترنت (IP)
        الخاص بك، ومعلومات المتصفّح/الجهاز (وكيل المستخدم)، والطوابع الزمنية، ونستخدمها من أجل: الحفاظ
        على توافر الخدمة وأمانها، وتطبيق حدود المعدّل، واكتشاف نشاط تسجيل الدخول المشبوه، وإجراء فحوصات
        مكافحة الاحتيال/إساءة الاستخدام عند إتمام الطلب (بما في ذلك مطابقة هاتف الطلب أو بريده
        الإلكتروني أو عنوان الـ IP مع قائمة حظر، ووسم الطلبات المتكرّرة بسرعة غير معتادة لمراجعتها من
        قِبل فريقنا)، والاحتفاظ بسجلّات تدقيق للإجراءات الحسّاسة المتعلّقة بالحساب (تسجيلات الدخول
        وتغييرات كلمة المرور والإجراءات الإدارية).
      </p>
      <p>
        <strong>ملفات تعريف الارتباط (الكوكيز).</strong> نستخدم:
      </p>
      <ul>
        <li>
          <strong>ملفات ضرورية للغاية</strong> — ملف مصادقة لإبقائك مسجّلاً للدخول (HttpOnly)، وملف
          أمان للحماية من تزوير الطلبات عبر المواقع، وملف جلسة سلّة للضيوف. ولا يمكن للموقع العمل
          بدونها، لذا فهي غير خاضعة للاختيار أدناه.
        </li>
        <li>
          <strong>ملفات تحليلات (Google Analytics 4)</strong> — لا تُوضَع إلا إذا اخترت «قبول الكل»
          في شريط ملفات تعريف الارتباط وكانت التحليلات مُهيّأة لهذا المتجر. عندها تضع Google Analytics
          ملفاتها الخاصة (مثل <code>_ga</code>) لقياس الاستخدام الإجمالي غير المُعرِّف. واختيار
          «الضرورية فقط» يُبقيها متوقّفة، وإذا لم تكن التحليلات مُهيّأة فلا تُوضَع أي منها على أي حال.
        </li>
        <li>
          <strong>hCaptcha</strong> — في خطوة تأكيد البريد الإلكتروني عند إتمام الطلب نحمّل hCaptcha،
          وهي خدمة لمكافحة الروبوتات، وقد تضع ملفاتها الخاصة وتعالج تفاعلك وعنوان الـ IP للتمييز بين
          البشر وإساءة الاستخدام الآلية.
        </li>
      </ul>
      <p style={{ color: 'var(--color-text-muted)' }}>
        لا نستخدم ملفات تعريف ارتباط للإعلانات أو للتتبّع عبر المواقع. وفي زيارتك الأولى يتيح لك شريط
        الاختيار بين «قبول الكل» و«الضرورية فقط»، ويمكنك تغيير هذا الاختيار في أي وقت من «تفضيلات ملفات
        تعريف الارتباط» في تذييل الموقع.
      </p>

      <h2>٢. كيف نستخدم معلوماتك</h2>
      <p>نستخدم معلوماتك من أجل:</p>
      <ul>
        <li>إنشاء حسابك وإدارته؛</li>
        <li>معالجة طلبات الدفع عند الاستلام وتوصيلها وتمكينك من تتبّعها؛</li>
        <li>
          التواصل معك بشأن حسابك أو طلباتك أو الأمان (تأكيد البريد الإلكتروني، ورموز التحقّق عند إتمام
          الطلب، وإعادة تعيين كلمة المرور، وإشعارات حالة الطلب وإلغائه)؛
        </li>
        <li>
          الحفاظ على أمان المنصّة — منع الاحتيال وإساءة الاستخدام، وتحديد المعدّل، وسجلّات التدقيق؛
        </li>
        <li>فهم الاستخدام الإجمالي لتحسين المتجر.</li>
      </ul>
      <p>
        لا نبيع معلوماتك الشخصية لأطراف ثالثة، ولا نشاركها لأغراض الإعلان الخاص بأطراف ثالثة.
      </p>

      <h2>٣. معلومات الدفع</h2>
      <p>
        نقبل حاليًا <strong>الدفع عند الاستلام فقط</strong>. ولا نجمع أو نعالج أو نخزّن أي معلومات عن
        البطاقات أو الدفع عبر الإنترنت. وإذا أُضيف الدفع عبر الإنترنت مستقبلاً، فسيتم تحديث هذا القسم
        بالإفصاحات المتعلّقة بمزوّد الدفع ومعالجة البيانات.
      </p>

      <h2>٤. كيف نحمي معلوماتك</h2>
      <p>
        نتّخذ تدابير فنية وتنظيمية معقولة لحماية معلوماتك الشخصية. ولا تُخزَّن كلمات المرور بأي صيغة
        قابلة للقراءة. وتُحمى جلسات تسجيل الدخول والإجراءات الحسّاسة المتعلّقة بالحساب باستخدام ممارسات
        أمنية معتمدة، ويقتصر الوصول الإداري على الموظّفين المصرّح لهم ويخضع للمراقبة.
      </p>
      <p>
        لا توجد وسيلة نقل عبر الإنترنت أو وسيلة تخزين إلكتروني آمنة بنسبة ١٠٠٪، لذا لا يمكننا ضمان
        الأمان المطلق.
      </p>

      <h2>٥. المراسلات عبر البريد الإلكتروني</h2>
      <p>
        نرسل <strong>رسائل بريد إلكتروني تعامُلية فقط</strong> — تأكيد الحساب، ورموز التحقّق عند إتمام
        الطلب، وإعادة تعيين كلمة المرور، وتأكيد الطلب (الذي يتضمّن رابط تتبّع)، وإشعارات حالة
        الطلب/إلغائه. ولا نرسل رسائل تسويقية أو ترويجية، ولن نفعل ذلك دون موافقتك المنفصلة والصريحة
        (مع إمكانية إلغاء الاشتراك).
      </p>

      <h2>٦. الأطراف الثالثة التي تعالج البيانات نيابةً عنّا</h2>
      <p>نعتمد على عدد محدود من مزوّدي الخدمات الذين يعالجون البيانات نيابةً عنّا فقط:</p>
      <ul>
        <li>
          <strong>مزوّد إرسال البريد الإلكتروني</strong> — يرسل الرسائل التعامُلية أعلاه؛ ويتلقّى
          عنوان المستلِم ومحتوى الرسالة.
        </li>
        <li>
          <strong>hCaptcha</strong> — الحماية من الروبوتات في خطوة التحقّق عند إتمام الطلب.
        </li>
        <li>
          <strong>Google Analytics</strong> — تحليلات استخدام إجمالية، عند تفعيلها لهذا المتجر.
        </li>
        <li>
          <strong>استضافة الصور / شبكة توصيل المحتوى (CDN)</strong> — تقدّم صور المنتجات؛ ولا تتلقّى
          معلوماتك الشخصية.
        </li>
      </ul>
      <p style={{ color: 'var(--color-text-muted)' }}>
        قد يعالج بعض هؤلاء المزوّدين البيانات على خوادم خارج بلدك.
      </p>

      <h2>٧. الاحتفاظ بالبيانات</h2>
      <p>
        نحتفظ بمعلومات حسابك وطلباتك طالما كان حسابك نشطًا وطوال المدّة اللازمة لتنفيذ الطلبات،
        والامتثال للالتزامات القانونية أو الضريبية، وحلّ النزاعات، وإنفاذ اتفاقياتنا. وقد يُحتفَظ
        بسجلّات الطلبات على وجه الخصوص لعدّة سنوات لأغراض محاسبية. ولا نُجري حاليًا حذفًا تلقائيًا؛
        ويمكن تزويدك بمدد احتفاظ محدّدة عند الطلب.
      </p>

      <h2>٨. حقوقك</h2>
      <p>يمكنك:</p>
      <ul>
        <li>
          الوصول إلى اسمك ورقم هاتفك وعناوين التوصيل الخاصة بك وتحديثها في أي وقت من إعدادات حسابك،
          وتغيير كلمة المرور من هناك؛
        </li>
        <li>
          طلب حذف حسابك والبيانات الشخصية المرتبطة به بالتواصل معنا عبر {contact} — يتولّى فريقنا حذف
          الحساب يدويًا (لا توجد ميزة حذف ذاتي بعد)، مع مراعاة السجلّات التي يجب علينا الاحتفاظ بها
          لأسباب قانونية أو ضريبية؛
        </li>
        <li>طلب نسخة من البيانات الشخصية التي نحتفظ بها عنك بالتواصل معنا عبر {contact}.</li>
      </ul>

      <h2>٩. خصوصية الأطفال</h2>
      <p>
        خدماتنا ليست موجّهة للأطفال دون سنّ ١٦ عامًا، ولا نجمع عن قصد معلومات شخصية من الأطفال. ونبيع
        ملابس الأطفال على افتراض أن أحد الوالدين أو الوصيّ هو صاحب الحساب والمشتري. وإذا كنت تعتقد أن
        طفلاً قدّم لنا معلومات شخصية، فتواصل معنا وسنحذفها.
      </p>

      <h2>١٠. التغييرات على هذه السياسة</h2>
      <p>
        قد نُحدِّث سياسة الخصوصية هذه من وقت لآخر. وسننشر السياسة المحدَّثة على هذه الصفحة مع تاريخ
        «آخر تحديث» جديد، وبالنسبة للتغييرات الجوهرية سنتّخذ خطوات معقولة لإخطارك.
      </p>

      <h2>١١. التواصل</h2>
      <p>لأي سؤال أو طلب يتعلّق بالخصوصية، تواصل معنا عبر {contact}.</p>
    </>
  );
}
