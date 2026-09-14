'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, ShoppingBag } from 'lucide-react';
import { Alert, Button, EmptyState, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { HCaptchaWidget, type HCaptchaHandle } from '@/components/checkout/hcaptcha-widget';
import { useCart } from '@/hooks/use-cart';
import { useAuth } from '@/hooks/use-auth';
import { useAddresses, useProfile } from '@/hooks/use-account';
import { useCheckout, useDeliveryQuote } from '@/hooks/use-orders';
import { useRequestCheckoutOtp, useVerifyCheckoutOtp } from '@/hooks/use-checkout-otp';
import { useDeliveryRegionOptions } from '@/lib/use-delivery-region-options';
import { regionLabel } from '@/lib/regions';
import { formatCurrency } from '@/lib/format';
import { isApiError, discountsApi } from '@/lib/api';
import type { CheckoutBody, Order, ResolvedCoupon } from '@/lib/types';

/** Client-side mirror of the server's couponAmountOff — for the summary line. */
function couponAmountOff(coupon: ResolvedCoupon, subtotal: number): number {
  const off = coupon.type === 'PERCENT' ? (subtotal * coupon.value) / 100 : coupon.value;
  return Math.round(Math.min(Math.max(0, off), subtotal) * 100) / 100;
}

type Locale = 'en' | 'ar';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Gates "Place order" behind an email-OTP challenge — required for a guest,
 * or a logged-in shopper whose account email isn't verified yet (see
 * order.service.ts checkout(); skipped entirely for an already-verified
 * logged-in shopper, who never renders this). Self-contained: manages its
 * own request → code-entry → verified steps and reports the resulting
 * ticket up via `onVerified`.
 */
