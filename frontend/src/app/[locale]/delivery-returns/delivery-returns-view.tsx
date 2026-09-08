'use client';

import { useSettings } from '@/hooks/use-settings';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';

const LAST_UPDATED_EN = '7 September 2026';
const LAST_UPDATED_AR = '7 سبتمبر 2026';
const RETURN_WINDOW_DAYS = 7;

export function DeliveryReturnsView({ locale }: { locale: 'en' | 'ar' }) {
  const { data: settings } = useSettings();
  const ar = locale === 'ar';
  const brand = ar
    ? settings?.brandNameAr || DEFAULT_BRAND_NAME_AR
    : settings?.brandNameEn || DEFAULT_BRAND_NAME_EN;

  const channels: string[] = [];
  if (settings?.contactEmail) channels.push(settings.contactEmail);
  if (settings?.contactPhone) channels.push(settings.contactPhone);
  const contactLine =
    channels.length > 0
      ? channels.join(' · ')
      : ar
        ? 'تفاصيل التواصل الموضّحة في تذييل الموقع'
        : 'the contact details shown in our site footer';

  return (
    <div className="container section" style={{ maxWidth: '44rem' }}>
      <article className="prose" dir={ar ? 'rtl' : 'ltr'} style={{ maxWidth: 'none' }}>
        {ar ? (
          <ArabicDeliveryReturns brand={brand} contactLine={contactLine} />
        ) : (
          <EnglishDeliveryReturns brand={brand} contactLine={contactLine} />
        )}
      </article>
    </div>
  );
}

function EnglishDeliveryReturns({ brand, contactLine }: { brand: string; contactLine: string }) {
  return (
    <>
      <h1>Delivery &amp; Returns — {brand}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>Last updated: {LAST_UPDATED_EN}</p>

      <h2>Delivery</h2>
      <ul>
        <li>
          We currently offer <strong>Cash on Delivery only</strong> — no online payment is required
          to place an order. You pay the courier in cash when your order arrives.
        </li>
        <li>Delivery is handled directly by our team and covers all of Lebanon.</li>
        <li>
          Any delivery fee is shown at checkout before you confirm the order. Delivery may be free
          depending on your region or order total.
        </li>
        <li>
          We will contact you by phone to confirm your order and delivery details before dispatch.
        </li>
        <li>Please inspect your order at the time of delivery where possible.</li>
      </ul>

      <h3>Tracking &amp; cancelling an order</h3>
      <ul>
        <li>
          Your order confirmation email includes a private tracking link. If you checked out as a
          guest, you can also look your order up with your order number and the email or phone you
          used.
        </li>
        <li>
          You can cancel an order yourself while it is still pending or confirmed (before it
          ships) — from your account, or from the tracking link. Once an order has shipped it can no
          longer be cancelled online; contact us instead.
        </li>
      </ul>

      <h2>Returns &amp; Exchanges</h2>
      <p>We want you to be happy with your purchase. We accept returns or exchanges when:</p>
      <ul>
        <li>the item has a manufacturing defect or fault; or</li>
        <li>
          the size doesn&apos;t fit — we&apos;ll exchange it for a different size, subject to
          availability.
        </li>
      </ul>

      <h3>Conditions for a return</h3>
      <ul>
        <li>
          The request is made within <strong>{RETURN_WINDOW_DAYS} days</strong> of delivery.
        </li>
        <li>
          Items are unworn, unwashed, and in their original condition, with the original tags and
          packaging attached where applicable.
        </li>
        <li>
          For hygiene reasons, intimates/lingerie and swimwear cannot be returned or exchanged once
          the tags or hygiene seal have been removed — unless the item is faulty.
        </li>
        <li>
          Discounted / sale items are eligible for a size <strong>exchange only</strong> (no cash
          refund), except where the item is faulty.
        </li>
      </ul>

      <h3>How to request a return or exchange</h3>
      <ol>
        <li>
          Contact us at {contactLine} within the return window, including your order number and the
          reason for the return.
        </li>
        <li>
          We&apos;ll confirm whether the item is eligible and arrange for our team to collect it
          from you (or a drop-off, by arrangement).
        </li>
        <li>Once the item is received and inspected, we&apos;ll process your exchange or refund.</li>
      </ol>

      <h3>Refunds</h3>
      <ul>
        <li>
          Because we operate on Cash on Delivery, an approved refund is paid back to you in cash
          when we collect the returned item.
        </li>
        <li>A size exchange is arranged at no extra delivery charge.</li>
        <li>
          If the requested exchange size or item is unavailable, we&apos;ll issue a refund instead.
        </li>
      </ul>

      <h3>Non-returnable items</h3>
      <ul>
        <li>Items damaged through misuse, accident, or normal wear after use.</li>
        <li>
          Intimates/lingerie and swimwear without their original tags or hygiene seal (see above).
        </li>
        <li>Free gifts and promotional items.</li>
      </ul>

      <h2>Contact</h2>
      <p>For any delivery or return question, contact us at {contactLine}.</p>
    </>
  );
}

