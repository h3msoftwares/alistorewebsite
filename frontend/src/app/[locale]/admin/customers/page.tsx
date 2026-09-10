'use client';

import { Fragment, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Field,
  Input,
  Modal,
  ProductGridSkeleton,
  Select,
  StatusPill,
} from '@/components/ui';
import { AdminPager } from '@/components/admin/admin-pager';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAdminCustomer, useAdminCustomers, useSetCustomerActive } from '@/hooks/use-customers';
import { usePermissions } from '@/lib/rbac';
import type { AdminCustomerSummary, CustomerSort, Order } from '@/lib/types';

const PAGE_SIZE = 20;

type StatusFilter = 'all' | 'active' | 'inactive';

export default function AdminCustomersPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const money = (n: number) =>
    new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'USD',
      numberingSystem: 'latn',
    }).format(n);
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const canManage = usePermissions().has('customers:manage');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 300);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<CustomerSort>('newest');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Blocking cuts a customer off from signing in and checking out, so it goes
  // through a confirm step; unblocking is a plain restore and applies straight away.
  const [confirmBlock, setConfirmBlock] = useState<AdminCustomerSummary | null>(null);

  const { data, isPending, isError, refetch } = useAdminCustomers({
    search: search || undefined,
    status,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });
  const setActive = useSetCustomerActive();

  const rows = data?.customers ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const resetPage = () => setPage(1);

  const setCustomerActive = async (c: AdminCustomerSummary, isActive: boolean) => {
    setActionError(null);
    setBusyId(c.id);
    try {
      await setActive.mutateAsync({ id: c.id, isActive });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('Update failed', 'فشل التحديث'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmBlockNow = async () => {
    if (!confirmBlock) return;
    const target = confirmBlock;
    setConfirmBlock(null);
    await setCustomerActive(target, false);
  };

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Customers', 'الزبائن')}</h1>
      </div>

      <div className="admin-form__row">
        <Field label={t('Search', 'بحث')} hint={t('Name, email or phone', 'الاسم أو البريد أو الهاتف')}>
          {(p) => (
            <Input
              {...p}
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                resetPage();
              }}
              placeholder={t('Search customers…', 'ابحث عن زبائن…')}
            />
          )}
        </Field>
        <Field label={t('Status', 'الحالة')}>
          {(p) => (
            <Select
              {...p}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                resetPage();
              }}
            >
              <option value="all">{t('All', 'الكل')}</option>
              <option value="active">{t('Active', 'نشط')}</option>
              <option value="inactive">{t('Blocked', 'محظور')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('Sort by', 'الترتيب')}>
          {(p) => (
            <Select
              {...p}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as CustomerSort);
                resetPage();
              }}
            >
              <option value="newest">{t('Newest', 'الأحدث')}</option>
              <option value="oldest">{t('Oldest', 'الأقدم')}</option>
              <option value="name">{t('Name', 'الاسم')}</option>
              <option value="orders">{t('Most orders', 'الأكثر طلبات')}</option>
            </Select>
          )}
        </Field>
      </div>

      {actionError && (
        <Alert tone="danger" className="stack">
          {actionError}
        </Alert>
      )}

      {isPending ? (
        <ProductGridSkeleton count={4} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load customers", 'تعذّر تحميل الزبائن')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            search || status !== 'all'
              ? t('No matching customers', 'لا زبائن مطابقون')
              : t('No customers yet', 'لا يوجد زبائن بعد')
          }
        />
      ) : (
        <>
          <DataTable responsive>
            <thead>
              <tr>
                <th>{t('Customer', 'الزبون')}</th>
                <th>{t('Joined', 'انضمّ')}</th>
                <th className="is-numeric">{t('Orders', 'الطلبات')}</th>
                <th className="is-numeric">{t('Total spent', 'إجمالي الإنفاق')}</th>
                <th>{t('Last order', 'آخر طلب')}</th>
                <th>{t('Status', 'الحالة')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const busy = busyId === c.id;
                const open = expanded === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr aria-busy={busy || undefined}>
                      <td data-label={t('Customer', 'الزبون')}>
                        <button
                          type="button"
                          className="admin-disclosure"
                          aria-expanded={open}
                          onClick={() => setExpanded(open ? null : c.id)}
                        >
                          {c.name}
                        </button>
                        <br />
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)' }}>
                          {[c.email, c.phone].filter(Boolean).join(' · ') || t('No contact info', 'لا معلومات اتصال')}
                        </span>
                      </td>
                      <td data-label={t('Joined', 'انضمّ')}>{date(c.joinedAt)}</td>
                      <td className="is-numeric" data-label={t('Orders', 'الطلبات')}>
                        {c.orderCount}
                        {c.orderCount !== c.paidOrderCount && (
                          <span
                            style={{ color: 'var(--color-text-muted)', fontSize: 'var(--fs-xs)' }}
                            title={t('Excludes cancelled / returned', 'باستثناء المُلغاة / المُرتجعة')}
                          >
                            {' '}
                            ({c.paidOrderCount})
                          </span>
                        )}
                      </td>
                      <td className="is-numeric" data-label={t('Total spent', 'إجمالي الإنفاق')}>
                        {money(Number(c.totalSpent))}
                      </td>
                      <td data-label={t('Last order', 'آخر طلب')}>
                        {c.lastOrderAt ? date(c.lastOrderAt) : <span className="muted">—</span>}
                      </td>
                      <td data-label={t('Status', 'الحالة')}>
                        <span className="admin-row-actions">
                          {c.isActive ? (
                            <span className="muted">{t('Active', 'نشط')}</span>
                          ) : (
                            <Badge variant="low-stock">{t('Blocked', 'محظور')}</Badge>
                          )}
                          {canManage &&
                            (c.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="btn--danger-quiet"
                                disabled={busy}
                                onClick={() => setConfirmBlock(c)}
                              >
                                {t('Block', 'حظر')}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setCustomerActive(c, true)}
                              >
                                {t('Unblock', 'رفع الحظر')}
                              </Button>
                            ))}
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6}>
                          <CustomerOrders id={c.id} locale={locale} money={money} date={date} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </DataTable>

          <AdminPager
            page={data?.page ?? page}
            totalPages={totalPages}
            onPageChange={setPage}
            locale={locale}
          />
        </>
      )}

      {confirmBlock && (
        <Modal
          open
          onClose={() => setConfirmBlock(null)}
          title={t(`Block ${confirmBlock.name}`, `حظر ${confirmBlock.name}`)}
          closeLabel={t('Close', 'إغلاق')}
        >
          <div className="admin-modal">
            <h2 className="admin-modal__title">{t('Block this customer?', 'حظر هذا الزبون؟')}</h2>
            <p className="admin-modal__body">
              {t(
                `${confirmBlock.name} won't be able to sign in or place orders until you unblock them. Their order history is kept.`,
                `لن يتمكن ${confirmBlock.name} من تسجيل الدخول أو تقديم الطلبات حتى ترفع الحظر. يُحتفظ بسجل طلباته.`
              )}
            </p>
            <div className="admin-modal__actions">
              <Button variant="ghost" onClick={() => setConfirmBlock(null)}>
                {t('Cancel', 'إلغاء')}
              </Button>
              <Button variant="danger" onClick={confirmBlockNow}>
                {t('Block customer', 'حظر الزبون')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The expanded row: one customer's full order history, fetched on demand. */
function CustomerOrders({
  id,
  locale,
  money,
  date,
}: {
  id: string;
  locale: 'en' | 'ar';
  money: (n: number) => string;
  date: (iso: string) => string;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data, isPending, isError, refetch } = useAdminCustomer(id);

  if (isPending) return <ProductGridSkeleton count={1} />;
  if (isError)
    return (
      <Alert tone="danger" className="stack">
        <span>{t("Couldn't load this customer's orders.", 'تعذّر تحميل طلبات هذا الزبون.')}</span>{' '}
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          {t('Retry', 'إعادة المحاولة')}
        </Button>
      </Alert>
    );

  if (data.orders.length === 0) {
    return <p className="muted">{t('This customer has not placed any orders.', 'لم يُجرِ هذا الزبون أي طلب.')}</p>;
  }

  const itemCount = (o: Order) => o.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="stack">
      <p className="muted">
        {t(
          `${data.orderCount} order(s) · ${money(Number(data.totalSpent))} lifetime`,
          `${data.orderCount} طلب · ${money(Number(data.totalSpent))} إجمالاً`
        )}
      </p>
      <DataTable responsive>
        <thead>
          <tr>
            <th>{t('Order', 'الطلب')}</th>
            <th>{t('Date', 'التاريخ')}</th>
            <th className="is-numeric">{t('Items', 'القطع')}</th>
            <th className="is-numeric">{t('Total', 'الإجمالي')}</th>
            <th>{t('Status', 'الحالة')}</th>
          </tr>
        </thead>
        <tbody>
          {data.orders.map((o) => (
            <tr key={o.id}>
              <td data-label={t('Order', 'الطلب')}>{o.orderNumber}</td>
              <td data-label={t('Date', 'التاريخ')}>{date(o.dateCreated)}</td>
              <td className="is-numeric" data-label={t('Items', 'القطع')}>
                {itemCount(o)}
              </td>
              <td className="is-numeric" data-label={t('Total', 'الإجمالي')}>
                {money(Number(o.total))}
              </td>
              <td data-label={t('Status', 'الحالة')}>
                <StatusPill status={o.status} locale={locale} />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