function EmailOtpStep({
  locale,
  email,
  verified,
  onVerified,
  disabled,
}: {
  locale: Locale;
  email: string;
  verified: boolean;
  onVerified: (token: string) => void;
  disabled?: boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const captchaRef = useRef<HCaptchaHandle>(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');

  const requestOtp = useRequestCheckoutOtp();
  const verifyOtp = useVerifyCheckoutOtp();

  const validEmail = EMAIL_RE.test(email);

  const handleSend = async () => {
    if (!captchaToken || !validEmail) return;
    try {
      await requestOtp.mutateAsync({ email, captchaToken });
      setSent(true);
      setCode('');
    } catch {
      /* surfaced below */
    } finally {
      captchaRef.current?.reset();
      setCaptchaToken('');
    }
  };

  const handleVerify = async () => {
    try {
      const token = await verifyOtp.mutateAsync({ email, code });
      onVerified(token);
    } catch {
      /* surfaced below */
    }
  };

  if (verified) {
    return (
      <Alert tone="success">{t(`Email verified: ${email}`, `تم تأكيد البريد الإلكتروني: ${email}`)}</Alert>
    );
  }

  return (
    <div className="stack" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
      <p className="admin-form__hint" style={{ margin: 0 }}>
        {t('Verify your email to place this order.', 'أكّد بريدك الإلكتروني لإتمام الطلب.')}
      </p>

      {!sent ? (
        <>
          <HCaptchaWidget ref={captchaRef} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />
          {requestOtp.isError && (
            <Alert tone="danger">
              {isApiError(requestOtp.error)
                ? requestOtp.error.message
                : t('Could not send the code. Try again.', 'تعذّر إرسال الرمز. حاول مرة أخرى.')}
            </Alert>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            loading={requestOtp.isPending}
            disabled={!captchaToken || !validEmail || disabled}
          >
            {t('Send verification code', 'إرسال رمز التحقق')}
          </Button>
        </>
      ) : (
        <>
          <Field label={t('Verification code', 'رمز التحقق')}>
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={disabled}
              />
            )}
          </Field>
          {verifyOtp.isError && (
            <Alert tone="danger">{t('Invalid or expired code.', 'رمز غير صالح أو منتهي الصلاحية.')}</Alert>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Button type="button" size="sm" onClick={handleVerify} loading={verifyOtp.isPending} disabled={code.length !== 6 || disabled}>
              {t('Verify', 'تحقّق')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSent(false)} disabled={disabled}>
              {t('Use a different code', 'استخدام رمز مختلف')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Everything the address form can hold; `deliveryName` / `guestEmail` are only
// asked of guests (a signed-in shopper's name + email come from their profile).
interface FormValues {
  deliveryName?: string;
  guestEmail?: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryRegion: string;
  deliveryArea?: string;
  deliveryNotes?: string;
}

export function CheckoutView({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const money = (n: number) => formatCurrency(n, locale);

  const cart = useCart();
  const { isAuthenticated } = useAuth();
  const guest = !isAuthenticated;
  const profile = useProfile({ enabled: isAuthenticated });
  const addresses = useAddresses({ enabled: isAuthenticated });

  const checkout = useCheckout();

  // The built-in governorates plus any custom zone the admin has priced.
  const regionOptions = useDeliveryRegionOptions(locale);

  const savedAddresses = useMemo(() => addresses.data ?? [], [addresses.data]);
  const hasSaved = isAuthenticated && savedAddresses.length > 0;

  // Signed-in with a saved address ⇒ pick one; otherwise fill the form.
  // "Add a new address" flips a shopper with saved addresses into the form.
  const [addingNew, setAddingNew] = useState(false);
  const showPicker = hasSaved && !addingNew; // otherwise the address form shows

  const defaultAddressId =
    savedAddresses.find((a) => a.isDefault)?.id ?? savedAddresses[0]?.id ?? '';
  const [pickedId, setPickedId] = useState('');
  const selectedId = pickedId || defaultAddressId;
  const selectedAddress = savedAddresses.find((a) => a.id === selectedId);

  // A saved address created before governorates existed has no `region`; ask
  // for one inline so the fee can still be quoted.
  const [pickRegion, setPickRegion] = useState('');
  const [pickNotes, setPickNotes] = useState('');

  const [placed, setPlaced] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email OTP — required for a guest, or a logged-in shopper whose account
  // email isn't verified yet; skipped entirely for an already-verified
  // logged-in shopper (order.service.ts checkout() enforces the same rule
  // server-side, this is just the UX gate). `verifiedEmail` tracks which
  // address the current token actually covers, so editing the email after
  // verifying correctly un-verifies it again.
  const [emailVerifyToken, setEmailVerifyToken] = useState<string | undefined>();
  const [verifiedEmail, setVerifiedEmail] = useState<string | undefined>();

  // Coupon: the shopper types a code and applies it; we resolve it against the
  // API and show the reduction. The code is also sent at checkout, where the
  // server re-validates and computes the authoritative discount.
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<ResolvedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      setAppliedCoupon(await discountsApi.validateCoupon(code));
    } catch {
      setAppliedCoupon(null);
      setCouponError(t('That code is not valid.', 'هذا الرمز غير صالح.'));
    } finally {
      setCouponBusy(false);
    }
  };
  const clearCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
  };

  const schema = useMemo(() => {
    const base = {
      deliveryPhone: z.string().trim().min(6, t('Enter a valid phone', 'أدخل رقمًا صالحًا')),
      deliveryAddress: z.string().trim().min(3, t('Enter your street address', 'أدخل عنوان الشارع')),
      deliveryCity: z.string().trim().min(1, t('Required', 'مطلوب')),
      deliveryRegion: z.string().trim().min(1, t('Pick a delivery region', 'اختر منطقة التوصيل')),
      deliveryArea: z.string().trim().max(120).optional(),
      deliveryNotes: z.string().trim().max(500).optional(),
    };
    return guest
      ? z.object({
          ...base,
          deliveryName: z.string().trim().min(1, t('Required', 'مطلوب')),
          guestEmail: z.string().trim().email(t('Enter a valid email', 'أدخل بريدًا صالحًا')),
        })
      : z.object(base);
  }, [guest, isAr]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: { deliveryRegion: undefined },
  });

  const formRegion = useWatch({ control, name: 'deliveryRegion' });
  const region: string | null = showPicker
    ? selectedAddress?.region || pickRegion || null
    : formRegion ?? null;

  const quote = useDeliveryQuote(region);
  const subtotal = cart.data?.subtotal ?? 0;
  const deliveryFee = quote.data?.deliveryFee ?? null;
  const couponDiscount = appliedCoupon ? couponAmountOff(appliedCoupon, subtotal) : 0;
  const total = Math.round(((quote.data?.total ?? subtotal) - couponDiscount) * 100) / 100;
  const busy = checkout.isPending;

  const guestEmailWatched = useWatch({ control, name: 'guestEmail' });
  const otpEmail = (guest ? guestEmailWatched : profile.data?.email) ?? '';
  const otpRequired = guest || !profile.data?.emailVerified;
  const otpVerified = !otpRequired || (Boolean(emailVerifyToken) && verifiedEmail === otpEmail);
  const canPlaceOrder = !busy && otpVerified;

  const place = async (body: CheckoutBody) => {
    setError(null);
    try {
      setPlaced(await checkout.mutateAsync({ ...body, expectedSubtotal: subtotal }));
    } catch (e) {
      if (isApiError(e)) {
        if (e.code === 'CONFLICT' && (e.meta as { reason?: string } | undefined)?.reason === 'PRICE_CHANGED') {
          // A price moved since the cart was last fetched — refresh it so the
          // summary (and the expectedSubtotal on the next attempt) reflects
          // reality, rather than repeating the same rejected request.
          await cart.refetch();
          setError(
            t(
              'Prices changed since you added these items. Review your order below and place it again.',
              'تغيّرت الأسعار منذ إضافة هذه العناصر. راجع طلبك أدناه ثم أعد تأكيده.'
            )
          );
          return;
        }
        const detail = e.issues.map((i) => i.message).join(' · ');
        setError(detail || e.message);
      } else {
        setError(t('Something went wrong. Please try again.', 'حدث خطأ ما. حاول مرة أخرى.'));
      }
    }
  };

  const submitForm = handleSubmit((v) =>
    place({
      deliveryName: guest ? v.deliveryName!.trim() : (profile.data?.name ?? '').trim(),
      deliveryPhone: v.deliveryPhone,
      deliveryAddress: v.deliveryAddress,
      deliveryCity: v.deliveryCity,
      deliveryRegion: v.deliveryRegion,
      deliveryArea: v.deliveryArea || undefined,
      deliveryNotes: v.deliveryNotes || undefined,
      ...(guest
        ? { guestEmail: v.guestEmail || undefined }
        : { saveAddress: true, guestEmail: profile.data?.email || undefined }),
      emailVerifyToken,
      couponCode: appliedCoupon?.code,
    })
  );

  const submitPicked = () => {
    const a = selectedAddress;
    if (!a) return setError(t('Choose a delivery address.', 'اختر عنوان التوصيل.'));
    const r = a.region || pickRegion;
    if (!r) return setError(t('Choose a governorate for this address.', 'اختر محافظة لهذا العنوان.'));
    return place({
      addressId: a.id,
      deliveryName: (profile.data?.name ?? a.fullName).trim(),
      deliveryPhone: a.phone,
      deliveryAddress: a.addressLine,
      deliveryCity: a.city,
      deliveryRegion: r,
      deliveryArea: a.area || undefined,
      deliveryNotes: pickNotes.trim() || a.notes || undefined,
      guestEmail: profile.data?.email || undefined,
      emailVerifyToken,
      couponCode: appliedCoupon?.code,
    });
  };

  // ---- confirmation ----
  if (placed) {
    return (
      <div className="container section--tight">
        <EmptyState
          icon={CheckCircle2}
          title={t('Order placed', 'تم تأكيد الطلب')}
          body={
            isAr ? (
              <>
                الطلب <span lang="en">{placed.orderNumber}</span> — الإجمالي{' '}
                <span lang="en">{money(Number(placed.total))}</span>. سنتصل بـ{' '}
                <span lang="en">{placed.deliveryPhone}</span> لتأكيد التوصيل.
              </>
            ) : (
              <>
                Order {placed.orderNumber} — total {money(Number(placed.total))}. We&apos;ll call{' '}
                {placed.deliveryPhone} to confirm delivery.
              </>
            )
          }
          action={
            <Link className="btn btn--primary" href={`/${locale}`}>
              {t('Continue shopping', 'متابعة التسوق')}
            </Link>
          }
        />
      </div>
    );
  }

  const settingUp = cart.isPending || (isAuthenticated && (profile.isPending || addresses.isPending));
  if (settingUp) {
    return (
      <div className="container section--tight stack">
        <Skeleton variant="title" width="40%" />
        <Skeleton variant="block" height="12rem" />
      </div>
    );
  }

  if (cart.isError || !cart.data || cart.data.items.length === 0) {
    return (
      <div className="container section--tight">
        <EmptyState
          icon={ShoppingBag}
          title={t('Your cart is empty', 'سلتك فارغة')}
          body={t('Add something before checking out.', 'أضف منتجًا قبل إتمام الطلب.')}
          action={
            <Link className="btn btn--primary" href={`/${locale}`}>
              {t('Browse the store', 'تصفح المتجر')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container section--tight checkout">
      <h1 style={{ marginBlockStart: 0 }}>{t('Checkout', 'إتمام الطلب')}</h1>

      <div className="checkout__grid">
        {showPicker ? (
          <div className="admin-form">
            <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600, marginBlockEnd: 'var(--space-2)' }}>
                {t('Delivery address', 'عنوان التوصيل')}
              </legend>
              {savedAddresses.map((a) => (
                <label
                  key={a.id}
                  className="checkout__addr"
                  style={{
                    display: 'flex',
                    gap: 'var(--space-3)',
                    alignItems: 'flex-start',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-3)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="checkout-address"
                    value={a.id}
                    checked={selectedId === a.id}
                    onChange={() => setPickedId(a.id)}
                    disabled={busy}
                  />
                  <span>
                    <strong>
                      {a.addressLine}, {a.city}
                      {a.area ? `, ${a.area}` : ''}
                    </strong>
                    <br />
                    <span className="prose" style={{ fontSize: 'var(--fs-sm)' }}>
                      {a.region ? `${regionLabel(a.region, locale)} · ` : ''}
                      {a.phone}
                      {a.isDefault ? ` · ${t('Default', 'افتراضي')}` : ''}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            {selectedAddress && !selectedAddress.region && (
              <Field label={t('Governorate', 'المحافظة')} required>
                {(p) => (
                  <Select
                    {...p}
                    value={pickRegion}
                    onChange={(e) => setPickRegion(e.target.value)}
                    disabled={busy}
                  >
                    <option value="" disabled>
                      {t('Select a governorate', 'اختر محافظة')}
                    </option>
                    {regionOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}

            <Field label={t('Delivery notes (optional)', 'ملاحظات التوصيل (اختياري)')}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={pickNotes}
                  onChange={(e) => setPickNotes(e.target.value)}
                  disabled={busy}
                />
              )}
            </Field>

            {otpRequired && (
              <EmailOtpStep
                locale={locale}
                email={otpEmail}
                verified={otpVerified}
                disabled={busy}
                onVerified={(token) => {
                  setEmailVerifyToken(token);
                  setVerifiedEmail(otpEmail);
                }}
              />
            )}

            <p className="admin-form__hint">{t('Payment: cash on delivery.', 'الدفع: نقدًا عند الاستلام.')}</p>
            {error && <Alert tone="danger">{error}</Alert>}

            <div className="admin-form__actions" style={{ gap: 'var(--space-3)' }}>
              <Button type="button" loading={busy} disabled={!canPlaceOrder} onClick={submitPicked}>
                {t('Place order', 'تأكيد الطلب')}
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setAddingNew(true)}>
                {t('Add a new address', 'إضافة عنوان جديد')}
              </Button>
            </div>
          </div>
        ) : (
          <form className="admin-form" noValidate onSubmit={submitForm}>
            {!guest && (
              <p className="admin-form__hint">
                {hasSaved ? (
                  <button
                    type="button"
                    onClick={() => setAddingNew(false)}
                    style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--color-link)', cursor: 'pointer' }}
                  >
                    {t('← Use a saved address', '← استخدام عنوان محفوظ')}
                  </button>
                ) : (
                  t('This address will be saved to your account for next time.', 'سيتم حفظ هذا العنوان في حسابك للمرة القادمة.')
                )}
              </p>
            )}

            {guest && (
              <div className="admin-form__row">
                <Field label={t('Full name', 'الاسم الكامل')} error={errors.deliveryName?.message} required>
                  {(p) => <Input {...p} {...register('deliveryName')} autoComplete="name" disabled={busy} />}
                </Field>
                <Field label={t('Email', 'البريد الإلكتروني')} error={errors.guestEmail?.message} required>
                  {(p) => <Input {...p} type="email" {...register('guestEmail')} autoComplete="email" disabled={busy} />}
                </Field>
              </div>
            )}

            <Field label={t('Phone', 'الهاتف')} error={errors.deliveryPhone?.message} required>
              {(p) => <Input {...p} type="tel" {...register('deliveryPhone')} autoComplete="tel" disabled={busy} />}
            </Field>

            <Field label={t('Street address', 'عنوان الشارع')} error={errors.deliveryAddress?.message} required>
              {(p) => <Input {...p} {...register('deliveryAddress')} autoComplete="street-address" disabled={busy} />}
            </Field>

            <div className="admin-form__row">
              <Field label={t('City', 'المدينة')} error={errors.deliveryCity?.message} required>
                {(p) => <Input {...p} {...register('deliveryCity')} autoComplete="address-level2" disabled={busy} />}
              </Field>
              <Field label={t('Governorate', 'المحافظة')} error={errors.deliveryRegion?.message} required>
                {(p) => (
                  <Select {...p} {...register('deliveryRegion')} defaultValue="" disabled={busy}>
                    <option value="" disabled>
                      {t('Select a governorate', 'اختر محافظة')}
                    </option>
                    {regionOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            <Field label={t('Area (optional)', 'المنطقة (اختياري)')} error={errors.deliveryArea?.message}>
              {(p) => <Input {...p} {...register('deliveryArea')} disabled={busy} />}
            </Field>

            <Field label={t('Delivery notes (optional)', 'ملاحظات التوصيل (اختياري)')} error={errors.deliveryNotes?.message}>
              {(p) => <Textarea {...p} rows={2} {...register('deliveryNotes')} disabled={busy} />}
            </Field>

            {otpRequired && (
              <EmailOtpStep
                locale={locale}
                email={otpEmail}
                verified={otpVerified}
                disabled={busy}
                onVerified={(token) => {
                  setEmailVerifyToken(token);
                  setVerifiedEmail(otpEmail);
                }}
              />
            )}

            <p className="admin-form__hint">{t('Payment: cash on delivery.', 'الدفع: نقدًا عند الاستلام.')}</p>
            {error && <Alert tone="danger">{error}</Alert>}

            <div className="admin-form__actions">
              <Button type="submit" loading={busy} disabled={!canPlaceOrder}>
                {t('Place order', 'تأكيد الطلب')}
              </Button>
            </div>
          </form>
        )}

        <aside className="checkout__summary card">
          <div className="card__body stack">
            <strong>{t('Order summary', 'ملخص الطلب')}</strong>
            <ul className="checkout__lines">
              {cart.data.items.map((i) => {
                const p = i.variant.product;
                const unit = i.effectivePrice ?? Number(i.variant.price ?? p.price);
                return (
                  <li key={i.id}>
                    <span>
                      {(isAr ? p.nameAr : p.nameEn)} × {i.quantity}
                    </span>
                    <span className="is-numeric" lang="en">{money(unit * i.quantity)}</span>
                  </li>
                );
              })}
            </ul>

            <div className="checkout__row checkout__coupon">
              <label htmlFor="checkout-coupon" className="visually-hidden">
                {t('Coupon code', 'رمز القسيمة')}
              </label>
              {appliedCoupon ? (
                <>
                  <span>
                    {t('Coupon', 'قسيمة')} <strong>{appliedCoupon.code}</strong>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={clearCoupon}>
                    {t('Remove', 'إزالة')}
                  </Button>
                </>
              ) : (
                <span className="checkout__coupon-entry">
                  <Input
                    id="checkout-coupon"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder={t('Coupon code', 'رمز القسيمة')}
                    disabled={couponBusy}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={applyCoupon} loading={couponBusy}>
                    {t('Apply', 'تطبيق')}
                  </Button>
                </span>
              )}
            </div>
            {couponError && <p className="admin-form__hint" role="alert">{couponError}</p>}

            <div className="checkout__row">
              <span>{t('Subtotal', 'المجموع الفرعي')}</span>
              <span className="is-numeric" lang="en">{money(subtotal)}</span>
            </div>
            {couponDiscount > 0 && (
              <div className="checkout__row">
                <span>{t('Discount', 'الخصم')} ({appliedCoupon?.code})</span>
                <span className="is-numeric" lang="en">−{money(couponDiscount)}</span>
              </div>
            )}
            <div className="checkout__row">
              <span>{t('Delivery', 'التوصيل')}</span>
              <span className="is-numeric" lang={!region || quote.isPending || deliveryFee === 0 ? undefined : 'en'}>
                {!region
                  ? t('— pick a governorate', '— اختر محافظة')
                  : quote.isPending
                    ? '…'
                    : deliveryFee === 0
                      ? t('Free', 'مجاني')
                      : money(deliveryFee ?? 0)}
              </span>
            </div>
            {quote.data?.freeReason === 'threshold' && (
              <p className="admin-form__hint">{t('Free — order over the threshold.', 'مجاني — الطلب فوق الحد.')}</p>
            )}
            {quote.data?.freeReason === 'region' && region && (
              <p className="admin-form__hint">
                {t(`Free delivery to ${regionLabel(region, 'en')}.`, `توصيل مجاني إلى ${regionLabel(region, 'ar')}.`)}
              </p>
            )}
            <div className="checkout__row checkout__row--total">
              <span>{t('Total', 'الإجمالي')}</span>
              <span className="is-numeric" lang="en">{money(total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