function ArabicDeliveryReturns({ brand, contactLine }: { brand: string; contactLine: string }) {
  return (
    <>
      <h1>التوصيل والإرجاع — {brand}</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>آخر تحديث: {LAST_UPDATED_AR}</p>

      <h2>التوصيل</h2>
      <ul>
        <li>
          نوفّر حاليًا <strong>الدفع عند الاستلام فقط</strong> — لا يلزم أي دفع عبر الإنترنت لإتمام
          الطلب. تدفع لمندوب التوصيل نقدًا عند وصول طلبك.
        </li>
        <li>يتولّى فريقنا التوصيل مباشرةً، ويشمل جميع مناطق لبنان.</li>
        <li>
          تُعرض أي رسوم توصيل عند إتمام الطلب قبل تأكيده. وقد يكون التوصيل مجانيًا حسب منطقتك أو
          إجمالي طلبك.
        </li>
        <li>سنتواصل معك هاتفيًا لتأكيد طلبك وتفاصيل التوصيل قبل الإرسال.</li>
        <li>يُرجى فحص طلبك عند الاستلام قدر الإمكان.</li>
      </ul>

      <h3>تتبّع الطلب وإلغاؤه</h3>
      <ul>
        <li>
          يتضمّن بريد تأكيد الطلب رابط تتبّع خاصًا. وإذا أتممت الطلب كضيف، يمكنك أيضًا البحث عن طلبك
          برقم الطلب والبريد الإلكتروني أو الهاتف الذي استخدمته.
        </li>
        <li>
          يمكنك إلغاء الطلب بنفسك طالما كان قيد الانتظار أو مؤكَّدًا (قبل إرساله) — من حسابك، أو من
          رابط التتبّع. وبعد إرسال الطلب لا يمكن إلغاؤه عبر الإنترنت؛ تواصل معنا بدلاً من ذلك.
        </li>
      </ul>

      <h2>الإرجاع والاستبدال</h2>
      <p>نريدك أن تكون راضيًا عن مشترياتك. نقبل الإرجاع أو الاستبدال في الحالات التالية:</p>
      <ul>
        <li>وجود عيب أو خلل في التصنيع؛ أو</li>
        <li>عدم ملاءمة المقاس — سنستبدله بمقاس آخر، وذلك حسب التوفّر.</li>
      </ul>

      <h3>شروط الإرجاع</h3>
      <ul>
        <li>
          تقديم الطلب خلال <strong>{RETURN_WINDOW_DAYS} أيام</strong> من تاريخ الاستلام.
        </li>
        <li>
          أن تكون القطع غير مُرتداة وغير مغسولة وبحالتها الأصلية، مع بطاقاتها وعبوتها الأصلية عند
          الاقتضاء.
        </li>
        <li>
          لأسباب صحية، لا يمكن إرجاع أو استبدال الملابس الداخلية/اللانجري وملابس السباحة بعد إزالة
          البطاقات أو الختم الصحي — إلا إذا كانت القطعة معيبة.
        </li>
        <li>
          القطع المخفَّضة/قطع التخفيضات مؤهَّلة <strong>للاستبدال بمقاس آخر فقط</strong> (دون استرداد
          نقدي)، إلا في حال كانت القطعة معيبة.
        </li>
      </ul>

      <h3>كيفية طلب الإرجاع أو الاستبدال</h3>
      <ol>
        <li>
          تواصل معنا عبر {contactLine} خلال مدّة الإرجاع، مع ذكر رقم طلبك وسبب الإرجاع.
        </li>
        <li>
          سنؤكّد ما إذا كانت القطعة مؤهَّلة، ونرتّب لفريقنا استلامها منك (أو تسليمها في المتجر،
          بالاتفاق).
        </li>
        <li>بعد استلام القطعة وفحصها، سنعالج الاستبدال أو الاسترداد.</li>
      </ol>

      <h3>الاسترداد</h3>
      <ul>
        <li>
          بما أننا نعمل بنظام الدفع عند الاستلام، يُعاد إليك المبلغ المسترَد المعتمَد نقدًا عند
          استلامنا للقطعة المُرجَعة.
        </li>
        <li>يُرتَّب استبدال المقاس دون أي رسوم توصيل إضافية.</li>
        <li>
          إذا لم يتوفّر المقاس أو القطعة المطلوبة للاستبدال، فسنُصدر استردادًا بدلاً من ذلك.
        </li>
      </ul>

      <h3>قطع غير قابلة للإرجاع</h3>
      <ul>
        <li>القطع المتضرّرة بسبب سوء الاستخدام أو الحوادث أو الاستهلاك الطبيعي بعد الاستخدام.</li>
        <li>
          الملابس الداخلية/اللانجري وملابس السباحة دون بطاقاتها الأصلية أو ختمها الصحي (انظر أعلاه).
        </li>
        <li>الهدايا المجانية والقطع الترويجية.</li>
      </ul>

      <h2>التواصل</h2>
      <p>لأي سؤال يتعلّق بالتوصيل أو الإرجاع، تواصل معنا عبر {contactLine}.</p>
    </>
  );
}
