'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, ShoppingBag } from 'lucide-react';
import { Alert, Button, EmptyState, Field, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { useCart } from '@/hooks/use-cart';
import { useAuth } from '@/hooks/use-auth';
import { useAddresses } from '@/hooks/use-account';
import { useCheckout, useDeliveryQuote } from '@/hooks/use-orders';
import { DELIVERY_REGIONS, REGION_VALUES, regionLabel } from '@/lib/regions';
import { formatCurrency } from '@/lib/format';
import { isApiError } from '@/lib/api';
import type { CheckoutBody, Order } from '@/lib/types';

type Locale = 'en' | 'ar';

export function CheckoutView({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const money = (n: number) => formatCurrency(n, locale);

  const cart = useCart();
  const { isAuthenticated } = useAuth();
  const addresses = useAddresses({ enabled: isAuthenticated });
  const checkout = useCheckout();

  const [addressId, setAddressId] = useState<string | undefined>();
  const [placed, setPlaced] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z
        .object({
          deliveryName: z.string().trim().min(1, t('Required', 'مطلوب')),
          deliveryPhone: z.string().trim().min(6, t('Enter a valid phone', 'أدخل رقمًا صالحًا')),
          deliveryAddress: z.string().trim().min(5, t('Enter your street address', 'أدخل عنوان الشارع')),
          deliveryCity: z.string().trim().min(1, t('Required', 'مطلوب')),
          deliveryRegion: z.enum(REGION_VALUES, { message: t('Pick a governorate', 'اختر محافظة') }),
          deliveryArea: z.string().trim().max(120).optional(),
          deliveryNotes: z.string().trim().max(500).optional(),
          notes: z.string().trim().max(500).optional(),
          guestEmail: z.string().trim().email(t('Enter a valid email', 'أدخل بريدًا صالحًا')).or(z.literal('')),
        })
        .superRefine((v, ctx) => {
          if (!isAuthenticated && !v.guestEmail) {
            ctx.addIssue({ code: 'custom', path: ['guestEmail'], message: t('Required', 'مطلوب') });
          }
        }),
    [isAuthenticated, isAr] // eslint-disable-line react-hooks/exhaustive-deps
  );
  type Values = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { deliveryRegion: undefined } });

  const region = useWatch({ control, name: 'deliveryRegion' });
  const quote = useDeliveryQuote(region ?? null);

  const subtotal = cart.data?.subtotal ?? 0;
  const deliveryFee = quote.data?.deliveryFee ?? null;
  const total = quote.data?.total ?? subtotal;

  const applySavedAddress = (id: string) => {
    setAddressId(id || undefined);
    const a = addresses.data?.find((x) => x.id === id);
    if (!a) return;
    setValue('deliveryName', a.fullName);
    setValue('deliveryPhone', a.phone);
    setValue('deliveryAddress', a.addressLine);
    setValue('deliveryCity', a.city);
    if (a.region && (REGION_VALUES as string[]).includes(a.region)) {
      setValue('deliveryRegion', a.region as Values['deliveryRegion']);
    }
    setValue('deliveryArea', a.area ?? '');
  };

  const onSubmit = async (v: Values) => {
    setError(null);
    const body: CheckoutBody = {
      deliveryName: v.deliveryName,
      deliveryPhone: v.deliveryPhone,
      deliveryAddress: v.deliveryAddress,
      deliveryCity: v.deliveryCity,
      deliveryRegion: v.deliveryRegion,
      deliveryArea: v.deliveryArea || undefined,
      deliveryNotes: v.deliveryNotes || undefined,
      notes: v.notes || undefined,
      ...(isAuthenticated ? {} : { guestEmail: v.guestEmail || undefined }),
      ...(addressId ? { addressId } : {}),
    };
    try {
      const order = await checkout.mutateAsync(body);
      setPlaced(order);
    } catch (e) {
      setError(isApiError(e) ? e.message : t('Something went wrong. Please try again.', 'حدث خطأ ما. حاول مرة أخرى.'));
    }
  };

  // ---- confirmation ----
  if (placed) {
    return (
      <div className="container section--tight">
        <EmptyState
          icon={CheckCircle2}
          title={t('Order placed', 'تم تأكيد الطلب')}
          body={t(
            `Order ${placed.orderNumber} — total ${money(Number(placed.total))}. We'll call ${placed.deliveryPhone} to confirm delivery.`,
            `الطلب ${placed.orderNumber} — الإجمالي ${money(Number(placed.total))}. سنتصل بـ ${placed.deliveryPhone} لتأكيد التوصيل.`
          )}
          action={
            <Link className="btn btn--primary" href={`/${locale}`}>
              {t('Continue shopping', 'متابعة التسوق')}
            </Link>
          }
        />
      </div>
    );
  }

  if (cart.isPending) {
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

  const busy = checkout.isPending;

  return (
    <div className="container section--tight checkout">
      <h1 style={{ marginBlockStart: 0 }}>{t('Checkout', 'إتمام الطلب')}</h1>

      <div className="checkout__grid">
        <form className="admin-form" noValidate onSubmit={handleSubmit(onSubmit)}>
          {isAuthenticated && (addresses.data?.length ?? 0) > 0 && (
            <Field label={t('Use a saved address', 'استخدام عنوان محفوظ')}>
              {(p) => (
                <Select {...p} value={addressId ?? ''} onChange={(e) => applySavedAddress(e.target.value)} disabled={busy}>
                  <option value="">{t('New address', 'عنوان جديد')}</option>
                  {addresses.data!.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.addressLine}, {a.city}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <div className="admin-form__row">
            <Field label={t('Full name', 'الاسم الكامل')} error={errors.deliveryName?.message} required>
              {(p) => <Input {...p} {...register('deliveryName')} autoComplete="name" disabled={busy} />}
            </Field>
            <Field label={t('Phone', 'الهاتف')} error={errors.deliveryPhone?.message} required>
              {(p) => <Input {...p} type="tel" {...register('deliveryPhone')} autoComplete="tel" disabled={busy} />}
            </Field>
          </div>

          {!isAuthenticated && (
            <Field label={t('Email', 'البريد الإلكتروني')} error={errors.guestEmail?.message} required>
              {(p) => <Input {...p} type="email" {...register('guestEmail')} autoComplete="email" disabled={busy} />}
            </Field>
          )}

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
                  {DELIVERY_REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {isAr ? r.ar : r.en}
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

          <p className="admin-form__hint">{t('Payment: cash on delivery.', 'الدفع: نقدًا عند الاستلام.')}</p>

          {error && <Alert tone="danger">{error}</Alert>}

          <div className="admin-form__actions">
            <Button type="submit" loading={busy}>
              {t('Place order', 'تأكيد الطلب')}
            </Button>
          </div>
        </form>

        <aside className="checkout__summary card">
          <div className="card__body stack">
            <strong>{t('Order summary', 'ملخص الطلب')}</strong>
            <ul className="checkout__lines">
              {cart.data.items.map((i) => {
                const p = i.variant.product;
                return (
                  <li key={i.id}>
                    <span>
                      {(isAr ? p.nameAr : p.nameEn)} × {i.quantity}
                    </span>
                    <span className="is-numeric">
                      {money(Number(i.variant.price ?? p.price) * i.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="checkout__row">
              <span>{t('Subtotal', 'المجموع الفرعي')}</span>
              <span className="is-numeric">{money(subtotal)}</span>
            </div>
            <div className="checkout__row">
              <span>{t('Delivery', 'التوصيل')}</span>
              <span className="is-numeric">
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
              <span className="is-numeric">{money(total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
